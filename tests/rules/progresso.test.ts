import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno } from './helpers';

// Progresso é o caminho mais quente do app: todo quiz concluído passa por aqui.
// Foi exatamente esta gravação que parou de funcionar em silêncio no apagão de
// 2026-07-25 (ver o comentário em firestore.rules), quando ownLocationId() foi
// apagada por engano e toda escrita com locationId passou a ser recusada.

const SEMANA = '2026-W26';

const progressoValido = (uid: string, extra: Record<string, unknown> = {}) => ({
  userId: uid,
  week: SEMANA,
  track: 'teen',
  trimestre: 'Provado pelo Fogo',
  xp: 240,
  streak: 2,
  done: [1, 2],
  history: { '1': { xp: 120, acertos: 4 }, '2': { xp: 120, acertos: 4 } },
  nome: 'Fulano',
  avatar: '🦁',
  isAdmin: false,
  updatedAt: serverTimestamp(),
  ...extra,
});

describe('progress', () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(limpar);

  it('aluno matriculado grava o próprio progresso com locationId', async () => {
    await semearAluno('aluno1', { locationId: 'igreja1', track: 'teen' });
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc(`progress/aluno1_${SEMANA}`).set(progressoValido('aluno1', { locationId: 'igreja1' })),
    );
  });

  it('aluno não grava progresso no documento de outro', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc(`progress/aluno2_${SEMANA}`).set(progressoValido('aluno2')),
    );
  });
});
