// ===== Conteúdo das lições, carregado sob demanda =====
// Cada trilha tem ~13 semanas de texto corrido; embarcar todas fazia todo mundo
// baixar o conteúdo de trilhas que nunca vai abrir (~74 KB gzip só de adulto).
// Com import() dinâmico, cada pessoa baixa só a sua — e nada precisa ser
// apagado do repositório para isso.
//
// O acesso continua SÍNCRONO (getTrackLessons) porque a UI inteira depende
// disso no primeiro render; quem garante que o cache está quente é o
// loadTrackLessons() no arranque do App, antes de sair da splash.

import { HISTORICO_TEMPORADAS, LicaoHistorica } from './historicoTemporadas';

export type TrackId = 'teen' | 'youngAdult' | 'adult';

// Cache vazio de propósito: uma lista vazia aqui (`[]`) é truthy e curto-circuita
// o loadTrackLessons, então nenhuma trilha pode nascer pré-preenchida.
const cache: Partial<Record<TrackId, any[]>> = {};

const carregadores: Record<TrackId, () => Promise<any[]>> = {
  teen: () => import('./lessonsTeen').then(m => m.default),
  adult: () => import('./lessonsAdult').then(m => m.default),
  youngAdult: () => import('./lessonsYoung').then(m => m.default),
};

const normalize = (track?: string | null): TrackId =>
  (track === 'adult' || track === 'youngAdult' ? track : 'teen');

// Deduplica chamadas simultâneas para a mesma trilha
const emVoo: Partial<Record<TrackId, Promise<any[]>>> = {};

export const loadTrackLessons = async (track?: string | null): Promise<any[]> => {
  const t = normalize(track);
  const pronto = cache[t];
  if (pronto) return pronto;
  if (!emVoo[t]) {
    emVoo[t] = carregadores[t]().then(licoes => { cache[t] = licoes; return licoes; });
  }
  return emVoo[t]!;
};

// Leitura síncrona do cache. Devolve [] enquanto a trilha não carregou — as
// telas já sabem lidar com isso (mostram "Em breve"/carregando).
export const getTrackLessons = (track?: string | null): any[] => cache[normalize(track)] || [];

export const isTrackLoaded = (track?: string | null) => !!cache[normalize(track)];

// ===== Histórico de temporadas encerradas =====
// Só o esqueleto (semana, trimestre, datas) — ver historicoTemporadas.ts. NÃO
// entra em getTrackLessons: estudo, quiz, trilha do aluno e Ao Vivo só enxergam
// a temporada em curso. Quem precisa olhar para trás (apresentação de
// encerramento, relatório da temporada, sorteio de uma semana que passou)
// pede explicitamente `getTrackHistory`/`getTrackLessonsComHistorico`.
export const getTrackHistory = (track?: string | null): LicaoHistorica[] =>
  (HISTORICO_TEMPORADAS as Record<string, LicaoHistorica[]>)[normalize(track)] || [];

// Histórico + temporada atual, em ordem cronológica. Os itens históricos trazem
// `historico: true` para quem precisar distinguir (sem texto nem perguntas).
export const getTrackLessonsComHistorico = (track?: string | null): any[] =>
  [...getTrackHistory(track), ...getTrackLessons(track)];

export const loadTrackLessonsComHistorico = async (track?: string | null): Promise<any[]> => {
  const atuais = await loadTrackLessons(track);
  return [...getTrackHistory(track), ...(atuais || [])];
};
