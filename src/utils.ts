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

// Embaralhamento de verdade (Fisher-Yates).
//
// O `[...a].sort(() => Math.random() - 0.5)` que existia antes NÃO embaralha
// direito: o comparador é inconsistente e o algoritmo de ordenação do
// navegador não redistribui de forma uniforme. Medido com 200 mil sorteios de
// 4 opções, a primeira continuava em 1º lugar em 35,8% das vezes, quando o
// justo é 25% — a alternativa certa tendia a ficar sempre no mesmo canto e
// quem chutasse a primeira acertava acima do acaso. Com Fisher-Yates dá 25,0%.
export const embaralhar = <T,>(lista: T[]): T[] => {
  const c = [...lista];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
};

export const AVTS = ['🦁','🐯','🦊','🐺','🦅','🐬','🌟','🔥','⚡','🎯','👑','🚀'];

// Nomes de usuários que não devem aparecer nos rankings
export const RANKING_HIDDEN_NAMES: string[] = ['André Santana', 'Brenda Roosevelt'];

const normalizeName = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const hiddenNamesNormalized = new Set(RANKING_HIDDEN_NAMES.map(normalizeName));

export const isRankingHidden = (nome: string) => hiddenNamesNormalized.has(normalizeName(nome));

// `liberado`: o admin liberou ESTE dia para ser refeito sem punição de data
// (ver adminLiberarDia em firebase.ts). Quem perdeu o dia por doença, viagem
// ou erro do app refaz valendo 100%, em vez dos 75% de quem só atrasou.
export const getRecencyMult = (diaData: string, liberado = false) => {
  if (liberado) return 1.0;
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

export const xpSpeed = (t: number, ok: boolean, diaData?: string, liberado = false) => {
  if (!ok) return 0;

  let scoreTempo = 100 - ((t / 40) * 25);
  if (scoreTempo < 75) scoreTempo = 75;
  if (scoreTempo > 100) scoreTempo = 100;

  let mult = diaData ? getRecencyMult(diaData, liberado) : 1.0;

  return Math.round(scoreTempo * mult);
};

// ===== Modo Ao Vivo (Kahoot) =====
// Pontuação daquela sala é efêmera — não usa xpSpeed nem toca XP/progresso.
// Acertou vale de 500 a 1000, conforme a rapidez da resposta.
//
// `multiplicador`: 0 = pergunta que não pontua (enquete), 1 = normal,
// 2 = pontos em dobro. Aplicado depois do cálculo de velocidade, igual ao
// Kahoot: dobrar cedo dobraria também o piso de 500.
export const pontosAoVivo = (tempoMs: number, correta: boolean, duracaoSec: number, multiplicador = 1) => {
  if (!correta || multiplicador <= 0) return 0;
  const frac = Math.min(1, Math.max(0, tempoMs / 1000 / duracaoSec));
  return Math.round(Math.max(500, 1000 - frac * 500) * multiplicador);
};

// Bônus por acertos seguidos — o "answer streak" do Kahoot, que é o que faz a
// turma gritar quando alguém erra na quinta seguida. `streak` é a sequência
// DEPOIS de contar o acerto atual: o 1º acerto não dá bônus, o 2º dá 100, e
// assim por diante até o teto de 500 (a partir do 6º).
//
// Tabela em vez de fórmula de propósito: é assim que o Kahoot documenta, e
// deixa o valor fácil de ajustar sem reler a conta.
const BONUS_STREAK = [0, 0, 100, 200, 300, 400, 500];
export const bonusSequencia = (streak: number) => {
  if (!streak || streak < 2) return 0;
  return BONUS_STREAK[Math.min(streak, BONUS_STREAK.length - 1)];
};

// Nomes sugeridos para quem entra como convidado. Existe por dois motivos:
// tirar o atrito de "pensar num nome" (a turma inteira entra em 10 segundos) e
// dar uma saída pronta quando alguém escolhe um apelido impróprio — o professor
// expulsa e a pessoa volta com um destes.
const ADJETIVOS = ['Veloz', 'Radiante', 'Destemido', 'Sábio', 'Alegre', 'Fiel', 'Corajoso', 'Sereno', 'Brilhante', 'Nobre'];
const CRIATURAS = ['Leão', 'Águia', 'Cervo', 'Falcão', 'Golfinho', 'Lobo', 'Tigre', 'Coruja', 'Pantera', 'Raposa'];
export const nomeSugerido = () => {
  const a = ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)];
  const c = CRIATURAS[Math.floor(Math.random() * CRIATURAS.length)];
  return `${c} ${a}`;
};

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I, etc.) — o código da sala é
// lido em voz alta e digitado por gente olhando um projetor de longe.
const ALFABETO_CODIGO_SALA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const gerarCodigoSala = () =>
  Array.from({ length: 6 }, () => ALFABETO_CODIGO_SALA[Math.floor(Math.random() * ALFABETO_CODIGO_SALA.length)]).join('');

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

