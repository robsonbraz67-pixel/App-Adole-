import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearDoc } from './helpers';

// Modo Ao Vivo: o jogo vale pontuação na frente da turma inteira. Estas são
// as travas anti-cola — três delas (25, 26, 28) já foram bugs corrigidos
// (ver os comentários originais nas linhas 507-536 e 670-674 de firestore.rules).

const CODE = 'ABCD12';

const salaBase = (extra: Record<string, unknown> = {}) => ({
  code: CODE, hostId: 'host1', hostName: 'Professor', track: 'teen',
  semana: '2026-W26', totalQuestions: 5, questionDurationSec: 20,
  phase: 'lobby', currentIndex: -1, ...extra,
});

describe('liveGamesPrivate', () => {
  beforeAll(() => setup('aovivo'));
  afterAll(teardown);
  beforeEach(limpar);

  // #25 — só o host lê o gabarito completo. Sem isto, qualquer jogador abre
  // a aba Network e vê a resposta certa antes de o host revelar.
  it('jogador não lê o gabarito da sala', async () => {
    await semearDoc(`liveGames/${CODE}`, salaBase());
    await semearDoc(`liveGamesPrivate/${CODE}`, { perguntas: [] });
    const db = comoUsuario('player1');

    await assertFails(db.doc(`liveGamesPrivate/${CODE}`).get());
  });
});

describe('liveAnswers', () => {
  beforeAll(() => setup('aovivo'));
  afterAll(teardown);
  beforeEach(limpar);

  // #26 — vazamento real, corrigido: antes, qualquer autenticado listava as
  // respostas da pergunta corrente e via o que os colegas marcaram antes de
  // responder. Só o host lista; o jogador sempre lê o PRÓPRIO doc por get().
  it('jogador não lista as respostas da pergunta corrente', async () => {
    await semearDoc(`liveGames/${CODE}`, salaBase({ phase: 'question', currentIndex: 0 }));
    await semearDoc(`liveAnswers/${CODE}_player1_0`, {
      code: CODE, uid: 'player1', idx: 0, opcaoEscolhida: 1,
      answeredAt: serverTimestamp(), tempoRespostaMs: 1200, graded: false,
    });
    const db = comoUsuario('player2');

    await assertFails(db.collection('liveAnswers').where('code', '==', CODE).get());
  });

  // #28 — impede responder pergunta futura cujo texto já tenha chegado por
  // algum motivo, e reescrever resposta de pergunta já encerrada.
  it('jogador não responde pergunta que não é a corrente da sala', async () => {
    await semearDoc(`liveGames/${CODE}`, salaBase({ phase: 'question', currentIndex: 0 }));
    const db = comoUsuario('player1');

    await assertFails(
      db.doc(`liveAnswers/${CODE}_player1_1`).set({
        code: CODE, uid: 'player1', idx: 1, opcaoEscolhida: 0,
        answeredAt: serverTimestamp(), tempoRespostaMs: 900, graded: false,
      }),
    );
  });
});

describe('livePlayers', () => {
  beforeAll(() => setup('aovivo'));
  afterAll(teardown);
  beforeEach(limpar);

  // #27 — o jogador nunca se autopontua; só o host credita pontos, depois de
  // conferir a resposta no gabarito privado.
  it('jogador não altera o próprio placar', async () => {
    await semearDoc(`liveGames/${CODE}`, salaBase());
    await semearDoc(`livePlayers/${CODE}_player1`, {
      code: CODE, uid: 'player1', nome: 'Jogador', avatar: '🦁',
      score: 0, joinedAt: serverTimestamp(),
    });
    const db = comoUsuario('player1');

    await assertFails(db.doc(`livePlayers/${CODE}_player1`).update({ score: 9999 }));
  });

  // #30 — é por aqui também que a revanche zera todo mundo sem recriar os
  // documentos; precisa continuar funcionando para o host de verdade.
  it('host credita pontos aos jogadores da própria sala', async () => {
    await semearDoc(`liveGames/${CODE}`, salaBase());
    await semearDoc(`livePlayers/${CODE}_player1`, {
      code: CODE, uid: 'player1', nome: 'Jogador', avatar: '🦁',
      score: 0, joinedAt: serverTimestamp(),
    });
    const db = comoUsuario('host1');

    await assertSucceeds(
      db.doc(`livePlayers/${CODE}_player1`).update({ score: 850, streak: 1, maxStreak: 1 }),
    );
  });
});

describe('liveGames', () => {
  beforeAll(() => setup('aovivo'));
  afterAll(teardown);
  beforeEach(limpar);

  // #29 — Modo Ao Vivo é ferramenta de professor/admin (canManage()), nunca
  // de aluno comum, mesmo autenticado.
  it('aluno comum não cria uma sala', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc(`liveGames/${CODE}`).set({
        ...salaBase({ hostId: 'aluno1' }), createdAt: serverTimestamp(),
      }),
    );
  });
});
