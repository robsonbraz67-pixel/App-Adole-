import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Fase 3b — o que o professor deixa de poder. Estes testes existem porque o
// que foi REMOVIDO é tão importante quanto o que foi concedido: estreitar
// errado trava professor real, e não estreitar deixa aberto o que o plano
// prometeu fechar.
//
// A consulta importa: `allow list` é tudo-ou-nada contra a consulta inteira.
// Uma listagem sem `where('turmaId','==', a minha)` é recusada por completo —
// é isso que o primeiro bloco prova.

describe('professor lê só a própria turma', () => {
  beforeAll(() => setup('escopo'));
  afterAll(teardown);
  beforeEach(limpar);

  const cenario = async () => {
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await semearAluno('aluno2', { turmaId: 'turma2' });
    await semearAluno('semTurma');
  };

  it('lê o perfil de quem é da turma dele', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('users/aluno1').get());
  });

  it('NÃO lê o perfil de aluno de outra turma', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertFails(db.doc('users/aluno2').get());
  });

  it('NÃO lê o perfil de quem está sem turma', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertFails(db.doc('users/semTurma').get());
  });

  // O painel do professor (getUsersDaTurma) faz exatamente esta consulta.
  it('lista os alunos filtrando pela própria turma', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertSucceeds(db.collection('users').where('turmaId', '==', 'turma1').get());
  });

  // Era o que o painel antigo fazia — e é o que passa a falhar INTEIRO.
  it('NÃO lista todos os usuários do sistema', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertFails(db.collection('users').get());
  });

  it('NÃO lista os alunos de outra turma', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertFails(db.collection('users').where('turmaId', '==', 'turma2').get());
  });

  // Sem a guarda de turma vazia, um professor sem turma casaria com todo
  // perfil que também está sem turma — que hoje seria metade da escola.
  it('professor sem turma não lê ninguém', async () => {
    await cenario();
    await semearProfessor('professorSemTurma');
    const db = comoUsuario('professorSemTurma');

    await assertFails(db.doc('users/semTurma').get());
    await assertFails(db.collection('users').get());
  });

  it('o professor continua lendo o próprio perfil', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('users/professor1').get());
  });

  it('admin continua lendo tudo', async () => {
    await cenario();
    await semearAdmin('admin1');
    const db = comoUsuario('admin1');

    await assertSucceeds(db.collection('users').get());
    await assertSucceeds(db.doc('users/aluno2').get());
  });

  // O ranking depende de progress, que é público — estreitar users não pode
  // ter derrubado isso junto.
  it('o ranking continua de pé: progress segue legível por qualquer um', async () => {
    await cenario();
    await semearDoc('progress/aluno2_2026-W26', {
      userId: 'aluno2', week: '2026-W26', xp: 100, streak: 1, nome: 'Aluno 2', avatar: '🦁',
    });
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('progress/aluno2_2026-W26').get());
  });
});

describe('professor edita só o conteúdo da própria trilha', () => {
  beforeAll(() => setup('escopo'));
  afterAll(teardown);
  beforeEach(limpar);

  // O id do override carrega a trilha: `${track}_${semana}_${dia}`.
  const cenario = async () => {
    await semearTurma('turmaTeen', { track: 'teen' });
    await semearProfessor('professor1', { turmaId: 'turmaTeen' });
  };

  it('edita a lição da trilha da turma dele', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertSucceeds(
      db.doc('conteudoOverrides/teen_2026-W26_3').set({ titulo: 'Novo título', updatedAt: serverTimestamp() }),
    );
  });

  it('NÃO edita a lição de outra trilha', async () => {
    await cenario();
    const db = comoUsuario('professor1');

    await assertFails(
      db.doc('conteudoOverrides/adult_2026-W26_3').set({ titulo: 'Novo título', updatedAt: serverTimestamp() }),
    );
  });

  it('professor sem turma não edita conteúdo nenhum', async () => {
    await semearProfessor('professorSemTurma');
    const db = comoUsuario('professorSemTurma');

    await assertFails(
      db.doc('conteudoOverrides/teen_2026-W26_3').set({ titulo: 'Novo título', updatedAt: serverTimestamp() }),
    );
  });

  it('admin edita qualquer trilha', async () => {
    await semearAdmin('admin1');
    const db = comoUsuario('admin1');

    await assertSucceeds(
      db.doc('conteudoOverrides/adult_2026-W26_3').set({ titulo: 'Novo título', updatedAt: serverTimestamp() }),
    );
  });

  // Todo mundo LÊ o conteúdo — é o material da lição, não dado sensível.
  it('aluno continua lendo o conteúdo', async () => {
    await semearAluno('aluno1');
    await semearDoc('conteudoOverrides/teen_2026-W26_3', { titulo: 'Título' });
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('conteudoOverrides/teen_2026-W26_3').get());
  });
});

describe('logs técnicos voltam a ser só do admin', () => {
  beforeAll(() => setup('escopo'));
  afterAll(teardown);
  beforeEach(limpar);

  // `origem` só aceita boundary/window/promise (isValidErrorLog).
  const log = {
    origem: 'boundary', mensagem: 'estourou', buildId: 'x', userAgent: 'y', criadoEm: serverTimestamp(),
  };

  it('professor NÃO lê mais os logs de erro', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearDoc('errorLogs/log1', log);
    const db = comoUsuario('professor1');

    await assertFails(db.doc('errorLogs/log1').get());
    await assertFails(db.collection('errorLogs').get());
  });

  it('admin lê', async () => {
    await semearAdmin('admin1');
    await semearDoc('errorLogs/log1', log);
    const db = comoUsuario('admin1');

    await assertSucceeds(db.collection('errorLogs').get());
  });

  // Gravar continua aberto: erro que não consegue ser registrado é erro perdido.
  it('qualquer autenticado continua conseguindo REGISTRAR um erro', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('errorLogs/log2').set({ ...log, criadoEm: serverTimestamp() }));
  });
});
