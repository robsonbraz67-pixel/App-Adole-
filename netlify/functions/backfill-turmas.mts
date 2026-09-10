// ===== Backfill das turmas (Fase 2 da expansão multi-igreja) =====
//
// Carimba `turmaId` nos usuários e nos documentos de progresso que já existem,
// colocando todo mundo dentro de uma turma. Roda UMA vez por turma; depois
// disso não há mais o que carimbar.
//
// ORDEM OBRIGATÓRIA — users primeiro, progress depois. Não é preferência:
// depois de carimbado, todo save de quiz carrega o turmaId do documento (o
// cliente salva com merge, então o campo sobrevive), e a regra confere esse
// valor contra o turmaId do PERFIL (isValidProgress -> ownTurmaId()).
// Carimbar progress sem carimbar users deixa os dois em desacordo e **recusa
// todo quiz daquele aluno, em silêncio** — o apagão de 2026-07-25 em versão
// parcial. Está provado nos testes #47 e #48 (tests/rules/progresso.test.ts).
// Por isso, aqui: users são gravados e confirmados antes de qualquer progress,
// e nenhum progresso de dono sem turma é tocado.
//
// Três modos, todos exigindo o token:
//   ?token=X                      -> relatório: o que existe hoje, sem escrever
//   ?token=X&turmaId=Y            -> simulação: o que SERIA carimbado, sem escrever
//   ?token=X&turmaId=Y&aplicar=1  -> grava
//
// Escopo (quem entra na turma), no modo simulação/aplicar:
//   &escopo=local-trilha (padrão) -> só quem bate com a igreja E a trilha da turma
//   &escopo=todos                 -> todo usuário ainda sem turma
// O padrão é o restritivo de propósito: carimbar de menos aparece no relatório
// e se corrige rodando de novo; carimbar de mais mistura igrejas e só se
// desfaz na mão.

import type { Config } from '@netlify/functions';

const LOTE = 400; // limite de escrita do Firestore é 500 por batch

type Escrita = { ref: any; patch: Record<string, any> };

const gravarEmLotes = async (db: any, escritas: Escrita[]) => {
  for (let i = 0; i < escritas.length; i += LOTE) {
    const batch = db.batch();
    for (const e of escritas.slice(i, i + LOTE)) batch.update(e.ref, e.patch);
    await batch.commit();
  }
};

const contar = (valores: (string | undefined)[]) => {
  const mapa: Record<string, number> = {};
  for (const v of valores) {
    const chave = v || '(vazio)';
    mapa[chave] = (mapa[chave] || 0) + 1;
  }
  return mapa;
};

