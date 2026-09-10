import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearDoc } from './helpers';

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
  beforeAll(() => setup('progresso'));
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

  // #2 — o ranking inteiro depende de qualquer autenticado poder ler
  // progress de terceiros, não só o próprio.
  it('qualquer autenticado lê o progresso de outro (o ranking depende disso)', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    await semearDoc(`progress/aluno1_${SEMANA}`, progressoValido('aluno1'));
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.doc(`progress/aluno1_${SEMANA}`).get());
  });

  // #6 — a auditoria de pontuação do painel Admin (AuditoriaPontuacao em
  // components.tsx) depende de o admin poder corrigir o doc de outra pessoa.
  it('admin corrige o progresso de outro aluno', async () => {
    await semearAluno('aluno1');
    await semearAdmin('admin1');
    await semearDoc(`progress/aluno1_${SEMANA}`, progressoValido('aluno1'));
    const db = comoUsuario('admin1');

    await assertSucceeds(
      // updatedAt precisa vir junto: isValidProgress exige data.updatedAt ==
      // request.time sempre que a chave existe (firestore.rules:423), e o
      // valor herdado do seed original não bateria com o desta transação.
      // gravarCorrecao em firebase.ts sempre reenvia serverTimestamp() aqui.
      db.doc(`progress/aluno1_${SEMANA}`).update({
        xp: 0, streak: 0, done: [], history: {}, zeradoEm: Date.now(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  // #33 — a trilha nova precisa funcionar no caminho mais quente do app.
  it('aluno grava progresso na trilha juvenil', async () => {
    await semearAluno('aluno1', { track: 'juvenil' });
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc(`progress/aluno1_juvenil_${SEMANA}`).set(
        progressoValido('aluno1', { track: 'juvenil' }),
      ),
    );
  });

  // #34 (lado do progresso) — turmaId carimbado tem de ser a turma REAL do
  // dono; é o que vai tornar o ranking por turma calculável sem ler
  // users/{uid} de terceiro.
  it('aluno grava o próprio progresso com o turmaId da própria turma', async () => {
    await semearAluno('aluno1', { turmaId: 'turma1' });
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc(`progress/aluno1_${SEMANA}`).set(
        progressoValido('aluno1', { turmaId: 'turma1' }),
      ),
    );
  });

  // #37 — sem esta trava, o aluno se carimbaria na turma de outra igreja e
  // apareceria no ranking dela.
  it('aluno não grava progresso com turmaId de outra turma', async () => {
    await semearAluno('aluno1', { turmaId: 'turma1' });
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc(`progress/aluno1_${SEMANA}`).set(
        progressoValido('aluno1', { turmaId: 'turma2' }),
      ),
    );
  });

  // ===== O estado que o backfill da Fase 2 deixa para trás =====
  // Os dois testes acima cobrem o aluno MANDANDO turmaId. Depois do backfill o
  // caso é outro, e mais perigoso: o cliente não manda o campo (saveProgress
  // nem o conhece), mas o documento no servidor já o tem — e como o save é
  // merge, a regra avalia o resultado MESCLADO. É por isso que o backfill
  // carimba o perfil ANTES do progresso, e nunca um sem o outro.

  it('depois do backfill, o aluno salva normalmente sem mandar turmaId', async () => {
    await semearAluno('aluno1', { turmaId: 'turma1', locationId: 'igreja1' });
    await semearDoc(`progress/aluno1_${SEMANA}`, progressoValido('aluno1', { turmaId: 'turma1', locationId: 'igreja1' }));
    const db = comoUsuario('aluno1');

    // Exatamente o que saveProgress manda: sem turmaId no corpo.
    await assertSucceeds(
      db.doc(`progress/aluno1_${SEMANA}`).set(
        progressoValido('aluno1', { xp: 360, done: [1, 2, 3], locationId: 'igreja1' }),
        { merge: true },
      ),
    );
  });

  // Se o progresso for carimbado e o perfil não, TODO save seguinte daquele
  // aluno passa a ser recusado — e ele não vê erro nenhum, só para de pontuar.
  // Mesma família do apagão de 2026-07-25. É o motivo da ordem no backfill.
  it('progresso carimbado com o perfil sem turma trava o aluno', async () => {
    await semearAluno('aluno1', { locationId: 'igreja1' }); // sem turmaId
    await semearDoc(`progress/aluno1_${SEMANA}`, progressoValido('aluno1', { turmaId: 'turma1', locationId: 'igreja1' }));
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc(`progress/aluno1_${SEMANA}`).set(
        progressoValido('aluno1', { xp: 360, done: [1, 2, 3], locationId: 'igreja1' }),
        { merge: true },
      ),
    );
  });

  // #18 — nem o admin apaga um doc de progress (allow delete: if false).
  // Corrigir é sempre zerar campos (ver #6), nunca remover o documento.
  it('ninguém apaga um documento de progresso — nem admin', async () => {
    await semearAluno('aluno1');
    await semearAdmin('admin1');
    await semearDoc(`progress/aluno1_${SEMANA}`, progressoValido('aluno1'));
    const db = comoUsuario('admin1');

    await assertFails(db.doc(`progress/aluno1_${SEMANA}`).delete());
  });
});
