import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Motivos de oração particulares — a coleção que ninguém além do dono lê.
//
// Estes testes existem por causa da promessa da tela: "só você vê". Um
// adolescente escreve ali justamente o que não quer que a turma saiba, e às
// vezes o que não quer que o professor saiba. Ou a regra sustenta isso, ou a
// tela não devia prometer.
//
// Por isso o bloco mais importante daqui é o que prova quem NÃO lê — incluindo
// o admin, que tem saída em praticamente todas as outras regras do sistema.

const particular = (autorId: string, extra: Record<string, unknown> = {}) => ({
  autorId,
  texto: 'meus pais estão brigando muito em casa',
  respondida: false,
  criadoEm: serverTimestamp(),
  ...extra,
});

describe('só o dono lê o que é particular', () => {
  beforeAll(() => setup('particulares'));
  afterAll(teardown);
  beforeEach(limpar);

  const cenario = async () => {
    await semearTurma('turma1', { professores: ['prof'] });
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await semearAluno('colega', { turmaId: 'turma1' });
    await semearProfessor('prof', { turmaId: 'turma1' });
    await semearAdmin('admin1');
    await semearDoc('oracoesParticulares/p1', { ...particular('aluno1'), criadoEm: new Date() });
  };

  it('o dono lê o próprio motivo', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('aluno1').doc('oracoesParticulares/p1').get());
  });

  // A consulta que o app faz — o lembrete antes do estudo e a aba particular.
  it('o dono lista os próprios motivos', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('aluno1').collection('oracoesParticulares').where('autorId', '==', 'aluno1').get());
  });

  it('colega de turma NÃO lê', async () => {
    await cenario();
    await assertFails(comoUsuario('colega').doc('oracoesParticulares/p1').get());
    await assertFails(comoUsuario('colega').collection('oracoesParticulares').where('autorId', '==', 'aluno1').get());
  });

  // Diferente do mural: lá o professor lê até o pedido anônimo, e a tela avisa
  // isso. Aqui a tela promete o contrário, e a regra tem de cumprir.
  it('o professor da turma NÃO lê', async () => {
    await cenario();
    await assertFails(comoUsuario('prof').doc('oracoesParticulares/p1').get());
    await assertFails(comoUsuario('prof').collection('oracoesParticulares').where('autorId', '==', 'aluno1').get());
  });

  // O teste que mais importa: em quase toda outra regra do sistema o admin tem
  // saída. Aqui, não.
  it('o admin NÃO lê', async () => {
    await cenario();
    await assertFails(comoUsuario('admin1').doc('oracoesParticulares/p1').get());
    await assertFails(comoUsuario('admin1').collection('oracoesParticulares').get());
  });

  it('ninguém lista a coleção inteira', async () => {
    await cenario();
    await assertFails(comoUsuario('aluno1').collection('oracoesParticulares').get());
  });
});

describe('escrever, marcar respondida e apagar', () => {
  beforeAll(() => setup('particulares'));
  afterAll(teardown);
  beforeEach(limpar);

  it('o dono cria o próprio motivo', async () => {
    await semearAluno('aluno1');
    await assertSucceeds(comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1')));
  });

  it('com categoria da lista', async () => {
    await semearAluno('aluno1');
    await assertSucceeds(
      comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1', { categoria: 'familia' })),
    );
  });

  it('categoria inventada é recusada', async () => {
    await semearAluno('aluno1');
    await assertFails(
      comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1', { categoria: 'qualquer' })),
    );
  });

  it('não dá para escrever em nome de outra pessoa', async () => {
    await semearAluno('aluno1');
    await semearAluno('colega');
    await assertFails(comoUsuario('colega').doc('oracoesParticulares/novo').set(particular('aluno1')));
  });

  it('não nasce já respondida', async () => {
    await semearAluno('aluno1');
    await assertFails(
      comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1', { respondida: true })),
    );
  });

  it('texto vazio não passa', async () => {
    await semearAluno('aluno1');
    await assertFails(comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1', { texto: '' })));
  });

  it('campo a mais derruba a gravação', async () => {
    await semearAluno('aluno1');
    await assertFails(
      comoUsuario('aluno1').doc('oracoesParticulares/novo').set(particular('aluno1', { turmaId: 'turma1' })),
    );
  });

  it('o dono marca como respondida', async () => {
    await semearAluno('aluno1');
    await semearDoc('oracoesParticulares/p1', { ...particular('aluno1'), criadoEm: new Date() });
    await assertSucceeds(comoUsuario('aluno1').doc('oracoesParticulares/p1').update({ respondida: true }));
  });

  // Motivo que se reescreve depois não é mais o mesmo motivo — a mesma escolha
  // do texto imutável do mural.
  it('o texto não muda depois', async () => {
    await semearAluno('aluno1');
    await semearDoc('oracoesParticulares/p1', { ...particular('aluno1'), criadoEm: new Date() });
    await assertFails(comoUsuario('aluno1').doc('oracoesParticulares/p1').update({ texto: 'outra coisa' }));
  });

  it('outra pessoa não marca nem apaga', async () => {
    await semearAluno('aluno1');
    await semearAluno('colega');
    await semearAdmin('admin1');
    await semearDoc('oracoesParticulares/p1', { ...particular('aluno1'), criadoEm: new Date() });

    await assertFails(comoUsuario('colega').doc('oracoesParticulares/p1').update({ respondida: true }));
    await assertFails(comoUsuario('colega').doc('oracoesParticulares/p1').delete());
    await assertFails(comoUsuario('admin1').doc('oracoesParticulares/p1').delete());
  });

  it('o dono apaga o que não quer mais guardar', async () => {
    await semearAluno('aluno1');
    await semearDoc('oracoesParticulares/p1', { ...particular('aluno1'), criadoEm: new Date() });
    await assertSucceeds(comoUsuario('aluno1').doc('oracoesParticulares/p1').delete());
  });
});

describe('categoria no mural da turma', () => {
  beforeAll(() => setup('particulares'));
  afterAll(teardown);
  beforeEach(limpar);

  const pedido = (extra: Record<string, unknown> = {}) => ({
    autorId: 'aluno1', turmaId: 'turma1', texto: 'orem por mim', anonimo: true,
    oraram: [], coracoes: [], curtidas: [], respondido: false, criadoEm: serverTimestamp(), ...extra,
  });

  it('pedido com categoria da lista passa', async () => {
    await semearTurma('turma1');
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await assertSucceeds(comoUsuario('aluno1').doc('pedidosOracao/novo').set(pedido({ categoria: 'escola' })));
  });

  it('categoria inventada é recusada', async () => {
    await semearTurma('turma1');
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await assertFails(comoUsuario('aluno1').doc('pedidosOracao/novo').set(pedido({ categoria: 'futebol' })));
  });

  // Princípio 3: o mural de hoje inteiro está sem categoria e não pode parar
  // de funcionar por causa disso.
  it('pedido SEM categoria continua passando', async () => {
    await semearTurma('turma1');
    await semearAluno('aluno1', { turmaId: 'turma1' });
    await assertSucceeds(comoUsuario('aluno1').doc('pedidosOracao/novo').set(pedido()));
  });
});
