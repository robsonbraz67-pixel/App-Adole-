import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, onSnapshot, writeBatch, increment, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { gerarCodigoSala, pontosAoVivo } from '../utils';
import { calibrarRelogio } from './relogio';

// ===== Seleção das perguntas da sala =====
// Junta as perguntas de todos os dias da lição e sorteia até `totalQuestions`.
// Mesmo filtro de "pergunta malformada" do Quiz diário (components.tsx) — o
// editor de conteúdo do Admin consegue gravar uma pergunta sem opções.
export const selecionarPerguntasSala = (licao: any, totalQuestions: number) => {
  const pool = (licao?.dias || []).flatMap((d: any) =>
    (d.perguntas || []).flatMap((q: any) => {
      const opcoes = Array.isArray(q?.opcoes) ? q.opcoes.filter((o: any) => typeof o === 'string') : [];
      if (opcoes.length < 2) return [];
      const correta = typeof q.correta === 'number' && q.correta >= 0 && q.correta < opcoes.length ? q.correta : 0;
      return [{ id: q.id, pergunta: q.pergunta, opcoes, correta, explicacao: q.explicacao || '' }];
    })
  );
  const embaralhado = [...pool].sort(() => Math.random() - 0.5);
  return embaralhado.slice(0, Math.min(totalQuestions, 12));
};

// ===== Criar sala =====
// liveGamesPrivate nasce no MESMO writeBatch de liveGames — dentro do batch,
// isGameHost() ainda veria "a sala não existe" (armadilha do firestore.rules).
export const criarSala = async (opts: {
  hostId: string; hostName: string; track: string; semana: string; trimestre?: string; licaoTitulo?: string;
  perguntas: any[]; questionDurationSec: number;
}) => {
  const { hostId, hostName, track, semana, trimestre, licaoTitulo, perguntas, questionDurationSec } = opts;

  let code = gerarCodigoSala();
  for (let tentativas = 0; tentativas < 5; tentativas++) {
    const snap = await getDoc(doc(db, 'liveGames', code));
    if (!snap.exists()) break;
    code = gerarCodigoSala();
  }

  const gameData: any = {
    code, hostId, hostName, track,
    semana: semana || '',
    totalQuestions: perguntas.length,
    questionDurationSec,
    phase: 'lobby',
    currentIndex: -1,
    createdAt: serverTimestamp(),
  };
  if (trimestre) gameData.trimestre = trimestre;
  if (licaoTitulo) gameData.licaoTitulo = licaoTitulo;

  const privateData = {
    perguntas: perguntas.map(p => ({ id: p.id, pergunta: p.pergunta, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao || '' })),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'liveGames', code), gameData);
  batch.set(doc(db, 'liveGamesPrivate', code), privateData);
  await batch.commit();

  return code;
};

export const getSala = async (code: string) => {
  const snap = await getDoc(doc(db, 'liveGames', code));
  return snap.exists() ? snap.data() : null;
};

// Só o host lê — usado também pra recuperar a sala depois de um F5 (o
// gabarito só existia em memória antes de existir esta coleção separada).
export const getSalaPrivada = async (code: string) => {
  const snap = await getDoc(doc(db, 'liveGamesPrivate', code));
  return snap.exists() ? (snap.data().perguntas as any[]) : null;
};

export const getMeuJogador = async (code: string, uid: string) => {
  const snap = await getDoc(doc(db, 'livePlayers', `${code}_${uid}`));
  return snap.exists() ? snap.data() : null;
};

// ===== Entrar na sala =====
export const entrarNaSala = async (code: string, uid: string, nome: string, avatar: string, isGuest: boolean) => {
  const playerData: any = { code, uid, nome, avatar, score: 0, joinedAt: serverTimestamp() };
  if (isGuest) playerData.isGuest = true;
  await setDoc(doc(db, 'livePlayers', `${code}_${uid}`), playerData);
};

// ===== Assinaturas =====
export const assinarSala = (code: string, cb: (game: any) => void) =>
  onSnapshot(doc(db, 'liveGames', code), snap => {
    const dados = snap.exists() ? snap.data() : null;
    // Calibra o relógio de graça: este snapshot já carrega um instante do
    // servidor, e a hora local de agora é o outro lado da conta. Só serve
    // quando vem do servidor — o cache devolveria um instante antigo.
    if (dados?.faseIniciadaEm && !snap.metadata.fromCache) {
      calibrarRelogio(dados.faseIniciadaEm.toMillis(), Date.now());
    }
    cb(dados);
  });

