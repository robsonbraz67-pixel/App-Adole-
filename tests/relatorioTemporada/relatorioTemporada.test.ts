import { describe, it, expect } from 'vitest';
import {
  diaFoiEstudadoNoCerto, velocidadeDoAluno, ofensivaReal, melhorSemana,
  diaMaisEstudado, maratonistas, liderancaPeloExemplo, type Licao, type LinhaProgresso,
} from '../../src/relatorioTemporada';

// Duas semanas de 7 dias cada, com datas reais — o bastante para testar
// ofensiva/melhor-semana/dia-mais-estudado sem embarcar uma temporada inteira.
const LICOES: Licao[] = [
  { semana: 'W1', trimestre: 'T', dias: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, data: `2026-06-2${i}` })) },
  { semana: 'W2', trimestre: 'T', dias: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, data: `2026-07-0${i + 1}` })) },
];

const linha = (userId: string, week: string, done: number[], history: Record<string, any> = {}, extra: Partial<LinhaProgresso> = {}): LinhaProgresso => ({
  userId, week, nome: userId, avatar: '🦁', done, dias: done.length,
  xp: done.length * 100, isAdmin: false, isProfessor: false, history, ...extra,
});

describe('diaFoiEstudadoNoCerto — data real manda, sem ambiguidade', () => {
  it('com emISO, só compara a data — nem olha o XP', () => {
    expect(diaFoiEstudadoNoCerto({ emISO: '2026-06-20' }, '2026-06-20', null)).toBe(true);
    expect(diaFoiEstudadoNoCerto({ emISO: '2026-06-21' }, '2026-06-20', null)).toBe(false);
  });

  it('sem emISO, um XP só possível a 100% é "no dia certo"', () => {
    // 4 acertos: leitura (100) + 4 respostas (75..100 cada) => no dia certo o
    // XP fica em [400,500]. 480 não cabe em nenhuma das faixas de atraso
    // (90%: [362,450]; 75%: [299,375]), então só a hipótese "no dia" sobra.
    expect(diaFoiEstudadoNoCerto({ xp: 480, acertos: 4 }, '2026-06-20', null)).toBe(true);
  });

  it('sem emISO, um XP só possível atrasado não vira "no dia certo"', () => {
    // 380 não cabe em [400,500] (100%), só em [362,450] (90%).
    expect(diaFoiEstudadoNoCerto({ xp: 380, acertos: 4 }, '2026-06-20', null)).toBe(false);
  });

  it('dia ambíguo (cabe em mais de uma hipótese) usa a velocidade típica do aluno', () => {
    // 420 cabe tanto em [400,500] (100%, implica s≈80) quanto em [362,450]
    // (90%, implica s≈91,7) — a régua de 75% fica fora (só vai até 375).
    // Uma velocidade típica perto de 80 aponta pro dia certo; perto de 95, pro
    // atraso — é a MEDIANA do próprio aluno que desempata, nunca um palpite.
    expect(diaFoiEstudadoNoCerto({ xp: 420, acertos: 4 }, '2026-06-20', 80)).toBe(true);
    expect(diaFoiEstudadoNoCerto({ xp: 420, acertos: 4 }, '2026-06-20', 95)).toBe(false);
  });

  it('sem dado nenhum (xp/acertos ausentes) não afirma nada', () => {
    expect(diaFoiEstudadoNoCerto({}, '2026-06-20', null)).toBe(false);
  });
});

describe('velocidadeDoAluno — mediana dos dias confirmados no dia certo', () => {
  it('ignora dias sem prova de que foram no dia certo', () => {
    const linhas = [linha('ana', 'W1', [1, 2], {
      '1': { emISO: '2026-06-20', xp: 396, acertos: 4 }, // (396-100)/4=74
      '2': { emISO: '2026-07-10', xp: 200, acertos: 4 }, // atrasado, fora da conta
    })];
    expect(velocidadeDoAluno(linhas, LICOES)).toBe(74);
  });

  it('sem nenhum dia confirmado, devolve null (nunca inventa uma referência)', () => {
    expect(velocidadeDoAluno([linha('ana', 'W1', [1], { '1': { emISO: '2026-07-10', xp: 200, acertos: 4 } })], LICOES)).toBeNull();
  });
});