// Horário local (HH:mm) em que o quiz foi concluído — grava ao lado de emISO
// (ver App.tsx). Não decide nada sozinho hoje (a regra de "dia certo" continua
// sendo só a DATA), mas abre a porta para analisar horário preferido de estudo
// sem precisar de outro backfill depois. Ver docs/relatorio-temporada.md.
export const agoraLocalHora = (): string => {
  const h = new Date();
  return String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
};

const diaAnteriorISO = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

// Datas em que a pessoa estudou de verdade: history[diaId].emISO, gravado no
// fim do quiz. Indexado por semana, como o `done`.
export type DatasEstudo = Record<string, Record<number, string>>;

export const datasEstudoDoHistory = (history: any): Record<number, string> => {
  const datas: Record<number, string> = {};
  for (const diaId of Object.keys(history || {})) {
    const emISO = history[diaId]?.emISO;
    if (typeof emISO === 'string' && emISO) datas[Number(diaId)] = emISO;
  }
  return datas;
};

// Converte { semana: diaIds[] } (getUserAllDone) num Set de datas de calendário
// (YYYY-MM-DD). Base da ofensiva.
//
// A data que vale é o dia em que a pessoa SENTOU E ESTUDOU (`datasEstudo`), não
// a data que a lição carrega: quem coloca a semana em dia num domingo à tarde
// estudou no domingo — um dia — e quem estuda toda noite adiantado estudou
// todas elas. Dias concluídos antes deste carimbo existir não têm como saber a
// data real e caem na data da lição, que era o comportamento anterior.
const doneDatesSet = (allDone: Record<string, number[]>, licoes: any[], datasEstudo: DatasEstudo = {}): Set<string> => {
  const datas = new Set<string>();
  for (const semana of Object.keys(allDone)) {
    const l = licoes.find((x: any) => x.semana === semana);
    for (const diaId of allDone[semana]) {
      const real = datasEstudo[semana]?.[diaId];
      if (real) { datas.add(real); continue; }
      const dia = l?.dias.find((d: any) => d.id === diaId);
      if (dia?.data) datas.add(dia.data);
    }
  }
  return datas;
};

