import { describe, it, expect } from 'vitest';
import { diasEmAtraso, type Licao, type LinhaProgresso } from '../../src/relatorioTemporada';

const LICOES: Licao[] = [
  { semana: 'W1', trimestre: 'T', dias: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, data: `2026-06-2${i}` })) },
];

const linha = (userId: string, done: number[], history: Record<string, any> = {}, extra: any = {}): LinhaProgresso & { liberados?: number[] } => ({
  userId, week: 'W1', nome: userId, avatar: '🦁', done, dias: done.length,
  xp: 0, isAdmin: false, isProfessor: false, history, ...extra,
});

describe('diasEmAtraso', () => {
  it('data real: atraso com a quantidade de dias; no dia ou antes não conta', () => {
    const [a] = diasEmAtraso([linha('ana', [1, 2, 3], {
      1: { emISO: '2026-06-20' },
      2: { emISO: '2026-06-24' },
      3: { emISO: '2026-06-20' }, // antes da data: não é atraso
    })], LICOES);
    expect(a.feitos).toBe(3);
    expect(a.noDia).toBe(2);
    expect(a.atrasados).toEqual([{ week: 'W1', dia: 2, data: '2026-06-21', estudadoEm: '2026-06-24', atrasoDias: 3, prova: 'data' }]);
  });

  it('sem carimbo: XP só possível com desconto vira atraso por XP; sem acertos vira sem-dados', () => {
    const [a] = diasEmAtraso([linha('bia', [1, 2, 3], {
      1: { xp: 480, acertos: 4 }, // só cabe a 100%
      2: { xp: 380, acertos: 4 }, // só cabe a 90%
      3: { xp: 100 },             // sem acertos
    })], LICOES);
    expect(a.noDia).toBe(1);
    expect(a.atrasados.map(d => [d.dia, d.prova])).toEqual([[2, 'xp'], [3, 'sem-dados']]);
  });

  it('dia liberado pelo admin não aparece como atraso', () => {
    const [a] = diasEmAtraso([linha('caio', [1], { 1: { emISO: '2026-06-25' } }, { liberados: [1] })], LICOES);
    expect(a.atrasados).toEqual([]);
    expect(a.noDia).toBe(1);
  });

  it('ignora admin/professor e ordena quem mais atrasou primeiro', () => {
    const r = diasEmAtraso([
      linha('um', [1], { 1: { emISO: '2026-06-22' } }),
      linha('dois', [1, 2], { 1: { emISO: '2026-06-22' }, 2: { emISO: '2026-06-23' } }),
      linha('prof', [1], { 1: { emISO: '2026-06-29' } }, { isProfessor: true }),
    ], LICOES);
    expect(r.map(a => a.userId)).toEqual(['dois', 'um']);
  });
});

import { situacaoSorteioSemanal, semanaTodaNoDia } from '../../src/relatorioTemporada';

describe('situacaoSorteioSemanal — zona real do sorteio da semana', () => {
  const L = LICOES[0]; // dias 1..7 = 2026-06-20 .. 2026-06-26
  const hoje = '2026-06-22'; // dias 1, 2 e 3 liberados

  it('todo dia liberado feito no dia → dentro', () => {
    const s = situacaoSorteioSemanal({ done: [1, 2, 3], history: {
      1: { emISO: '2026-06-20' }, 2: { emISO: '2026-06-21' }, 3: { emISO: '2026-06-22' } } }, L, hoje);
    expect(s.status).toBe('dentro');
    expect(s.dias.filter(d => d.situacao === 'futuro').length).toBe(4);
  });

  it('só falta o dia de hoje → ainda dá', () => {
    const s = situacaoSorteioSemanal({ done: [1, 2], history: { 1: { emISO: '2026-06-20' }, 2: { emISO: '2026-06-21' } } }, L, hoje);
    expect(s.status).toBe('falta-hoje');
  });

  it('dia de ontem feito hoje → fora, mesmo com todos os dias feitos', () => {
    const s = situacaoSorteioSemanal({ done: [1, 2, 3], history: {
      1: { emISO: '2026-06-20' }, 2: { emISO: '2026-06-22' }, 3: { emISO: '2026-06-22' } } }, L, hoje);
    expect(s.status).toBe('fora');
    expect(s.dias[1]).toMatchObject({ situacao: 'atrasado', estudadoEm: '2026-06-22' });
  });

  it('dia passado sem fazer → fora; liberado pelo admin e ainda não refeito → ainda dá', () => {
    expect(situacaoSorteioSemanal({ done: [2, 3], history: { 2: { emISO: '2026-06-21' }, 3: { emISO: '2026-06-22' } } }, L, hoje).status).toBe('fora');
    expect(situacaoSorteioSemanal({ done: [2, 3], liberados: [1], history: { 2: { emISO: '2026-06-21' }, 3: { emISO: '2026-06-22' } } }, L, hoje).status).toBe('falta-hoje');
  });

  it('dia refeito depois da liberação conta como no dia — inclusive no sorteador', () => {
    const history: any = {};
    for (let i = 1; i <= 7; i++) history[i] = { emISO: `2026-06-2${i - 1}` };
    history[1] = { emISO: '2026-06-26', liberado: true };
    expect(situacaoSorteioSemanal({ done: [1, 2, 3, 4, 5, 6, 7], history }, L, '2026-06-26').status).toBe('dentro');
    expect(semanaTodaNoDia(linha('x', [1, 2, 3, 4, 5, 6, 7], history), L)).toBe(true);
  });

  it('sem progresso nenhum → fora (dias passados faltando)', () => {
    expect(situacaoSorteioSemanal(null, L, hoje).status).toBe('fora');
  });
});