const json = (corpo: any, status = 200) =>
  new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req: Request): Promise<Response> => {
  // Falha fechado: sem o token configurado no Netlify, o endpoint não faz
  // nada. Ele escreve na base de produção inteira — não pode ficar aberto.
  const esperado = process.env.BACKFILL_TOKEN;
  if (!esperado) {
    return json({ ok: false, erro: 'BACKFILL_TOKEN não configurado. Endpoint desativado.' }, 503);
  }
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== esperado) {
    return json({ ok: false, erro: 'Token inválido.' }, 403);
  }

  const turmaId = url.searchParams.get('turmaId') || '';
  const aplicar = url.searchParams.get('aplicar') === '1';
  const escopo = url.searchParams.get('escopo') === 'todos' ? 'todos' : 'local-trilha';

  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    // Contra o emulador (tests/backfill) não existe credencial: o admin SDK
    // detecta FIRESTORE_EMULATOR_HOST e dispensa o service account. É o que
    // permite testar de verdade a função que escreve na base inteira.
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-backfill' });
    } else {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
      initializeApp({ credential: cert(serviceAccount) });
    }
  }
  const db = getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');

  const [usersSnap, turmasSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('turmas').get(),
  ]);

  const usuarios = usersSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
  const turmas = turmasSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // ---- Modo 1: relatório ----
  // Sem turmaId, só descreve a realidade. É o que responde "quem entra em que
  // turma?" antes de qualquer decisão — a distribuição por igreja e trilha
  // costuma ser diferente do que se imagina.
  if (!turmaId) {
    const progSnapRel = await db.collection('progress').get();
    return json({
      ok: true,
      modo: 'relatório',
      usuarios: {
        total: usuarios.length,
        jaComTurma: usuarios.filter(u => u.turmaId).length,
        semTurma: usuarios.filter(u => !u.turmaId).length,
        convidados: usuarios.filter(u => u.isGuest).length,
        bloqueados: usuarios.filter(u => u.bloqueado).length,
        porIgreja: contar(usuarios.map(u => u.locationId)),
        porTrilha: contar(usuarios.map(u => u.track)),
      },
      progresso: {
        total: progSnapRel.size,
        jaComTurma: progSnapRel.docs.filter(d => (d.data() as any).turmaId).length,
      },
      turmasCadastradas: turmas.map(t => ({
        id: t.id, nome: t.nome, locationId: t.locationId, track: t.track, active: t.active,
      })),
      proximoPasso: 'Rode de novo com &turmaId=<id> para simular o carimbo (ainda sem escrever).',
    });
  }

  const turma = turmas.find(t => t.id === turmaId);
  if (!turma) {
    return json({ ok: false, erro: `Turma ${turmaId} não existe.`, turmasCadastradas: turmas.map(t => t.id) }, 404);
  }

  // ---- Quem entra ----
  // Trilha ausente == 'teen': todo o histórico anterior às trilhas é teen (a
  // mesma convenção do trackKey em firebase.ts).
  const trilhaDe = (x: any) => x.track || 'teen';
  const alvo = usuarios.filter(u => {
    if (u.turmaId) return false; // idempotência: quem já tem turma não é tocado
    if (escopo === 'todos') return true;
    return u.locationId === turma.locationId && trilhaDe(u) === trilhaDe(turma);
  });
  const alvoIds = new Set(alvo.map(u => u.id));

  // Turma de cada usuário DEPOIS deste backfill — inclui quem já tinha turma
  // (de uma rodada anterior) e quem vai ser carimbado agora. É este mapa que
  // decide quais progressos podem ser tocados.
  const turmaFinalPorUsuario: Record<string, string> = {};
  for (const u of usuarios) {
    if (u.turmaId) turmaFinalPorUsuario[u.id] = u.turmaId;
    else if (alvoIds.has(u.id)) turmaFinalPorUsuario[u.id] = turmaId;
  }
  const idsExistentes = new Set(usuarios.map(u => u.id));

  const progSnap = await db.collection('progress').get();
  const progressoParaCarimbar: Escrita[] = [];
  let progressoOrfao = 0, progressoDonoSemTurma = 0, progressoJaOk = 0;

  progSnap.forEach(d => {
    const p = d.data() as any;
    const dono = p.userId;
    const turmaDoDono = turmaFinalPorUsuario[dono];

    if (!idsExistentes.has(dono)) { progressoOrfao++; return; }
    // A TRAVA que impede o apagão parcial: progresso de dono sem turma nunca
    // é carimbado (ver o comentário no topo e o teste #48).
    if (!turmaDoDono) { progressoDonoSemTurma++; return; }
    if (p.turmaId === turmaDoDono) { progressoJaOk++; return; }

    progressoParaCarimbar.push({ ref: d.ref, patch: { turmaId: turmaDoDono } });
  });

  const resumo = {
    turma: { id: turmaId, nome: turma.nome, locationId: turma.locationId, track: turma.track },
    escopo,
    usuariosParaCarimbar: alvo.length,
    usuariosJaComTurma: usuarios.filter(u => u.turmaId).length,
    progressoParaCarimbar: progressoParaCarimbar.length,
    progressoJaCarimbado: progressoJaOk,
    progressoDeDonoSemTurma: progressoDonoSemTurma,
    progressoOrfao,
  };

  // ---- Modo 2: simulação ----
  if (!aplicar) {
    return json({
      ok: true,
      modo: 'simulação (nada foi gravado)',
      ...resumo,
      amostraUsuarios: alvo.slice(0, 10).map(u => ({ id: u.id, nome: u.nome, locationId: u.locationId, track: u.track })),
      proximoPasso: 'Confira os números e rode de novo com &aplicar=1 para gravar.',
    });
  }

  // ---- Modo 3: aplicar ----
  // users PRIMEIRO, e só depois progress (ver o comentário no topo).
  await gravarEmLotes(db, alvo.map(u => ({ ref: u.ref, patch: { turmaId } })));

  // Confere que os perfis chegaram mesmo antes de tocar em progress. Se a
  // gravação acima falhar pela metade, parar aqui deixa o sistema num estado
  // SEGURO (perfis com turma, progressos sem — a regra ignora o campo ausente).
  const conferencia = await db.collection('users').get();
  const semTurmaAindaNoAlvo = conferencia.docs.filter(d => alvoIds.has(d.id) && !(d.data() as any).turmaId).length;
  if (semTurmaAindaNoAlvo > 0) {
    return json({
      ok: false,
      modo: 'aplicar — INTERROMPIDO após os usuários',
      erro: `${semTurmaAindaNoAlvo} usuário(s) do alvo continuam sem turmaId. Nenhum progresso foi tocado.`,
      ...resumo,
    }, 500);
  }

  await gravarEmLotes(db, progressoParaCarimbar);

  console.log('Backfill de turmas concluído:', JSON.stringify(resumo));
  return json({
    ok: true,
    modo: 'aplicado',
    ...resumo,
    observacao: 'Rodar de novo não muda nada: quem já tem turma não é tocado.',
  });
};

// Sem `schedule`: é operação de uma vez só, disparada à mão. Um backfill que
// roda sozinho de hora em hora é um backfill que carimba turma errada às 3h da
// manhã sem ninguém olhando.
export const config: Config = {
  path: '/api/backfill-turmas',
};