// Ofensiva real: conta dias de calendário consecutivos estudados, derivado do
// Firestore (allDone: { semana: diaIds[] } de getUserAllDone, mais as datas de
// estudo do history). Independente de localStorage — funciona em qualquer aparelho.
export const computeRealStreak = (allDone: Record<string, number[]>, licoes: any[], datasEstudo: DatasEstudo = {}, hojeISO: string = hojeLocalISO()): number => {
  const datas = doneDatesSet(allDone, licoes, datasEstudo);
  let cursor = datas.has(hojeISO) ? hojeISO : diaAnteriorISO(hojeISO);
  let streak = 0;
  while (datas.has(cursor)) {
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
    if (filtro?.track && (r.track || 'teen') !== filtro.track) continue;
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
//
// NÃO filtra por trilha aqui — só combina as duas fontes. O recorte por
// trilha/local é responsabilidade exclusiva de aggregateSeasonRanking (via
// `filtro`), aplicado depois. Chegou a existir um filtro por trilha aqui, mas
// ele rodava ANTES do filtro de verdade e afetava até a Campanha "Geral" (sem
// filtro nenhum) — se o jogador tivesse mudado de trilha (só admin/professor
// podiam), as próprias semanas antigas dele, salvas sob a trilha anterior,
// desapareciam do total. Sem filtro aqui, esse cenário nunca mais acontece.
export const mergeLiveWeek = (seasonRows: any[], weekRows: any[], semana: string) => {
  if (!semana) return seasonRows;
  // A semana corrente só é SUBSTITUÍDA para quem realmente veio na assinatura.
  // Trocar em bloco fazia o acumulado perder a semana inteira enquanto o
  // snapshot não chegava (ou se ele viesse parcial) — some ponto sem avisar.
  const temLive = new Set(weekRows.map((r: any) => r.userId));
  return [...seasonRows.filter((r: any) => r.week !== semana || !temLive.has(r.userId)), ...weekRows];
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

// ===== Sons =====
// Todos sintetizados na hora (Web Audio): nenhum arquivo de áudio, zero bytes a
// mais no app. Os valores vêm da página de teste de sons aprovada em 2026-09-26.
export type Som = 'correct' | 'wrong' | 'ranking' | 'tempo' | 'perfeito' | 'aba' | 'praticar' | 'voltar'
  | 'subiu' | 'caiu' | 'ouro' | 'prata' | 'bronze' | 'promocao';

export const somLigado = (): boolean => {
  try { return localStorage.getItem('som') !== 'off'; } catch { return true; }
};

// ===== Sorteio: rufar de tambor sincronizado com a revelação =====
// Única exceção à regra "tudo sintetizado" acima: um rufar de tambor de
// verdade dá o suspense que osciladores não reproduzem bem. Gravado (Mixkit,
// licença livre, sem crédito obrigatório), mora em public/sons/ — arquivo
// estático, não entra no bundle JS.
//
// A BATIDA (o instante em que o prato bate, fim do rufar) foi medida na
// forma de onda: a energia salta de pico ~15k para ~30k em 5,25s (ffmpeg
// astats, janelas de 10ms). É esse instante que o Sorteador usa para revelar
// o ganhador — trocou o arquivo, tem que remedir e atualizar esta constante,
// senão o nome aparece fora do tempo do som.
export const SORTEIO_BATIDA_S = 5.25;

// Arquivos de public/sons/, decodificados uma vez e guardados. Falha de
// download não fica em cache: a próxima chamada tenta de novo.
const _arquivos: Record<string, Promise<AudioBuffer>> = {};
const carregarArquivo = (c: AudioContext, nome: string): Promise<AudioBuffer> => {
  if (!_arquivos[nome]) {
    _arquivos[nome] = fetch(`/sons/${nome}.mp3`)
      .then(r => { if (!r.ok) throw new Error(nome); return r.arrayBuffer(); })
      .then(b => c.decodeAudioData(b))
      .catch(e => { delete _arquivos[nome]; throw e; });
  }
  return _arquivos[nome];
};
const carregarSorteioBuffer = (c: AudioContext) => carregarArquivo(c, 'sorteio-tambor');

// Efeitos gravados da apresentação de encerramento (Mixkit, mesma licença do
// rufar). Respeitam o botão de som do app como todo o resto.
//
// Os tempos abaixo foram medidos na forma de onda de cada arquivo (ffmpeg,
// janelas de 10ms) — são o que permite casar som e imagem: quem chama agenda
// o arquivo para que o INSTANTE FORTE caia exatamente quando a tela muda.
// Trocou um arquivo, remeça e atualize aqui.
export type EfeitoGravado = 'whoosh' | 'impacto' | 'fanfarra' | 'aplausos' | 'sino' | 'riser' | 'suspense';
export const ATAQUE_S: Record<EfeitoGravado, number> = {
  whoosh: 0.99,    // o "vuush" forte chega em ~1,0s (pico 1,07s)
  impacto: 0.69,   // o golpe começa em 0,69s (pico 1,40s)
  fanfarra: 0.27,
  aplausos: 0.89,
  sino: 0.25,
  riser: 7.0,      // riser.mp3 é o trecho final do original, cortado para o ápice cair em 7,0s
  suspense: 1.0,   // trilha contínua; o loop vai de 1,0s a 38,0s (antes e depois é fade)
};
export const SUSPENSE_LOOP = { inicio: 1.0, fim: 38.0 };

export const precarregarEfeitos = (nomes: EfeitoGravado[]) => {
  try { const c = getAudioCtx(); nomes.forEach(n => { carregarArquivo(c, n).catch(() => {}); }); } catch {}
};

export type SomTocando = { ctx: AudioContext; inicio: number; parar: (fade?: number) => void };

// Toca um efeito. `quando`: instante exato no relógio do AudioContext (tem
// prioridade sobre `em`, atraso em segundos a partir de agora). `desde`:
// começa do meio do arquivo. `loop`: repete o trecho [inicio, fim].
// Devolve null sem som (desligado, falhou, ou áudio pausado pelo navegador).
export const tocarEfeito = async (nome: EfeitoGravado, opts: {
  vol?: number; em?: number; quando?: number; desde?: number; dur?: number; loop?: { inicio: number; fim: number };
} = {}): Promise<SomTocando | null> => {
  if (!somLigado()) return null;
  try {
    const c = getAudioCtx();
    const buf = await carregarArquivo(c, nome);
    if (c.state !== 'running') {
      await Promise.race([c.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))]);
      if ((c.state as AudioContextState) !== 'running') return null;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts.loop) { src.loop = true; src.loopStart = opts.loop.inicio; src.loopEnd = opts.loop.fim; }
    const g = c.createGain();
    const vol = opts.vol ?? 0.6;
    const t0 = Math.max(c.currentTime + 0.02, opts.quando ?? c.currentTime + 0.02 + (opts.em || 0));
    g.gain.setValueAtTime(vol, t0);
    if (opts.dur) {
      g.gain.setValueAtTime(vol, t0 + Math.max(0, opts.dur - 0.5));
      g.gain.linearRampToValueAtTime(0.0001, t0 + opts.dur);
    }
    src.connect(g); g.connect(c.destination);
    src.start(t0, opts.desde || 0);
    if (opts.dur) src.stop(t0 + opts.dur + 0.05);
    return {
      ctx: c, inicio: t0,
      parar: (fade = 0.15) => {
        const now = c.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.linearRampToValueAtTime(0.0001, now + fade);
        try { src.stop(now + fade + 0.05); } catch {}
      },
    };
  } catch { return null; }
};

// Chame ao abrir a tela do Sorteador — pré-carrega o arquivo pra tocarSorteioTambor()
// não esperar o download na hora do clique. Falha em silêncio (sem internet,
// o Sorteador continua funcionando, só sem o rufar).
export const precarregarSorteioTambor = () => {
  try { carregarSorteioBuffer(getAudioCtx()); } catch {}
};

// Toca o rufar e devolve o instante (no relógio do AudioContext, não do
// JavaScript) em que a batida final acontece. Quem chama agenda a revelação
// do ganhador comparando esse instante com ctx.currentTime — o relógio de
// áudio não atrasa sob carga da thread principal como setTimeout atrasaria,
// então a batida e o nome aparecem juntos mesmo se a tela estiver ocupada
// animando a lista de nomes.
export const tocarSorteioTambor = async (): Promise<{ ctx: AudioContext; batidaEm: number } | null> => {
  if (!somLigado()) return null;
  try {
    const c = getAudioCtx();
    const buf = await carregarSorteioBuffer(c);
    // Contexto pausado (o navegador ainda não viu um clique/tecla) não toca e
    // não anda o relógio — quem esperasse a batida ficaria girando para
    // sempre. Tenta retomar por um instante; se não der, devolve null e quem
    // chamou usa o tempo fixo.
    if (c.state !== 'running') {
      await Promise.race([c.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))]);
      if ((c.state as AudioContextState) !== 'running') return null;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.55;
    src.connect(g); g.connect(c.destination);
    const t0 = c.currentTime + 0.05;
    src.start(t0);
    return { ctx: c, batidaEm: t0 + SORTEIO_BATIDA_S };
  } catch {
    return null;
  }
};