describe('ofensivaReal — só dias seguidos NO DIA CERTO, nunca antes da conta existir', () => {
  it('conta a sequência de datas reais consecutivas', () => {
    const linhas = [linha('ana', 'W1', [1, 2, 3], {
      '1': { emISO: '2026-06-20' }, '2': { emISO: '2026-06-21' }, '3': { emISO: '2026-06-22' },
    })];
    const r = ofensivaReal(linhas, LICOES, '2026-06-01', '2026-07-07');
    expect(r).toEqual({ dias: 3, inicio: '2026-06-20', fim: '2026-06-22' });
  });

  it('um dia de furo quebra a sequência', () => {
    const linhas = [linha('ana', 'W1', [1, 3], {
      '1': { emISO: '2026-06-20' }, '3': { emISO: '2026-06-22' }, // pulou o dia 2 (06-21)
    })];
    expect(ofensivaReal(linhas, LICOES, '2026-06-01', '2026-07-07').dias).toBe(1);
  });

  it('descarta dias com data anterior à criação da conta (recuperação não é sequência)', () => {
    const linhas = [linha('ana', 'W1', [1, 2], {
      '1': { emISO: '2026-06-20' }, '2': { emISO: '2026-06-21' },
    })];
    // conta criada só depois do dia 2 -> nenhum dos dois pode contar
    expect(ofensivaReal(linhas, LICOES, '2026-06-22', '2026-07-07').dias).toBe(0);
  });
});

describe('melhorSemana — mais estudos no dia certo, desempate por acertos', () => {
  it('ordena pela contagem de estudos no dia certo', () => {
    const linhas = [
      linha('ana', 'W1', [1, 2], { '1': { emISO: '2026-06-20', acertos: 4 }, '2': { emISO: '2026-06-21', acertos: 3 } }),
      linha('bia', 'W2', [1], { '1': { emISO: '2026-07-01', acertos: 4 } }),
    ];
    const r = melhorSemana(linhas, LICOES);
    expect(r[0].week).toBe('W1');
    expect(r[0].estudosNoDia).toBe(2);
    expect(r[1].week).toBe('W2');
  });
});

describe('diaMaisEstudado — só conta quem estudou no dia certo', () => {
  it('não conta quem estudou atrasado na mesma data de calendário', () => {
    const linhas = [
      linha('ana', 'W1', [1], { '1': { emISO: '2026-06-20' } }),
      linha('bia', 'W1', [1], { '1': { emISO: '2026-07-05' } }), // atrasada, não é 06-20
    ];
    const r = diaMaisEstudado(linhas, LICOES);
    expect(r[0]).toEqual({ data: '2026-06-20', alunos: 1 });
  });
});

describe('maratonistas — mais lições atrasadas concluídas num único dia real', () => {
  it('só conta lições com data real diferente da data da lição', () => {
    const linhas = [linha('ana', 'W1', [1, 2, 3], {
      '1': { emISO: '2026-07-10' }, '2': { emISO: '2026-07-10' }, '3': { emISO: '2026-06-22' }, // no dia certo, não conta
    })];
    const r = maratonistas(linhas, LICOES);
    expect(r[0]).toMatchObject({ userId: 'ana', maxNumDia: 2, dataMax: '2026-07-10', totalRecuperado: 2 });
  });

  it('quem não recuperou nada não aparece na lista', () => {
    const linhas = [linha('ana', 'W1', [1], { '1': { emISO: '2026-06-20' } })];
    expect(maratonistas(linhas, LICOES)).toEqual([]);
  });
});

describe('liderancaPeloExemplo — admin/professor, somando todas as trilhas', () => {
  it('soma os dias de trilhas diferentes da mesma pessoa', () => {
    const linhas = [
      linha('robgo', 'W1', [1, 2], {}, { isAdmin: true, track: 'teen' }),
      linha('robgo', 'W1', [1, 2, 3], {}, { isAdmin: true, track: 'adult' }),
      linha('aluno', 'W1', [1], {}, { isAdmin: false, isProfessor: false }),
    ];
    const r = liderancaPeloExemplo(linhas);
    expect(r).toEqual([{ nome: 'robgo', dias: 5 }]);
  });
});

// ===== Apresentação: perfis, conquistas e pistas =====
import { perfisDosAlunos, conquistasDosAlunos, pistasDoPodio } from '../../src/relatorioTemporada';

const semanaCompleta = (userId: string, week: string, datas: string[], xpPorDia = 450, extra: Partial<LinhaProgresso> = {}) =>
  linha(userId, week, [1, 2, 3, 4, 5, 6, 7],
    Object.fromEntries(datas.map((d, i) => [String(i + 1), { emISO: d, xp: xpPorDia, acertos: 4 }])),
    { xp: xpPorDia * 7, ...extra });

const DATAS_W1 = LICOES[0].dias.map(d => d.data!);
const DATAS_W2 = LICOES[1].dias.map(d => d.data!);

describe('perfisDosAlunos', () => {
  it('ordena como o ranking (dias, depois XP) e soma as semanas de cada um', () => {
    const linhas = [
      semanaCompleta('ana', 'W1', DATAS_W1, 450), semanaCompleta('ana', 'W2', DATAS_W2, 450),
      semanaCompleta('bia', 'W1', DATAS_W1, 480),
    ];
    const ps = perfisDosAlunos(linhas, LICOES, {}, '2026-07-07');
    expect(ps.map(p => [p.userId, p.dias, p.semanasCompletas])).toEqual([['ana', 14, 2], ['bia', 7, 1]]);
    expect(ps[0].noDia).toBe(14);
    expect(ps[0].pctAcertos).toBe(100);
  });

  it('deixa admin e professor de fora', () => {
    const linhas = [semanaCompleta('prof', 'W1', DATAS_W1, 450, { isProfessor: true }), semanaCompleta('ana', 'W1', DATAS_W1)];
    expect(perfisDosAlunos(linhas, LICOES, {}, '2026-07-07').map(p => p.userId)).toEqual(['ana']);
  });
});

