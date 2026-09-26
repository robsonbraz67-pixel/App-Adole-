import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import { setup, teardown, limpar, comoUsuario, semearAluno, semearAdmin, semearProfessor, semearDoc, semearTurma } from './helpers';

// Registro dos ganhadores do Sorteador. O que estes testes protegem:
//
//  1. só quem conduz a turma registra — aluno nunca, nem na própria turma;
//  2. o registro é imutável (prova de quem ganhou não se reescreve);
//  3. a turma lê os próprios ganhadores, e só os dela;
//  4. o documento não carrega a foto inteira nem mente sobre quem sorteou.

const SORTEIO = {
  turmaId: 'turma1',
  track: 'teen',
  tipo: 'semana',
  periodo: '2026-W39',
  regra: 'semana-completa',
  ganhadorId: 'aluno1',
  ganhadorNome: 'Fulano',
  ganhadorAvatar: '🦁',
  participantes: 9,
  bilhetes: 9,
  sorteadoPor: 'prof1',
  sorteadoPorNome: 'Professor',
};

const semearSorteio = (id: string, extra: Record<string, unknown> = {}) =>
  semearDoc(`sorteios/${id}`, { ...SORTEIO, criadoEm: new Date(), ...extra });

const cenario = async () => {
  await semearTurma('turma1', { professores: ['prof1'] });
  await semearTurma('turma2');
  await semearProfessor('prof1', { turmaId: 'turma1' });
  await semearProfessor('profOutra', { turmaId: 'turma2' });
  await semearAluno('aluno1', { turmaId: 'turma1' });
  await semearAluno('deOutraTurma', { turmaId: 'turma2' });
};

describe('registrar ganhador', () => {
  beforeAll(() => setup('sorteios'));
  afterAll(teardown);
  beforeEach(limpar);

  it('professor da turma registra', async () => {
    await cenario();
    await assertSucceeds(comoUsuario('prof1').collection('sorteios').add({ ...SORTEIO, criadoEm: serverTimestamp() }));
  });

  it('professor que conduz a turma sem ser dela registra', async () => {
    await cenario();
    await semearTurma('turma1', { professores: ['prof1', 'profOutra'] });
    await assertSucceeds(comoUsuario('profOutra').collection('sorteios').add({
      ...SORTEIO, sorteadoPor: 'profOutra', criadoEm: serverTimestamp(),
    }));
  });

  it('admin registra em qualquer turma', async () => {
    await cenario();
    await semearAdmin('admin1', { turmaId: 'turma2' });
    await assertSucceeds(comoUsuario('admin1').collection('sorteios').add({
      ...SORTEIO, sorteadoPor: 'admin1', criadoEm: serverTimestamp(),
    }));
  });

  it('aluno não registra, nem na própria turma', async () => {
    await cenario();
    await assertFails(comoUsuario('aluno1').collection('sorteios').add({
      ...SORTEIO, sorteadoPor: 'aluno1', criadoEm: serverTimestamp(),
    }));
  });

  it('professor de outra turma não registra', async () => {
    await cenario();
    await assertFails(comoUsuario('profOutra').collection('sorteios').add({
      ...SORTEIO, sorteadoPor: 'profOutra', criadoEm: serverTimestamp(),
    }));
  });

  it('não dá para registrar em nome de outra pessoa', async () => {
    await cenario();
    await assertFails(comoUsuario('prof1').collection('sorteios').add({
      ...SORTEIO, sorteadoPor: 'outraPessoa', criadoEm: serverTimestamp(),
    }));
  });

  it('não aceita a foto em data URI no lugar do emoji', async () => {
    await cenario();
    await assertFails(comoUsuario('prof1').collection('sorteios').add({
      ...SORTEIO, ganhadorAvatar: 'data:image/png;base64,' + 'A'.repeat(200), criadoEm: serverTimestamp(),
    }));
  });

  it('regra precisa combinar com o tipo', async () => {
    await cenario();
    await assertFails(comoUsuario('prof1').collection('sorteios').add({
      ...SORTEIO, tipo: 'temporada', regra: 'semana-completa', criadoEm: serverTimestamp(),
    }));
    await assertSucceeds(comoUsuario('prof1').collection('sorteios').add({
      ...SORTEIO, tipo: 'temporada', periodo: 'Livro Aberto', regra: 'temporada-bilhete-por-semana', bilhetes: 40, criadoEm: serverTimestamp(),
    }));
  });

  it('menos bilhetes que participantes não fecha a conta', async () => {
    await cenario();
    await assertFails(comoUsuario('prof1').collection('sorteios').add({
      ...SORTEIO, participantes: 9, bilhetes: 3, criadoEm: serverTimestamp(),
    }));
  });
});

describe('ler, editar e apagar', () => {
  beforeAll(() => setup('sorteios-ler'));
  afterAll(teardown);
  beforeEach(limpar);

  it('a turma lê os próprios ganhadores', async () => {
    await cenario();
    await semearSorteio('s1');
    await assertSucceeds(comoUsuario('aluno1').collection('sorteios').where('turmaId', '==', 'turma1').get());
  });

  it('outra turma não lê', async () => {
    await cenario();
    await semearSorteio('s1');
    await assertFails(comoUsuario('deOutraTurma').doc('sorteios/s1').get());
    await assertFails(comoUsuario('deOutraTurma').collection('sorteios').where('turmaId', '==', 'turma1').get());
  });

  it('consulta sem filtro de turma é recusada', async () => {
    await cenario();
    await semearSorteio('s1');
    await assertFails(comoUsuario('aluno1').collection('sorteios').get());
  });

  it('ninguém reescreve um ganhador, nem o admin', async () => {
    await cenario();
    await semearAdmin('admin1');
    await semearSorteio('s1');
    await assertFails(comoUsuario('prof1').doc('sorteios/s1').update({ ganhadorNome: 'Outro' }));
    await assertFails(comoUsuario('admin1').doc('sorteios/s1').update({ ganhadorNome: 'Outro' }));
  });

  it('professor da turma e admin apagam; aluno não', async () => {
    await cenario();
    await semearAdmin('admin1');
    await semearSorteio('s1');
    await semearSorteio('s2');
    await assertFails(comoUsuario('aluno1').doc('sorteios/s1').delete());
    await assertSucceeds(comoUsuario('prof1').doc('sorteios/s1').delete());
    await assertSucceeds(comoUsuario('admin1').doc('sorteios/s2').delete());
  });
});
