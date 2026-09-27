import { describe, it, expect } from 'vitest';
import LICOES_TEEN from '../../src/lessonsTeen';
import { montarApresentacao, conquistas, pistasDoPodio, partesDaLicao, type Slide } from '../../src/apresentacaoEncerramento';
import { RESUMO, PERFIS } from './fixture';

const CTX = { licoes: LICOES_TEEN as any[], track: 'teen', hojeISO: '2026-09-26', aleatorio: () => 0 };
const slides = montarApresentacao(RESUMO, CTX);
const slide = <T extends Slide['tipo']>(id: string) => slides.find(s => s.id === id) as Extract<Slide, { tipo: T }>;

describe('montarApresentacao — os 22 slides do PPT de Provado pelo Fogo', () => {
  it('mesma ordem do PPT original', () => {
    expect(slides.map(s => s.id)).toEqual([
      'capa', 'numeros', 'dia', 'semana', 'lideranca', 'maratonistas', 'ofensiva', 'clube', 'antes-do-podio',
      'misterio-3', 'revelacao-3', 'misterio-2', 'revelacao-2', 'misterio-1', 'revelacao-1',
      'turma', 'urna', 'sorteio', 'proxima', 'vouchers', 'simulacao', 'fim',
    ]);
  });

  it('capa: nome, número de lições e datas da temporada saem das lições', () => {
    const s = slide<'capa'>('capa');
    expect(s.titulo).toBe('Provado pelo Fogo');
    expect(s.subtitulo).toBe('13 lições · 27 de junho a 25 de setembro de 2026');
    expect(s.linha).toBe('Adolescentes — ASA NORTE');
    expect(s.cortina).toBe(true); // tela preta antes de abrir
  });

  it('números: um clique por número, e o total com os professores', () => {
    const s = slide<'numeros'>('numeros');
    expect(s.cards.map(c => [c.valor, c.rotulo])).toEqual([[946, 'dias estudados'], [14, 'adolescentes'], [131, 'semanas completas'], [383349, 'XP conquistados']]);
    expect(s.passos).toBe(4);
    expect(s.rodape).toBe('Com os professores, foram 1.163 dias de estudo.');
  });

  it('dia mais estudado: empate no 2º lugar e a história da Lição 7', () => {
    const s = slide<'dia'>('dia');
    expect(s.data).toBe('23/09');
    expect(s.legenda).toBe('quarta-feira · 11 adolescentes estudaram no dia certo');
    expect(s.lateral).toEqual([
      '2º lugar, empatados com 10: 08/08, 22/09 e 25/09',
      '08/08 foi o sábado em que começou a Lição 7 — Provado pelo Fogo, a lição que dá nome à temporada.',
    ]);
  });

  it('melhor semana: número e nome da lição', () => {
    const s = slide<'podio'>('semana');
    expect(s.itens[0]).toEqual({ pos: 1, titulo: 'Lição 13', destaque: '64 estudos no dia certo', detalhe: 'O Sábado e a Lei de Deus · 12 alunos · 91,8% de acertos' });
    expect(s.itens[1].titulo).toBe('Lição 6');
  });

  it('liderança: quem estudou em duas trilhas aparece com a divisão', () => {
    const s = slide<'podio'>('lideranca');
    expect(s.itens.map(i => i.detalhe)).toEqual(['não perdeu nenhum', 'estudados na temporada', '36 na trilha de adulto + 8 na de adolescentes']);
  });

  it('maratonistas: quem fechou, quem entrou depois, e a menção honrosa', () => {
    const s = slide<'podio'>('maratonistas');
    expect(s.itens.map(i => [i.destaque, i.detalhe])).toEqual([
      ['38 lições em 19/09', 'Fechou os 91 dias · total recuperado: 46'],
      ['37 lições em 22/09', 'Entrou em 22/08 · total recuperado: 37'],
      ['22 lições em 23/09', 'Entrou em 22/08 · total recuperado: 33'],
    ]);
    expect(s.rodape).toBe('Menção honrosa: Hélio, com 44 lições recuperadas ao longo da temporada.');
  });

  it('ofensiva: "a temporada quase inteira" só para quem chegou perto dos 91', () => {
    const s = slide<'podio'>('ofensiva');
    expect(s.itens.map(i => i.detalhe)).toEqual(['de 04/07 a 25/09 — a temporada quase inteira', 'de 29/07 a 08/09', 'de 20/07 a 20/08']);
  });

  it('clube: um nome por clique, e o número por extenso', () => {
    const s = slide<'grade'>('clube');
    expect(s.titulo).toBe('O Clube dos 91');
    expect(s.subtitulo).toBe('91 de 91 dias · 13 de 13 semanas completas');
    expect(s.passos).toBe(9);
    expect(s.rodape).toBe('Guardem esses nove nomes. Eles voltam no fim.');
    const antes = slide<'frase'>('antes-do-podio');
    expect(antes.linhas.map(l => l.texto)).toEqual(['Nove completaram tudo.', 'Só três sobem ao pódio.']);
    expect(antes.legenda).toBe('Entre o 2º e o 3º lugar, apenas 349 XP de diferença.');
  });

  it('mistério do 1º lugar: as pistas do PPT, na ordem, uma por clique', () => {
    const s = slide<'misterio'>('misterio-1');
    expect(s.pistas).toEqual([
      'Estudou 91 de 91 dias — não perdeu nenhum',
      'Acertou 93,1% das perguntas da temporada',
      "Melhor semana: Lição 5 — 'Grande Humildade', com 3.364 XP",
      'Estudou 82 dias na data certa da lição, com a 3ª maior ofensiva real da turma: 32 dias seguidos',
      'Gabaritou um dia: 500 XP perfeitos',
      'Fechou a temporada com 41.769 XP — 1.096 à frente do 2º lugar',
    ]);
    expect(s.passos).toBe(6);
  });

  it('mistério do 3º lugar não compara com um 4º', () => {
    expect(pistasDoPodio(RESUMO, 2, CTX.licoes).at(-1)).toBe('Fechou a temporada com 40.324 XP');
  });

  it('revelação: silêncio de 1s no 3º e 2º, 2s no 1º', () => {
    expect(slide<'revelacao'>('revelacao-3')).toMatchObject({ nome: 'Céu', avatar: '🐬', detalhe: '40.324 XP · 91 dias', silencioMs: 1000 });
    expect(slide<'revelacao'>('revelacao-1')).toMatchObject({ nome: 'Aurora', silencioMs: 2000 });
  });

  it('próxima temporada: Livro Aberto começa hoje', () => {
    const s = slide<'capa'>('proxima');
    expect(s.titulo).toBe('Livro Aberto');
    expect(s.subtitulo).toBe('4º trimestre de 2026 · começa hoje');
    expect(s.linha).toBe('13 lições · começa com Conhecendo a Si Mesmo · 26 de setembro a 25 de dezembro');
  });

  it('vouchers: temporada anterior à regra vira "regras novas" + simulação retroativa', () => {
    expect(slide<'cartoes'>('vouchers').eyebrow).toBe('AS REGRAS NOVAS');
    const s = slide<'simulacao'>('simulacao');
    expect(s.eyebrow).toBe('SIMULAÇÃO RETROATIVA');
    expect(s.tabela[0]).toEqual({ nome: 'Duna', semanas: 12 });
    expect(s.exemplo?.licao).toBe('Lição 13 · a semana com mais gente em dia');
    expect(s.exemplo?.concorrentes).toEqual(['Aurora', 'Céu', 'Duna']);
    expect([...(s.exemplo?.ordem || [])].sort()).toEqual(['Aurora', 'Céu', 'Duna']);
    expect(s.rodape).toBe('Se essa regra já valesse, Duna teria ganhado voucher em 12 das 13 semanas. Essa é a régua que vale a partir de agora.');
  });

  it('temporada que já nasceu com a regra não chama de simulação', () => {
    const livro = montarApresentacao({ ...RESUMO, trimestre: 'Livro Aberto' }, { ...CTX, hojeISO: '2026-12-26' });
    expect(livro.find(s => s.id === 'vouchers')).toMatchObject({ eyebrow: 'A REGRA DOS VOUCHERS' });
    expect(livro.find(s => s.id === 'simulacao')).toMatchObject({ eyebrow: 'VOUCHERS DA TEMPORADA', exemplo: undefined });
    expect(livro.find(s => s.id === 'proxima')).toBeUndefined(); // não há temporada depois de Livro Aberto cadastrada
  });
});

