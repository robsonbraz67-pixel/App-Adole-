import { collapseByUserWeek, embaralhar } from './utils';

// ===== Regras do sorteio =====
// semana-completa: quem fez os 7 dias da semana, 1 bilhete cada.
// temporada-tudo: quem fez TODOS os dias liberados da temporada, 1 bilhete cada.
// temporada-bilhete-por-semana: 1 bilhete por semana completa na temporada —
//   quem foi constante tem mais chance, mas quem fechou uma semana só também entra.
export type RegraSorteio = 'semana-completa' | 'temporada-tudo' | 'temporada-bilhete-por-semana';

export type Participante = {
  id: string;
  nome: string;
  avatar: string;
  xp: number;
  dias: number;
  bilhetes: number;
  semanasCompletas: number;
};

type Licao = { semana: string; dias: { data?: string }[] };

// Quantos dias de cada semana já foram liberados até `hojeISO`. É a meta de
// "estudou tudo": numa temporada que ainda está correndo, ninguém pode ser
// cobrado pelos dias que nem abriram.
export const diasLiberadosPorSemana = (licoes: Licao[], hojeISO: string): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const l of licoes) m[l.semana] = l.dias.filter(d => !!d.data && d.data <= hojeISO).length;
  return m;
};

// Turma de cada aluno = a da semana MAIS RECENTE dele na temporada. Não dá
// para exigir o carimbo em toda semana: doc antigo sem turmaId faria a pessoa
// perder a vaga no sorteio sem ninguém perceber. E quem trocou de turma no
// meio conta na turma onde está agora, não nas duas.
const turmaAtualPorAluno = (rows: any[]): Record<string, string | undefined> => {
  const ultima: Record<string, { week: string; turmaId?: string }> = {};
  for (const r of rows) {
    const u = ultima[r.userId];
    if (!u || r.week > u.week || (r.week === u.week && !u.turmaId && r.turmaId)) {
      ultima[r.userId] = { week: r.week, turmaId: r.turmaId || u?.turmaId };
    } else if (!u.turmaId && r.turmaId) {
      u.turmaId = r.turmaId;
    }
  }
  const out: Record<string, string | undefined> = {};
  for (const id of Object.keys(ultima)) out[id] = ultima[id].turmaId;
  return out;
};

export const participantesDaTemporada = (
  rows: any[],
  metaPorSemana: Record<string, number>,
  regra: Exclude<RegraSorteio, 'semana-completa'>,
  recorte: { turmaId?: string; track?: string },
): Participante[] => {
  const semanas = new Set(Object.keys(metaPorSemana));
  const daTemporada = rows.filter(r =>
    semanas.has(r.week)
    && !r.isAdmin && !r.isProfessor
    && (!recorte.track || (r.track || 'teen') === recorte.track));
  const turmaDe = turmaAtualPorAluno(daTemporada);
  const metaTotal = Object.values(metaPorSemana).reduce((s, n) => s + n, 0);

  const porAluno: Record<string, Participante> = {};
  // Nome e avatar da semana mais recente: é como a pessoa se chama e aparece HOJE.
  const semanaDoPerfil: Record<string, string> = {};
  for (const r of collapseByUserWeek(daTemporada)) {
    if (recorte.turmaId && turmaDe[r.userId] !== recorte.turmaId) continue;
    const p = porAluno[r.userId] ||= { id: r.userId, nome: r.nome, avatar: r.avatar, xp: 0, dias: 0, bilhetes: 0, semanasCompletas: 0 };
    if (!semanaDoPerfil[r.userId] || r.week > semanaDoPerfil[r.userId]) {
      semanaDoPerfil[r.userId] = r.week;
      p.nome = r.nome;
      p.avatar = r.avatar;
    }
    const dias = r.dias ?? (r.done?.length || 0);
    p.dias += dias;
    p.xp += r.xp || 0;
    const meta = metaPorSemana[r.week] || 0;
    if (meta > 0 && dias >= meta) p.semanasCompletas++;
  }

  const lista = Object.values(porAluno).map(p => ({
    ...p,
    bilhetes: regra === 'temporada-tudo'
      ? (metaTotal > 0 && p.dias >= metaTotal ? 1 : 0)
      : p.semanasCompletas,
  }));
  return lista
    .filter(p => p.bilhetes > 0)
    .sort((a, b) => (b.bilhetes - a.bilhetes) || (b.dias - a.dias) || (b.xp - a.xp));
};

// Ordem dos ganhadores, sem repetir ninguém, com chance proporcional aos
// bilhetes: embaralha TODOS os bilhetes (Fisher-Yates, não o sort aleatório
// enviesado) e fica com a primeira aparição de cada pessoa. O 1º da ordem sai
// com probabilidade bilhetes/total, e o mesmo vale entre os que sobram.
export const ordemPonderada = (participantes: { bilhetes: number }[]): number[] => {
  const urna: number[] = [];
  participantes.forEach((p, i) => { for (let k = 0; k < Math.max(1, p.bilhetes); k++) urna.push(i); });
  const vistos = new Set<number>();
  const ordem: number[] = [];
  for (const i of embaralhar(urna)) if (!vistos.has(i)) { vistos.add(i); ordem.push(i); }
  return ordem;
};

export const REGRA_TEXTO: Record<RegraSorteio, string> = {
  'semana-completa': '1 bilhete por quem fez os 7 dias',
  'temporada-tudo': '1 bilhete por quem estudou todos os dias',
  'temporada-bilhete-por-semana': '1 bilhete por semana completa',
};