describe('conquistasDosAlunos', () => {
  it('dá um texto para cada aluno, e o pódio leva a posição na frente', () => {
    const linhas = ['a', 'b', 'c', 'd', 'e'].map((id, i) => semanaCompleta(id, 'W1', DATAS_W1, 500 - i * 10));
    const ps = perfisDosAlunos(linhas, [LICOES[0]], {}, '2026-06-26');
    const c = conquistasDosAlunos(ps, [LICOES[0]]);
    expect(Object.keys(c).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(c.a).toMatch(/^1º lugar/);
    expect(c.b).toMatch(/^2º lugar/);
    expect(c.c).toMatch(/^3º lugar/);
    // Fora do pódio, os títulos de categoria não se repetem.
    expect(c.d).not.toBe(c.e);
  });
});

describe('pistasDoPodio', () => {
  it('termina no XP com a diferença para o lugar de baixo', () => {
    const linhas = [semanaCompleta('a', 'W1', DATAS_W1, 500), semanaCompleta('b', 'W1', DATAS_W1, 480)];
    const ps = perfisDosAlunos(linhas, [LICOES[0]], {}, '2026-06-26');
    const pistas = pistasDoPodio(ps, 0, [LICOES[0]]);
    expect(pistas[0]).toContain('7 de 7 dias');
    expect(pistas[pistas.length - 1]).toContain('140 à frente do 2º lugar');
  });

  it('posição sem ninguém devolve lista vazia', () => {
    expect(pistasDoPodio([], 0, LICOES)).toEqual([]);
  });
});

describe('conquistasDosAlunos — superlativo só para o 1º da turma inteira', () => {
  it('quem só perde para alguém do pódio não ganha "Maior…"/"Mais…"', () => {
    // 'a' (pódio) estuda tudo no dia certo; 'd' e 'e' têm menos dias no dia certo.
    const semAtraso = semanaCompleta('a', 'W1', DATAS_W1, 500);
    const outros = ['b', 'c'].map((id, i) => semanaCompleta(id, 'W1', DATAS_W1, 490 - i * 10));
    const d = linha('d', 'W1', [1, 2, 3], { '1': { emISO: DATAS_W1[0], xp: 480, acertos: 4 }, '2': { emISO: DATAS_W1[1], xp: 480, acertos: 4 }, '3': { emISO: DATAS_W1[2], xp: 480, acertos: 4 } });
    const ps = perfisDosAlunos([semAtraso, ...outros, d], [LICOES[0]], {}, '2026-06-26');
    const c = conquistasDosAlunos(ps, [LICOES[0]]);
    expect(c.d).not.toMatch(/^(Maior|Mais|Melhor|Recorde|Quem mais)/);
  });
});

describe('perfisDosAlunos — semanas 100% no dia certo (ticket semanal)', () => {
  it('conta a semana só quando os 7 dias foram na data certa', () => {
    const perfeita = semanaCompleta('ana', 'W1', DATAS_W1);
    const umAtrasado = semanaCompleta('ana', 'W2', [...DATAS_W2.slice(0, 6), '2026-07-20']);
    const [p] = perfisDosAlunos([perfeita, umAtrasado], LICOES, {}, '2026-07-21');
    expect(p.semanasCompletas).toBe(2);
    expect(p.semanasNoDia).toBe(1);
  });
});

import { semanaTodaNoDia } from '../../src/relatorioTemporada';
describe('semanaTodaNoDia — regra do sorteio semanal', () => {
  it('vale só com os 7 dias feitos, todos no dia certo', () => {
    expect(semanaTodaNoDia(semanaCompleta('ana', 'W1', DATAS_W1), LICOES[0])).toBe(true);
  });
  it('um dia atrasado tira a semana', () => {
    const atrasou = semanaCompleta('ana', 'W1', [...DATAS_W1.slice(0, 6), '2026-06-30']);
    expect(semanaTodaNoDia(atrasou, LICOES[0])).toBe(false);
  });
  it('um dia faltando tira a semana', () => {
    const faltou = linha('ana', 'W1', [1, 2, 3, 4, 5, 6], Object.fromEntries(DATAS_W1.slice(0, 6).map((d, i) => [String(i + 1), { emISO: d }])));
    expect(semanaTodaNoDia(faltou, LICOES[0])).toBe(false);
  });
});
