import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearProfessor, semearDoc } from './helpers';

// Ferramentas de gestão (locais, convites, atribuição de professor, conteúdo)
// concentram quase todo o risco de escalada de privilégio do app: são
// exatamente as coleções que um professor de UMA igreja não pode usar para
// mexer em outra — o problema central da Fase 3 do plano de expansão.

describe('teacherAssignments', () => {
  beforeAll(() => setup('gestao'));
  afterAll(teardown);
  beforeEach(limpar);

  // #14 — só admin atribui; nem o próprio professor.
  it('professor não se autoatribui a um local', async () => {
    await semearProfessor('professor1');
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('teacherAssignments/professor1').set({
        locationId: 'igreja1', assignedBy: 'professor1', assignedAt: serverTimestamp(),
      }),
    );
  });
});

describe('inviteCodes', () => {
  beforeAll(() => setup('gestao'));
  afterAll(teardown);
  beforeEach(limpar);

  // #15 — a trava central da Etapa 3 (professorCanIssueFor em firestore.rules):
  // sem ela, um professor emitiria convite de qualquer local via console/API,
  // mesmo com a UI restringindo à igreja atribuída a ele.
  it('professor não emite convite para local diferente do atribuído', async () => {
    await semearProfessor('professor1');
    await semearDoc('teacherAssignments/professor1', {
      locationId: 'igrejaA', assignedBy: 'admin1', assignedAt: serverTimestamp(),
    });
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('inviteCodes/TEEN-ABCDE').set({
        code: 'TEEN-ABCDE', locationId: 'igrejaB', track: 'teen',
        active: true, createdBy: 'professor1', createdAt: serverTimestamp(),
      }),
    );
  });

  // #22 — list só para quem gerencia, para ninguém enumerar todos os
  // códigos do sistema (comentário original na linha 213 do firestore.rules).
  it('aluno não lista os códigos de convite', async () => {
    await semearAluno('aluno1');
    await semearDoc('inviteCodes/TEEN-ABCDE', {
      code: 'TEEN-ABCDE', locationId: 'igreja1', track: 'teen',
      active: true, createdBy: 'professor1',
    });
    const db = comoUsuario('aluno1');

    await assertFails(db.collection('inviteCodes').get());
  });
});

describe('studyLocations', () => {
  beforeAll(() => setup('gestao'));
  afterAll(teardown);
  beforeEach(limpar);

  // #16 — evita que aluno comum polua o dropdown de cadastro com local lixo.
  it('aluno comum não cadastra um local de estudo', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('studyLocations/igreja1').set({
        name: 'Igreja Nova', createdBy: 'aluno1', createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('conteudoOverrides', () => {
  beforeAll(() => setup('gestao'));
  afterAll(teardown);
  beforeEach(limpar);

  // #17
  it('aluno comum não edita o conteúdo de uma lição', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('conteudoOverrides/teen_2026-W26_1').set({
        titulo: 'Título alterado', updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('errorLogs e userReports', () => {
  beforeAll(() => setup('gestao'));
  afterAll(teardown);
  beforeEach(limpar);

  // #23 — são caixa de entrada da liderança, não conteúdo de aluno comum
  // (comentário original na linha 725 do firestore.rules).
  it('aluno não lê logs de erro nem relatos de outros usuários', async () => {
    await semearAluno('aluno1');
    await semearDoc('errorLogs/log1', {
      origem: 'window', mensagem: 'TypeError: x is undefined',
      buildId: 'abc123', userAgent: 'test-agent', criadoEm: serverTimestamp(),
    });
    await semearDoc('userReports/rel1', {
      mensagem: 'O quiz travou', status: 'novo',
      buildId: 'abc123', userAgent: 'test-agent', criadoEm: serverTimestamp(),
    });
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('errorLogs/log1').get());
    await assertFails(db.doc('userReports/rel1').get());
  });
});
