import type { ResumoTemporada } from './relatorioTemporada';

// ===== Apresentação de encerramento de temporada =====
//
// A versão "dentro do app" do PPT que fechou Provado pelo Fogo
// (SabatinaQuest3tri.pptx, setembro/2026): os mesmos 22 slides, na mesma
// ordem, só que montados a partir do relatório que a aba 📊 Temporada já
// calcula (src/relatorioTemporada.ts). Nenhum nome de aluno mora no código —
// o bundle do app é público; os dados chegam na hora, com a permissão de quem
// conduz a turma.
//
// Cada slide carrega as técnicas de docs/manual-apresentacao-encerramento.md:
// PASSOS (cliques dentro do slide: "pergunte antes de revelar", pistas uma a
// uma, nomes um a um para a turma ir ficando em pé), a DEIXA de som e as
// NOTAS do apresentador (a tecla N mostra na tela).
//
// Tudo aqui é PURO: recebe o relatório e as lições, devolve os slides. Quem
// desenha é src/ApresentacaoEncerramento.tsx.

export type Tema = 'fogo' | 'palco' | 'azul';

// Deixas de som (manual, "Deixas de música e som, por tipo de slide").
export type Deixa = 'abertura' | 'swoosh' | 'suspense' | 'impacto' | 'campeao' | 'aplausos' | 'virada';

type Base = {
  id: string;
  tema: Tema;
  notas: string;
  // Cliques extras dentro do slide antes de avançar para o próximo (0 = nenhum).
  passos: number;
  // Toca ao entrar no slide.
  som?: Deixa;
};

export type ItemPodio = { pos: 1 | 2 | 3; titulo: string; destaque: string; detalhe: string };

export type Slide = Base & (
  | { tipo: 'capa'; eyebrow: string; emoji: string; titulo: string; subtitulo: string; linha: string; cortina?: boolean }
  | { tipo: 'numeros'; eyebrow: string; titulo: string; cards: { valor: number; rotulo: string }[]; rodape?: string }
  | { tipo: 'dia'; eyebrow: string; titulo: string; data: string; legenda: string; lateral: string[] }
  | { tipo: 'podio'; eyebrow: string; titulo: string; itens: ItemPodio[]; rodape?: string }
  | { tipo: 'grade'; eyebrow: string; titulo: string; subtitulo: string; nomes: string[]; bilhete?: boolean; rodape: string }
  | { tipo: 'frase'; emoji?: string; linhas: { texto: string; cor: 'claro' | 'ouro' | 'azul' }[]; legenda?: string }
  | { tipo: 'misterio'; eyebrow: string; titulo: string; pistas: string[] }
  | { tipo: 'revelacao'; pos: 1 | 2 | 3; nome: string; avatar: string; detalhe: string; silencioMs: number }
  | { tipo: 'turma'; eyebrow: string; titulo: string; alunos: { nome: string; avatar: string; dias: number; xp: number; conquista: string }[] }
  | { tipo: 'sorteio'; emoji: string; titulo: string; subtitulo: string; regra: string }
  | { tipo: 'cartoes'; eyebrow: string; titulo: string; cartoes: { titulo: string; texto: string }[]; rodape: string }
  | { tipo: 'simulacao'; eyebrow: string; titulo: string; tabela: { nome: string; semanas: number }[]; totalSemanas: number;
      exemplo?: { licao: string; concorrentes: string[]; ordem: string[] }; rodape: string }
);

export type LicaoInfo = { semana: string; titulo: string; trimestre: string; dias: { data?: string }[] };

export type ContextoApresentacao = {
  // Lições da trilha da turma (todas as temporadas): dão nome às semanas e
  // acham a próxima temporada.
  licoes: LicaoInfo[];
  track?: string;
  hojeISO: string;
  // Só para a simulação ilustrativa dos vouchers; os testes passam um fixo.
  aleatorio?: () => number;
};

// Quando a regra de vouchers (docs/relatorio-temporada.md, regra 9) passou a
// valer: 1º dia de Livro Aberto. Temporada que acabou antes disso mostra a
// régua como "regra nova" + simulação retroativa, como no PPT original.
export const INICIO_REGRA_VOUCHER = '2026-09-26';

