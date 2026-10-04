import { describe, it, expect } from 'vitest';
import { respostaConfere, normalizarResposta, prepararEspecial, ehEspecial } from '../../src/perguntasEspeciais';

describe('digitar: comparação tolerante', () => {
  const q = { tipo: 'digitar', pergunta: '...', resposta: 'Jeremias', aceitas: ['Jr'] };

  it('ignora acento, caixa, pontuação e artigo', () => {
    expect(normalizarResposta('  O Fílho! ')).toBe('filho');
    expect(respostaConfere('jeremias', q)).toBe(true);
    expect(respostaConfere('JEREMIAS.', q)).toBe(true);
  });

  it('aceita um erro de digitação em palavra média, nenhum em palavra curta', () => {
    expect(respostaConfere('jeremais', q)).toBe(false);   // troca = 2 operações
    expect(respostaConfere('jeremia', q)).toBe(true);
    expect(respostaConfere('jr', q)).toBe(true);           // está em `aceitas`
    expect(respostaConfere('jo', { resposta: 'Jó' })).toBe(true);
    expect(respostaConfere('ja', { resposta: 'Jó' })).toBe(false);
  });

  it('resposta vazia nunca confere', () => {
    expect(respostaConfere('   ', q)).toBe(false);
  });
});

describe('prepararEspecial', () => {
  it('reconhece só os tipos especiais', () => {
    expect(ehEspecial({ tipo: 'ordenar' })).toBe(true);
    expect(ehEspecial({ pergunta: 'x', opcoes: ['a', 'b'] })).toBe(false);
  });

  it('múltipla: embaralha mantendo o gabarito pelo texto', () => {
    const q = { tipo: 'multipla', pergunta: 'p', opcoes: ['A', 'B', 'C', 'D'], corretas: [0, 2] };
    for (let k = 0; k < 20; k++) {
      const p = prepararEspecial(q);
      expect(p.corretas.map((i: number) => p.opcoes[i]).sort()).toEqual(['A', 'C']);
    }
  });

  it('ordenar: nunca exibe já na ordem certa', () => {
    const q = { tipo: 'ordenar', pergunta: 'p', itens: ['1', '2', '3'] };
    for (let k = 0; k < 30; k++) {
      const p = prepararEspecial(q);
      expect(p.embaralhados.every((v: number, i: number) => v === i)).toBe(false);
      expect([...p.embaralhados].sort()).toEqual([0, 1, 2]);
    }
  });

  it('descarta malformadas em vez de quebrar o quiz', () => {
    expect(prepararEspecial({ tipo: 'multipla', pergunta: 'p', opcoes: ['A', 'B', 'C'], corretas: [5] })).toBeNull();
    expect(prepararEspecial({ tipo: 'ordenar', pergunta: 'p', itens: ['a', 'a', 'b'] })).toBeNull();
    expect(prepararEspecial({ tipo: 'pares', pergunta: 'p', pares: [['a', 'x'], ['b', 'x'], ['c', 'y']] })).toBeNull();
    expect(prepararEspecial({ tipo: 'relampago', pergunta: 'p', itens: [{ texto: 'a', verdadeiro: 'sim' }] })).toBeNull();
    expect(prepararEspecial({ tipo: 'digitar', pergunta: 'p', resposta: '' })).toBeNull();
  });
});
