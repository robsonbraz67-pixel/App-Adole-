import { planejarBackfill, trackDe } from '../src/backfillTurmas';
import { dbAdmin } from './lib/firebaseAdmin';

// ===== Backfill da Fase 2: carimbar turmaId nos dados que já existem =====
//
// Mesma lógica que rodava como Netlify Function manual, disparada por curl
// com BACKFILL_TOKEN (ver netlify/functions/backfill-turmas.mts) — migrada
// para rodar via `workflow_dispatch` no GitHub Actions
// (.github/workflows/backfill-turmas.yml). O controle de acesso passa a ser
// o do GitHub (quem pode disparar o workflow) em vez de um token na URL.
//
// Duas travas continuam valendo, herdadas de src/backfillTurmas.ts e da regra
// do Firestore:
// 1) DRY-RUN POR PADRÃO. Só escreve com --aplicar. Sem essa flag, mostra o
//    que ACONTECERIA sem escrever nada.
// 2) NUNCA SOBRESCREVE. Quem já tem turmaId é contado e ignorado.
//
// Uso:
//   npx tsx scripts/backfill-turmas.ts --mapa
//   npx tsx scripts/backfill-turmas.ts --turmaId=ID [--incluirSemIgreja]
//   npx tsx scripts/backfill-turmas.ts --turmaId=ID --aplicar [--incluirSemIgreja]

const LOTE = 400; // o limite do batch do Firestore é 500; folga para o retry

const parseArgs = (argv: string[]) => {
  const flags: Record<string, string | boolean> = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    flags[key] = value ?? true;
  }
  return {
    mapa: flags.mapa === true,
    turmaId: typeof flags.turmaId === 'string' ? flags.turmaId : '',
    aplicar: flags.aplicar === true,
    incluirSemIgreja: flags.incluirSemIgreja === true,
  };
};

export const run = async (argv: string[]) => {
  const { mapa, turmaId, aplicar, incluirSemIgreja } = parseArgs(argv);
  const db = dbAdmin();

  const usersSnap = await db.collection('users').get();
  const users: { id: string; d: any }[] = [];
  usersSnap.forEach(doc => users.push({ id: doc.id, d: doc.data() }));

  // ---- Modo mapa: quantas turmas precisam existir ----
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
    const resultado = { modo: 'mapa', totalUsuarios: users.length, convidados, grupos, turmas };
    console.log(JSON.stringify(resultado, null, 2));
    return resultado;
  }

  if (!turmaId) {
    throw new Error('Faltou --turmaId=ID. Use --mapa para ver os grupos e as turmas existentes.');
  }

  // ---- A turma tem de existir: a regra exige exists(turmas/{id}) e o
  // progresso vai passar a apontar para ela ----
  const turmaDoc = await db.collection('turmas').doc(turmaId).get();
  if (!turmaDoc.exists) throw new Error(`Turma ${turmaId} não existe.`);
  const turma = turmaDoc.data() as any;
  if (turma.active === false) {
    throw new Error(`Turma ${turmaId} ("${turma.nome}") está arquivada. Reative antes de matricular alguém nela.`);
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
    const resultado = {
      modo: 'ensaio (nada foi escrito)',
      ...resumo,
      comoAplicar: `npx tsx scripts/backfill-turmas.ts --turmaId=${turmaId} --aplicar${incluirSemIgreja ? ' --incluirSemIgreja' : ''}`,
    };
    console.log(JSON.stringify(resultado, null, 2));
    return resultado;
  }

  // ---- Escrita: perfil primeiro, progresso depois ----
  // A ordem é a regra: progresso carimbado antes do perfil deixaria uma
  // janela em que o save do aluno é recusado por turmaId != ownTurmaId().
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
  const resultado = { modo: 'aplicado', ...resumo, escritas };
  console.log('Backfill de turmas concluído:', JSON.stringify(resultado, null, 2));
  return resultado;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch(err => { console.error(err.message ?? err); process.exitCode = 1; });
}