// Lista completa dos jogadores — cara pra ler (~N docs por revelação). Só o
// host assina isto o jogo inteiro (precisa do roster pra corrigir); os
// jogadores assinam isto só no lobby/placar/pódio (ver assinarMeuJogador).
export const assinarJogadores = (code: string, cb: (jogadores: any[]) => void) =>
  onSnapshot(query(collection(db, 'livePlayers'), where('code', '==', code)), snap => {
    const lista = snap.docs.map(d => d.data());
    lista.sort((a, b) => (b.score || 0) - (a.score || 0));
    cb(lista);
  });

// Só o próprio doc — usado pelo jogador durante pergunta/revelação, pra não
// custar ~19.200 leituras numa sala de 40 pessoas × 12 perguntas (doc 1.8).
export const assinarMeuJogador = (code: string, uid: string, cb: (jogador: any) => void) =>
  onSnapshot(doc(db, 'livePlayers', `${code}_${uid}`), snap => cb(snap.exists() ? snap.data() : null));

export const assinarMinhaResposta = (code: string, uid: string, idx: number, cb: (resp: any) => void) =>
  onSnapshot(doc(db, 'liveAnswers', `${code}_${uid}_${idx}`), snap => cb(snap.exists() ? snap.data() : null));

// ===== Responder =====
// Doc id composto impede responder 2x: a 2ª tentativa de `setDoc` bate na
// regra de `update` (só o host escreve `graded/correta/pontos`) e é recusada.
//
// Devolve o que aconteceu de FATO, em vez de ser disparada e esquecida: a
// regra do Firestore recusa a escrita se a fase já virou ou o índice mudou —
// exatamente o caso de quem responde nos últimos instantes com a rede lenta.
// Antes disso, a tela dizia "Resposta enviada!" sem nenhuma confirmação e o
// aluno ficava sem ponto sem entender por quê.
export type ResultadoResposta = 'ok' | 'tarde' | 'falhou';

export const responder = async (
  code: string, uid: string, idx: number, opcaoEscolhida: number, tempoRespostaMs: number
): Promise<ResultadoResposta> => {
  const dados = {
    code, uid, idx, opcaoEscolhida, tempoRespostaMs, answeredAt: serverTimestamp(), graded: false,
  };
  // Duas tentativas: a primeira falha muitas vezes é um soluço de rede, e
  // meio segundo depois passa. Mais que isso não adianta — a janela da
  // pergunta já teria fechado de qualquer jeito.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await setDoc(doc(db, 'liveAnswers', `${code}_${uid}_${idx}`), dados);
      return 'ok';
    } catch (e: any) {
      // 'permission-denied' aqui quer dizer que a regra recusou: a pergunta
      // fechou. Repetir não ajuda e só atrasa o aviso ao aluno.
      if (e?.code === 'permission-denied') return 'tarde';
      if (tentativa === 0) await new Promise(r => setTimeout(r, 500));
    }
  }
  return 'falhou';
};

// ===== Controle do host =====
export const iniciarPergunta = async (code: string, idx: number, pergunta: any) => {
  await updateDoc(doc(db, 'liveGames', code), {
    phase: 'question',
    currentIndex: idx,
    currentQuestion: { pergunta: pergunta.pergunta, opcoes: pergunta.opcoes },
    questionStartedAt: serverTimestamp(),
    faseIniciadaEm: serverTimestamp(),
  });
};

export const revelarPergunta = async (code: string, correctIndex: number, explicacao: string, revealCounts: number[]) => {
  await updateDoc(doc(db, 'liveGames', code), {
    phase: 'reveal',
    revealCorrectIndex: correctIndex,
    revealExplicacao: explicacao || '',
    revealCounts,
    faseIniciadaEm: serverTimestamp(),
  });
};

