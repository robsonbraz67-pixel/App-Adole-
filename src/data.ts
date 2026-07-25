// ===== Conteúdo das lições, carregado sob demanda =====
// Cada trilha tem ~13 semanas de texto corrido; embarcar todas fazia todo mundo
// baixar o conteúdo de trilhas que nunca vai abrir (~74 KB gzip só de adulto).
// Com import() dinâmico, cada pessoa baixa só a sua — e nada precisa ser
// apagado do repositório para isso.
//
// O acesso continua SÍNCRONO (getTrackLessons) porque a UI inteira depende
// disso no primeiro render; quem garante que o cache está quente é o
// loadTrackLessons() no arranque do App, antes de sair da splash.

export type TrackId = 'teen' | 'youngAdult' | 'adult';

const cache: Partial<Record<TrackId, any[]>> = {
  // youngAdult ainda não tem conteúdo: lista vazia (a UI já trata com "Em breve")
  youngAdult: [],
};

const carregadores: Record<TrackId, () => Promise<any[]>> = {
  teen: () => import('./lessonsTeen').then(m => m.default),
  adult: () => import('./lessonsAdult').then(m => m.default),
  youngAdult: async () => [],
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
