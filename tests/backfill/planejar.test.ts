import { describe, it, expect } from 'vitest';
import { planejarBackfill } from '../../src/backfillTurmas';

// A decisão de quem entra na turma não depende de rede, e é onde um erro
// custaria caro: carimbar alguém na turma errada o põe no ranking errado, e
// carimbar progresso sem carimbar o dono TRAVA todo save daquele aluno (a
// regra exige turmaId == ownTurmaId()). Por isso ela é testada com objetos
// comuns, sem emulador — roda em milissegundos e cobre os casos de borda.

const turma = { id: 'turmaA', nome: 'Adolescentes', locationId: 'igreja1', track: 'teen' };

describe('planejarBackfill — quem entra na turma', () => {
  it('carimba o aluno da mesma igreja e trilha', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', nome: 'Ana', locationId: 'igreja1', track: 'teen' }],
      progressos: [],
      turma,
    });
    expect(r.elegiveis.map(e => e.id)).toEqual(['a1']);
  });

  // Antes das trilhas, todo mundo era teen — e a chave legada `${uid}_${week}`
  // é teen. Sem esta leitura, o aluno mais antigo da escola ficaria de fora.
  it('trata perfil sem trilha como teen', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1' }],
      progressos: [],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(1);
  });

  it('não mistura trilha: quem é adult não entra na turma teen', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'adult' }],
      progressos: [],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.contagem.outraTrilha).toBe(1);
  });

  it('não mistura igreja', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja2', track: 'teen' }],
      progressos: [],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.contagem.outraIgreja).toBe(1);
  });

  // Quem não tem igreja é ambíguo com mais de uma igreja no sistema: conta,
  // relata, e só entra quando alguém pedir explicitamente.
  it('deixa de fora quem não tem igreja, a menos que peçam', () => {
    const usuarios = [{ id: 'a1', track: 'teen' }];
    expect(planejarBackfill({ usuarios, progressos: [], turma }).contagem.elegiveis).toBe(0);
    expect(planejarBackfill({ usuarios, progressos: [], turma }).contagem.semIgreja).toBe(1);
    expect(planejarBackfill({ usuarios, progressos: [], turma, incluirSemIgreja: true }).contagem.elegiveis).toBe(1);
  });

  it('convidado do Ao Vivo não entra em turma', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'g1', isGuest: true, locationId: 'igreja1', track: 'teen' }],
      progressos: [],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.contagem.convidados).toBe(1);
  });

  it('nunca tira alguém de outra turma', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaB' }],
      progressos: [],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.contagem.emOutraTurma).toBe(1);
  });

  // Idempotência: a segunda passada não tem o que escrever.
  it('rodar de novo não escreve nada', () => {
    const usuarios = [{ id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' }];
    const progressos = [{ id: 'a1_2026-01', userId: 'a1', track: 'teen', turmaId: 'turmaA' }];
    const r = planejarBackfill({ usuarios, progressos, turma });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.progContagem.elegiveis).toBe(0);
    expect(r.contagem.jaNestaTurma).toBe(1);
    expect(r.progContagem.jaNestaTurma).toBe(1);
  });
});

describe('planejarBackfill — a igreja que falta no perfil', () => {
  // A turma define a igreja (Anexo A do plano). Quem está na turma sem
  // locationId fica de fora de tudo que é recortado por igreja — a escalação
  // de duplas, por exemplo.
  it('aponta quem está na turma sem igreja', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', nome: 'Ana', track: 'teen', turmaId: 'turmaA' }],
      progressos: [],
      turma,
    });
    expect(r.igrejaFaltando.map(u => u.id)).toEqual(['a1']);
  });

  it('aponta também quem está entrando agora sem igreja', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', nome: 'Ana', track: 'teen' }],
      progressos: [],
      turma,
      incluirSemIgreja: true,
    });
    expect(r.contagem.elegiveis).toBe(1);
    expect(r.igrejaFaltando.map(u => u.id)).toEqual(['a1']);
  });

  it('não mexe em quem já tem a igreja certa', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' }],
      progressos: [],
      turma,
    });
    expect(r.igrejaFaltando).toEqual([]);
    expect(r.igrejaDivergente).toBe(0);
  });

  // Perfil apontando para outra igreja é conflito de dado: sobrescrever
  // esconderia o problema. Conta, relata, não toca.
  it('conta, mas não toca, em perfil apontando para outra igreja', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja2', track: 'teen', turmaId: 'turmaA' }],
      progressos: [],
      turma,
    });
    expect(r.igrejaFaltando).toEqual([]);
    expect(r.igrejaDivergente).toBe(1);
  });

  it('ignora quem não é da turma', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', track: 'teen', turmaId: 'outraTurma' }],
      progressos: [],
      turma,
    });
    expect(r.igrejaFaltando).toEqual([]);
  });
});

describe('planejarBackfill — qual progresso é carimbado', () => {
  it('carimba o progresso de quem acabou de entrar', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen' }],
      progressos: [{ id: 'a1_2026-01', userId: 'a1', track: 'teen' }],
      turma,
    });
    expect(r.progElegiveis.map(p => p.id)).toEqual(['a1_2026-01']);
  });

  // Chave legada `${uid}_${week}`, sem trilha no meio: é teen por definição.
  it('carimba o progresso legado, sem campo track', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen' }],
      progressos: [{ id: 'a1_2025-40', userId: 'a1' }],
      turma,
    });
    expect(r.progElegiveis.map(p => p.id)).toEqual(['a1_2025-40']);
  });

  // Quem trocou de trilha tem histórico de outra: carimbá-lo aqui o poria no
  // ranking de uma turma que ele nunca frequentou naquela trilha.
  it('não carimba o histórico de outra trilha do mesmo aluno', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen' }],
      progressos: [
        { id: 'a1_2026-01', userId: 'a1', track: 'teen' },
        { id: 'a1_adult_2026-01', userId: 'a1', track: 'adult' },
      ],
      turma,
    });
    expect(r.progElegiveis.map(p => p.id)).toEqual(['a1_2026-01']);
    expect(r.progContagem.outraTrilha).toBe(1);
  });

  // A trava central: progresso carimbado sem o dono carimbado faria a regra
  // recusar TODO save seguinte daquele aluno, em silêncio.
  it('nunca carimba progresso de dono que não entrou na turma', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja2', track: 'teen' }],
      progressos: [{ id: 'a1_2026-01', userId: 'a1', track: 'teen' }],
      turma,
    });
    expect(r.elegiveis).toEqual([]);
    expect(r.progElegiveis).toEqual([]);
    expect(r.progContagem.deOutroDono).toBe(1);
  });

  it('carimba o progresso de quem já estava na turma mas ficou sem o campo', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' }],
      progressos: [{ id: 'a1_2026-01', userId: 'a1', track: 'teen' }],
      turma,
    });
    expect(r.contagem.elegiveis).toBe(0);
    expect(r.progElegiveis.map(p => p.id)).toEqual(['a1_2026-01']);
  });

  it('não mexe em progresso já apontando para outra turma', () => {
    const r = planejarBackfill({
      usuarios: [{ id: 'a1', locationId: 'igreja1', track: 'teen', turmaId: 'turmaA' }],
      progressos: [{ id: 'a1_2026-01', userId: 'a1', track: 'teen', turmaId: 'turmaB' }],
      turma,
    });
    expect(r.progElegiveis).toEqual([]);
    expect(r.progContagem.emOutraTurma).toBe(1);
  });
});