// ----- formatação -----
export const fmtNum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtPct = (n: number) => String(n).replace('.', ',');
const ddmm = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaDaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()];
const dataExtenso = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
const porExtenso = (n: number) => EXTENSO[n] ?? String(n);
const Maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const PUBLICO: Record<string, string> = { teen: 'adolescentes', youngAdult: 'jovens', adult: 'participantes' };
const NOME_TRILHA: Record<string, string> = { teen: 'adolescentes', youngAdult: 'jovens', adult: 'adulto' };

// "Lição 13 - O Sábado e a Lei de Deus (19 a 25 de setembro)" -> { numero: 13, nome: 'O Sábado e a Lei de Deus' }
export const partesDaLicao = (titulo = '') => {
  const m = titulo.match(/^Lição\s*(\d+)\s*[-—]\s*(.*?)\s*(\([^)]*\))?\s*$/i);
  return m ? { numero: Number(m[1]), nome: m[2] } : { numero: 0, nome: titulo };
};

const inicioFim = (licoes: LicaoInfo[]) => {
  const datas = licoes.flatMap(l => l.dias.map(d => d.data)).filter((x): x is string => !!x).sort();
  return { inicio: datas[0], fim: datas[datas.length - 1] };
};

// Trimestre do ano pela data do meio da temporada (a do 4º começa em 26/09).
const trimestreDoAno = (inicio: string, fim: string) => {
  const meio = new Date((new Date(inicio + 'T12:00:00').getTime() + new Date(fim + 'T12:00:00').getTime()) / 2);
  return { n: Math.floor(meio.getMonth() / 3) + 1, ano: meio.getFullYear() };
};

type Perfil = ResumoTemporada['perfis'][number];

// ===== Uma frase de conquista para cada aluno =====
// Manual: "Todo mundo tem uma conquista" — cada aluno ganha UMA frase, e a
// mesma conquista não se repete (só o 1º em ofensiva é "maior ofensiva").
// A ordem de prioridade é a do PPT de Provado pelo Fogo.
export const conquistas = (resumo: ResumoTemporada, inicioTemporada?: string): Record<string, string> => {
  const perfis = resumo.perfis;
  const d = resumo.totais.diasLiberados;
  const frase: Record<string, string> = {};
  const livre = (p?: Perfil) => !!p && !frase[p.userId];
  const melhorPor = (f: (p: Perfil) => number) =>
    perfis.filter(livre).filter(p => f(p) > 0).sort((a, b) => f(b) - f(a))[0];

  const [p1, p2, p3] = perfis;
  if (p1) frase[p1.userId] = `1º lugar · ${p1.ofensivaReal ? `${p1.ofensivaReal} dias seguidos no dia certo` : `${fmtNum(p1.xp)} XP`}`;
  if (p2) frase[p2.userId] = `2º lugar · ${p2.pctAcertos !== null ? `${fmtPct(p2.pctAcertos)}% de acertos` : `${fmtNum(p2.xp)} XP`}`;
  if (p3) frase[p3.userId] = `3º lugar · ${plural(p3.diasNoDiaCerto, 'dia', 'dias')} no dia certo`;

  const ofensiva = melhorPor(p => p.ofensivaReal);
  if (ofensiva) frase[ofensiva.userId] = `Maior ofensiva real: ${ofensiva.ofensivaReal} dias seguidos`;
  const pontual = melhorPor(p => p.diasNoDiaCerto);
  if (pontual) frase[pontual.userId] = `Mais pontual: ${pontual.diasNoDiaCerto} dias no dia certo`;
  const maratona = resumo.maratonistas.find(m => livre(perfis.find(p => p.userId === m.userId)));
  if (maratona) frase[maratona.userId] = `${maratona.maxNumDia} lições num dia só`;
  const recuperou = melhorPor(p => p.totalRecuperado);
  if (recuperou) frase[recuperou.userId] = `${recuperou.totalRecuperado} lições recuperadas`;

  for (const p of perfis) {
    if (frase[p.userId]) continue;
    const entrouTarde = !!(p.criadoEm && inicioTemporada && p.criadoEm > inicioTemporada);
    const maxDia = resumo.maratonistas.find(m => m.userId === p.userId)?.maxNumDia || 0;
    if (entrouTarde && maxDia >= 10) frase[p.userId] = `Entrou em ${MESES[Number(p.criadoEm!.slice(5, 7)) - 1]} · ${maxDia} lições num dia`;
    else if (p.dias >= d) frase[p.userId] = `${d} dias · ${fmtNum(p.xp)} XP`;
    else if (p.gabaritos > 0) frase[p.userId] = `Gabaritou ${plural(p.gabaritos, 'dia', 'dias')}`;
    else if (p.pctAcertos !== null && p.pctAcertos >= 90) frase[p.userId] = `${fmtPct(p.pctAcertos)}% de acertos`;
    else if (p.dias > 0 && p.diasNoDiaCerto / p.dias >= 0.9) frase[p.userId] = `${p.diasNoDiaCerto} dos ${p.dias} dias no dia certo`;
    else if (entrouTarde) frase[p.userId] = `Chegou em ${ddmm(p.criadoEm)} · ${plural(p.dias, 'dia estudado', 'dias estudados')}`;
    else frase[p.userId] = `${plural(p.dias, 'dia', 'dias')} · ${fmtNum(p.xp)} XP`;
  }
  return frase;
};

