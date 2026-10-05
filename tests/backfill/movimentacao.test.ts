import { describe, it, expect } from 'vitest';
import { planejarBackfill, planejarMovimentacao, planejarReparoDeTurma } from '../../src/backfillTurmas';

// Mover alguém de turma e reparar o progresso sem turma são as duas portas
// pelas quais um aluno some (ou aparece no lugar errado) do ranking da turma.
// Mesma filosofia de planejar.test.ts: decisão pura, testada sem emulador.

const turmaA = { id: 'turmaA', nome: 'Adolescentes', locationId: 'igreja1', track: 'teen' };
const turmaJ = { id: 'turmaJ', nome: 'Jovens', locationId: 'igreja1', track: 'youngAdult' };

describe('planejarMovimentacao — mover ou inserir um aluno', () => {
  it('insere quem está sem turma e traz o progresso da trilha', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja1', track: 'teen' },
      progressos: [
        { id: 'a1_2026-W39', userId: 'a1', track: 'teen' },
        { id: 'a1_2026-W40', userId: 'a1', track: 'teen' },
      ],
      turma: turmaA,
    });
    expect(r.perfil).toEqual({ turmaId: 'turmaA' });
    expect(r.progresso).toEqual(['a1_2026-W39', 'a1_2026-W40']);
    expect(r.deTurma).toBeNull();
  });

  it('move de turma reescrevendo o progresso que apontava para a antiga', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaB' },
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', track: 'teen', turmaId: 'turmaB' }],
      turma: turmaA,
    });
    expect(r.deTurma).toBe('turmaB');
    expect(r.progresso).toEqual(['a1_2026-W39']);
  });

  // A turma define igreja e trilha: o perfil herda as duas, e o progresso de
  // outra trilha fica onde está (é outro ranking).
  it('troca igreja e trilha junto e deixa o progresso de outra trilha em paz', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja2', track: 'teen', turmaId: 'turmaB' },
      progressos: [
        { id: 'a1_2026-W39', userId: 'a1', track: 'teen', turmaId: 'turmaB' },
        { id: 'a1_youngAdult_2026-W40', userId: 'a1', track: 'youngAdult' },
      ],
      turma: turmaJ,
    });
    expect(r.perfil).toEqual({ turmaId: 'turmaJ', locationId: 'igreja1', track: 'youngAdult' });
    expect(r.progresso).toEqual(['a1_youngAdult_2026-W40']);
    expect(r.outraTrilha).toBe(1);
  });

  it('nunca toca progresso de outra pessoa', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja1', track: 'teen' },
      progressos: [{ id: 'b2_2026-W39', userId: 'b2', track: 'teen' }],
      turma: turmaA,
    });
    expect(r.progresso).toEqual([]);
  });

  it('quem já está certo não tem nada a fazer', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' },
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', turmaId: 'turmaA' }],
      turma: turmaA,
    });
    expect(r.nadaAFazer).toBe(true);
  });

  // O caso do "na semana passada eu não apareço": já é da turma, mas uma
  // semana ficou sem carimbo.
  it('acerta a semana sem carimbo de quem já é da turma', () => {
    const r = planejarMovimentacao({
      usuario: { id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' },
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', track: 'teen' }],
      turma: turmaA,
    });
    expect(r.jaEstava).toBe(true);
    expect(r.nadaAFazer).toBe(false);
    expect(r.progresso).toEqual(['a1_2026-W39']);
  });
});

describe('planejarReparoDeTurma — o reparo de hora em hora', () => {
  const usuarios = [{ id: 'a1', turmaId: 'turmaA', track: 'teen' }];

  it('preenche a turma atual do dono no progresso sem turma', () => {
    const r = planejarReparoDeTurma({
      usuarios,
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', track: 'teen' }],
      turmas: [turmaA],
    });
    expect(r).toEqual([{ id: 'a1_2026-W39', turmaId: 'turmaA' }]);
  });

  it('nunca troca um turmaId que já existe', () => {
    const r = planejarReparoDeTurma({
      usuarios,
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', track: 'teen', turmaId: 'turmaB' }],
      turmas: [turmaA],
    });
    expect(r).toEqual([]);
  });

  it('ignora progresso de outra trilha, dono sem turma, convidado e turma inexistente', () => {
    const r = planejarReparoDeTurma({
      usuarios: [
        ...usuarios,
        { id: 'b2' },
        { id: 'c3', turmaId: 'turmaA', isGuest: true },
        { id: 'd4', turmaId: 'sumiu' },
      ],
      progressos: [
        { id: 'a1_youngAdult_2026-W39', userId: 'a1', track: 'youngAdult' },
        { id: 'b2_2026-W39', userId: 'b2' },
        { id: 'c3_2026-W39', userId: 'c3' },
        { id: 'd4_2026-W39', userId: 'd4' },
      ],
      turmas: [turmaA],
    });
    expect(r).toEqual([]);
  });
});

describe('planejarBackfill — semanas presas na turma anterior', () => {
  it('lista o progresso de membro que ficou na turma antiga, sem carimbá-lo', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', nome: 'André', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' }],
      progressos: [{ id: 'a1_2026-W39', userId: 'a1', track: 'teen', turmaId: 'turmaB' }],
      turma: turmaA,
    });
    expect(r.progElegiveis).toEqual([]);
    expect(r.progDesalinhados).toEqual([{ id: 'a1_2026-W39', userId: 'a1', de: 'turmaB' }]);
    expect(r.donosDoProgresso).toEqual(['André']);
  });
});
