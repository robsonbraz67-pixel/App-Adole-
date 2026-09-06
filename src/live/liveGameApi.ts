import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, serverTimestamp, onSnapshot, writeBatch, increment, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { gerarCodigoSala, pontosAoVivo, bonusSequencia, embaralhar } from '../utils';
import { calibrarRelogio } from './relogio';

// Tipos de pergunta suportados no Modo Ao Vivo:
// 'quiz'    — múltipla escolha (2 a 4 opções)
// 'vf'      — verdadeiro ou falso (detectado automaticamente quando as duas
//             únicas opções são exatamente isso; muda só a apresentação)
// 'enquete' — sondagem sem resposta certa: não pontua e não quebra sequência
export type TipoPergunta = 'quiz' | 'vf' | 'enquete';

const ehVerdadeiroFalso = (opcoes: string[]) => {
  if (opcoes.length !== 2) return false;
  const n = opcoes.map(o => o.trim().toLowerCase().replace(/[.!]$/, ''));
  const par = new Set(n);
  return (par.has('verdadeiro') && par.has('falso')) || (par.has('certo') && par.has('errado')) || (par.has('sim') && par.has('não'));
};

// ===== Seleção das perguntas da sala =====
// Junta as perguntas de todos os dias da lição e sorteia até `totalQuestions`.
// Mesmo filtro de "pergunta malformada" do Quiz diário (components.tsx) — o
// editor de conteúdo do Admin consegue gravar uma pergunta sem opções.
export const selecionarPerguntasSala = (licao: any, totalQuestions: number, embaralharOpcoes = true) => {
  const pool = (licao?.dias || []).flatMap((d: any) =>
    (d.perguntas || []).flatMap((q: any) => {
      // Mesmo saneamento do quiz diário: opção vazia não vale (o botão sairia
      // em branco) e a grade só desenha 4. Ver o comentário longo no Quiz,
      // em components.tsx, para o porquê de cada regra.
      const brutas = Array.isArray(q?.opcoes) ? q.opcoes : [];
      const validas = brutas.filter((o: any) => typeof o === 'string' && o.trim().length > 0);
      if (validas.length < 2) return [];
      const textoCerto = brutas[typeof q.correta === 'number' ? q.correta : 0];
      const idx = validas.indexOf(textoCerto);
      const correta = idx >= 0 ? idx : 0;
      let opcoes = validas.slice(0, 4);
      if (correta >= opcoes.length) return [];

      // Embaralhar as ALTERNATIVAS (não só a ordem das perguntas): sem isto, quem
      // já fez o quiz do dia decora a posição e acerta sem ler. Verdadeiro/falso
      // fica de fora — trocar "Verdadeiro" de lugar só confunde.
      const vf = ehVerdadeiroFalso(opcoes);
      let indiceCerto = correta;
      if (embaralharOpcoes && !vf) {
        // Embaralha os ÍNDICES e não os textos: assim a resposta certa é
        // rastreada pela posição de origem, sem depender de comparar texto
        // (que quebra quando duas opções têm o mesmo conteúdo).
        const ordem = embaralhar(opcoes.map((_: string, i: number) => i));
        opcoes = ordem.map((i: number) => opcoes[i]);
        indiceCerto = ordem.indexOf(correta);
      }

      return [{
        id: q.id,
        pergunta: q.pergunta,
        opcoes,
        correta: indiceCerto,
        explicacao: q.explicacao || '',
        tipo: (vf ? 'vf' : 'quiz') as TipoPergunta,
        multiplicador: 1,
      }];
    })
  );
  return embaralhar(pool).slice(0, Math.min(totalQuestions, 50));
};

