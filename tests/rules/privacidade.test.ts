import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearDoc } from './helpers';

// O app é usado por adolescentes. Anotação de estudo é conteúdo pessoal, e a
// dupla (Etapa 4) troca anotações só entre os dois membros — nenhum dos dois
// é conteúdo que o ranking, o professor ou outro aluno deveriam alcançar.

describe('studyNotes', () => {
  beforeAll(() => setup('privacidade'));
  afterAll(teardown);
  beforeEach(limpar);

  // #5
  it('aluno grava a própria anotação privada', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc('studyNotes/aluno1_2026-W26').set({
        userId: 'aluno1', week: '2026-W26', track: 'teen',
        notes: { '1': { nota: 'minha reflexão', hl: {} } },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  // #19 — sem exceção nem para admin (Etapa 8): é o único dado do app que
  // nem o super admin lê. Ver o comentário em INVARIANTES.md.
  it('aluno não lê a anotação privada de outro', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    await semearDoc('studyNotes/aluno2_2026-W26', {
      userId: 'aluno2', week: '2026-W26', track: 'teen',
      notes: { '1': { nota: 'segredo do aluno2', hl: {} } },
    });
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('studyNotes/aluno2_2026-W26').get());
  });
});

describe('pairs', () => {
  beforeAll(() => setup('privacidade'));
  afterAll(teardown);
  beforeEach(limpar);

  // #24
  it('quem não é membro da dupla não lê as anotações compartilhadas dela', async () => {
    await semearAluno('userA');
    await semearAluno('userB');
    await semearAluno('userC');
    await semearDoc('pairs/pair1', {
      inviteId: 'pair1', members: ['userA', 'userB'], userA: 'userA', userB: 'userB',
      userAName: 'Aluno A', userAAvatar: '🦁', userBName: 'Aluno B', userBAvatar: '🐯',
      locationId: 'igreja1', track: 'teen', type: 'friend', active: true,
      createdAt: serverTimestamp(), sharesA: {}, sharesB: {},
    });
    const db = comoUsuario('userC');

    await assertFails(db.doc('pairs/pair1').get());
  });
});
