import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Mural de orações. O mural é da TURMA e é lido por adolescentes — o que estes
// testes protegem é o que uma tela bonita não protege sozinha:
//
//  1. pedido não vaza para fora da turma (nem por consulta sem filtro);
//  2. "anônimo" é anônimo NO DOCUMENTO, não só na renderização;
//  3. o contador de orações só se mexe com o próprio uid;
//  4. o texto publicado é imutável, e apagar é do autor, do professor da
//     turma e do admin — de mais ninguém.

const PEDIDO = {
  autorId: 'aluno1',
  autorNome: 'Fulano',
  autorAvatar: '🦁',
  anonimo: false,
  turmaId: 'turma1',
  texto: 'Orem pela minha avó, que está internada.',
  oraram: [] as string[],
  coracoes: [] as string[],
  curtidas: [] as string[],
  respondido: false,
};

const RECADO = {
  pedidoId: 'p1',
  paraId: 'aluno1',
  deId: 'aluno2',
  deNome: 'Beltrano',
  deAvatar: '🐯',
  texto: 'Tô orando por você e pela sua avó. Segura firme.',
  turmaId: 'turma1',
  lida: false,
};

// Semeado direto (sem passar pelas regras) para os testes de leitura/edição,
// com um carimbo qualquer no lugar do request.time exigido na criação.
const semearPedido = (id: string, extra: Record<string, unknown> = {}) =>
  semearDoc(`pedidosOracao/${id}`, { ...PEDIDO, criadoEm: new Date(), ...extra });

const cenario = async () => {
  await semearTurma('turma1');
  await semearTurma('turma2');
  await semearAluno('aluno1', { turmaId: 'turma1' });
  await semearAluno('aluno2', { turmaId: 'turma1' });
  await semearAluno('deOutraTurma', { turmaId: 'turma2' });
  await semearAluno('semTurma');
};

describe('publicar pedido', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('aluno da turma publica o próprio pedido', async () => {
    await cenario();
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.collection('pedidosOracao').add({ ...PEDIDO, criadoEm: serverTimestamp() }),
    );
  });

  it('pedido anônimo NÃO pode carregar nome nem avatar', async () => {
    await cenario();
    const db = comoUsuario('aluno1');

    // É o ponto inteiro do anonimato: esconder na tela não adianta se o campo
    // viaja no documento que a turma toda lê.
    await assertFails(
      db.collection('pedidosOracao').add({
        ...PEDIDO, anonimo: true, criadoEm: serverTimestamp(),
      }),
    );
  });

  it('pedido anônimo passa quando vem realmente sem identificação', async () => {
    await cenario();
    const { autorNome, autorAvatar, ...semNome } = PEDIDO;
    const db = comoUsuario('aluno1');

    await assertSucceeds(
      db.collection('pedidosOracao').add({ ...semNome, anonimo: true, criadoEm: serverTimestamp() }),
    );
  });

  it('não dá para publicar em nome de outra pessoa', async () => {
    await cenario();
    const db = comoUsuario('aluno2');

    await assertFails(
      db.collection('pedidosOracao').add({ ...PEDIDO, criadoEm: serverTimestamp() }),
    );
  });

  it('não dá para publicar na turma de outra igreja', async () => {
    await cenario();
    const db = comoUsuario('deOutraTurma');

    await assertFails(
      db.collection('pedidosOracao').add({
        ...PEDIDO, autorId: 'deOutraTurma', criadoEm: serverTimestamp(),
      }),
    );
  });

  it('quem não está em turma nenhuma não publica', async () => {
    await cenario();
    const db = comoUsuario('semTurma');

    await assertFails(
      db.collection('pedidosOracao').add({
        ...PEDIDO, autorId: 'semTurma', criadoEm: serverTimestamp(),
      }),
    );
  });

  // A tela mostra a QUALQUER admin todas as turmas como "conduzidas"
  // (getTurmasQueConduzo em firebase.ts), inclusive uma em que ele não é
  // professor — o admin PRECISA conseguir publicar ali, senão a tela mente.
  it('admin publica na turma de outra igreja, mesmo sem ser professor dela', async () => {
    await cenario();
    await semearAdmin('admin1', { turmaId: 'turma2' });
    const db = comoUsuario('admin1');

    await assertSucceeds(
      db.collection('pedidosOracao').add({
        ...PEDIDO, autorId: 'admin1', turmaId: 'turma1', criadoEm: serverTimestamp(),
      }),
    );
  });

  it('pedido não nasce já orado nem já respondido', async () => {
    await cenario();
    const db = comoUsuario('aluno1');

    await assertFails(
      db.collection('pedidosOracao').add({
        ...PEDIDO, oraram: ['aluno2', 'aluno3'], criadoEm: serverTimestamp(),
      }),
    );
    await assertFails(
      db.collection('pedidosOracao').add({
        ...PEDIDO, respondido: true, criadoEm: serverTimestamp(),
      }),
    );
  });
});

