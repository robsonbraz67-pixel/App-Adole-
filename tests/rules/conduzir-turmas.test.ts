import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Fase 6 — "de que turma eu faço parte" e "que turma eu conduzo" deixam de ser
// o mesmo campo.
//
// Até aqui, liderança era `users/{uid}.turmaId`, que é único e congelado depois
// de definido: um professor conduzia UMA turma e pronto. Agora a autoridade é
// `turmas/{id}.professores`, e o turmaId do perfil volta a significar só
// matrícula.
//
// O que estes testes precisam provar, nesta ordem de importância:
//   1. quem conduz enxerga e age na turma que conduz;
//   2. NADA se alargou para quem não conduz — nem para quem está na lista sem
//      ser professor, nem para professor nenhum fora das turmas dele;
//   3. o caminho da segunda turma (o convite) não virou uma porta para
//      qualquer turma.

const CONDUZ = { professores: ['prof'] };

describe('professor conduz turma de que não faz parte', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  // O professor É da turma1 (matrícula) e CONDUZ a turma2 (lista). É o caso
  // que não existia antes: as duas turmas ao mesmo tempo.
  const cenario = async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma2', CONDUZ);
    await semearTurma('turma3');
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await semearAluno('aluno2', { turmaId: 'turma2' });
    await semearAluno('aluno3', { turmaId: 'turma3' });
  };

  it('lê o perfil de aluno da turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').doc('users/aluno2').get());
  });

  it('lista os alunos da turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').collection('users').where('turmaId', '==', 'turma2').get());
  });

  it('continua lendo a turma de que faz parte', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').collection('users').where('turmaId', '==', 'turma1').get());
  });

  // O ponto 2: alargar não pode ter virado "professor vê tudo de novo".
  it('NÃO lê a turma que não conduz', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').doc('users/aluno3').get());
    await assertFails(comoUsuario('prof').collection('users').where('turmaId', '==', 'turma3').get());
  });

  it('NÃO lista o sistema inteiro', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').collection('users').get());
  });

  // `professores` só vale como autoridade junto com a flag do perfil. Sem
  // isto, bastava um admin digitar o uid errado na lista para promover alguém.
  it('estar na lista sem ser professor não dá nada', async () => {
    await cenario();
    await semearTurma('turma4', { professores: ['aluno1'] });
    await semearAluno('aluno4', { turmaId: 'turma4' });
    await assertFails(comoUsuario('aluno1').doc('users/aluno4').get());
  });

  // A guarda do turmaId vazio: quem conduz alguma coisa não pode passar a ver
  // todo perfil que está sem turma.
  it('quem conduz não enxerga quem está sem turma nenhuma', async () => {
    await cenario();
    await semearAluno('semTurma');
    await assertFails(comoUsuario('prof').doc('users/semTurma').get());
  });
});

describe('mural de orações da turma conduzida', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  const pedido = (turmaId: string, autorId: string) => ({
    autorId, turmaId, texto: 'orem por mim', anonimo: true,
    oraram: [], coracoes: [], curtidas: [], respondido: false, criadoEm: serverTimestamp(),
  });

  const cenario = async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma2', CONDUZ);
    await semearTurma('turma3');
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAluno('aluno2', { turmaId: 'turma2' });
    await semearDoc('pedidosOracao/p2', { ...pedido('turma2', 'aluno2'), criadoEm: new Date() });
    await semearDoc('pedidosOracao/p3', { ...pedido('turma3', 'aluno3'), criadoEm: new Date() });
  };

  it('lê o mural da turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').collection('pedidosOracao').where('turmaId', '==', 'turma2').get());
  });

  it('NÃO lê o mural de turma que não conduz', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').collection('pedidosOracao').where('turmaId', '==', 'turma3').get());
    await assertFails(comoUsuario('prof').doc('pedidosOracao/p3').get());
  });

  // Publicar na turma conduzida sem fazer parte dela é exatamente o que a
  // regra antiga recusava (`turmaId == minhaTurma()`, e só).
  it('publica pedido na turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').doc('pedidosOracao/novo').set(pedido('turma2', 'prof')));
  });

  it('NÃO publica em turma que não conduz', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').doc('pedidosOracao/novo').set(pedido('turma3', 'prof')));
  });

  it('ora pelo pedido da turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').doc('pedidosOracao/p2').update({ oraram: ['prof'] }));
  });

  // Moderação: é o professor que precisa poder tirar do mural o que não pode
  // ficar lá. Sai por professorDaMesmaTurma, que passou a incluir as conduzidas.
  it('apaga pedido da turma que conduz', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof').doc('pedidosOracao/p2').delete());
  });

  it('NÃO apaga pedido de turma que não conduz', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').doc('pedidosOracao/p3').delete());
  });

  it('aluno continua sem ver o mural da turma vizinha', async () => {
    await cenario();
    await assertFails(comoUsuario('aluno2').collection('pedidosOracao').where('turmaId', '==', 'turma3').get());
  });
});

