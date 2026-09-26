import { describe, it, expect } from 'vitest';
import { participantesDaTemporada, ordemPonderada, diasLiberadosPorSemana } from '../../src/sorteio';

// Uma linha por (aluno, semana), no formato que getSeasonProgress devolve.
const linha = (userId: string, week: string, dias: number, extra: Record<string, unknown> = {}) => ({
  userId, week, nome: userId, avatar: '🦁', done: Array.from({ length: dias }, (_, i) => i + 1), dias, xp: dias * 100,
  isAdmin: false, isProfessor: false, turmaId: 'turma1', track: 'teen', ...extra,
});

const META = { W1: 7, W2: 7, W3: 7 };

describe('temporada — 1 bilhete por quem estudou tudo', () => {
  it('só entra quem fez todos os dias liberados, com 1 bilhete cada', () => {
    const rows = [
      ...['W1', 'W2', 'W3'].map(w => linha('ana', w, 7)),
      linha('bia', 'W1', 7), linha('bia', 'W2', 7), linha('bia', 'W3', 6),
    ];
    const ps = participantesDaTemporada(rows, META, 'temporada-tudo', { turmaId: 'turma1' });
    expect(ps.map(p => [p.id, p.bilhetes])).toEqual([['ana', 1]]);
  });

  it('não cobra dia que ainda não foi liberado', () => {
    const rows = [linha('ana', 'W1', 7), linha('ana', 'W2', 3)];
    const ps = participantesDaTemporada(rows, { W1: 7, W2: 3, W3: 0 }, 'temporada-tudo', {});
    expect(ps.map(p => p.id)).toEqual(['ana']);
  });
});

describe('temporada — 1 bilhete por semana completa', () => {
  it('conta um bilhete por semana fechada, e quem fechou uma só também entra', () => {
    const rows = [
      ...['W1', 'W2', 'W3'].map(w => linha('ana', w, 7)),
      linha('bia', 'W1', 7), linha('bia', 'W2', 5),
      linha('caio', 'W1', 6),
    ];
    const ps = participantesDaTemporada(rows, META, 'temporada-bilhete-por-semana', { turmaId: 'turma1' });
    expect(ps.map(p => [p.id, p.bilhetes])).toEqual([['ana', 3], ['bia', 1]]);
  });

  it('doc duplicado da mesma semana não vira bilhete a mais', () => {
    const rows = [linha('ana', 'W1', 7), linha('ana', 'W1', 7, { track: 'teen' })];
    const ps = participantesDaTemporada(rows, META, 'temporada-bilhete-por-semana', {});
    expect(ps[0].bilhetes).toBe(1);
  });
});

describe('recorte da turma', () => {
  it('semana antiga sem carimbo de turma não tira a vaga de quem está na turma', () => {
    const rows = [
      linha('ana', 'W1', 7, { turmaId: undefined }),
      linha('ana', 'W2', 7), linha('ana', 'W3', 7),
    ];
    const ps = participantesDaTemporada(rows, META, 'temporada-tudo', { turmaId: 'turma1' });
    expect(ps.map(p => p.id)).toEqual(['ana']);
  });

  it('quem trocou de turma conta só na turma em que está agora', () => {
    const rows = [
      linha('ana', 'W1', 7, { turmaId: 'turma2' }),
      linha('ana', 'W2', 7), linha('ana', 'W3', 7),
    ];
    expect(participantesDaTemporada(rows, META, 'temporada-bilhete-por-semana', { turmaId: 'turma1' })[0].bilhetes).toBe(3);
    expect(participantesDaTemporada(rows, META, 'temporada-bilhete-por-semana', { turmaId: 'turma2' })).toEqual([]);
  });

  it('nome e avatar vêm da semana mais recente', () => {
    const rows = [
      linha('ana', 'W3', 7, { nome: 'Ana Clara', avatar: '🦊' }),
      linha('ana', 'W1', 7, { nome: 'Ana', avatar: '🐧' }),
      linha('ana', 'W2', 7, { nome: 'Ana C', avatar: '🐶' }),
    ];
    const [p] = participantesDaTemporada(rows, META, 'temporada-tudo', {});
    expect([p.nome, p.avatar]).toEqual(['Ana Clara', '🦊']);
  });

  it('admin e professor não concorrem', () => {
    const rows = [
      ...['W1', 'W2', 'W3'].map(w => linha('prof', w, 7, { isProfessor: true })),
      ...['W1', 'W2', 'W3'].map(w => linha('adm', w, 7, { isAdmin: true })),
    ];
    expect(participantesDaTemporada(rows, META, 'temporada-tudo', {})).toEqual([]);
  });

  it('outra trilha fica de fora', () => {
    const rows = ['W1', 'W2', 'W3'].map(w => linha('ana', w, 7, { track: 'adult' }));
    expect(participantesDaTemporada(rows, META, 'temporada-tudo', { track: 'teen' })).toEqual([]);
  });
});

describe('ordemPonderada', () => {
  it('sorteia todo mundo, uma vez cada', () => {
    const ordem = ordemPonderada([{ bilhetes: 3 }, { bilhetes: 1 }, { bilhetes: 5 }]);
    expect([...ordem].sort()).toEqual([0, 1, 2]);
  });

  it('a chance do 1º lugar acompanha os bilhetes', () => {
    // 9 bilhetes contra 1: o primeiro deve sair perto de 90% das vezes.
    let primeiro = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (ordemPonderada([{ bilhetes: 9 }, { bilhetes: 1 }])[0] === 0) primeiro++;
    expect(primeiro / N).toBeGreaterThan(0.86);
    expect(primeiro / N).toBeLessThan(0.94);
  });
});

describe('diasLiberadosPorSemana', () => {
  it('conta só os dias com data até hoje', () => {
    const licoes = [
      { semana: 'W1', dias: [{ data: '2026-09-26' }, { data: '2026-09-27' }, { data: '2026-09-28' }] },
      { semana: 'W2', dias: [{ data: '2026-10-03' }] },
    ];
    expect(diasLiberadosPorSemana(licoes, '2026-09-27')).toEqual({ W1: 2, W2: 0 });
  });
});