describe('conquistas — uma frase por aluno, sem repetir', () => {
  const frase = conquistas(RESUMO, '2026-06-27');
  it('pódio, maior ofensiva, mais pontual, maratona e recuperação', () => {
    expect(frase.Aurora).toBe('1º lugar · 32 dias seguidos no dia certo');
    expect(frase.Brisa).toBe('2º lugar · 92,9% de acertos');
    expect(frase['Céu']).toBe('3º lugar · 57 dias no dia certo');
    expect(frase.Duna).toBe('Maior ofensiva real: 84 dias seguidos');
    expect(frase['Fênix']).toBe('Mais pontual: 87 dias no dia certo');
    expect(frase['Íris']).toBe('38 lições num dia só');
    expect(frase['Hélio']).toBe('44 lições recuperadas');
    expect(frase.Jade).toBe('Entrou em agosto · 37 lições num dia');
  });
  it('todo mundo tem uma', () => {
    expect(PERFIS.every(p => frase[p.userId])).toBe(true);
  });
});

describe('turma e sorteio — slides que dependem de quantos alunos existem', () => {
  it('a turma inteira: um aluno por clique', () => {
    const s = slide<'turma'>('turma');
    expect(s.alunos).toHaveLength(PERFIS.length);
    expect(s.passos).toBe(PERFIS.length - 1);
  });
  it('turma sem ninguém no clube não mostra clube, urna nem sorteio', () => {
    const sem = montarApresentacao({ ...RESUMO, clubeDaTemporada: [] }, CTX);
    expect(sem.map(s => s.id)).not.toContain('clube');
    expect(sem.map(s => s.id)).not.toContain('sorteio');
  });
});

describe('partesDaLicao', () => {
  it('tira número, nome e as datas entre parênteses', () => {
    expect(partesDaLicao('Lição 13 - O Sábado e a Lei de Deus (19 a 25 de setembro)')).toEqual({ numero: 13, nome: 'O Sábado e a Lei de Deus' });
  });
});