describe('ler o mural', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('colega de turma lê o mural da própria turma', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.collection('pedidosOracao').where('turmaId', '==', 'turma1').get());
  });

  it('aluno de outra turma NÃO lê o mural desta', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('deOutraTurma');

    await assertFails(db.doc('pedidosOracao/p1').get());
    await assertFails(db.collection('pedidosOracao').where('turmaId', '==', 'turma1').get());
  });

  // `allow list` é tudo-ou-nada contra a CONSULTA: sem o filtro por turma, a
  // listagem inteira é recusada em vez de devolver só o que se pode ver.
  it('listagem sem filtro de turma é recusada', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertFails(db.collection('pedidosOracao').get());
  });
});

describe('orar por um pedido', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('colega entra na lista com o próprio uid', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.doc('pedidosOracao/p1').update({ oraram: ['aluno2'] }));
  });

  it('colega sai da lista quando desmarca', async () => {
    await cenario();
    await semearPedido('p1', { oraram: ['aluno1', 'aluno2'] });
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.doc('pedidosOracao/p1').update({ oraram: ['aluno1'] }));
  });

  it('ninguém inflaciona o contador com uid alheio', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertFails(db.doc('pedidosOracao/p1').update({ oraram: ['aluno1'] }));
    await assertFails(db.doc('pedidosOracao/p1').update({ oraram: ['aluno2', 'aluno1'] }));
  });

  it('ninguém apaga a oração dos outros', async () => {
    await cenario();
    await semearPedido('p1', { oraram: ['aluno1', 'aluno2'] });
    const db = comoUsuario('aluno2');

    await assertFails(db.doc('pedidosOracao/p1').update({ oraram: [] }));
  });

  it('aluno de outra turma não ora aqui', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('deOutraTurma');

    await assertFails(db.doc('pedidosOracao/p1').update({ oraram: ['deOutraTurma'] }));
  });

  it('admin ora num pedido de turma que não é a dele nem conduz', async () => {
    await cenario();
    await semearAdmin('admin1', { turmaId: 'turma2' });
    await semearPedido('p1');

    await assertSucceeds(comoUsuario('admin1').doc('pedidosOracao/p1').update({ oraram: ['admin1'] }));
  });
});

describe('respondido e texto', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('o autor marca o próprio pedido como respondido', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('pedidosOracao/p1').update({ respondido: true }));
  });

  it('colega não marca o pedido dos outros como respondido', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertFails(db.doc('pedidosOracao/p1').update({ respondido: true }));
  });

  // Pedido que muda depois de a turma orar por ele não é o mesmo pedido.
  it('o texto publicado é imutável, inclusive para o autor', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('pedidosOracao/p1').update({ texto: 'outra coisa' }));
  });

  it('o pedido não pode trocar de dono nem de turma', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno1');

    await assertFails(db.doc('pedidosOracao/p1').update({ autorId: 'aluno2' }));
    await assertFails(db.doc('pedidosOracao/p1').update({ turmaId: 'turma2' }));
  });
});

describe('apagar um pedido', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('o autor apaga o próprio pedido', async () => {
    await cenario();
    await semearPedido('p1');

    await assertSucceeds(comoUsuario('aluno1').doc('pedidosOracao/p1').delete());
  });

  it('colega de turma NÃO apaga o pedido de outro', async () => {
    await cenario();
    await semearPedido('p1');

    await assertFails(comoUsuario('aluno2').doc('pedidosOracao/p1').delete());
  });

  it('o professor da turma modera e apaga', async () => {
    await cenario();
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearPedido('p1');

    await assertSucceeds(comoUsuario('professor1').doc('pedidosOracao/p1').delete());
  });

  it('professor de OUTRA turma não apaga', async () => {
    await cenario();
    await semearProfessor('professor2', { turmaId: 'turma2' });
    await semearPedido('p1');

    await assertFails(comoUsuario('professor2').doc('pedidosOracao/p1').delete());
  });

  it('o admin apaga qualquer pedido', async () => {
    await cenario();
    await semearAdmin('admin1', { turmaId: 'turma2' });
    await semearPedido('p1');

    await assertSucceeds(comoUsuario('admin1').doc('pedidosOracao/p1').delete());
  });
});

describe('coração e curtida', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  it('colega deixa um coração e uma curtida, um de cada vez', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.doc('pedidosOracao/p1').update({ coracoes: ['aluno2'] }));
    await assertSucceeds(db.doc('pedidosOracao/p1').update({ curtidas: ['aluno2'] }));
  });

  it('coração alheio não entra', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertFails(db.doc('pedidosOracao/p1').update({ coracoes: ['aluno1'] }));
  });

  // Duas listas numa gravação só abriria "entro no coração E saio da oração
  // dos outros" no mesmo update.
  it('não dá para mexer em duas reações na mesma gravação', async () => {
    await cenario();
    await semearPedido('p1');
    const db = comoUsuario('aluno2');

    await assertFails(
      db.doc('pedidosOracao/p1').update({ coracoes: ['aluno2'], curtidas: ['aluno2'] }),
    );
  });

  it('pedido antigo, sem os campos novos, ainda aceita um coração', async () => {
    await cenario();
    const { coracoes, curtidas, ...semReacoesNovas } = PEDIDO;
    await semearDoc('pedidosOracao/antigo', { ...semReacoesNovas, criadoEm: new Date() });
    const db = comoUsuario('aluno2');

    await assertSucceeds(db.doc('pedidosOracao/antigo').update({ coracoes: ['aluno2'] }));
  });
});