// ===== Criar sala =====
// liveGamesPrivate nasce no MESMO writeBatch de liveGames — dentro do batch,
// isGameHost() ainda veria "a sala não existe" (armadilha do firestore.rules).
export const criarSala = async (opts: {
  hostId: string; hostName: string; track: string; semana: string; trimestre?: string; licaoTitulo?: string;
  perguntas: any[]; questionDurationSec: number; soNoTelao?: boolean;
}) => {
  const { hostId, hostName, track, semana, trimestre, licaoTitulo, perguntas, questionDurationSec, soNoTelao } = opts;

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
  if (soNoTelao) gameData.soNoTelao = true;

  const privateData = {
    perguntas: perguntas.map(p => ({
      id: p.id, pergunta: p.pergunta, opcoes: p.opcoes, correta: p.correta, explicacao: p.explicacao || '',
      tipo: p.tipo || 'quiz', multiplicador: typeof p.multiplicador === 'number' ? p.multiplicador : 1,
      // Só quando o professor mudou: sem o campo, vale a duração da sala.
      ...(p.duracaoSec ? { duracaoSec: p.duracaoSec } : {}),
    })),
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
// RECONEXÃO: se já existe doc para este uid, NÃO reescreve. Um `setDoc` aqui
// zeraria `score` — e a regra recusaria de qualquer jeito, porque só o host
// pode mexer em pontuação. Era o que quebrava quem dava F5 ou perdia o Wi-Fi
// no meio da partida: voltava e levava "não foi possível entrar".
// Devolve se a pessoa é nova ou está voltando, para a tela dizer a coisa certa.
export const entrarNaSala = async (
  code: string, uid: string, nome: string, avatar: string, isGuest: boolean
): Promise<'novo' | 'voltou'> => {
  const ref = doc(db, 'livePlayers', `${code}_${uid}`);
  const existente = await getDoc(ref);
  if (existente.exists()) return 'voltou';

  const playerData: any = { code, uid, nome, avatar, score: 0, streak: 0, maxStreak: 0, joinedAt: serverTimestamp() };
  if (isGuest) playerData.isGuest = true;
  try {
    await setDoc(ref, playerData);
  } catch {
    // Mesma janela de deploy do campo `placar` (ver comentário nas regras):
    // se elas publicadas ainda não conhecerem streak/maxStreak, hasOnly()
    // recusa o documento INTEIRO — e sem isto NINGUÉM entraria na sala
    // enquanto a regra nova não estivesse no ar. Refaz no formato antigo.
    const { streak, maxStreak, ...semStreak } = playerData;
    await setDoc(ref, semStreak);
  }
  return 'novo';
};

// ===== Assinaturas =====
export const assinarSala = (code: string, cb: (game: any) => void) =>
  onSnapshot(doc(db, 'liveGames', code), snap => {
    // 'estimate': no APARELHO DE QUEM ESCREVEU, um serverTimestamp() pendente
    // (questionStartedAt, faseIniciadaEm) chega como `null` até o servidor
    // confirmar — sem isto, decorridoNaPergunta() caía no ramo "sem pausa" por
    // um instante e o cronômetro daquele aparelho corria solto e depois
    // pulava para trás quando o valor real chegasse. 'estimate' preenche com
    // a hora local do próprio cliente enquanto o valor real não confirma.
    const dados = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
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

// Quantas respostas já chegaram nesta pergunta — SÓ o host assina. É o número
// que diz ao professor se dá para avançar ou se ainda tem gente decidindo, em
// vez de ele adivinhar olhando a turma. Custa ~1 leitura por resposta que
// chega (≈N por pergunta), não os N docs a cada mudança.
export const assinarContagemRespostas = (code: string, idx: number, cb: (n: number) => void) =>
  onSnapshot(
    query(collection(db, 'liveAnswers'), where('code', '==', code), where('idx', '==', idx)),
    snap => cb(snap.size),
    err => console.error('assinarContagemRespostas', err),
  );

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
// `duracaoSec` é a duração EFETIVA desta pergunta (a personalizada dela ou o
// padrão da sala). Sempre gravada: questionDurationSec é imutável pela regra,
// então a variação mora em `duracaoAtualSec` — e escrever sempre evita que o
// tempo maior de uma pergunta vaze para a seguinte.
export const iniciarPergunta = async (code: string, idx: number, pergunta: any, duracaoSec: number) => {
  const marcadoresDeTempo = { questionStartedAt: serverTimestamp(), faseIniciadaEm: serverTimestamp() };
  const dados: any = {
    phase: 'question',
    currentIndex: idx,
    currentQuestion: {
      pergunta: pergunta.pergunta,
      opcoes: pergunta.opcoes,
      tipo: pergunta.tipo || 'quiz',
      multiplicador: typeof pergunta.multiplicador === 'number' ? pergunta.multiplicador : 1,
    },
    ...marcadoresDeTempo,
    // Toda pergunta começa despausada e sem tempo parado acumulado — senão a
    // pausa da pergunta anterior encurtaria/esticaria esta.
    pausado: false,
    msPausados: 0,
    duracaoAtualSec: Math.max(5, Math.min(300, Math.round(duracaoSec))),
  };
  try {
    await updateDoc(doc(db, 'liveGames', code), dados);
  } catch {
    // Mesma janela de deploy do campo `placar`: se as regras publicadas ainda
    // forem a versão anterior, hasOnly() recusa o update INTEIRO — e o erro
    // era engolido em silêncio por comPasso. Sem este fallback, a fase jamais
    // avançaria e o professor ficaria preso na tela anterior sem saber por
    // quê. Refaz no formato antigo: sem tipo/multiplicador/pausa.
    await updateDoc(doc(db, 'liveGames', code), {
      phase: 'question',
      currentIndex: idx,
      currentQuestion: { pergunta: pergunta.pergunta, opcoes: pergunta.opcoes },
      ...marcadoresDeTempo,
    });
  }
};

// ===== Pausa =====
// Congela a pergunta para a turma discutir (ou porque alguém precisou sair).
// O tempo parado é ACUMULADO em msPausados e somado a todos os prazos: assim
// o cronômetro do host e o dos 40 celulares voltam no mesmo segundo, sem
// ninguém recalcular nada por conta própria.
export const pausarJogo = async (code: string) => {
  await updateDoc(doc(db, 'liveGames', code), { pausado: true, faseIniciadaEm: serverTimestamp() });
};

// `msJaPausados` é quanto já havia de tempo parado antes desta pausa, e
// `msDestaPausa` quanto durou a pausa que está terminando agora.
export const retomarJogo = async (code: string, msJaPausados: number, msDestaPausa: number) => {
  await updateDoc(doc(db, 'liveGames', code), {
    pausado: false,
    msPausados: Math.max(0, Math.round(msJaPausados + msDestaPausa)),
  });
};

// ===== Moderação =====
// Apelido impróprio no telão é o problema clássico de Kahoot em sala. A regra
// já permitia o host apagar o doc do jogador; faltava a ação. Quem é expulso
// perde a pontuação junto (o doc some) e o cliente dele detecta e avisa.
export const expulsarJogador = async (code: string, uid: string) => {
  await deleteDoc(doc(db, 'livePlayers', `${code}_${uid}`));
};

// Publica também o `placar` já atualizado: é o que permite ao aluno ver a
// própria posição e a distância para o líder JUNTO com o "você acertou" — no
// Kahoot esse "3º lugar, 120 pontos atrás" é metade da graça. Custo de leitura
// zero: o doc da sala já é assinado por todo mundo.
export const revelarPergunta = async (
  code: string, correctIndex: number, explicacao: string, revealCounts: number[], jogadores: any[] = []
) => {
  const base: any = {
    phase: 'reveal',
    revealCorrectIndex: correctIndex,
    revealExplicacao: explicacao || '',
    revealCounts,
    faseIniciadaEm: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, 'liveGames', code), { ...base, placar: resumoPlacar(jogadores) });
  } catch {
    await updateDoc(doc(db, 'liveGames', code), base);
  }
};

// Republica só o placar, sem tocar em faseIniciadaEm — usado depois da
// varredura de retardatários (doc 1.7), que roda DURANTE a revelação. Chamar
// revelarPergunta() de novo ali reiniciaria o relógio da fase e atrasaria (ou,
// se respostas seguissem chegando, travaria) o avanço automático para o
// placar. Aqui é só o número que o aluno vê mudar, sem reabrir nada.
export const atualizarPlacarSala = async (code: string, jogadores: any[]) => {
  try {
    await updateDoc(doc(db, 'liveGames', code), { placar: resumoPlacar(jogadores) });
  } catch { /* placar ainda não aceito pelas regras publicadas — degrada em silêncio */ }
};

// ===== Revanche =====
// "Jogar de novo" com a mesma turma, sem ninguém precisar reescanear o QR: a
// sala volta ao lobby, todo mundo zera e as MESMAS perguntas rodam de novo
// (liveGamesPrivate é imutável pela regra — e no Kahoot o "play again" também
// repete o mesmo kahoot). `rodada` sobe para os clientes limparem estado local.
export const revanche = async (code: string, jogadores: any[], rodadaAtual = 0) => {
  const CHUNK = 400;
  for (let i = 0; i < jogadores.length; i += CHUNK) {
    const batch = writeBatch(db);
    jogadores.slice(i, i + CHUNK).forEach((j: any) => {
      batch.update(doc(db, 'livePlayers', `${code}_${j.uid}`), { score: 0, streak: 0, maxStreak: 0 });
    });
    await batch.commit();
  }
  await updateDoc(doc(db, 'liveGames', code), {
    phase: 'lobby',
    currentIndex: -1,
    rodada: (Number(rodadaAtual) || 0) + 1,
    placar: [],
    pausado: false,
    msPausados: 0,
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
    .map(j => ({
      uid: String(j.uid),
      nome: String(j.nome || '').slice(0, 50),
      score: Number(j.score) || 0,
      // A sequência viaja junto: é o que deixa o aluno ver a própria chama sem
      // pagar leitura nova (o doc da sala ele já assina).
      streak: Number(j.streak) || 0,
    }))
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

// ===== Feedback do aluno =====
// Duas perguntas, uma tela, cinco segundos: é o que o Kahoot pergunta no fim
// e o que dá ao professor a única medida de "valeu a pena" que não vem de
// pontuação. Falha em silêncio — ninguém perde nada se não der para enviar.
export const enviarFeedback = async (code: string, uid: string, estrelas: number, aprendeu: boolean) => {
  try {
    await setDoc(doc(db, 'liveFeedback', `${code}_${uid}`), {
      code, uid,
      estrelas: Math.max(1, Math.min(5, Math.round(estrelas))),
      aprendeu: !!aprendeu,
      criadoEm: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
};

// ===== Relatório do professor =====
// Todo o dado já estava em liveAnswers desde a primeira versão — só nunca era
// lido de volta. É a diferença entre "a turma se divertiu" e "78% errou a
// pergunta sobre o sábado, precisa revisar isso no próximo encontro".
//
// Uma leitura só, no fim da partida (N respostas), e a conta é toda local.
export type RelatorioPergunta = {
  idx: number; pergunta: string; opcoes: string[]; correta: number; tipo: TipoPergunta;
  responderam: number; acertos: number; percentual: number; tempoMedioMs: number; distribuicao: number[];
};
export type RelatorioAluno = {
  uid: string; nome: string; acertos: number; responderam: number; percentual: number;
  score: number; maxStreak: number;
};

export const buscarRelatorio = async (code: string, perguntas: any[], jogadores: any[]) => {
  const [snap, snapFb] = await Promise.all([
    getDocs(query(collection(db, 'liveAnswers'), where('code', '==', code))),
    // O feedback pode nem existir (ninguém respondeu ainda) e a leitura pode
    // ser recusada se o professor não tiver permissão de gestão — nos dois
    // casos o relatório sai igual, só sem esta seção.
    getDocs(query(collection(db, 'liveFeedback'), where('code', '==', code))).catch(() => null),
  ]);
  const respostas = snap.docs.map(d => d.data() as any);
  const feedbacks = snapFb ? snapFb.docs.map(d => d.data() as any) : [];

  const porPergunta: RelatorioPergunta[] = perguntas.map((p: any, idx: number) => {
    const doIdx = respostas.filter(r => r.idx === idx);
    const acertos = doIdx.filter(r => r.correta === true).length;
    const distribuicao = (p.opcoes || []).map((_: any, i: number) => doIdx.filter(r => r.opcaoEscolhida === i).length);
    const tempos = doIdx.map(r => Number(r.tempoRespostaMs) || 0);
    return {
      idx,
      pergunta: p.pergunta,
      opcoes: p.opcoes || [],
      correta: p.correta,
      tipo: (p.tipo || 'quiz') as TipoPergunta,
      responderam: doIdx.length,
      acertos,
      percentual: doIdx.length ? Math.round((acertos / doIdx.length) * 100) : 0,
      tempoMedioMs: tempos.length ? Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length) : 0,
      distribuicao,
    };
  });

  const porAluno: RelatorioAluno[] = jogadores.map((j: any) => {
    const minhas = respostas.filter(r => r.uid === j.uid);
    const acertos = minhas.filter(r => r.correta === true).length;
    return {
      uid: j.uid,
      nome: j.nome || '',
      acertos,
      responderam: minhas.length,
      percentual: minhas.length ? Math.round((acertos / minhas.length) * 100) : 0,
      score: Number(j.score) || 0,
      maxStreak: Number(j.maxStreak) || 0,
    };
  }).sort((a, b) => b.score - a.score);

  // Só perguntas que valem acerto entram na média da turma — enquete não tem
  // certo nem errado e puxaria o número para baixo sem significar nada.
  const valem = porPergunta.filter(p => p.tipo !== 'enquete' && p.responderam > 0);
  const mediaTurma = valem.length
    ? Math.round(valem.reduce((s, p) => s + p.percentual, 0) / valem.length)
    : 0;

  const comEstrelas = feedbacks.filter(f => typeof f.estrelas === 'number');
  const feedback = comEstrelas.length ? {
    respostas: comEstrelas.length,
    mediaEstrelas: Math.round((comEstrelas.reduce((s, f) => s + f.estrelas, 0) / comEstrelas.length) * 10) / 10,
    aprenderam: feedbacks.filter(f => f.aprendeu === true).length,
  } : null;

  return {
    porPergunta,
    porAluno,
    mediaTurma,
    feedback,
    // As 3 mais erradas, para o professor saber o que revisar no próximo encontro.
    maisDificeis: [...valem].sort((a, b) => a.percentual - b.percentual).slice(0, 3),
    // Quem ficou abaixo de 50%: é a lista de quem precisa de reforço, não de ranking.
    precisamAjuda: porAluno.filter(a => a.responderam > 0 && a.percentual < 50),
  };
};

// Corrige em lote: só respostas ainda não corrigidas, de quem está de fato na
// sala (senão o `update` do score bate num doc ausente e a regra recusa o
// LOTE INTEIRO — doc 1.7 cautela #4), e que o chamador ainda não marcou como
// "em correção" em `jaCorrigidos` — esse Set é o que impede tanto o duplo-
// clique quanto a varredura de retardatários pontuarem a mesma resposta 2x
// (doc 1.7, cautelas #1 e #3). `writeBatch` fatiado em blocos de 250 (2
// operações por resposta; o limite real do Firestore é 500).
// `jogadores` entra para a sequência: o bônus depende de quantos acertos
// seguidos a pessoa JÁ tinha, e esse número mora no doc dela. `tipo` decide se
// a pergunta pontua ('enquete' não pontua e nem quebra sequência) e
// `multiplicador` aplica o "pontos em dobro".
export const corrigirRespostas = async (
  code: string, correctIndex: number, questionDurationSec: number,
  respostas: { id: string; data: any }[], uidsValidos: Set<string>, jaCorrigidos: Set<string>,
  jogadores: any[] = [], tipo: TipoPergunta = 'quiz', multiplicador = 1
) => {
  const pendentes = respostas.filter(r => !r.data.graded && uidsValidos.has(r.data.uid) && !jaCorrigidos.has(r.id));
  // Mesmo formato do caminho normal: quem chama monta o placar a partir daqui
  // e não pode receber ora um array, ora um objeto.
  if (!pendentes.length) return { ids: [], ganhos: {}, streaks: {}, maxStreaks: {} };
  pendentes.forEach(r => jaCorrigidos.add(r.id));

  const streakPorUid: Record<string, number> = {};
  const maxStreakPorUid: Record<string, number> = {};
  jogadores.forEach((j: any) => {
    streakPorUid[j.uid] = Number(j.streak) || 0;
    maxStreakPorUid[j.uid] = Number(j.maxStreak) || 0;
  });
  // Ganhos desta rodada, devolvidos ao host: a assinatura de `livePlayers` só
  // reflete os novos pontos alguns instantes depois do lote, e o host precisa
  // do placar JÁ atualizado para publicar a classificação na revelação.
  const ganhosPorUid: Record<string, number> = {};

  // 200 e não 250: são até 2 operações por resposta e o teto do Firestore é
  // 500 por lote. Com 250 o lote batia exatamente em 500 — funcionava, mas
  // qualquer operação a mais no futuro derrubaria o lote inteiro.
  const CHUNK = 200;
  for (let i = 0; i < pendentes.length; i += CHUNK) {
    const lote = pendentes.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    lote.forEach(r => {
      const uid = r.data.uid;
      // Enquete não tem resposta certa: todo mundo "participou", ninguém
      // pontua e a sequência de acertos fica congelada (não sobe nem zera).
      if (tipo === 'enquete') {
        batch.update(doc(db, 'liveAnswers', r.id), { graded: true, correta: false, pontos: 0, bonusStreak: 0, streakDepois: streakPorUid[uid] || 0 });
        return;
      }
      const correta = r.data.opcaoEscolhida === correctIndex;
      const streakAnterior = streakPorUid[uid] || 0;
      const streakDepois = correta ? streakAnterior + 1 : 0;
      const base = pontosAoVivo(r.data.tempoRespostaMs, correta, questionDurationSec, multiplicador);
      // O bônus de sequência NÃO é multiplicado: numa pergunta de pontos em
      // dobro ele já viria embutido no dobro da base, e dobrar os dois faria
      // uma única questão decidir a partida inteira.
      const bonusStreak = correta ? bonusSequencia(streakDepois) : 0;
      const pontos = base + bonusStreak;

      streakPorUid[uid] = streakDepois;
      ganhosPorUid[uid] = (ganhosPorUid[uid] || 0) + pontos;
      const novoMax = Math.max(maxStreakPorUid[uid] || 0, streakDepois);
      maxStreakPorUid[uid] = novoMax;

      batch.update(doc(db, 'liveAnswers', r.id), { graded: true, correta, pontos, bonusStreak, streakDepois });
      // update(), nunca set/merge: num doc ausente set/merge viraria create e
      // a regra recusaria — update() falha isolado, sem derrubar o lote.
      const patch: any = { streak: streakDepois, maxStreak: novoMax };
      if (pontos > 0) patch.score = increment(pontos);
      batch.update(doc(db, 'livePlayers', `${code}_${uid}`), patch);
    });
    await batch.commit();
  }
  return { ids: pendentes.map(r => r.id), ganhos: ganhosPorUid, streaks: streakPorUid, maxStreaks: maxStreakPorUid };
};

// Quem NÃO respondeu também perde a sequência — no Kahoot ficar de fora quebra
// o streak igual errar. Roda depois da correção, e só toca em quem tinha
// sequência viva (quem já estava zerado não precisa de escrita nenhuma).
export const zerarSequenciaDeQuemFaltou = async (
  code: string, jogadores: any[], uidsQueResponderam: Set<string>, tipo: TipoPergunta = 'quiz'
) => {
  if (tipo === 'enquete') return 0;
  const faltantes = jogadores.filter((j: any) => !uidsQueResponderam.has(j.uid) && (Number(j.streak) || 0) > 0);
  if (!faltantes.length) return 0;
  const CHUNK = 400;
  for (let i = 0; i < faltantes.length; i += CHUNK) {
    const batch = writeBatch(db);
    faltantes.slice(i, i + CHUNK).forEach((j: any) => {
      batch.update(doc(db, 'livePlayers', `${code}_${j.uid}`), { streak: 0 });
    });
    await batch.commit();
  }
  return faltantes.length;
};