describe('recado de apoio para quem eu conduzo', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  const recado = (turmaId: string, paraId: string) => ({
    pedidoId: 'p2', paraId, deId: 'prof', deNome: 'Prof', deAvatar: '🦁',
    texto: 'estou orando por você', turmaId, lida: false, criadoEm: serverTimestamp(),
  });

  it('manda recado no pedido da turma que conduz', async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma2', CONDUZ);
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAluno('aluno2', { turmaId: 'turma2' });
    await semearDoc('pedidosOracao/p2', {
      autorId: 'aluno2', turmaId: 'turma2', texto: 'orem', anonimo: true,
      oraram: [], respondido: false, criadoEm: new Date(),
    });

    await assertSucceeds(comoUsuario('prof').doc('recadosApoio/r1').set(recado('turma2', 'aluno2')));
  });

  it('NÃO manda recado em pedido de turma que não conduz', async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma3');
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAluno('aluno3', { turmaId: 'turma3' });
    await semearDoc('pedidosOracao/p2', {
      autorId: 'aluno3', turmaId: 'turma3', texto: 'orem', anonimo: true,
      oraram: [], respondido: false, criadoEm: new Date(),
    });

    await assertFails(comoUsuario('prof').doc('recadosApoio/r1').set(recado('turma3', 'aluno3')));
  });
});

describe('código de matrícula das turmas que conduzo', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  const codigo = (turmaId: string) => ({
    code: 'ABCD', locationId: 'igreja1', turmaId, track: 'juvenil',
    active: true, createdBy: 'prof', createdAt: serverTimestamp(),
  });

  it('emite código para a turma que conduz', async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma2', CONDUZ);
    await semearProfessor('prof', { turmaId: 'turma1' });

    await assertSucceeds(comoUsuario('prof').doc('inviteCodes/ABCD').set(codigo('turma2')));
  });

  it('NÃO emite código para turma que não conduz', async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma3');
    await semearProfessor('prof', { turmaId: 'turma1' });

    await assertFails(comoUsuario('prof').doc('inviteCodes/ABCD').set(codigo('turma3')));
  });
});

