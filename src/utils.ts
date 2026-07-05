export const gs = (k: string, d: any = null) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};

export const ss = (k: string, v: any) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const AVTS = ['🦁','🐯','🦊','🐺','🦅','🐬','🌟','🔥','⚡','🎯','👑','🚀'];

// Nomes de usuários que não devem aparecer nos rankings
export const RANKING_HIDDEN_NAMES: string[] = ['André Santana', 'Brenda Roosevelt'];

const normalizeName = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const hiddenNamesNormalized = new Set(RANKING_HIDDEN_NAMES.map(normalizeName));

export const isRankingHidden = (nome: string) => hiddenNamesNormalized.has(normalizeName(nome));

export const getRecencyMult = (diaData: string) => {
  const hoje = new Date();
  const offset = hoje.getTimezoneOffset() * 60000;
  const hLocal = new Date(hoje.getTime() - offset);
  const hojeStr = hLocal.toISOString().split('T')[0];
  
  if (diaData === hojeStr) {
    return 1.0;
  } else {
    const dayOfWeek = hoje.getDay();
    const distToSat = (dayOfWeek + 1) % 7;
    const startOfWeek = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - distToSat);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const [y, m, d] = diaData.split('-').map(Number);
    const targetLocal = new Date(y, m - 1, d);
    
    if (targetLocal >= startOfWeek && targetLocal <= endOfWeek) {
      return 0.90;
    } else {
      return 0.75;
    }
  }
};

export const xpSpeed = (t: number, ok: boolean, diaData?: string) => {
  if (!ok) return 0;
  
  let scoreTempo = 100 - ((t / 40) * 25);
  if (scoreTempo < 75) scoreTempo = 75;
  if (scoreTempo > 100) scoreTempo = 100;
  
  let mult = diaData ? getRecencyMult(diaData) : 1.0;
  
  return Math.round(scoreTempo * mult);
};

export const getDiaId = (dias: any[]) => {
  const hoje = new Date();
  const offset = hoje.getTimezoneOffset() * 60000;
  const hLocal = new Date(hoje.getTime() - offset);
  const h = hLocal.toISOString().split('T')[0];
  const d = dias.find((x: any) => x.data === h);
  return d ? d.id : dias[dias.length - 1].id;
};

export const hojeLocalISO = (): string => {
  const h = new Date();
  return new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const diaAnteriorISO = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

// Ofensiva real: conta dias de calendário consecutivos estudados, derivado do
// Firestore (allDone: { semana: diaIds[] } de getUserAllDone) + LICOES (mapeia
// diaId -> data real). Independente de localStorage — funciona em qualquer aparelho.
export const computeRealStreak = (allDone: Record<string, number[]>, licoes: any[], hojeISO: string = hojeLocalISO()): number => {
  const datas = new Set<string>();
  for (const semana of Object.keys(allDone)) {
    const l = licoes.find((x: any) => x.semana === semana);
    if (!l) continue;
    for (const diaId of allDone[semana]) {
      const dia = l.dias.find((d: any) => d.id === diaId);
      if (dia?.data) datas.add(dia.data);
    }
  }
  let cursor = datas.has(hojeISO) ? hojeISO : diaAnteriorISO(hojeISO);
  let streak = 0;
  while (datas.has(cursor)) {
    streak++;
    cursor = diaAnteriorISO(cursor);
  }
  return streak;
};

export const getMsgRes = (a: number, t: number) => {
  const r = a / t;
  if (r === 1) return { ic: '🏆', mg: 'PERFEITO! Você é imbatível!' };
  if (r >= .75) return { ic: '🌟', mg: 'Incrível! Quase lá!' };
  if (r >= .5) return { ic: '💪', mg: 'Bom esforço! Continue assim!' };
  return { ic: '📖', mg: 'Leia novamente amanhã, você vai melhorar!' };
};

export const rankDemo = () => [
  { id: 'd1', nome: 'Maria', avatar: '🦁', xp: 890, dias: 5 },
  { id: 'd2', nome: 'Pedro', avatar: '🔥', xp: 720, dias: 4 },
  { id: 'd3', nome: 'Ana', avatar: '⚡', xp: 540, dias: 3 },
  { id: 'd4', nome: 'Lucas', avatar: '🌟', xp: 320, dias: 2 }
];

export const calcPos = (r: any[], id: string, xp: number) => {
  const s = [...r].sort((a, b) => b.xp - a.xp);
  const i = s.findIndex((x: any) => x.id === id);
  return i === -1 ? s.length + 1 : i + 1;
};

export const PROG0 = { xp: 0, streak: 0, done: [], history: {}, pos: 1 };

export const shareApp = async () => {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'SabatinaQuest ✨',
        text: 'Venha estudar a lição comigo no SabatinaQuest!',
        url: url
      });
      return;
    } catch (e) {
      console.error("Share failed", e);
    }
  }
  
  try {
    await navigator.clipboard.writeText(url);
    alert('Link copiado!');
  } catch (e) {
    prompt('Link para compartilhar:', url);
  }
};

// AudioContext único e reutilizado — iOS limita a ~4 contextos simultâneos;
// criar um por som causa vazamento, travamentos e áudio mudo
let _actx: AudioContext | null = null;
export const getAudioCtx = (): AudioContext => {
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!_actx || _actx.state === 'closed') _actx = new AC();
  if (_actx.state === 'suspended') _actx.resume().catch(() => {});
  return _actx;
};

export const playSound = (type: 'correct' | 'wrong' | 'ranking') => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'ranking') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1);
      osc.frequency.setValueAtTime(659.25, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch(e) {}
};

export const formatDiaSemana = (dia: string): string => {
  if (!dia) return '';
  const d = dia.trim().toLowerCase();
  if (d === 'sex') return 'Sexta';
  if (d === 'sáb' || d === 'sab') return 'Sábado';
  if (d === 'dom') return 'Domingo';
  if (d === 'seg') return 'Segunda';
  if (d === 'ter') return 'Terça';
  if (d === 'qua') return 'Quarta';
  if (d === 'qui') return 'Quinta';
  return dia;
};

export const scheduleStudyReminder = async (userName: string, lessonTitle: string) => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  
  try {
    let perm = Notification.permission;
    if (perm !== 'granted') {
       perm = await Notification.requestPermission();
    }
    
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        const title = `Olá, ${userName}! 🌟`;
        const options: any = {
           body: `Hora do estudo: ${lessonTitle} - continue com sua sequência no SabatinaQuest!`,
           icon: '/icon-192.png',
           badge: '/icon-192.png',
        };
        
        const targetTime = new Date().getTime() + 24 * 60 * 60 * 1000;
        
        if ('showTrigger' in Notification.prototype) {
           options.showTrigger = new (window as any).TimestampTrigger(targetTime);
           await reg.showNotification(title, options);
        } else {
           console.log("Notification Triggers not supported. You will receive notifications only when the app is open.");
           // Optional: simple timeout if they keep it open for 24h
           setTimeout(() => {
             reg.showNotification(title, options);
           }, 24 * 60 * 60 * 1000);
        }
      }
    }
  } catch (e) {
    console.error("Error scheduling reminder", e);
  }
};

