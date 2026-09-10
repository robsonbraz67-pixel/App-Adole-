import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Fase 3 — resgate do convite de professor. É a única auto-promoção que existe
// no sistema: uma pessoa comum se marca `isProfessor` sozinha. Por isso metade
// destes testes é sobre o que NÃO pode acontecer.
//
// O resgate tem dois passos, nesta ordem:
//   1. queimar o convite  (compare-and-set num só documento: um vencedor)
//   2. marcar o próprio perfil (a regra confere `usedBy == quem escreve`)
// Invertido, a janela entre as escritas promoveria duas pessoas ao mesmo tempo.

const FUTURO = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PASSADO = () => Timestamp.fromMillis(Date.now() - 60 * 1000);

const convite = (extra: Record<string, unknown> = {}) => ({
  code: 'PROF-ABCDE',
  locationId: 'igreja1',
  turmaId: 'turma1',
  active: true,
  createdBy: 'admin1',
  createdAt: serverTimestamp(),
  expiresAt: FUTURO(),
  ...extra,
});

const queimar = (uid: string) => ({ active: false, usedBy: uid, usedAt: serverTimestamp() });

describe('resgate do convite de professor', () => {
  beforeAll(() => setup('professor'));
  afterAll(teardown);
  beforeEach(limpar);

  it('passo 1: o convidado queima o convite', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite());
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('teacherInvites/PROF-ABCDE').update(queimar('aluno1')));
  });

  it('passo 2: com o convite queimado por ele, o perfil vira professor', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false, usedBy: 'aluno1', usedAt: serverTimestamp() }));
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc('users/aluno1').update({ isProfessor: true, turmaId: 'turma1', inviteCode: 'PROF-ABCDE' }),
    );
  });

  // ===== O que NÃO pode =====

  it('ninguém se marca professor sem convite nenhum', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ isProfessor: true }));
  });

  // O convite queimado por OUTRA pessoa não serve: sem esta checagem, bastaria
  // ver o código de alguém que acabou de entrar para entrar junto.
  it('não vale o convite que outra pessoa queimou', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false, usedBy: 'aluno2', usedAt: serverTimestamp() }));
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').update({ isProfessor: true, turmaId: 'turma1', inviteCode: 'PROF-ABCDE' }),
    );
  });

  it('convite ainda não queimado não promove ninguém', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite());
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').update({ isProfessor: true, turmaId: 'turma1', inviteCode: 'PROF-ABCDE' }),
    );
  });

  // A turma do perfil tem de ser a do convite, senão o convite de uma turma
  // viraria entrada para qualquer outra.
  it('não dá para entrar numa turma diferente da do convite', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false, usedBy: 'aluno1', usedAt: serverTimestamp() }));
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').update({ isProfessor: true, turmaId: 'turma2', inviteCode: 'PROF-ABCDE' }),
    );
  });

  // A trava mais importante do arquivo: convite de professor não vira admin.
  it('o resgate não dá isAdmin junto', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false, usedBy: 'aluno1', usedAt: serverTimestamp() }));
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').update({ isProfessor: true, isAdmin: true, turmaId: 'turma1', inviteCode: 'PROF-ABCDE' }),
    );
  });

  it('convite vencido não queima', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ expiresAt: PASSADO() }));
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('teacherInvites/PROF-ABCDE').update(queimar('aluno1')));
  });

  it('convite revogado não queima', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false }));
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('teacherInvites/PROF-ABCDE').update(queimar('aluno1')));
  });

  // É isto que torna o passo 1 um compare-and-set: o segundo a chegar perde.
  it('convite já usado não queima de novo', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite({ active: false, usedBy: 'aluno2', usedAt: serverTimestamp() }));
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('teacherInvites/PROF-ABCDE').update(queimar('aluno1')));
  });

  it('ninguém queima um convite em nome de outro', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    await semearDoc('teacherInvites/PROF-ABCDE', convite());
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('teacherInvites/PROF-ABCDE').update(queimar('aluno2')));
  });
});

describe('professor na própria turma', () => {
  beforeAll(() => setup('professor'));
  afterAll(teardown);
  beforeEach(limpar);

  it('entra sozinho na lista de professores da turma dele', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: [] });
    const db = comoUsuario('professor1');

    await assertSucceeds(
      db.doc('turmas/turma1').update({ professores: ['professor1'], updatedAt: serverTimestamp() }),
    );
  });

  it('entrar na lista não é desculpa para tirar quem já estava', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor2', 'professor3'] });
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('turmas/turma1').update({ professores: ['professor1'], updatedAt: serverTimestamp() }),
    );
  });

  it('não entra na lista de turma que não é a dele', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma2', { professores: [] });
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('turmas/turma2').update({ professores: ['professor1'], updatedAt: serverTimestamp() }),
    );
  });

  it('renomeia a própria turma', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1'] });
    const db = comoUsuario('professor1');

    await assertSucceeds(
      db.doc('turmas/turma1').update({ nome: 'Adolescentes — sábado de manhã', updatedAt: serverTimestamp() }),
    );
  });

  // Trocar igreja ou trilha moveria os alunos de escopo sem ninguém pedir.
  it('não muda a igreja nem a trilha da turma', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1'] });
    const db = comoUsuario('professor1');

    await assertFails(db.doc('turmas/turma1').update({ locationId: 'igreja2', updatedAt: serverTimestamp() }));
    await assertFails(db.doc('turmas/turma1').update({ track: 'adult', updatedAt: serverTimestamp() }));
  });

  it('um professor não tira outro da turma', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1', 'professor2'] });
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('turmas/turma1').update({ professores: ['professor1'], updatedAt: serverTimestamp() }),
    );
  });

  it('professor não arquiva a própria turma — isso é do admin', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1'] });
    const db = comoUsuario('professor1');

    await assertFails(db.doc('turmas/turma1').update({ active: false, updatedAt: serverTimestamp() }));
  });

  it('emite convite de aluno para a própria turma', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1'] });
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('inviteCodes/TEEN-ZZZZZ').set({
      code: 'TEEN-ZZZZZ', locationId: 'igreja1', turmaId: 'turma1', track: 'teen',
      active: true, createdBy: 'professor1', createdAt: serverTimestamp(),
    }));
  });

  it('não emite convite para turma que não é a dele', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma2', { professores: [] });
    const db = comoUsuario('professor1');

    await assertFails(db.doc('inviteCodes/TEEN-ZZZZZ').set({
      code: 'TEEN-ZZZZZ', locationId: 'igreja1', turmaId: 'turma2', track: 'teen',
      active: true, createdBy: 'professor1', createdAt: serverTimestamp(),
    }));
  });

  // Nada do que entrou aqui pode ter afrouxado a emissão de convite de
  // PROFESSOR, que continua exclusiva do admin.
  it('professor continua sem emitir convite de professor', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearTurma('turma1', { professores: ['professor1'] });
    const db = comoUsuario('professor1');

    await assertFails(db.doc('teacherInvites/PROF-QQQQQ').set(convite({ code: 'PROF-QQQQQ', createdBy: 'professor1' })));
  });
});
