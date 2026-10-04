import { describe, it, expect } from 'vitest';
import { getTrackLessons, getTrackHistory, loadTrackLessons, loadTrackLessonsComHistorico, getTrackLessonsComHistorico } from '../../src/data';
import { montarResumoTemporada } from '../../src/relatorioTemporada';

const TRILHAS = ['teen', 'youngAdult', 'adult'] as const;

describe('histórico de temporadas encerradas', () => {
  it('o esqueleto não carrega texto de estudo nem perguntas', () => {
    for (const t of ['teen', 'adult']) {
      const hist = getTrackHistory(t);
      expect(hist.length).toBe(13);
      for (const l of hist) {
        expect(l.historico).toBe(true);
        expect(l.dias).toHaveLength(7);
        expect(Object.keys(l).sort()).toEqual(['dias', 'historico', 'semana', 'titulo', 'trimestre']);
        for (const d of l.dias) expect(Object.keys(d).sort()).toEqual(['data', 'diaSemana', 'id']);
      }
    }
    expect(getTrackHistory('youngAdult')).toEqual([]);
  });

  it('estudo, quiz e trilha do aluno (getTrackLessons) nunca enxergam o histórico', async () => {
    for (const t of TRILHAS) {
      const atuais = await loadTrackLessons(t);
      expect(atuais.length).toBe(13);
      expect(getTrackLessons(t).some((l: any) => l.historico)).toBe(false);
      for (const l of atuais) expect(l.dias.every((d: any) => d.conteudo && d.perguntas?.length)).toBe(true);
    }
  });

  it('histórico + atuais ficam em ordem cronológica, sem semana nem data repetida', async () => {
    for (const t of TRILHAS) {
      const todas = await loadTrackLessonsComHistorico(t);
      expect(getTrackLessonsComHistorico(t)).toHaveLength(todas.length);
      const datas = todas.flatMap((l: any) => l.dias.map((d: any) => d.data));
      expect(new Set(datas).size).toBe(datas.length);                   // nenhuma data duplicada
      expect([...datas].sort()).toEqual(datas);                         // já em ordem
      const semanas = todas.map((l: any) => l.semana);
      expect(new Set(semanas).size).toBe(semanas.length);               // nenhuma semana duplicada
    }
  });

  it('a temporada encerrada ainda alimenta o resumo da apresentação', async () => {
    const todas = await loadTrackLessonsComHistorico('teen');
    const licoes = todas.filter((l: any) => l.trimestre === 'Provado pelo Fogo');
    expect(licoes).toHaveLength(13);
    const resumo = montarResumoTemporada({
      linhasDaTurma: [], linhasLiderancaTodasTrilhas: [], licoes, criadoEmPorAluno: {},
      turmaNome: 'Turma', trimestre: 'Provado pelo Fogo', hojeISO: '2026-10-04',
    } as any);
    expect(resumo).toBeTruthy();
  });
});