describe('o resgate de convite não move mais a matrícula', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  const convite = (turmaId: string, usedBy: string) => ({
    code: 'PROF-X', locationId: 'igreja1', turmaId, active: false,
    createdBy: 'admin1', createdAt: new Date(), expiresAt: new Date(Date.now() + 864e5),
    usedBy, usedAt: new Date(),
  });

  // O caminho de quem entra no app já matriculado e depois vira professor de
  // OUTRA turma: antes, o resgate arrastava a matrícula junto e ele perdia o
  // mural e o ranking da turma de que fazia parte.
  it('quem já tem turma vira professor sem trocar de turma', async () => {
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearAluno('novo', { turmaId: 'turma1' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2', 'novo'));

    await assertSucceeds(
      comoUsuario('novo').doc('users/novo').update({ isProfessor: true, inviteCode: 'PROF-X' }),
    );
  });

  it('e NÃO consegue mudar a própria turma no mesmo movimento', async () => {
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearAluno('novo', { turmaId: 'turma1' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2', 'novo'));

    await assertFails(
      comoUsuario('novo').doc('users/novo').update({ isProfessor: true, inviteCode: 'PROF-X', turmaId: 'turma2' }),
    );
  });

  // Quem chega pelo convite, sem matrícula anterior, continua herdando a turma.
  it('quem não tem turma ainda herda a do convite', async () => {
    await semearTurma('turma2');
    await semearAluno('novo');
    await semearDoc('teacherInvites/PROF-X', convite('turma2', 'novo'));

    await assertSucceeds(
      comoUsuario('novo').doc('users/novo').update({ isProfessor: true, inviteCode: 'PROF-X', turmaId: 'turma2' }),
    );
  });

  it('mas só a do convite, não uma turma qualquer', async () => {
    await semearTurma('turma2');
    await semearTurma('turma3');
    await semearAluno('novo');
    await semearDoc('teacherInvites/PROF-X', convite('turma2', 'novo'));

    await assertFails(
      comoUsuario('novo').doc('users/novo').update({ isProfessor: true, inviteCode: 'PROF-X', turmaId: 'turma3' }),
    );
  });

  it('convite queimado por OUTRA pessoa não promove ninguém', async () => {
    await semearTurma('turma2');
    await semearAluno('novo');
    await semearDoc('teacherInvites/PROF-X', convite('turma2', 'outro'));

    await assertFails(
      comoUsuario('novo').doc('users/novo').update({ isProfessor: true, inviteCode: 'PROF-X', turmaId: 'turma2' }),
    );
  });
});

describe('entrar sozinho na lista de professores', () => {
  beforeAll(() => setup('conduzir'));
  afterAll(teardown);
  beforeEach(limpar);

  const convite = (turmaId: string) => ({
    code: 'PROF-X', locationId: 'igreja1', turmaId, active: false,
    createdBy: 'admin1', createdAt: new Date(), expiresAt: new Date(Date.now() + 864e5),
    usedBy: 'prof', usedAt: new Date(),
  });

  // Segunda turma: o professor já é da turma1 e acabou de queimar um convite
  // da turma2. É este passo que o cliente faz logo depois do resgate.
  it('entra na turma para a qual o próprio convite aponta', async () => {
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearProfessor('prof', { turmaId: 'turma1', inviteCode: 'PROF-X' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2'));

    await assertSucceeds(
      comoUsuario('prof').doc('turmas/turma2').update({ professores: ['prof'], updatedAt: serverTimestamp() }),
    );
  });

  it('NÃO entra numa turma que o convite dele não menciona', async () => {
    await semearTurma('turma1');
    await semearTurma('turma2');
    await semearTurma('turma3');
    await semearProfessor('prof', { turmaId: 'turma1', inviteCode: 'PROF-X' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2'));

    await assertFails(
      comoUsuario('prof').doc('turmas/turma3').update({ professores: ['prof'], updatedAt: serverTimestamp() }),
    );
  });

  // A trava que já existia e continua valendo: entrar é só para si mesmo, um
  // por vez, e sem derrubar quem já está.
  it('NÃO coloca outra pessoa na lista', async () => {
    await semearTurma('turma2');
    await semearProfessor('prof', { turmaId: 'turma1', inviteCode: 'PROF-X' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2'));

    await assertFails(
      comoUsuario('prof').doc('turmas/turma2').update({ professores: ['prof', 'outro'], updatedAt: serverTimestamp() }),
    );
  });

  it('NÃO tira quem já estava', async () => {
    await semearTurma('turma2', { professores: ['antigo'] });
    await semearProfessor('prof', { turmaId: 'turma1', inviteCode: 'PROF-X' });
    await semearDoc('teacherInvites/PROF-X', convite('turma2'));

    await assertFails(
      comoUsuario('prof').doc('turmas/turma2').update({ professores: ['prof'], updatedAt: serverTimestamp() }),
    );
  });

  it('quem conduz renomeia a turma que conduz', async () => {
    await semearTurma('turma2', CONDUZ);
    await semearProfessor('prof', { turmaId: 'turma1' });

    await assertSucceeds(
      comoUsuario('prof').doc('turmas/turma2').update({ nome: 'Adolescentes B', updatedAt: serverTimestamp() }),
    );
  });

  // Mover aluno de turma segue sendo ato de admin, conduza ele quantas
  // turmas conduzir.
  it('quem conduz NÃO muda a turma de um aluno', async () => {
    await semearTurma('turma1', CONDUZ);
    await semearTurma('turma2', CONDUZ);
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAluno('aluno2', { turmaId: 'turma2' });

    await assertFails(comoUsuario('prof').doc('users/aluno2').update({ turmaId: 'turma1' }));
  });

  it('admin continua pondo professor em qualquer turma', async () => {
    await semearTurma('turma2');
    await semearAdmin('admin1');

    await assertSucceeds(
      comoUsuario('admin1').doc('turmas/turma2').update({ professores: ['prof', 'outro'], updatedAt: serverTimestamp() }),
    );
  });
});
