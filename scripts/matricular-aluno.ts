import { dbAdmin } from './lib/firebaseAdmin';

// ===== Matrícula pontual de UM aluno numa turma =====
//
// Para quem ficou sem turmaId (entrou sem código da turma). Mesmas travas do
// backfill de turmas: a turma tem de existir, estar ativa e ser da mesma
// igreja/trilha do aluno, e quem já tem turmaId não é tocado. Perfil primeiro,
// progresso depois — a regra exige turmaId do progresso == turmaId do dono.
// Só ids no log: o log de um repositório público é público.

const USER_ID = process.env.USER_ID || '';
const TURMA_ID = process.env.TURMA_ID || '';

export const run = async () => {
  if (!USER_ID || !TURMA_ID) throw new Error('USER_ID e TURMA_ID são obrigatórios');
  const db = dbAdmin();

  const turma = (await db.collection('turmas').doc(TURMA_ID).get()).data();
  if (!turma) throw new Error('turma não existe');
  if (turma.active === false) throw new Error('turma arquivada');

  const userRef = db.collection('users').doc(USER_ID);
  const user = (await userRef.get()).data();
  if (!user) throw new Error('usuário não existe');
  if (user.turmaId) { console.log(`já matriculado em ${user.turmaId}; nada feito`); return; }
  if ((user.track || 'teen') !== (turma.track || 'teen')) throw new Error('trilha do aluno != trilha da turma');
  if (user.locationId && user.locationId !== turma.locationId) throw new Error('igreja do aluno != igreja da turma');

  await userRef.update({ turmaId: TURMA_ID, ...(user.locationId ? {} : { locationId: turma.locationId }) });

  const prog = await db.collection('progress').where('userId', '==', USER_ID).get();
  const alvo = prog.docs.filter(d => !d.data().turmaId && (d.data().track || 'teen') === (turma.track || 'teen'));
  const batch = db.batch();
  alvo.forEach(d => batch.update(d.ref, { turmaId: TURMA_ID }));
  if (alvo.length) await batch.commit();
  console.log(`perfil=1 progresso=${alvo.length}`);
};

run().catch(e => { console.error(e.message ?? e); process.exit(1); });
