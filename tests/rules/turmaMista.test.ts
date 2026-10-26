import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearDoc, semearTurma, PERFIL_BASE } from './helpers';

// Turma mista (jovens + adultos): o código MISTA- é de trilha `adult`, mas
// quem escolhe "Jovens" no cadastro grava `youngAdult`. A checagem do convite
// (inviteCodeMatchesIncoming) exige trilha igual e falha — o cadastro tem de
// passar pelo caminho "a igreja existe", que é o de quem entra sem código.
// Estes testes provam o fluxo inteiro antes de alguém usar o código de verdade.

const CODIGO = 'MISTA-8VRG7';
const SEMANA = '2026-W44';

const semearCulto = async () => {
  await semearDoc('studyLocations/ucob', { name: 'UCOB', createdBy: 'admin1' });
  await semearTurma('culto', { locationId: 'ucob', track: 'adult', nome: 'Culto Matinal' });
  await semearDoc(`inviteCodes/${CODIGO}`, {
    code: CODIGO, locationId: 'ucob', turmaId: 'culto', track: 'adult', active: true, createdBy: 'admin1',
  });
};

const progresso = (uid: string, track: string) => ({
  userId: uid, week: SEMANA, track, trimestre: 'Temporada', locationId: 'ucob', turmaId: 'culto',
  xp: 120, streak: 1, done: [3], history: { '3': { xp: 120, acertos: 4 } },
  nome: 'Fulano', avatar: '🦁', isAdmin: false, updatedAt: serverTimestamp(),
});

describe('turma mista — cadastro com código MISTA-', () => {
  beforeAll(() => setup('turma-mista'));
  afterAll(teardown);
  beforeEach(limpar);

  for (const track of ['youngAdult', 'adult']) {
    it(`quem já entrou com Google completa o cadastro como ${track} e grava o quiz na turma`, async () => {
      await semearCulto();
      await semearAluno('novo'); // o perfil nasce no login, sem local/trilha/turma
      const db = comoUsuario('novo');

      await assertSucceeds(db.doc(`inviteCodes/${CODIGO}`).get());
      await assertSucceeds(db.doc('users/novo').set(
        { id: 'novo', email: 'novo@teste.com', ...PERFIL_BASE, track, locationId: 'ucob', turmaId: 'culto', inviteCode: CODIGO },
        { merge: true },
      ));
      await assertSucceeds(db.doc(`progress/novo_${track}_${SEMANA}`).set(progresso('novo', track)));
    });

    it(`perfil criado de uma vez como ${track} também passa`, async () => {
      await semearCulto();
      const db = comoUsuario('novo2');

      await assertSucceeds(db.doc('users/novo2').set({
        id: 'novo2', email: 'novo2@teste.com', ...PERFIL_BASE, track, locationId: 'ucob', turmaId: 'culto', inviteCode: CODIGO,
      }));
    });
  }
});
