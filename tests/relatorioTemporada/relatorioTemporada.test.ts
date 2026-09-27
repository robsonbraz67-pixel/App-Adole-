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