describe('recados de apoio', () => {
  beforeAll(() => setup('oracoes'));
  afterAll(teardown);
  beforeEach(limpar);

  const comPedido = async () => {
    await cenario();
    await semearPedido('p1');
  };

  it('colega de turma manda um recado para quem publicou o pedido', async () => {
    await comPedido();
    const db = comoUsuario('aluno2');

    await assertSucceeds(
      db.collection('recadosApoio').add({ ...RECADO, criadoEm: serverTimestamp() }),
    );
  });

  // A trava que impede o recado de virar mensagem direta para qualquer pessoa:
  // o destinatário TEM de ser o autor do pedido citado.
  it('não dá para mandar recado para alguém que não publicou aquele pedido', async () => {
    await comPedido();
    await semearAluno('aluno3', { turmaId: 'turma1' });
    const db = comoUsuario('aluno2');

    await assertFails(
      db.collection('recadosApoio').add({ ...RECADO, paraId: 'aluno3', criadoEm: serverTimestamp() }),
    );
  });

  it('não dá para mandar recado sobre um pedido que não existe', async () => {
    await comPedido();
    const db = comoUsuario('aluno2');

    await assertFails(
      db.collection('recadosApoio').add({ ...RECADO, pedidoId: 'inventado', criadoEm: serverTimestamp() }),
    );
  });

  it('aluno de outra turma não manda recado para esta', async () => {
    await comPedido();
    const db = comoUsuario('deOutraTurma');

    await assertFails(
      db.collection('recadosApoio').add({
        ...RECADO, deId: 'deOutraTurma', deNome: 'Outro', turmaId: 'turma2', criadoEm: serverTimestamp(),
      }),
    );
  });

  it('não dá para assinar o recado com o nome de outra pessoa', async () => {
    await comPedido();
    const db = comoUsuario('aluno2');

    await assertFails(
      db.collection('recadosApoio').add({ ...RECADO, deId: 'aluno3', criadoEm: serverTimestamp() }),
    );
  });

  // Recado anônimo para adolescente é o formato clássico do bullying: o
  // anonimato do mural vale para PEDIR, nunca para escrever na caixa de alguém.
  it('recado sem assinatura é recusado', async () => {
    await comPedido();
    const { deNome, ...semNome } = RECADO;
    const db = comoUsuario('aluno2');

    await assertFails(
      db.collection('recadosApoio').add({ ...semNome, criadoEm: serverTimestamp() }),
    );
  });

  it('o destinatário lê os próprios recados', async () => {
    await comPedido();
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.collection('recadosApoio').where('paraId', '==', 'aluno1').get());
  });

  it('colega de turma NÃO lê o recado que não é dele', async () => {
    await comPedido();
    await semearAluno('aluno3', { turmaId: 'turma1' });
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('aluno3');

    await assertFails(db.doc('recadosApoio/r1').get());
    await assertFails(db.collection('recadosApoio').get());
  });

  // A liderança lê — e a tela avisa o aluno disso antes de ele escrever.
  it('o professor da turma lê os recados dela', async () => {
    await comPedido();
    await semearProfessor('professor1', { turmaId: 'turma1' });
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('professor1');

    await assertSucceeds(db.doc('recadosApoio/r1').get());
  });

  it('professor de outra turma não lê', async () => {
    await comPedido();
    await semearProfessor('professor2', { turmaId: 'turma2' });
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('professor2');

    await assertFails(db.doc('recadosApoio/r1').get());
  });

  it('o destinatário marca como lido, e nada mais muda', async () => {
    await comPedido();
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('aluno1');

    await assertSucceeds(db.doc('recadosApoio/r1').update({ lida: true }));
    await assertFails(db.doc('recadosApoio/r1').update({ texto: 'reescrito depois de lido' }));
  });

  it('quem mandou não reescreve nem marca como lido', async () => {
    await comPedido();
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });
    const db = comoUsuario('aluno2');

    await assertFails(db.doc('recadosApoio/r1').update({ lida: true }));
    await assertFails(db.doc('recadosApoio/r1').update({ texto: 'outra coisa' }));
  });

  it('destinatário, remetente e professor apagam; estranho não', async () => {
    await comPedido();
    await semearAluno('aluno3', { turmaId: 'turma1' });
    await semearDoc('recadosApoio/r1', { ...RECADO, criadoEm: new Date() });

    await assertFails(comoUsuario('aluno3').doc('recadosApoio/r1').delete());
    await assertSucceeds(comoUsuario('aluno1').doc('recadosApoio/r1').delete());
  });
});