type Tom = { f: number; f2?: number; glide?: number; type?: OscillatorType; t?: number; dur: number; vol?: number; a?: number; lp?: number; lp2?: number; detune?: number };
type Ruido = { f: number; f2?: number; q?: number; type?: BiquadFilterType; t?: number; dur: number; vol?: number; a?: number };

let _ruido: AudioBuffer | null = null;

const tom = (c: AudioContext, o: Tom) => {
  const t0 = c.currentTime + 0.01 + (o.t || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.detune) osc.detune.value = o.detune;
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || o.dur));
  const a = o.a ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let saida: AudioNode = osc;
  if (o.lp) {
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(o.lp, t0);
    if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t0 + o.dur);
    osc.connect(fl); saida = fl;
  }
  saida.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + o.dur + 0.03);
};

const ruido = (c: AudioContext, o: Ruido) => {
  if (!_ruido || _ruido.sampleRate !== c.sampleRate) {
    _ruido = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = _ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + 0.01 + (o.t || 0);
  const src = c.createBufferSource(); src.buffer = _ruido;
  const fl = c.createBiquadFilter();
  fl.type = o.type || 'bandpass';
  fl.frequency.setValueAtTime(o.f, t0);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  fl.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + (o.a ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(fl); fl.connect(g); g.connect(c.destination);
  src.start(t0); src.stop(t0 + o.dur + 0.03);
};

// Sino: as parciais inarmônicas (2,76× e 5,4×) é que dão o timbre metálico.
const sino = (c: AudioContext, f: number, t: number, dur: number, vol: number) => {
  tom(c, { f, t, dur, vol, a: 0.003 });
  tom(c, { f: f * 2.76, t, dur: dur * 0.6, vol: vol * 0.35, a: 0.003 });
  tom(c, { f: f * 5.4, t, dur: dur * 0.3, vol: vol * 0.15, a: 0.003 });
};

const semitom = (f: number, n: number) => f * Math.pow(2, n / 12);
// Degraus da sequência de acertos: 1º acerto no tom base, até o 6º (+9 semitons).
const DEGRAUS = [0, 2, 4, 5, 7, 9];

const certa = (c: AudioContext, k: number) => {
  const tema = document.documentElement.getAttribute('data-theme') || '';
  if (tema === 'neon') {
    [523.25, 783.99, 1046.5].forEach((f, i) => [-8, 8].forEach(d =>
      tom(c, { f: semitom(f, k), type: 'sawtooth', detune: d, t: i * 0.05, dur: 0.22, vol: 0.05, lp: 1200, lp2: 5000 })));
  } else if (tema.startsWith('mvp')) {
    tom(c, { f: semitom(987.77, k), type: 'square', dur: 0.09, vol: 0.07, a: 0.002 });
    tom(c, { f: semitom(1318.51, k), type: 'square', t: 0.08, dur: 0.35, vol: 0.07, a: 0.002 });
  } else if (tema === 'manga') {
    ruido(c, { type: 'lowpass', f: 420, dur: 0.1, vol: 0.8, a: 0.002 });
    tom(c, { f: semitom(190, k), f2: semitom(90, k), dur: 0.11, vol: 0.35, a: 0.002 });
    ruido(c, { f: semitom(3000, k), q: 3, dur: 0.02, vol: 0.3 });
  } else {
    [523.25, 659.25, 783.99].forEach((f, i) => tom(c, { f: semitom(f, k), type: 'triangle', t: i * 0.07, dur: 0.22, vol: 0.22 }));
    tom(c, { f: semitom(2093, k), t: 0.2, dur: 0.3, vol: 0.05 });
  }
};

const errada = (c: AudioContext) => {
  const tema = document.documentElement.getAttribute('data-theme') || '';
  if (tema === 'neon') {
    [-10, 10].forEach(d => tom(c, { f: 220, f2: 110, type: 'sawtooth', detune: d, dur: 0.38, vol: 0.08, lp: 1400, lp2: 300 }));
  } else if (tema.startsWith('mvp')) {
    [311.13, 293.66].forEach((f, i) => tom(c, { f, type: 'square', t: i * 0.13, dur: 0.12, vol: 0.07, a: 0.002 }));
    tom(c, { f: 277.18, type: 'square', t: 0.26, dur: 0.38, vol: 0.07, a: 0.002 });
  } else if (tema === 'manga') {
    for (let i = 0; i < 7; i++) ruido(c, { f: 2500 + i * 320, q: 2, dur: 0.05, vol: 0.16, t: i * 0.035 });
  } else {
    tom(c, { f: 329.63, type: 'square', dur: 0.14, vol: 0.08, lp: 1200 });
    tom(c, { f: 261.63, type: 'square', t: 0.15, dur: 0.3, vol: 0.08, lp: 1000 });
  }
};

// Navegação toca bem mais baixo que o quiz: som em toda troca de tela cansa.
export const playSound = (type: Som, opts: { seq?: number; t?: number } = {}) => {
  if (!somLigado()) return;
  try {
    const c = getAudioCtx();
    const t = opts.t || 0;
    switch (type) {
      case 'correct': certa(c, DEGRAUS[Math.min(Math.max((opts.seq || 1) - 1, 0), DEGRAUS.length - 1)]); break;
      case 'wrong': errada(c); break;
      case 'tempo':
        tom(c, { f: 160, f2: 90, dur: 0.12, vol: 0.5, t });
        tom(c, { f: 140, f2: 80, dur: 0.12, vol: 0.35, t: t + 0.17 });
        break;
      case 'perfeito':
        [392, 523.25, 659.25].forEach((f, i) => tom(c, { f, type: 'triangle', t: t + i * 0.11, dur: 0.16, vol: 0.2 }));
        tom(c, { f: 783.99, type: 'triangle', t: t + 0.33, dur: 0.65, vol: 0.2 });
        tom(c, { f: 2093, t: t + 0.42, dur: 0.3, vol: 0.05 });
        tom(c, { f: 2637, t: t + 0.52, dur: 0.35, vol: 0.04 });
        break;
      case 'aba': tom(c, { f: 600, f2: 950, glide: 0.05, dur: 0.07, vol: 0.08, a: 0.003, t }); break;
      case 'voltar': tom(c, { f: 520, f2: 340, glide: 0.05, dur: 0.07, vol: 0.08, a: 0.003, t }); break;
      case 'praticar': ruido(c, { f: 350, f2: 3200, q: 1.2, dur: 0.38, vol: 0.2, a: 0.15, t }); break;
      case 'ranking':
        for (let i = 0; i < 14; i++) ruido(c, { f: 1800, q: 0.8, dur: 0.05, vol: 0.05 + i * 0.016, t: t + i * 0.045 });
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tom(c, { f, type: 'triangle', t: t + 0.68 + i * 0.025, dur: 0.75, vol: 0.12 }));
        sino(c, 2093, t + 0.72, 0.6, 0.06);
        break;
      case 'subiu':
        tom(c, { f: 440, f2: 1100, glide: 0.35, dur: 0.4, vol: 0.16, t });
        sino(c, 1318.51, t + 0.35, 0.6, 0.1);
        break;
      case 'caiu': tom(c, { f: 660, f2: 330, dur: 0.45, vol: 0.13, lp: 1500, t }); break;
      case 'ouro': sino(c, 1318.51, t, 1.3, 0.22); sino(c, 1975.53, t + 0.08, 1.1, 0.08); break;
      case 'prata': sino(c, 1046.5, t, 1.0, 0.2); break;
      case 'bronze': sino(c, 783.99, t, 0.9, 0.2); break;
      case 'promocao':
        [261.63, 392, 523.25, 659.25].forEach((f, i) => tom(c, { f, type: 'triangle', t: t + i * 0.03, dur: 0.9, vol: 0.11, a: 0.01 }));
        tom(c, { f: 783.99, type: 'triangle', t: t + 0.25, dur: 0.7, vol: 0.12 });
        break;
    }
  } catch {}
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


