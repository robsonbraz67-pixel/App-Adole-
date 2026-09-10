import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc } from './helpers';

// Coleções introduzidas pela Fase 1. Nada no app escreve nelas ainda — estes
// testes existem para que a regra esteja provada ANTES do código que vai
// usá-la (Princípio 1: hasOnly() recusa o documento inteiro ao ver chave
// desconhecida, então o campo tem de ser aceito antes de ser gravado).

const turmaValida = (extra: Record<string, unknown> = {}) => ({
  locationId: 'igreja1',
  track: 'juvenil',
  nome: 'Juvenis — Profa. Ana',
  professores: ['professor1'],
  active: true,
  createdBy: 'admin1',
  createdAt: serverTimestamp(),
  ...extra,
});

describe('turmas', () => {
  beforeAll(() => setup('turmas'));
  afterAll(teardown);
  beforeEach(limpar);

  // #38 — o aluno precisa ver a turma para se matricular, e o nome dela
  // aparece no ranking. É dado administrativo, não pessoal.
  it('qualquer autenticado lê as turmas', async () => {
    await semearAluno('aluno1');
    await semearDoc('turmas/turma1', turmaValida());
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('turmas/turma1').get());
  });

  // #39
  it('aluno comum não cria turma', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('turmas/turma1').set(turmaValida({ createdBy: 'aluno1' })),
    );
  });

  // Professor ainda não gerencia turma: isso é a Fase 3, e sobe junto com os
  // testes do que ele passa a NÃO poder fazer. Se este teste começar a falhar
  // sem a Fase 3 ter acontecido, alguém afrouxou a regra cedo demais.
  it('professor ainda não cria turma (só na Fase 3)', async () => {
    await semearProfessor('professor1');
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('turmas/turma1').set(turmaValida({ createdBy: 'professor1' })),
    );
  });

  // #40
  it('admin cria turma', async () => {
    await semearAdmin('admin1');
    const db = comoUsuario('admin1');

    await assertSucceeds(db.doc('turmas/turma1').set(turmaValida()));
  });

  // #41 — a decisão "arquiva, não exclui" travada na própria regra: o
  // progresso carrega turmaId, e apagar a turma deixaria histórico órfão.
  it('ninguém apaga turma — nem admin', async () => {
    await semearAdmin('admin1');
    await semearDoc('turmas/turma1', turmaValida());
    const db = comoUsuario('admin1');

    await assertFails(db.doc('turmas/turma1').delete());
  });

  it('admin arquiva a turma em vez de excluir', async () => {
    await semearAdmin('admin1');
    await semearDoc('turmas/turma1', turmaValida());
    const db = comoUsuario('admin1');

    await assertSucceeds(db.doc('turmas/turma1').update({ active: false }));
  });
});

describe('teacherInvites', () => {
  beforeAll(() => setup('turmas'));
  afterAll(teardown);
  beforeEach(limpar);

  const conviteValido = (extra: Record<string, unknown> = {}) => ({
    code: 'PROF-ABCDE',
    locationId: 'igreja1',
    turmaId: 'turma1',
    active: true,
    createdBy: 'admin1',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...extra,
  });

  // #43 — o resgate (Fase 3) depende de quem recebeu o link conseguir ler o
  // convite pelo código exato, sem ser admin.
  it('aluno lê um convite de professor pelo código exato', async () => {
    await semearAluno('aluno1');
    await semearDoc('teacherInvites/PROF-ABCDE', conviteValido());
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('teacherInvites/PROF-ABCDE').get());
  });

  // #42 — mais fechado que inviteCodes: nem professor enumera convites que
  // concedem poder de professor.
  it('aluno não lista os convites de professor', async () => {
    await semearAluno('aluno1');
    await semearDoc('teacherInvites/PROF-ABCDE', conviteValido());
    const db = comoUsuario('aluno1');

    await assertFails(db.collection('teacherInvites').get());
  });

  it('professor não lista os convites de professor', async () => {
    await semearProfessor('professor1');
    await semearDoc('teacherInvites/PROF-ABCDE', conviteValido());
    const db = comoUsuario('professor1');

    await assertFails(db.collection('teacherInvites').get());
  });

  // #44
  it('aluno comum não cria convite de professor', async () => {
    await semearAluno('aluno1');
    await semearDoc('turmas/turma1', turmaValida());
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('teacherInvites/PROF-ABCDE').set(conviteValido({ createdBy: 'aluno1' })),
    );
  });

  // #45
  it('admin cria convite de professor para uma turma existente', async () => {
    await semearAdmin('admin1');
    await semearDoc('turmas/turma1', turmaValida());
    const db = comoUsuario('admin1');

    await assertSucceeds(
      db.doc('teacherInvites/PROF-ABCDE').set(conviteValido()),
    );
  });

  // A regra exige exists(turmas/{turmaId}): convite não pode apontar para uma
  // turma inventada, senão o resgate da Fase 3 promoveria alguém para o nada.
  it('admin não cria convite para turma que não existe', async () => {
    await semearAdmin('admin1');
    const db = comoUsuario('admin1');

    await assertFails(
      db.doc('teacherInvites/PROF-ABCDE').set(conviteValido({ turmaId: 'turmaInexistente' })),
    );
  });

  // O resgate é a Fase 3. Até lá, ninguém marca convite como usado — nem o
  // admin, cujo update só pode mexer em `active`.
  it('o resgate ainda não existe: ninguém marca o convite como usado', async () => {
    await semearAluno('aluno1');
    await semearDoc('turmas/turma1', turmaValida());
    await semearDoc('teacherInvites/PROF-ABCDE', conviteValido());
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('teacherInvites/PROF-ABCDE').update({ usedBy: 'aluno1', active: false }),
    );
  });
});
