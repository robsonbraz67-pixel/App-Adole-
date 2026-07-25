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

// Converte { semana: diaIds[] } (getUserAllDone) num Set de datas reais (YYYY-MM-DD),
// usando LICOES para mapear diaId -> data. Base tanto da ofensiva pessoal quanto da
// ofensiva com amigos (interseção de dois desses sets).
const doneDatesSet = (allDone: Record<string, number[]>, licoes: any[]): Set<string> => {
  const datas = new Set<string>();
  for (const semana of Object.keys(allDone)) {
    const l = licoes.find((x: any) => x.semana === semana);
    if (!l) continue;
    for (const diaId of allDone[semana]) {
      const dia = l.dias.find((d: any) => d.id === diaId);
      if (dia?.data) datas.add(dia.data);
    }
  }
  return datas;
};

// Ofensiva real: conta dias de calendário consecutivos estudados, derivado do
// Firestore (allDone: { semana: diaIds[] } de getUserAllDone) + LICOES (mapeia
// diaId -> data real). Independente de localStorage — funciona em qualquer aparelho.
export const computeRealStreak = (allDone: Record<string, number[]>, licoes: any[], hojeISO: string = hojeLocalISO()): number => {
  const datas = doneDatesSet(allDone, licoes);
  let cursor = datas.has(hojeISO) ? hojeISO : diaAnteriorISO(hojeISO);
  let streak = 0;
  while (datas.has(cursor)) {
    streak++;
    cursor = diaAnteriorISO(cursor);
  }
  return streak;
};

// Ofensiva com amigos (Etapa 7): dias em que os DOIS completaram — calculada ao
// vivo a partir do histórico real de progresso (sem contador salvo/cron para
// "quebrar" a sequência; se um dos dois perde um dia, a interseção já reflete
// isso automaticamente na próxima leitura, sem precisar de job agendado).
export const computeMutualStreak = (allDoneA: Record<string, number[]>, allDoneB: Record<string, number[]>, licoes: any[], hojeISO: string = hojeLocalISO()): number => {
  const datasA = doneDatesSet(allDoneA, licoes);
  const datasB = doneDatesSet(allDoneB, licoes);
  let cursor = (datasA.has(hojeISO) && datasB.has(hojeISO)) ? hojeISO : diaAnteriorISO(hojeISO);
  let streak = 0;
  while (datasA.has(cursor) && datasB.has(cursor)) {
    streak++;
    cursor = diaAnteriorISO(cursor);
  }
  return streak;
};

// ===== Métrica da dupla =====
// Um dia vale 1 ponto quando os DOIS completaram e 0,5 quando só um completou.
// É a regra que faz o "preenchimento" de um dia ficar pela metade enquanto a
// outra pessoa não estudar — o ranking de duplas premia caminhar junto, não a
// soma bruta de dois esforços separados.
export const pairDias = (diasA: number, diasB: number) => (diasA + diasB) / 2;

// Dias em que exatamente UM dos dois estudou (o "meio preenchido")
export const pairSolo = (diasA: number, diasB: number, juntos: number) => diasA + diasB - 2 * juntos;

// Sincronia: quanto do esforço da dupla foi feito lado a lado (0–100)
export const pairSincronia = (diasA: number, diasB: number, juntos: number) => {
  const total = diasA + diasB;
  return total === 0 ? 0 : Math.round((2 * juntos * 100) / total);
};

// 3,5 em vez de 3.5 (pt-BR); inteiro fica sem casa decimal
export const fmtDias = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '—';

export const pairNome = (a: string, b: string) => `${firstName(a)} & ${firstName(b)}`;

// ===== Agregadores dos rankings (puros, calculados no cliente) =====
// Com ~100 pessoas sai mais barato — e instantâneo — montar os rankings aqui a
// partir de progress/ do que manter docs pré-calculados por um job agendado.
//
// Um usuário pode ter mais de um doc na mesma semana (chave legada + chave por
// trilha da janela do bug, ou trilhas diferentes para admin/professor). Tudo
// aqui colapsa por (usuário, semana) ficando com o doc MAIS COMPLETO — nunca
// duplica a linha nem soma duas trilhas, o que seria injusto no ranking.
export const collapseByUserWeek = (rows: any[]): any[] => {
  const best: Record<string, any> = {};
  for (const r of rows) {
    const k = `${r.userId}__${r.week}`;
    const cur = best[k];
    const dias = r.dias ?? (r.done?.length || 0);
    const curDias = cur ? (cur.dias ?? (cur.done?.length || 0)) : -1;
    if (!cur || dias > curDias || (dias === curDias && (r.xp || 0) > (cur.xp || 0))) best[k] = r;
  }
  return Object.values(best);
};

export const aggregateWeekRanking = (rows: any[]) =>
  collapseByUserWeek(rows).sort((a: any, b: any) => (b.xp || 0) - (a.xp || 0));

