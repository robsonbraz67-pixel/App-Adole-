import { useEffect, useState } from 'react';

// Ofensiva da temporada (🔥) — serviço independente com persistência local.
// Regras: atividade hoje → +1 (uma vez por dia); >24h sem atividade → zera;
// Streak Freeze preserva a ofensiva uma vez.

export interface StreakState {
  streak: number;
  lastDate: string | null; // YYYY-MM-DD local
  freezes: number;
}

const STATE0: StreakState = { streak: 0, lastDate: null, freezes: 0 };

const key = (userId: string) => `seasonStreak_${userId}`;

export const hojeLocalISO = (): string => {
  const h = new Date();
  return new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const diffDias = (a: string, b: string): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export const loadStreak = (userId: string): StreakState => {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? { ...STATE0, ...JSON.parse(raw) } : { ...STATE0 };
  } catch {
    return { ...STATE0 };
  }
};

export const saveStreak = (userId: string, state: StreakState): void => {
  try { localStorage.setItem(key(userId), JSON.stringify(state)); } catch {}
};

// Aplica expiração: 1 dia sem atividade consome um freeze; mais que isso (ou sem freeze) zera
export const evaluateStreak = (state: StreakState, hoje: string = hojeLocalISO()): StreakState => {
  if (!state.lastDate || state.streak === 0) return state;
  const gap = diffDias(state.lastDate, hoje);
  if (gap <= 1) return state; // hoje ou ontem: ofensiva viva
  if (gap === 2 && state.freezes > 0) {
    // um dia perdido, freeze cobre
    return { ...state, freezes: state.freezes - 1 };
  }
  return { ...state, streak: 0 };
};

// Registra atividade concluída hoje (idempotente por dia)
export const registerActivity = (state: StreakState, hoje: string = hojeLocalISO()): StreakState => {
  const cur = evaluateStreak(state, hoje);
  if (cur.lastDate === hoje) return cur; // já contou hoje
  return { ...cur, streak: cur.streak + 1, lastDate: hoje };
};

export const registerStreakActivity = (userId: string): StreakState => {
  const next = registerActivity(loadStreak(userId));
  saveStreak(userId, next);
  return next;
};

export const getCurrentStreak = (userId: string): number => {
  const evaluated = evaluateStreak(loadStreak(userId));
  saveStreak(userId, evaluated);
  return evaluated.streak;
};

// Hook: expõe a ofensiva atual e revalida quando o app volta ao primeiro plano
export const useStreak = (userId?: string): number => {
  const [streak, setStreak] = useState(() => (userId ? getCurrentStreak(userId) : 0));
  useEffect(() => {
    if (!userId) return;
    const sync = () => setStreak(getCurrentStreak(userId));
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('streak-updated', sync as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('streak-updated', sync as EventListener);
    };
  }, [userId]);
  return streak;
};

