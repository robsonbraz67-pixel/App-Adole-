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

export const xpSpeed = (t: number, ok: boolean) => {
  if (!ok) return 0;
  if (t <= 7) return 100;
  if (t <= 14) return 60;
  return 30;
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