// Acumulado da campanha; `filtro` recorta por local e/ou trilha
export const aggregateSeasonRanking = (rows: any[], filtro?: { locationId?: string; track?: string }) => {
  const totals: Record<string, any> = {};
  for (const r of collapseByUserWeek(rows)) {
    if (filtro?.locationId && r.locationId !== filtro.locationId) continue;
    if (filtro?.track && r.track !== filtro.track) continue;
    if (!totals[r.userId]) {
      totals[r.userId] = { id: r.userId, nome: r.nome, avatar: r.avatar, xp: 0, dias: 0, isAdmin: false, isProfessor: false };
    }
    const t = totals[r.userId];
    t.xp += (r.xp || 0);
    t.dias += (r.dias ?? (r.done?.length || 0));
    t.isAdmin = t.isAdmin || !!r.isAdmin;
    t.isProfessor = t.isProfessor || !!r.isProfessor;
  }
  return Object.values(totals).sort((a: any, b: any) => (b.dias - a.dias) || (b.xp - a.xp));
};

// A campanha é lida sob demanda (13× mais docs que a semana) enquanto a semana
// corrente chega por assinatura ao vivo. Sobrepor uma na outra faz o total da
// campanha refletir na hora o quiz que a pessoa acabou de fazer.
// ATENÇÃO: trilhas diferentes compartilham a MESMA string de semana
// ("2026-W26") e só se distinguem pelo trimestre. Como weekRows vem de uma
// query só por semana, ele traz todas as trilhas — sem recortar pelo trimestre
// da campanha, o acumulado de "Geral" ganharia a semana atual de gente que nem
// está nesta campanha.
export const mergeLiveWeek = (seasonRows: any[], weekRows: any[], semana: string, trimestre?: string) => {
  if (!semana) return seasonRows;
  const live = trimestre ? weekRows.filter((r: any) => (r.trimestre || '') === trimestre) : weekRows;
  return [...seasonRows.filter((r: any) => r.week !== semana), ...live];
};

// Cruza a escalação das duplas com o progresso: dia cheio quando os dois
// estudaram, meio dia quando só um estudou. `doneA`/`doneB` só existem na
// versão semanal — é o que permite desenhar o trilho dia a dia.
export const buildPairWeekRanking = (roster: any[], weekRows: any[]) => {
  const byId: Record<string, any> = {};
  collapseByUserWeek(weekRows).forEach((r: any) => { byId[r.userId] = r; });
  return roster.map((p: any) => {
    const A = byId[p.aId], B = byId[p.bId];
    const doneA: number[] = A?.done || [];
    const doneB: number[] = B?.done || [];
    const setB = new Set(doneB);
    const juntos = doneA.filter(d => setB.has(d)).length;
    return {
      ...p,
      aNome: A?.nome || p.aNome, aAvatar: A?.avatar || p.aAvatar,
      bNome: B?.nome || p.bNome, bAvatar: B?.avatar || p.bAvatar,
      doneA, doneB,
      diasA: doneA.length,
      diasB: doneB.length,
      juntos,
      dias: pairDias(doneA.length, doneB.length),
      xp: (A?.xp || 0) + (B?.xp || 0),
      isAdmin: !!(A?.isAdmin || B?.isAdmin),
      isProfessor: !!(A?.isProfessor || B?.isProfessor),
    };
  });
};

// Mesma métrica somada nas semanas da campanha. Sem doneA/doneB (a UI desenha
// a barra proporcional a partir de juntos + dias que só um fez).
export const buildPairSeasonRanking = (roster: any[], seasonRows: any[]) => {
  const porUser: Record<string, any[]> = {};
  for (const r of collapseByUserWeek(seasonRows)) {
    (porUser[r.userId] ||= []).push(r);
  }
  return roster.map((p: any) => {
    const semanasA: Record<string, any> = {};
    const semanasB: Record<string, any> = {};
    (porUser[p.aId] || []).forEach(r => { semanasA[r.week] = r; });
    (porUser[p.bId] || []).forEach(r => { semanasB[r.week] = r; });
    let diasA = 0, diasB = 0, juntos = 0, xp = 0;
    let nomeA = p.aNome, avatarA = p.aAvatar, nomeB = p.bNome, avatarB = p.bAvatar;
    let isAdmin = false, isProfessor = false;
    for (const week of new Set([...Object.keys(semanasA), ...Object.keys(semanasB)])) {
      const wa = semanasA[week], wb = semanasB[week];
      const doneA: number[] = wa?.done || [];
      const doneB: number[] = wb?.done || [];
      const setB = new Set(doneB);
      diasA += doneA.length;
      diasB += doneB.length;
      juntos += doneA.filter(d => setB.has(d)).length;
      xp += (wa?.xp || 0) + (wb?.xp || 0);
      if (wa) { nomeA = wa.nome || nomeA; avatarA = wa.avatar || avatarA; }
      if (wb) { nomeB = wb.nome || nomeB; avatarB = wb.avatar || avatarB; }
      isAdmin = isAdmin || !!wa?.isAdmin || !!wb?.isAdmin;
      isProfessor = isProfessor || !!wa?.isProfessor || !!wb?.isProfessor;
    }
    return {
      ...p,
      aNome: nomeA, aAvatar: avatarA, bNome: nomeB, bAvatar: avatarB,
      diasA, diasB, juntos, xp, dias: pairDias(diasA, diasB), isAdmin, isProfessor,
    };
  });
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