// ===== Pistas do mistério de cada posição do pódio =====
export const pistasDoPodio = (resumo: ResumoTemporada, pos: 0 | 1 | 2, licoes: LicaoInfo[]): string[] => {
  const p = resumo.perfis[pos];
  if (!p) return [];
  const d = resumo.totais.diasLiberados;
  const pistas: string[] = [];
  pistas.push(p.dias >= d ? `Estudou ${d} de ${d} dias — não perdeu nenhum` : `Estudou ${p.dias} de ${d} dias`);
  if (p.pctAcertos !== null) pistas.push(`Acertou ${fmtPct(p.pctAcertos)}% das perguntas da temporada`);
  if (p.melhorSemana) {
    const l = partesDaLicao(licoes.find(x => x.semana === p.melhorSemana!.week)?.titulo);
    const nome = l.numero ? `Lição ${l.numero} — ${l.nome}` : p.melhorSemana.week;
    pistas.push(`Melhor semana: ${nome}, com ${fmtNum(p.melhorSemana.xp)} XP`);
  }
  if (p.diasNoDiaCerto > 0) {
    const ordemOfensiva = resumo.ofensivaReal.findIndex(o => o.userId === p.userId);
    const extra = ordemOfensiva >= 0 && ordemOfensiva < 3 && p.ofensivaReal > 0
      ? `, com a ${ordemOfensiva + 1}ª maior ofensiva real da turma: ${p.ofensivaReal} dias seguidos` : '';
    pistas.push(`Estudou ${p.diasNoDiaCerto} dias na data certa da lição${extra}`);
  }
  if (p.gabaritos > 0) {
    pistas.push(p.gabaritos === 1 ? 'Gabaritou um dia: 500 XP perfeitos' : `Gabaritou ${p.gabaritos} dias: 500 XP perfeitos em cada`);
  }
  const abaixo = resumo.perfis[pos + 1];
  pistas.push(`Fechou a temporada com ${fmtNum(p.xp)} XP${pos < 2 && abaixo ? ` — ${fmtNum(p.xp - abaixo.xp)} à frente do ${pos + 2}º lugar` : ''}`);
  return pistas;
};

