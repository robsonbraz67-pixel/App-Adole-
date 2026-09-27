import { collapseByUserWeek, isRankingHidden, hojeLocalISO } from './utils';
import { diasLiberadosPorSemana, participantesDaTemporada } from './sorteio';

// ===== Relatório de encerramento de temporada =====
//
// Este arquivo é a versão "para sempre" das contas que o encerramento de
// Provado pelo Fogo (setembro/2026) fez uma vez só, na mão, fora do app. A
// metodologia completa — o que cada número significa e por quê — está em
// docs/relatorio-temporada.md; leia aquele documento antes de mudar qualquer
// regra aqui, porque ele é o que a liderança usa para decidir o que apresentar
// no encerramento, e as duas coisas têm de continuar batendo.
//
// Tudo aqui é PURO (sem I/O): recebe as linhas de progresso já buscadas
// (getSeasonProgress) e as lições da temporada (loadTrackLessons filtrado por
// trimestre), e devolve números. Quem busca os dados é a tela (components.tsx).

export type Licao = {
  semana: string;
  trimestre: string;
  isAdminOnly?: boolean;
  dias: { id: number; data?: string }[];
};

export type HistoryEntry = {
  xp?: number;
  acertos?: number;
  emISO?: string;
  emHora?: string;
  reiniciado?: boolean;
};

// Mesma forma que ProgressRow (firebase.ts) devolve — `history` viaja junto
// porque rowsFromSnap espalha o doc inteiro (`...data`) antes de recortar os
// outros campos.
export type LinhaProgresso = {
  userId: string; week: string; nome: string; avatar: string;
  done: number[]; dias: number; xp: number;
  isAdmin: boolean; isProfessor: boolean; isGuest?: boolean;
  turmaId?: string; track?: string;
  history?: Record<string, HistoryEntry>;
};

// ----- Data da lição por (semana, dia) -----
const dataDaLicao = (licoes: Licao[], week: string, dia: number): string | undefined =>
  licoes.find(l => l.semana === week)?.dias.find(d => d.id === dia)?.data;

// Recortes de "melhor semana", "dia mais estudado" e "maratonistas" são sobre
// os ALUNOS da turma — quem conduz não deveria inflar o dia mais estudado
// estudando junto. rowsFromSnap (firebase.ts) já tira convidado e nome oculto
// antes de chegar aqui; só falta tirar admin/professor.
const somenteAlunos = (linhas: LinhaProgresso[]): LinhaProgresso[] =>
  linhas.filter(r => !r.isAdmin && !r.isProfessor);

// ===== 1) Classificar cada dia estudado como "no dia certo" ou "atrasado" =====
//
// A fonte boa é history[dia].emISO (a data real do estudo, gravada desde
// 13/09/2026 — ver App.tsx). Para dias mais antigos, sem esse carimbo, a única
// pista é o XP: getRecencyMult (utils.ts) multiplica a nota da leitura por
// 100% no dia certo, 90% na mesma semana e 75% depois. Sabendo os ACERTOS do
// dia (0 a 4, cada um vale 25 pontos de score-tempo entre 75 e 100) dá para
// enumerar os XPs POSSÍVEIS em cada uma das 3 hipóteses e ver quais batem com
// o XP gravado.
//
// scoreTempo por acerto vai de 75 a 100 (nunca sabemos o tempo de resposta
// real, só o resultado), então o XP de um dia com N acertos e multiplicador M
// cai sempre no intervalo [round(75*M)*N, round(100*M)*N].
const faixaXP = (mult: number, acertos: number): [number, number] => {
  const base = Math.round(100 * mult); // a leitura do dia, sempre uma parcela FIXA (não por acerto)
  return [base + Math.round(75 * mult) * acertos, base + Math.round(100 * mult) * acertos];
};

type Classificacao = 'no-dia' | 'atrasado' | 'ambiguo' | 'sem-dados';

