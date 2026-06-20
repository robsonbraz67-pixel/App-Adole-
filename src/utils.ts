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

export const xpSpeed = (t: number, ok: boolean, diaData?: string) => {
  if (!ok) return 0;
  
  let scoreTempo = 100 - ((t / 20) * 25);
  if (scoreTempo < 75) scoreTempo = 75;
  if (scoreTempo > 100) scoreTempo = 100;
  
  let mult = 1.0;
  if (diaData) {
    const hoje = new Date();
    const offset = hoje.getTimezoneOffset() * 60000;
    const hLocal = new Date(hoje.getTime() - offset);
    const hojeStr = hLocal.toISOString().split('T')[0];
    
    if (diaData === hojeStr) {
      mult = 1.0;
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
        mult = 0.90;
      } else {
        mult = 0.75;
      }
    }
  }
  
  return Math.round(scoreTempo * mult);
};

export const getDiaId = (dias: any[]) => {
  const h = new Date().toISOString().split('T')[0];
  const d = dias.find((x: any) => x.data === h);
  return d ? d.id : dias[dias.length - 1].id;
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

export const playSound = (type: 'correct' | 'wrong' | 'ranking') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