// Fisher-Yates com a fonte de aleatoriedade injetável (testes).
const embaralhar = <T,>(xs: T[], rnd: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ===== A apresentação inteira =====
export const montarApresentacao = (resumo: ResumoTemporada, ctx: ContextoApresentacao): Slide[] => {
  const slides: Slide[] = [];
  const add = (s: Slide) => slides.push(s);
  const publico = PUBLICO[ctx.track || 'teen'] || 'alunos';
  const d = resumo.totais.diasLiberados;
  const daTemporada = ctx.licoes.filter(l => l.trimestre === resumo.trimestre);
  const { inicio, fim } = inicioFim(daTemporada);
  const nomeDaSemana = (week: string) => partesDaLicao(daTemporada.find(l => l.semana === week)?.titulo);
  const perfis = resumo.perfis;

  // 1 — Capa
  add({
    id: 'capa', tipo: 'capa', tema: 'fogo', passos: 1, som: undefined, cortina: true,
    eyebrow: 'ENCERRAMENTO DA TEMPORADA', emoji: '🔥', titulo: resumo.trimestre,
    subtitulo: [plural(daTemporada.length, 'lição', 'lições'), inicio && fim ? `${dataExtenso(inicio)} a ${dataExtenso(fim)} de ${fim.slice(0, 4)}` : ''].filter(Boolean).join(' · '),
    linha: resumo.turma,
    notas: 'Tela preta antes de abrir (é assim que este slide começa). Som de fogo crepitando ou uma batida grave que sobe de volume nos últimos 3 segundos — só então clique para o título aparecer.',
  });

  // 2 — Números
  add({
    id: 'numeros', tipo: 'numeros', tema: 'fogo', passos: 4,
    eyebrow: 'A TEMPORADA EM NÚMEROS', titulo: 'Juntos, fomos longe',
    cards: [
      { valor: resumo.totais.dias, rotulo: 'dias estudados' },
      { valor: resumo.totais.alunos, rotulo: publico },
      { valor: resumo.totais.semanasCompletas, rotulo: 'semanas completas' },
      { valor: resumo.totais.xp, rotulo: 'XP conquistados' },
    ],
    rodape: resumo.totais.diasLideranca > 0 ? `Com os professores, foram ${fmtNum(resumo.totais.dias + resumo.totais.diasLideranca)} dias de estudo.` : undefined,
    notas: 'Pergunte antes de revelar: "quantos dias vocês acham que a turma estudou, somando todo mundo?" Deixe 2-3 chutes em voz alta. Cada clique revela um número, com o som de contador.',
  });

  // 3 — Dia mais estudado
  const [dia1, ...outrosDias] = resumo.diaMaisEstudado;
  if (dia1) {
    const segundo = outrosDias[0];
    const empatados = segundo ? outrosDias.filter(x => x.alunos === segundo.alunos).map(x => x.data) : [];
    const lateral: string[] = [];
    if (segundo) {
      lateral.push(empatados.length > 1
        ? `2º lugar, empatados com ${segundo.alunos}: ${empatados.map(ddmm).join(', ').replace(/, ([^,]*)$/, ' e $1')}`
        : `2º lugar: ${ddmm(segundo.data)}, com ${segundo.alunos}`);
    }
    // Conte como história, não como dado: se um dos dias do topo é o sábado
    // em que uma lição começou, diga qual.
    for (const data of [dia1.data, ...empatados]) {
      const l = daTemporada.find(x => x.dias[0]?.data === data);
      if (!l) continue;
      const pl = partesDaLicao(l.titulo);
      const nomeTemporada = pl.nome.toLowerCase() === resumo.trimestre.toLowerCase() ? ', a lição que dá nome à temporada' : '';
      lateral.push(`${ddmm(data)} foi o ${diaDaSemana(data)} em que começou a Lição ${pl.numero} — ${pl.nome}${nomeTemporada}.`);
      break;
    }
    add({
      id: 'dia', tipo: 'dia', tema: 'fogo', passos: 1,
      eyebrow: 'O DIA MAIS ESTUDADO', titulo: 'O dia em que a turma estudou junta',
      data: ddmm(dia1.data), legenda: `${diaDaSemana(dia1.data)} · ${dia1.alunos} ${publico} estudaram no dia certo`, lateral,
      notas: 'Pergunte: "qual dia vocês acham que mais gente estudou junto?" antes de clicar. Conte como história, não como dado — ligue a data a algo que a turma viveu (o nome da lição, um evento da igreja).',
    });
  }

  // 4 — Melhor semana
  if (resumo.melhorSemana.length) {
    add({
      id: 'semana', tipo: 'podio', tema: 'fogo', passos: Math.min(3, resumo.melhorSemana.length),
      eyebrow: 'A MELHOR SEMANA', titulo: 'As semanas mais estudadas',
      itens: resumo.melhorSemana.slice(0, 3).map((s, i) => {
        const l = nomeDaSemana(s.week);
        return {
          pos: (i + 1) as 1 | 2 | 3, titulo: l.numero ? `Lição ${l.numero}` : s.week,
          destaque: `${s.estudosNoDia} estudos no dia certo`,
          detalhe: `${l.numero ? `${l.nome} · ` : ''}${s.alunos} alunos · ${fmtPct(s.pctAcertos)}% de acertos`,
        };
      }),
      rodape: 'Terminamos mais fortes do que começamos.',
      notas: 'Mistério em miniatura: leia o destaque ("64 estudos no dia certo...") e pergunte qual lição foi antes de cada clique. Revela do 3º para o 1º.',
    });
  }

  // 5 — Liderança pelo exemplo
  if (resumo.liderancaPeloExemplo.length) {
    add({
      id: 'lideranca', tipo: 'podio', tema: 'fogo', passos: Math.min(3, resumo.liderancaPeloExemplo.length),
      eyebrow: 'LIDERANÇA PELO EXEMPLO', titulo: 'Quem conduz também estudou',
      itens: resumo.liderancaPeloExemplo.slice(0, 3).map((l, i) => {
        const trilhas = Object.entries(l.porTrilha || {}).filter(([, n]) => n > 0);
        return {
          pos: (i + 1) as 1 | 2 | 3, titulo: l.nome, destaque: `${l.dias} dias`,
          detalhe: trilhas.length > 1
            ? trilhas.sort((a, b) => b[1] - a[1]).map(([t, n], k) => `${n} na ${k ? 'de' : 'trilha de'} ${NOME_TRILHA[t] || t}`).join(' + ')
            : l.dias >= d ? 'não perdeu nenhum' : 'estudados na temporada',
        };
      }),
      notas: 'Leia as pistas antes do nome também aqui ("estudou os 91 dias, sem faltar nenhum") — deixe a turma gritar o palpite antes de cada clique. Mantém a energia da sala constante.',
    });
  }

  // 6 — Maratonistas
  if (resumo.maratonistas.length) {
    const top = resumo.maratonistas.slice(0, 3);
    const honra = perfis
      .filter(p => !top.some(m => m.userId === p.userId) && p.totalRecuperado > Math.min(...top.map(m => m.totalRecuperado)))
      .sort((a, b) => b.totalRecuperado - a.totalRecuperado)[0];
    add({
      id: 'maratonistas', tipo: 'podio', tema: 'fogo', passos: top.length,
      eyebrow: 'OS MARATONISTAS', titulo: 'Nunca é tarde para colocar a vida em dia',
      itens: top.map((m, i) => {
        const p = perfis.find(x => x.userId === m.userId);
        const antes = p && p.dias >= d ? `Fechou os ${d} dias` : p?.criadoEm && inicio && p.criadoEm > inicio ? `Entrou em ${ddmm(p.criadoEm)}` : '';
        return {
          pos: (i + 1) as 1 | 2 | 3, titulo: m.nome, destaque: `${m.maxNumDia} lições em ${ddmm(m.dataMax)}`,
          detalhe: [antes, `total recuperado: ${m.totalRecuperado}`].filter(Boolean).join(' · '),
        };
      }),
      rodape: honra ? `Menção honrosa: ${honra.nome}, com ${honra.totalRecuperado} lições recuperadas ao longo da temporada.` : undefined,
      notas: `Chame ${top[0].nome} para ficar em pé enquanto lê "${top[0].maxNumDia} lições num dia só" — o físico do momento vale mais que o slide sozinho.`,
    });
  }

  // 7 — A chama acesa (ofensiva real)
  const ofensivas = resumo.ofensivaReal.filter(o => o.dias > 0).slice(0, 3);
  if (ofensivas.length) {
    add({
      id: 'ofensiva', tipo: 'podio', tema: 'fogo', passos: ofensivas.length,
      eyebrow: 'A CHAMA ACESA · MAIOR OFENSIVA REAL', titulo: 'Só o dia certo, sem pular nenhum',
      itens: ofensivas.map((o, i) => ({
        pos: (i + 1) as 1 | 2 | 3, titulo: o.nome, destaque: `${o.dias} dias seguidos`,
        detalhe: `de ${ddmm(o.inicio)} a ${ddmm(o.fim)}${i === 0 && o.dias >= d * 0.85 ? ' — a temporada quase inteira' : ''}`,
      })),
      rodape: 'Só conta o estudo feito na data da própria lição. Atrasado ou adiantado quebra a sequência.',
      notas: `Pistas antes do nome: "${ofensivas[0].dias} dias seguidos, sem faltar um. Quem foi?" Silêncio de 1 segundo antes de revelar, depois solta a música/luz.`,
    });
  }

  // 8 — Clube da temporada
  const clube = resumo.clubeDaTemporada;
  const semanas = daTemporada.length;
  if (clube.length) {
    add({
      id: 'clube', tipo: 'grade', tema: 'fogo', passos: clube.length,
      eyebrow: 'TABELA GERAL', titulo: `O Clube dos ${d}`,
      subtitulo: `${d} de ${d} dias · ${semanas} de ${semanas} semanas completas`,
      nomes: clube.map(c => c.nome),
      rodape: `Guardem ${clube.length === 1 ? 'esse nome' : `esses ${porExtenso(clube.length)} nomes`}. ${clube.length === 1 ? 'Ele volta' : 'Eles voltam'} no fim.`,
      notas: 'Cada clique mostra um nome: chame a pessoa para ficar em pé na hora. No final, todos de pé formam uma "fileira de finalistas" visível — a turma já enxerga quem está na disputa.',
    });
  }

  // 9 — A virada para o pódio
  if (perfis.length >= 3) {
    const gap12 = perfis[0].xp - perfis[1].xp, gap23 = perfis[1].xp - perfis[2].xp;
    const legenda = gap23 <= gap12
      ? `Entre o 2º e o 3º lugar, apenas ${fmtNum(gap23)} XP de diferença.`
      : `Entre o 1º e o 2º lugar, apenas ${fmtNum(gap12)} XP de diferença.`;
    add({
      id: 'antes-do-podio', tipo: 'frase', tema: 'palco', passos: 0, emoji: '🏆',
      linhas: clube.length > 3
        ? [{ texto: `${Maiuscula(porExtenso(clube.length))} completaram tudo.`, cor: 'claro' }, { texto: 'Só três sobem ao pódio.', cor: 'ouro' }]
        : [{ texto: 'Chegou a hora do pódio.', cor: 'claro' }, { texto: 'Só três sobem.', cor: 'ouro' }],
      legenda,
      notas: 'Pausa real de 2 a 3 segundos, em silêncio, olhando para quem está em pé. Só depois avance e deixe a trilha de suspense começar.',
    });
  }

  // 10–15 — Mistério → revelação, do 3º para o 1º
  for (const pos of [2, 1, 0] as const) {
    const p = perfis[pos];
    if (!p) continue;
    const lugar = pos + 1 as 1 | 2 | 3;
    const pistas = pistasDoPodio(resumo, pos, daTemporada);
    add({
      id: `misterio-${lugar}`, tipo: 'misterio', tema: 'fogo', passos: pistas.length, som: 'suspense',
      eyebrow: `${lugar}º LUGAR · QUEM É?`, titulo: `❓ O mistério do ${lugar}º lugar`, pistas,
      notas: lugar === 1
        ? 'Clímax da noite. Trilha de suspense subindo de volume nas últimas pistas. Cada clique mostra uma pista; deixe a turma chutar antes da próxima.'
        : 'Trilha de suspense baixa enquanto lê as pistas devagar, uma por clique. Deixe a turma chutar em voz alta antes de cada pista seguinte.',
    });
    add({
      id: `revelacao-${lugar}`, tipo: 'revelacao', tema: 'palco', passos: 1,
      pos: lugar, nome: p.nome, avatar: p.avatar || '🏅', detalhe: `${fmtNum(p.xp)} XP · ${p.dias} dias`,
      silencioMs: lugar === 1 ? 2000 : 1000,
      notas: lugar === 1
        ? 'O clique corta o som e segura 2 segundos de silêncio antes do nome — é o clímax. Maior efeito da noite: confete, luz de palco, aplausos.'
        : `O clique corta o som por 1 segundo antes do nome aparecer, com som de impacto. Aplausos. Peça para ${p.nome} ficar em pé se ainda não estiver.`,
    });
  }

  // 16 — A turma inteira, um aluno por vez
  if (perfis.length) {
    const frase = conquistas(resumo, inicio);
    add({
      id: 'turma', tipo: 'turma', tema: 'fogo', passos: perfis.length - 1,
      eyebrow: 'A TURMA INTEIRA', titulo: 'Todo mundo tem uma conquista',
      alunos: perfis.map(p => ({ nome: p.nome, avatar: p.avatar || '🙂', dias: p.dias, xp: p.xp, conquista: frase[p.userId] })),
      notas: 'Não leia como lista corrida: um aluno por clique (avatar grande + a conquista), aplausos rápidos, próximo.',
    });
  }

  // 17–18 — Sorteio final
  if (clube.length) {
    add({
      id: 'urna', tipo: 'grade', tema: 'fogo', passos: 0, bilhete: true,
      eyebrow: 'SORTEIO FINAL DA TEMPORADA', titulo: 'A urna está cheia',
      subtitulo: `Completou as ${d} lições? Tem 1 bilhete. · ${plural(clube.length, 'participante', 'participantes')}`,
      nomes: clube.map(c => c.nome),
      rodape: clube.length > 1 ? `Lembram dos ${porExtenso(clube.length)} nomes? Chegou a hora.` : 'Chegou a hora.',
      notas: 'Chame quem está na urna para ficar em pé de novo (ou já estão, desde o Clube).',
    });
    add({
      id: 'sorteio', tipo: 'sorteio', tema: 'palco', passos: 0, emoji: '🎲',
      titulo: 'Sorteio ao vivo', subtitulo: 'Clique (ou aperte S) para abrir o sorteador no telão',
      regra: 'Regra: 1 bilhete por quem estudou todos os dias',
      notas: 'Convide alguém da plateia que NÃO está concorrendo para apertar o botão de sortear. Espaço sorteia, Esc volta para a apresentação. Registre o ganhador no próprio sorteador.',
    });
  }

  // 19 — Próxima temporada
  const trimestres: { nome: string; inicio: string; fim: string; licoes: LicaoInfo[] }[] = [];
  for (const nome of new Set(ctx.licoes.map(l => l.trimestre))) {
    const ls = ctx.licoes.filter(l => l.trimestre === nome);
    const f = inicioFim(ls);
    if (f.inicio && f.fim) trimestres.push({ nome, inicio: f.inicio, fim: f.fim, licoes: ls });
  }
  const proxima = fim ? trimestres.filter(t => t.inicio > fim).sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0] : undefined;
  if (proxima) {
    const tri = trimestreDoAno(proxima.inicio, proxima.fim);
    const quando = proxima.inicio === ctx.hojeISO ? 'começa hoje'
      : proxima.inicio > ctx.hojeISO ? `começa em ${ddmm(proxima.inicio)}` : `começou em ${ddmm(proxima.inicio)}`;
    const primeira = partesDaLicao([...proxima.licoes].sort((a, b) => ((a.dias[0]?.data || '') < (b.dias[0]?.data || '') ? -1 : 1))[0]?.titulo);
    add({
      id: 'proxima', tipo: 'capa', tema: 'azul', passos: 0, som: 'virada',
      eyebrow: 'PRÓXIMA TEMPORADA', emoji: '📖', titulo: proxima.nome,
      subtitulo: `${tri.n}º trimestre de ${tri.ano} · ${quando}`,
      linha: `${plural(proxima.licoes.length, 'lição', 'lições')} · começa com ${primeira.nome} · ${dataExtenso(proxima.inicio)} a ${dataExtenso(proxima.fim)}`,
      notas: 'Troque a trilha sonora aqui: de algo quente/intenso para algo mais claro e leve. É o único ponto do evento em que o clima muda de direção.',
    });
  }

  // 20–21 — Vouchers (regra 9 do docs/relatorio-temporada.md)
  const retroativa = !!fim && fim < INICIO_REGRA_VOUCHER;
  add({
    id: 'vouchers', tipo: 'cartoes', tema: 'azul', passos: 0,
    eyebrow: retroativa ? 'AS REGRAS NOVAS' : 'A REGRA DOS VOUCHERS', titulo: 'Estudou no dia certo? Ganhou voucher.',
    cartoes: [
      { titulo: '🎫 Sorteio semanal', texto: 'Só as semanas perfeitas participam: os 7 dias estudados no dia certo. Um dia atrasado nessa semana já tira o voucher.' },
      { titulo: '🏆 Sorteio da temporada', texto: 'Continua contando todos os dias estudados, inclusive os atrasados. Quem precisar recuperar ainda chega lá.' },
    ],
    rodape: 'Toda semana é uma chance nova. Chegou atrasado? Ainda vale para a temporada, mas o voucher da semana é de quem estudou no dia.',
    notas: 'Mostre um voucher físico (impresso) enquanto explica — objeto na mão fixa a regra mais que só a frase.',
  });
  const tabela = perfis.filter(p => p.semanasPerfeitas > 0).sort((a, b) => b.semanasPerfeitas - a.semanasPerfeitas)
    .map(p => ({ nome: p.nome, semanas: p.semanasPerfeitas }));
  if (tabela.length) {
    // A semana com mais gente em dia vira o exemplo do sorteio semanal.
    const porSemana: Record<string, string[]> = {};
    for (const p of perfis) for (const w of p.semanasPerfeitasLista) (porSemana[w] ??= []).push(p.nome);
    const [semanaEx, concorrentes] = Object.entries(porSemana).sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? 1 : -1))[0];
    const l = nomeDaSemana(semanaEx);
    const lider = tabela[0];
    add({
      id: 'simulacao', tipo: 'simulacao', tema: 'azul', passos: 0,
      eyebrow: retroativa ? 'SIMULAÇÃO RETROATIVA' : 'VOUCHERS DA TEMPORADA',
      titulo: retroativa ? 'Se os vouchers já valessem nesta temporada' : 'Quem fez semanas perfeitas',
      tabela: tabela.slice(0, 10), totalSemanas: semanas,
      exemplo: retroativa ? {
        licao: `${l.numero ? `Lição ${l.numero}` : semanaEx} · a semana com mais gente em dia`,
        concorrentes, ordem: embaralhar(concorrentes, ctx.aleatorio || Math.random),
      } : undefined,
      rodape: retroativa
        ? `Se essa regra já valesse, ${lider.nome} teria ganhado voucher em ${lider.semanas} das ${semanas} semanas. Essa é a régua que vale a partir de agora.`
        : `${lider.nome} fez ${lider.semanas} de ${semanas} semanas perfeitas.`,
      notas: retroativa
        ? 'Deixe claro em voz alta que é uma simulação para ilustrar a régua nova, não um sorteio que aconteceu — ninguém deve sair achando que perdeu um prêmio real.'
        : 'Semanas perfeitas: os 7 dias da lição, cada um estudado na data dele.',
    });
  }

  // 22 — Fechamento
  add({
    id: 'fim', tipo: 'frase', tema: 'azul', passos: 0,
    linhas: [{ texto: 'O ranking zerou.', cor: 'claro' }, { texto: 'Todo mundo começa igual.', cor: 'azul' }],
    legenda: '📱 Abre o app agora e começa a Lição 1',
    notas: 'Não deixe a tela em branco depois deste slide. Peça para todo mundo abrir o app ali mesmo, celular na mão, e começar a Lição 1 juntos.',
  });

  return slides;
};