// Só usa a data real ou o "range de XP" — nunca deixa a MEDIANA decidir uma
// hipótese que os números provam impossível. A mediana só desempata quando
// sobra mais de uma hipótese plausível (ver classificarDia).
const classificarPorXP = (xp: number | undefined, acertos: number | undefined): Classificacao => {
  if (xp === undefined || acertos === undefined || acertos === 0) return 'sem-dados';
  const noDia = xp >= faixaXP(1.0, acertos)[0] && xp <= faixaXP(1.0, acertos)[1];
  const fora = (xp >= faixaXP(0.9, acertos)[0] && xp <= faixaXP(0.9, acertos)[1])
    || (xp >= faixaXP(0.75, acertos)[0] && xp <= faixaXP(0.75, acertos)[1]);
  if (noDia && !fora) return 'no-dia';
  if (fora && !noDia) return 'atrasado';
  if (noDia && fora) return 'ambiguo';
  return 'sem-dados';
};

// Velocidade típica do aluno: XP por acerto (menos os 100 pontos-base) nos
// dias já confirmados como "no dia certo" — usada só para desempatar os poucos
// dias ambíguos que sobram depois da classificação por XP. Mediana, não média:
// um único dia de sorte/azar não pode arrastar a régua da pessoa inteira.
export const velocidadeDoAluno = (linhas: LinhaProgresso[], licoes: Licao[]): number | null => {
  const vel: number[] = [];
  for (const r of linhas) {
    for (const dia of r.done) {
      const e = r.history?.[String(dia)];
      if (!e?.acertos || e.xp === undefined) continue;
      const dataLicao = dataDaLicao(licoes, r.week, dia);
      const confirmadoNoDia = e.emISO ? e.emISO === dataLicao : classificarPorXP(e.xp, e.acertos) === 'no-dia';
      if (confirmadoNoDia) vel.push((e.xp - 100) / e.acertos);
    }
  }
  if (!vel.length) return null;
  const s = [...vel].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Decide se um dia estudado foi "no dia certo". `velocidade` vem de
// velocidadeDoAluno — passe null se ainda não tiver (o desempate cai para "não
// confirmado", nunca para "confirmado sem prova").
export const diaFoiEstudadoNoCerto = (
  entry: HistoryEntry | undefined,
  dataLicao: string | undefined,
  velocidade: number | null,
): boolean => {
  if (!entry || !dataLicao) return false;
  if (entry.emISO) return entry.emISO === dataLicao;
  const c = classificarPorXP(entry.xp, entry.acertos);
  if (c === 'no-dia') return true;
  if (c !== 'ambiguo') return false;
  if (velocidade === null || entry.acertos === undefined || entry.xp === undefined) return false;
  const { xp, acertos } = entry;
  const candidatoNoDia = Math.abs((xp - 100) / acertos - velocidade);
  // Só entra no Math.min a hipótese de atraso que os números realmente
  // permitem (mesma faixa que classificarPorXP usou para achar "ambiguo") —
  // nunca compara com uma hipótese que o próprio XP já descartou.
  const feasible90 = xp >= faixaXP(0.9, acertos)[0] && xp <= faixaXP(0.9, acertos)[1];
  const feasible75 = xp >= faixaXP(0.75, acertos)[0] && xp <= faixaXP(0.75, acertos)[1];
  const candidatosFora = [
    ...(feasible90 ? [Math.abs(((xp - 90) / acertos) / 0.9 - velocidade)] : []),
    ...(feasible75 ? [Math.abs(((xp - 75) / acertos) / 0.75 - velocidade)] : []),
  ];
  if (!candidatosFora.length) return true; // "ambíguo" só na teoria; na prática só o dia certo é possível
  return candidatoNoDia < Math.min(...candidatosFora);
};

// ===== 2) Maior ofensiva REAL: dias seguidos, só no dia certo =====
//
// Diferente do 🔥 que o app mostra ao vivo (que conta qualquer dia estudado,
// mesmo atrasado): aqui só conta quem estudou a lição na própria data dela, e
// nunca antes da conta existir (evita herdar recuperação de dias antigos como
// se fosse sequência).
export const ofensivaReal = (
  linhas: LinhaProgresso[],
  licoes: Licao[],
  criadoEmISO: string | undefined,
  hojeISO: string = hojeLocalISO(),
): { dias: number; inicio?: string; fim?: string } => {
  const vel = velocidadeDoAluno(linhas, licoes);
  const certos = new Set<string>();
  for (const r of linhas) {
    for (const dia of r.done) {
      const dataLicao = dataDaLicao(licoes, r.week, dia);
      if (!dataLicao) continue;
      if (criadoEmISO && dataLicao < criadoEmISO) continue; // doc antigo sem carimbo, pré-matrícula
      if (diaFoiEstudadoNoCerto(r.history?.[String(dia)], dataLicao, vel)) certos.add(dataLicao);
    }
  }
  let melhor = 0, atual = 0, fimMelhor = '';
  let cursor = licoes.map(l => l.dias.map(d => d.data)).flat().filter((x): x is string => !!x).sort()[0] || hojeISO;
  const fim = hojeISO;
  const d = new Date(cursor + 'T00:00:00');
  const dFim = new Date(fim + 'T00:00:00');
  while (d <= dFim) {
    const iso = d.toISOString().split('T')[0];
    if (certos.has(iso)) { atual++; if (atual > melhor) { melhor = atual; fimMelhor = iso; } }
    else atual = 0;
    d.setDate(d.getDate() + 1);
  }
  if (!melhor) return { dias: 0 };
  const ini = new Date(fimMelhor + 'T00:00:00');
  ini.setDate(ini.getDate() - (melhor - 1));
  return { dias: melhor, inicio: ini.toISOString().split('T')[0], fim: fimMelhor };
};

// ===== 3) Melhor semana: mais estudos no dia certo, desempate por acertos =====
export const melhorSemana = (linhasDaTurma: LinhaProgresso[], licoes: Licao[]) => {
  linhasDaTurma = somenteAlunos(linhasDaTurma);
  const porSemana: Record<string, { noDia: number; alunos: Set<string>; acertos: number[] }> = {};
  const velPorAluno = new Map<string, number | null>();
  for (const r of collapseByUserWeek(linhasDaTurma)) {
    if (!velPorAluno.has(r.userId)) {
      velPorAluno.set(r.userId, velocidadeDoAluno(linhasDaTurma.filter(x => x.userId === r.userId), licoes));
    }
    const vel = velPorAluno.get(r.userId) ?? null;
    for (const dia of r.done) {
      const dataLicao = dataDaLicao(licoes, r.week, dia);
      const e = r.history?.[String(dia)];
      if (!diaFoiEstudadoNoCerto(e, dataLicao, vel)) continue;
      const s = porSemana[r.week] ??= { noDia: 0, alunos: new Set(), acertos: [] };
      s.noDia++; s.alunos.add(r.userId);
      if (e?.acertos !== undefined) s.acertos.push(e.acertos);
    }
  }
  return Object.entries(porSemana)
    .map(([week, s]) => ({
      week, estudosNoDia: s.noDia, alunos: s.alunos.size,
      pctAcertos: s.acertos.length ? Math.round((100 * s.acertos.reduce((a, b) => a + b, 0)) / (4 * s.acertos.length) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.estudosNoDia - a.estudosNoDia || b.pctAcertos - a.pctAcertos);
};

// ===== 4) Dia mais estudado (calendário), só no dia certo =====
export const diaMaisEstudado = (linhasDaTurma: LinhaProgresso[], licoes: Licao[]) => {
  linhasDaTurma = somenteAlunos(linhasDaTurma);
  const porData: Record<string, Set<string>> = {};
  const velPorAluno = new Map<string, number | null>();
  for (const r of collapseByUserWeek(linhasDaTurma)) {
    if (!velPorAluno.has(r.userId)) {
      velPorAluno.set(r.userId, velocidadeDoAluno(linhasDaTurma.filter(x => x.userId === r.userId), licoes));
    }
    const vel = velPorAluno.get(r.userId) ?? null;
    for (const dia of r.done) {
      const dataLicao = dataDaLicao(licoes, r.week, dia);
      if (!dataLicao || !diaFoiEstudadoNoCerto(r.history?.[String(dia)], dataLicao, vel)) continue;
      (porData[dataLicao] ??= new Set()).add(r.userId);
    }
  }
  return Object.entries(porData)
    .map(([data, alunos]) => ({ data, alunos: alunos.size }))
    .sort((a, b) => b.alunos - a.alunos);
};

// ===== 5) Maratonistas: mais lições ATRASADAS colocadas em dia num só dia =====
//
// Só entram lições com data real (emISO) — o app não sabia a data do estudo
// antes de 13/09/2026, então uma maratona anterior a isso não tem como provar
// e fica de fora (menção honrosa manual, não dado).
export const maratonistas = (linhasDaTurma: LinhaProgresso[], licoes: Licao[]) => {
  linhasDaTurma = somenteAlunos(linhasDaTurma);
  const porAluno: Record<string, { nome: string; porData: Record<string, number>; totalRecuperado: number }> = {};
  for (const r of collapseByUserWeek(linhasDaTurma)) {
    const a = porAluno[r.userId] ??= { nome: r.nome, porData: {}, totalRecuperado: 0 };
    for (const dia of r.done) {
      const dataLicao = dataDaLicao(licoes, r.week, dia);
      const e = r.history?.[String(dia)];
      if (!e?.emISO || e.emISO === dataLicao) continue; // só atrasado, com prova de data
      a.totalRecuperado++;
      a.porData[e.emISO] = (a.porData[e.emISO] || 0) + 1;
    }
  }
  return Object.entries(porAluno)
    .map(([userId, a]) => {
      const [dataMax, maxNumDia] = Object.entries(a.porData).sort((x, y) => y[1] - x[1])[0] || ['', 0];
      return { userId, nome: a.nome, maxNumDia, dataMax, totalRecuperado: a.totalRecuperado };
    })
    .filter(m => m.maxNumDia > 0)
    .sort((a, b) => b.maxNumDia - a.maxNumDia || b.totalRecuperado - a.totalRecuperado);
};

// ===== 6) Liderança pelo exemplo: admins/professores, todas as trilhas =====
// `linhasTodasTrilhas` não filtra por track — quem lidera pode ter progresso
// em teen e adult (ver ROBGO no encerramento de Provado pelo Fogo). Por isso
// NÃO dá para usar collapseByUserWeek direto: ele colapsa por (userId, week)
// só, e duas trilhas da mesma pessoa na mesma semana colidiriam na mesma
// chave — ficando só com uma trilha e perdendo dias da outra. Aqui o colapso
// é por (userId, week, track): duplicata de doc dentro da MESMA trilha ainda
// fica com o melhor, mas trilhas diferentes nunca se sobrepõem.
export const liderancaPeloExemplo = (linhasTodasTrilhas: LinhaProgresso[]) => {
  const melhorPorChave: Record<string, LinhaProgresso> = {};
  for (const r of linhasTodasTrilhas) {
    const chave = `${r.userId}__${r.week}__${r.track || 'teen'}`;
    const atual = melhorPorChave[chave];
    const dias = r.dias ?? r.done?.length ?? 0;
    const diasAtual = atual ? (atual.dias ?? atual.done?.length ?? 0) : -1;
    if (!atual || dias > diasAtual || (dias === diasAtual && r.xp > atual.xp)) melhorPorChave[chave] = r;
  }
  const porAluno: Record<string, { nome: string; dias: number }> = {};
  for (const r of Object.values(melhorPorChave)) {
    if (!r.isAdmin && !r.isProfessor) continue;
    if (isRankingHidden(r.nome)) continue;
    const a = porAluno[r.userId] ??= { nome: r.nome, dias: 0 };
    a.dias += r.dias ?? r.done?.length ?? 0;
  }
  return Object.values(porAluno).sort((a, b) => b.dias - a.dias);
};

// ===== 7) Clube da temporada: quem completou TUDO (mesmo atrasado) =====
// Reusa a regra do sorteio (src/sorteio.ts) — é a MESMA lista que concorre no
// sorteio final, de propósito: o clube e a urna são o mesmo grupo.
export const clubeDaTemporada = (
  linhasDaTurma: LinhaProgresso[],
  licoes: Licao[],
  hojeISO: string,
  recorte: { turmaId?: string; track?: string },
) => {
  const meta = diasLiberadosPorSemana(licoes, hojeISO);
  return participantesDaTemporada(linhasDaTurma, meta, 'temporada-tudo', recorte);
};

// ===== 8) Resumo completo — o JSON que vira apresentação =====
// Esta é a forma que docs/relatorio-temporada.md descreve para colar no
// prompt de um encerramento futuro.
export type ResumoTemporada = ReturnType<typeof montarResumoTemporada>;

export const montarResumoTemporada = (args: {
  linhasDaTurma: LinhaProgresso[];         // já filtradas por turmaId + track
  linhasLiderancaTodasTrilhas: LinhaProgresso[]; // admins/professores, sem filtro de turma/trilha
  licoes: Licao[];                          // só as da temporada (mesmo trimestre)
  criadoEmPorAluno: Record<string, string>; // userId -> data ISO de criação da conta
  turmaNome: string;
  trimestre: string;
  hojeISO?: string;
}) => {
  const hojeISO = args.hojeISO || hojeLocalISO();
  const alunos = collapseByUserWeek(args.linhasDaTurma).filter(r => !r.isAdmin && !r.isProfessor);
  const porAluno: Record<string, { nome: string; dias: number; xp: number; semanasCompletas: number; linhas: LinhaProgresso[] }> = {};
  for (const r of alunos) {
    const a = porAluno[r.userId] ??= { nome: r.nome, dias: 0, xp: 0, semanasCompletas: 0, linhas: [] };
    a.dias += r.dias ?? r.done?.length ?? 0;
    a.xp += r.xp || 0;
    if ((r.dias ?? r.done?.length ?? 0) >= 7) a.semanasCompletas++;
    a.linhas.push(r);
  }
  const ranking = Object.entries(porAluno)
    .map(([userId, a]) => ({ userId, nome: a.nome, dias: a.dias, xp: a.xp, semanasCompletas: a.semanasCompletas }))
    .sort((a, b) => b.dias - a.dias || b.xp - a.xp);

  const ofensivas = Object.entries(porAluno)
    .map(([userId, a]) => ({ userId, nome: a.nome, ...ofensivaReal(a.linhas, args.licoes, args.criadoEmPorAluno[userId], hojeISO) }))
    .sort((a, b) => b.dias - a.dias);

  return {
    turma: args.turmaNome,
    trimestre: args.trimestre,
    geradoEm: hojeISO,
    totais: {
      alunos: ranking.length,
      dias: ranking.reduce((s, r) => s + r.dias, 0),
      xp: ranking.reduce((s, r) => s + r.xp, 0),
      semanasCompletas: ranking.reduce((s, r) => s + r.semanasCompletas, 0),
    },
    ranking,
    ofensivaReal: ofensivas.slice(0, 5),
    melhorSemana: melhorSemana(args.linhasDaTurma, args.licoes).slice(0, 5),
    diaMaisEstudado: diaMaisEstudado(args.linhasDaTurma, args.licoes).slice(0, 8),
    maratonistas: maratonistas(args.linhasDaTurma, args.licoes).slice(0, 5),
    liderancaPeloExemplo: liderancaPeloExemplo(args.linhasLiderancaTodasTrilhas).slice(0, 5),
    clubeDaTemporada: clubeDaTemporada(args.linhasDaTurma, args.licoes, hojeISO, {}).map(p => ({ nome: p.nome, xp: p.xp, dias: p.dias })),
  };
};