// ===== Placar agregado =====
// O motivo de existir é cota. Cada aluno assinando a lista de `livePlayers`
// custa N leituras a cada placar; com 40 alunos × 12 perguntas isso passa de
// 20.000 leituras por partida, e o plano gratuito do Firestore dá 50.000 por
// DIA — estourar derruba o app inteiro (ranking, progresso), não só o jogo.
// Aqui o host, que já tem a lista em memória, publica um resumo dentro do
// doc da sala, que todo aluno JÁ assina: custo zero de leitura nova.
//
// Sem avatar de propósito: ele pode ser um data URL de até 1MB, e 40 deles
// estourariam o limite de 1MB do documento. O aluno usa o avatar que já
// guardou do lobby, e quem entrou depois cai num emoji padrão.
const resumoPlacar = (jogadores: any[]) =>
  jogadores
    .map(j => ({ uid: String(j.uid), nome: String(j.nome || '').slice(0, 50), score: Number(j.score) || 0 }))
    .sort((a, b) => b.score - a.score);

// `placar` é campo novo: se as regras publicadas ainda não o conhecerem (elas
// são compartilhadas com o LUM07 e podem estar atrasadas), a escrita inteira
// seria recusada e a fase não avançaria — o jogo travaria. Por isso a
// tentativa com placar vem primeiro e, se falhar, refaz sem ele: aí o aluno
// volta a assinar `livePlayers` como antes. Degrada em custo, nunca em jogo.
export const avancarParaPlacar = async (code: string, jogadores: any[]) => {
  const base = { phase: 'placar', faseIniciadaEm: serverTimestamp() };
  try {
    await updateDoc(doc(db, 'liveGames', code), { ...base, placar: resumoPlacar(jogadores) });
    return true;
  } catch {
    await updateDoc(doc(db, 'liveGames', code), base);
    return false;
  }
};

// O pódio também publica o resumo: é o outro momento em que todo aluno
// precisa da classificação, e sem isto ele voltaria a ler a lista inteira.
export const encerrarJogo = async (code: string, jogadores: any[] = []) => {
  const base = { phase: 'ended', endedAt: serverTimestamp() };
  try {
    await updateDoc(doc(db, 'liveGames', code), { ...base, placar: resumoPlacar(jogadores) });
  } catch {
    await updateDoc(doc(db, 'liveGames', code), base);
  }
};

// Busca as respostas de uma pergunta — usado na revelação e de novo na
// varredura de retardatários (Wi-Fi de igreja atrasa respostas, doc 1.7).
export const buscarRespostasPergunta = async (code: string, idx: number) => {
  const snap = await getDocs(query(collection(db, 'liveAnswers'), where('code', '==', code), where('idx', '==', idx)));
  return snap.docs.map(d => ({ id: d.id, data: d.data() as any }));
};

// Corrige em lote: só respostas ainda não corrigidas, de quem está de fato na
// sala (senão o `update` do score bate num doc ausente e a regra recusa o
// LOTE INTEIRO — doc 1.7 cautela #4), e que o chamador ainda não marcou como
// "em correção" em `jaCorrigidos` — esse Set é o que impede tanto o duplo-
// clique quanto a varredura de retardatários pontuarem a mesma resposta 2x
// (doc 1.7, cautelas #1 e #3). `writeBatch` fatiado em blocos de 250 (2
// operações por resposta; o limite real do Firestore é 500).
export const corrigirRespostas = async (
  code: string, correctIndex: number, questionDurationSec: number,
  respostas: { id: string; data: any }[], uidsValidos: Set<string>, jaCorrigidos: Set<string>
) => {
  const pendentes = respostas.filter(r => !r.data.graded && uidsValidos.has(r.data.uid) && !jaCorrigidos.has(r.id));
  if (!pendentes.length) return [];
  pendentes.forEach(r => jaCorrigidos.add(r.id));

  // 200 e não 250: são até 2 operações por resposta e o teto do Firestore é
  // 500 por lote. Com 250 o lote batia exatamente em 500 — funcionava, mas
  // qualquer operação a mais no futuro derrubaria o lote inteiro.
  const CHUNK = 200;
  for (let i = 0; i < pendentes.length; i += CHUNK) {
    const lote = pendentes.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    lote.forEach(r => {
      const correta = r.data.opcaoEscolhida === correctIndex;
      const pontos = pontosAoVivo(r.data.tempoRespostaMs, correta, questionDurationSec);
      batch.update(doc(db, 'liveAnswers', r.id), { graded: true, correta, pontos });
      // update(), nunca set/merge: num doc ausente set/merge viraria create e
      // a regra recusaria — update() falha isolado, sem derrubar o lote.
      if (pontos > 0) batch.update(doc(db, 'livePlayers', `${code}_${r.data.uid}`), { score: increment(pontos) });
    });
    await batch.commit();
  }
  return pendentes.map(r => r.id);
};
