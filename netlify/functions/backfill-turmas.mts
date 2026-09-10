import type { Config } from "@netlify/functions";
import { planejarBackfill, trackDe } from "../../src/backfillTurmas";

// ===== Backfill da Fase 2: carimbar turmaId nos dados que já existem =====
//
// Ver docs/PLANO-EXPANSAO.md. Todo aluno de hoje está sem `turmaId`; este
// processo põe o campo no perfil e no progresso, para que o ranking por turma
// da Fase 4 seja calculável sem ler o perfil de terceiros.
//
// Três travas, cada uma vinda de um jeito conhecido de quebrar isto:
//
// 1) DRY-RUN POR PADRÃO. Só escreve com POST + ?aplicar=1. Um GET — de
//    navegador, de prefetch, de crawler — nunca escreve nada.
//
// 2) PERFIL ANTES DO PROGRESSO, E NUNCA UM SEM O OUTRO. A regra do progresso
//    exige `turmaId == ownTurmaId()` (firestore.rules): um doc de progresso
//    carimbado com turma que não bate com o perfil do dono faria TODO save
//    seguinte daquele aluno falhar — em silêncio, como no apagão de
//    2026-07-25. Por isso o progresso só é carimbado depois de o perfil do
//    dono ter recebido a mesma turma, e só quando a turma existe de verdade.
//
// 3) NUNCA SOBRESCREVE. Quem já tem turmaId é contado e ignorado. Rodar duas
//    vezes não muda nada na segunda — é o que torna seguro repetir quando a
//    execução estoura o tempo no meio.
//
// Uso (o token vem de BACKFILL_TOKEN nas variáveis do Netlify):
//
//   # 1. o mapa: quantas turmas precisam existir, por igreja e trilha
//   curl "$URL/.netlify/functions/backfill-turmas?token=$T&mapa=1"
//
//   # 2. o ensaio: o que ACONTECERIA para uma turma, sem escrever nada
//   curl "$URL/.netlify/functions/backfill-turmas?token=$T&turmaId=$ID"
//
//   # 3. o carimbo, depois de conferir o ensaio
//   curl -X POST "$URL/.netlify/functions/backfill-turmas?token=$T&turmaId=$ID&aplicar=1"

const LOTE = 400; // o limite do batch do Firestore é 500; folga para o retry

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });


export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // A função fica numa URL pública (o Netlify não tem autenticação embutida),
  // e ela escreve no banco de produção. Sem token configurado, não roda.
  const esperado = process.env.BACKFILL_TOKEN;
  if (!esperado) {
    return json({ ok: false, erro: 'BACKFILL_TOKEN não está configurado nas variáveis do Netlify. Defina um valor secreto antes de usar esta função.' }, 503);
  }
  const recebido = req.headers.get('x-backfill-token') ?? url.searchParams.get('token') ?? '';
  if (recebido !== esperado) return json({ ok: false, erro: 'Token inválido.' }, 401);

  const turmaId = url.searchParams.get('turmaId') ?? '';
  const mapa = url.searchParams.get('mapa') === '1';
  const incluirSemIgreja = url.searchParams.get('incluirSemIgreja') === '1';
  // Escrever exige as duas coisas: método POST e o pedido explícito.
  const aplicar = req.method === 'POST' && url.searchParams.get('aplicar') === '1';

  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');

  const usersSnap = await db.collection('users').get();
  const users: { id: string; d: any }[] = [];
  usersSnap.forEach(doc => users.push({ id: doc.id, d: doc.data() }));

  // ---- Modo mapa: quantas turmas precisam existir ----
  // Responde antes de qualquer escrita a pergunta que vem primeiro: a escola
  // tem uma turma só, ou uma por trilha? O passo 7 do plano depende disto.
  if (mapa) {
    const grupos: Record<string, { igreja: string; trilha: string; alunos: number; jaComTurma: number }> = {};
    let convidados = 0;
    for (const { d } of users) {
      if (d.isGuest) { convidados++; continue; }
      const chave = `${d.locationId || '(sem igreja)'} · ${trackDe(d.track)}`;
      grupos[chave] ??= { igreja: d.locationId || '(sem igreja)', trilha: trackDe(d.track), alunos: 0, jaComTurma: 0 };
      grupos[chave].alunos++;
      if (d.turmaId) grupos[chave].jaComTurma++;
    }
    const turmasSnap = await db.collection('turmas').get();
    const turmas = turmasSnap.docs.map(t => ({ id: t.id, ...(t.data() as any) }))
      .map(t => ({ id: t.id, nome: t.nome, igreja: t.locationId, trilha: t.track, ativa: t.active }));
    return json({ ok: true, modo: 'mapa', totalUsuarios: users.length, convidados, grupos, turmas });
  }

  if (!turmaId) {
    return json({ ok: false, erro: 'Faltou turmaId. Use ?mapa=1 para ver os grupos e as turmas existentes.' }, 400);
  }

  // ---- A turma tem de existir: a regra exige exists(turmas/{id}) e o
  // progresso vai passar a apontar para ela ----
  const turmaDoc = await db.collection('turmas').doc(turmaId).get();
  if (!turmaDoc.exists) return json({ ok: false, erro: `Turma ${turmaId} não existe.` }, 404);
  const turma = turmaDoc.data() as any;
  if (turma.active === false) {
    return json({ ok: false, erro: `Turma ${turmaId} ("${turma.nome}") está arquivada. Reative antes de matricular alguém nela.` }, 409);
  }
  const { locationId: turmaLocation, track: turmaTrack, nome: turmaNome } = turma;

  // ---- O plano: quem entra e qual progresso é carimbado ----
  const progSnap = await db.collection('progress').get();
  const { contagem, elegiveis, progContagem, progElegiveis } = planejarBackfill({
    usuarios: users.map(u => ({ id: u.id, ...u.d })),
    progressos: progSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })),
    turma: { id: turmaId, nome: turmaNome, locationId: turmaLocation, track: turmaTrack },
    incluirSemIgreja,
  });

  const resumo = {
    turma: { id: turmaId, nome: turmaNome, igreja: turmaLocation, trilha: turmaTrack },
    usuarios: contagem,
    progresso: progContagem,
    amostra: elegiveis.slice(0, 10).map(e => e.nome),
  };

  if (!aplicar) {
    return json({
      ok: true,
      modo: 'ensaio (nada foi escrito)',
      ...resumo,
      comoAplicar: `POST ${url.pathname}?token=…&turmaId=${turmaId}&aplicar=1${incluirSemIgreja ? '&incluirSemIgreja=1' : ''}`,
    });
  }

  // ---- Escrita: perfil primeiro, progresso depois ----
  // A ordem é a regra, não gosto: progresso carimbado antes do perfil deixaria
  // uma janela em que o save do aluno é recusado por turmaId != ownTurmaId().
  const gravarEmLotes = async (
    itens: FirebaseFirestore.DocumentReference[],
    patch: Record<string, unknown>,
  ) => {
    for (let i = 0; i < itens.length; i += LOTE) {
      const batch = db.batch();
      itens.slice(i, i + LOTE).forEach(ref => batch.update(ref, patch));
      await batch.commit();
    }
  };

  await gravarEmLotes(elegiveis.map(e => db.collection('users').doc(e.id)), { turmaId });
  await gravarEmLotes(progElegiveis.map(p => db.collection('progress').doc(p.id)), { turmaId });

  const escritas = { users: elegiveis.length, progress: progElegiveis.length };
  console.log('Backfill de turmas concluído:', JSON.stringify({ turmaId, ...escritas }));
  return json({ ok: true, modo: 'aplicado', ...resumo, escritas });
};

// Sem `schedule`: isto não é reparo contínuo, é uma operação de uma vez, feita
// por gente que acabou de ler o ensaio.
export const config: Config = {};
