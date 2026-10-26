import { describe, it, expect } from 'vitest';
import { ehCodigoDeTurmaMista, podeEscolherJovemAdulto, ehRankingMisto } from '../../src/utils';

// Turma mista (jovens + adultos no culto): nada pode mudar para as turmas que
// já existem — adolescentes acima de tudo. Estes testes travam isso.

describe('turma mista — o cadastro só muda com código MISTA-', () => {
  it('códigos que já circulam continuam fixando a trilha', () => {
    for (const [code, track] of [['TEEN-AB3K9', 'teen'], ['JOV-AB3K9', 'youngAdult'], ['ADT-AB3K9', 'adult'], ['PROF-AB3K9', 'adult']]) {
      expect(podeEscolherJovemAdulto({ code, track })).toBe(false);
    }
  });

  it('código MISTA- de jovens ou adultos abre a escolha', () => {
    expect(ehCodigoDeTurmaMista(' mista-ab3k9 ')).toBe(true);
    expect(podeEscolherJovemAdulto({ code: 'MISTA-AB3K9', track: 'adult' })).toBe(true);
    expect(podeEscolherJovemAdulto({ code: 'MISTA-AB3K9', track: 'youngAdult' })).toBe(true);
  });

  it('nem um código MISTA- abre a escolha numa trilha de adolescentes', () => {
    expect(podeEscolherJovemAdulto({ code: 'MISTA-AB3K9', track: 'teen' })).toBe(false);
    expect(podeEscolherJovemAdulto(null)).toBe(false);
  });
});

describe('turma mista — cores no ranking', () => {
  it('turma de adolescentes nunca ganha cor', () => {
    expect(ehRankingMisto([{ track: 'teen' }, { track: 'teen' }, {}])).toBe(false);
  });

  it('basta um adolescente na lista para não haver cor', () => {
    expect(ehRankingMisto([{ track: 'youngAdult' }, { track: 'adult' }, { track: 'teen' }])).toBe(false);
    expect(ehRankingMisto([{ track: 'youngAdult' }, { track: 'adult' }, {}])).toBe(false);
  });

  it('turma de uma trilha só fica igual', () => {
    expect(ehRankingMisto([{ track: 'adult' }, { track: 'adult' }])).toBe(false);
    expect(ehRankingMisto([{ track: 'youngAdult' }])).toBe(false);
    expect(ehRankingMisto([])).toBe(false);
  });

  it('equipe de outra trilha não transforma a turma em mista', () => {
    expect(ehRankingMisto([{ track: 'adult' }, { track: 'youngAdult', isProfessor: true }])).toBe(false);
  });

  it('jovens e adultos juntos, sem adolescentes, ganham cor', () => {
    expect(ehRankingMisto([{ track: 'youngAdult' }, { track: 'adult' }])).toBe(true);
  });
});
