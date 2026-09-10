import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearTurma, SUPER_ADMIN_EMAIL } from './helpers';

// users/{uid} é o documento mais sensível do app: é onde moram isAdmin,
// isProfessor, locationId e track. Toda escalada de privilégio passa por
// alguém conseguir escrever um campo aqui que não devia.

describe('users — criação e edição do próprio perfil', () => {
  beforeAll(() => setup('perfil'));
  afterAll(teardown);
  beforeEach(limpar);

  // #3
  it('aluno cria o próprio perfil no primeiro login', async () => {
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc('users/aluno1').set({
        id: 'aluno1', nome: 'Fulano', avatar: '🦁', email: 'aluno1@teste.com',
        criadoEm: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  // #4
  it('aluno atualiza nome e avatar do próprio perfil', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc('users/aluno1').update({ nome: 'Novo Nome', avatar: '🐯' }),
    );
  });

  // #8 — create: hasOnly permite a chave isAdmin, mas só passa com o e-mail
  // fixo do super admin (linha 124 do firestore.rules).
  it('aluno não se autopromove a isAdmin no create', async () => {
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').set({
        id: 'aluno1', nome: 'Fulano', avatar: '🦁', email: 'aluno1@teste.com',
        isAdmin: true,
      }),
    );
  });

  // #9 — mesma trava, agora no update de um perfil que já existe sem isAdmin.
  it('aluno não se autopromove a isAdmin no update', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ isAdmin: true }));
  });

  // #10 — diferente do #9: isProfessor nem está na lista de chaves que o
  // dono pode afetar (linha 129), então a recusa é estrutural, não por e-mail.
  it('aluno não se autopromove a isProfessor no update', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ isProfessor: true }));
  });

  // #11 — só admin/professor trocam a própria trilha; aluno comum, não.
  it('aluno não troca a própria trilha', async () => {
    await semearAluno('aluno1', { track: 'teen' });
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ track: 'adult' }));
  });

  // #12 — locationId é travado assim que definido, mesmo para quem gerencia
  // (a correção de local de outro usuário passa pelo branch de admin, não por
  // aqui — ver adminSetUserLocation em firebase.ts).
  it('aluno não troca o próprio local depois de definido', async () => {
    await semearAluno('aluno1', { locationId: 'igreja1' });
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ locationId: 'igreja2' }));
  });

  // #13
  it('aluno não altera o próprio e-mail', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ email: 'outro@teste.com' }));
  });

  // Controle positivo do #8/#9: o e-mail fixo do super admin PODE se
  // autopromover. Sem este teste, um endurecimento acidental da condição de
  // e-mail travaria o próprio robsonbraz67@gmail.com fora do próprio painel.
  it('o e-mail do super admin pode se autopromover a isAdmin', async () => {
    const db = comoUsuario('superadmin', SUPER_ADMIN_EMAIL);

    await assertSucceeds(
      db.doc('users/superadmin').set({
        id: 'superadmin', nome: 'Robson', avatar: '🦁', email: SUPER_ADMIN_EMAIL,
        isAdmin: true,
      }),
    );
  });
});

// ===== Fase 1: trilha juvenil e vínculo com turma =====
describe('users — trilha juvenil e turmaId', () => {
  beforeAll(() => setup('perfil'));
  afterAll(teardown);
  beforeEach(limpar);

  // #31
  it('juvenil é uma trilha válida', async () => {
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.doc('users/aluno1').set({
        id: 'aluno1', nome: 'Fulano', avatar: '🦁', email: 'aluno1@teste.com',
        track: 'juvenil',
      }),
    );
  });

  // #32 — o enum continua fechado: alargar não é abrir.
  it('trilha inventada continua recusada', async () => {
    const db = comoUsuario('aluno1');

    await assertFails(
      db.doc('users/aluno1').set({
        id: 'aluno1', nome: 'Fulano', avatar: '🦁', email: 'aluno1@teste.com',
        track: 'infantil',
      }),
    );
  });

  // #34 — a matrícula da Fase 4 depende de o próprio aluno conseguir gravar
  // o turmaId quando ainda não tem nenhum.
  it('aluno define o próprio turmaId quando ainda não tem', async () => {
    await semearAluno('aluno1');
    await semearTurma('turma1');
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('users/aluno1').update({ turmaId: 'turma1' }));
  });

  // #46 — mesma proteção que o locationId já tem: sem ela, bastaria inventar
  // um turmaId para o progresso (que precisa bater com ownTurmaId()) carimbar
  // aquela turma e o aluno aparecer no ranking de outra igreja.
  it('aluno não se matricula em turma que não existe', async () => {
    await semearAluno('aluno1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ turmaId: 'turmaInventada' }));
  });

  // #35 — mesma trava do locationId: definido uma vez, só admin troca.
  it('aluno não troca o próprio turmaId depois de definido', async () => {
    await semearAluno('aluno1', { turmaId: 'turma1' });
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno1').update({ turmaId: 'turma2' }));
  });

  // Nem quem gerencia se muda de turma sozinho: trocar alguém de turma é ato
  // administrativo, e passa pelo branch de admin do update.
  it('professor também não troca a própria turma sozinho', async () => {
    await semearProfessor('professor1', { turmaId: 'turma1' });
    const db = comoUsuario('professor1');

    await assertFails(db.doc('users/professor1').update({ turmaId: 'turma2' }));
  });

  // #36 — é assim que o admin corrige uma matrícula errada.
  it('admin troca o turmaId de um aluno', async () => {
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await semearAdmin('admin1');
    const db = comoUsuario('admin1');

    await assertSucceeds(db.doc('users/aluno1').update({ turmaId: 'turma2' }));
  });
});

describe('users — leitura por terceiros', () => {
  beforeAll(() => setup('perfil'));
  afterAll(teardown);
  beforeEach(limpar);

  // #20
  it('aluno não lê o perfil de outro', async () => {
    await semearAluno('aluno1');
    await semearAluno('aluno2');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('users/aluno2').get());
  });

  // #21 — MUDOU na Fase 3b (ver INVARIANTES.md). Era "professor lê qualquer
  // aluno"; passou a ser "professor lê os alunos da PRÓPRIA turma". A mudança
  // é o objetivo da fase, não um acidente: antes, um professor enxergava o
  // sistema inteiro. O escopo completo está em escopo-professor.test.ts.
  it('professor lê o perfil de um aluno da própria turma', async () => {
    await semearTurma('turma1');
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await semearProfessor('professor1', { turmaId: 'turma1' });
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('users/aluno1').get());
  });
});
