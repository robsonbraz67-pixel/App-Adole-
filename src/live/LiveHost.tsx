import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  criarSala, getSala, getSalaPrivada, assinarSala, assinarJogadores,
  iniciarPergunta, revelarPergunta, avancarParaPlacar, encerrarJogo,
  buscarRespostasPergunta, corrigirRespostas, selecionarPerguntasSala,
  zerarSequenciaDeQuemFaltou, pausarJogo, retomarJogo, expulsarJogador,
  revanche, buscarRelatorio, assinarContagemRespostas, atualizarPlacarSala,
} from './liveGameApi';
import {
  BarraRespostas, Placar, LivePodium, Contagem, MS_CONTAGEM, FaixaRodada, useTelao,
  estiloOpcoes, decorridoNaPergunta, duracaoDaPergunta, Chama, SeloTipo,
} from './LiveShared';
import { agoraServidor } from './relogio';
import { tocarMusicaFundo, pararMusicaFundo, prepararAudio, audioLiberado, somContagem, somVai, somGongo, somPodio, prepararPodio, TEMAS } from './chiptune';
import type { Tema } from './chiptune';
import { Confetti, SeletorLicao } from '../components';

const DURACOES = [10, 15, 20, 30, 60];
const QTDS = [5, 8, 10, 12, 16, 20];

// Linha de opção liga/desliga do setup — o mesmo desenho para todas, para o
// professor achar o interruptor no mesmo lugar sempre.
const OpcaoPartida = ({ ligado, onToggle, titulo, descricao }: { ligado: boolean; onToggle: () => void; titulo: string; descricao: string }) => (
  <div
    onClick={onToggle}
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      padding: '12px 14px', borderRadius: 14,
      border: `1.5px solid ${ligado ? 'var(--teal)' : 'var(--b3)'}`,
      background: ligado ? 'rgba(30,158,134,.10)' : 'var(--row-bg)',
    }}
  >
    <div style={{ fontSize: 18, lineHeight: 1.2 }}>{ligado ? '✅' : '⬜'}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2, color: ligado ? 'var(--teal)' : 'var(--txt2)' }}>{titulo}</div>
      <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>{descricao}</div>
    </div>
  </div>
);

export const LiveHost = ({ licao, jogador, onBack, onActiveChange }: any) => {
  // Lição DA PARTIDA: começa na lição ativa do professor, mas ele troca de
  // semana (ou de trilha) aqui na tela de preparo sem mexer no próprio perfil.
  // Uma partida de revisão no fim do trimestre não tem por que exigir que ele
  // mude a própria trilha no Perfil só para puxar as perguntas certas.
  const [sel, setSel] = useState<{ licao: any; track: string }>({ licao, track: jogador?.track || 'teen' });
  const licaoDaPartida = sel.licao || licao;
  const [code, setCode] = useState<string | null>(null);
  const [game, setGame] = useState<any>(null);
  const [jogadores, setJogadores] = useState<any[]>([]);
  const [perguntas, setPerguntas] = useState<any[]>([]); // gabarito completo — só existe aqui, do lado do host
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [duracao, setDuracao] = useState(20);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  // Opções da partida (padrões iguais aos do Kahoot: alternativas embaralhadas
  // ligado, pergunta no celular ligada).
  const [embaralharOpcoes, setEmbaralharOpcoes] = useState(true);
  const [soNoTelao, setSoNoTelao] = useState(false);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [verRelatorio, setVerRelatorio] = useState(false);
  // Perguntas já sorteadas e editáveis ANTES de abrir a sala: é aqui que o
  // professor tira uma que não quer, marca outra como enquete ou dobra os
  // pontos da decisiva. Sem esta lista, esses recursos existiriam no motor
  // mas não teriam como ser acionados.
  const [pool, setPool] = useState<any[]>([]);
  // Enquanto o professor não mexeu em nenhuma pergunta à mão, trocar "Nº de
  // perguntas" ou "embaralhar" pode continuar resorteando sozinho — é o que
  // "só funciona" sem precisar clicar em mais nada. Mas assim que ele marca
  // uma enquete, dobra pontos ou remove uma pergunta, esses dois campos
  // PARAM de resortear por conta própria: sem esta trava, mudar de 10 para
  // 12 perguntas jogava fora toda edição feita até ali, em silêncio.
  const poolEditadoRef = useRef(false);
  useEffect(() => {
    if (code || poolEditadoRef.current) return;
    setPool(selecionarPerguntasSala(licaoDaPartida, totalQuestions, embaralharOpcoes));
  }, [licaoDaPartida, totalQuestions, embaralharOpcoes, code]);

  const ajustarPergunta = (i: number, patch: any) => {
    poolEditadoRef.current = true;
    setPool(ps => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  };
  const removerPergunta = (i: number) => {
    poolEditadoRef.current = true;
    setPool(ps => ps.filter((_, k) => k !== i));
  };
  // Tempo desta pergunta: cicla entre "padrão da sala" e as durações maiores.
  // Uma pergunta difícil merece mais tempo sem esticar a partida inteira.
  const ciclarTempo = (i: number, atual?: number) => {
    const ciclo = [undefined, 30, 45, 60, 90];
    const pos = ciclo.findIndex(v => v === atual);
    ajustarPergunta(i, { duracaoSec: ciclo[(pos + 1) % ciclo.length] });
  };

  // Duração efetiva de uma pergunta: a dela, se o professor mudou, senão a da sala.
  const duracaoEfetiva = (p: any) => Number(p?.duracaoSec) || Number(game?.questionDurationSec) || duracao;
  const [tempoRestante, setTempoRestante] = useState(0);
  const [contagem, setContagem] = useState(0);   // 5..1 antes da pergunta; 0 = valendo
  const [musicaOn, setMusicaOn] = useState(true);
  // Modo telão: só com a sala ABERTA e numa tela larga e deitada. A classe vai
  // no <html> porque o que precisa ser desfeito (#root com 480/720px de
  // largura máxima) está acima de qualquer componente — é o app inteiro que
  // deixa de ser um celular e vira uma tela de projeção.
  const telaLarga = useTelao();
  // Tema musical da partida: um conjunto de trilhas (espera, perguntas,
  // rodada final, pódio), não uma música solta — ver TEMAS em chiptune.ts.
  // Fica no localStorage porque é gosto do professor, não da sala.
  const [tema, setTema] = useState<Tema>(() => {
    const salvo = localStorage.getItem('liveTema') as Tema | null;
    return salvo && TEMAS[salvo] ? salvo : 'classico';
  });
  useEffect(() => { localStorage.setItem('liveTema', tema); }, [tema]);
  // Prévia na tela de preparo: o professor escolhe a trilha ouvindo, não
  // lendo o nome dela. Toca a música das PERGUNTAS, que é a assinatura do
  // tema — é a que vai rodar quase a partida inteira.
  const [previa, setPrevia] = useState(false);
  useEffect(() => { if (code) setPrevia(false); }, [code]);
  useEffect(() => {
    if (code) return;                    // sala aberta: quem manda é a trilha da sala
    if (previa) tocarMusicaFundo(TEMAS[tema].jogo);
    else pararMusicaFundo();
  }, [previa, tema, code]);
  // Sair da tela pelo "Voltar" não passa por nenhum dos efeitos acima — sem
  // isto a prévia continuaria tocando no resto do app.
  useEffect(() => () => pararMusicaFundo(), []);
  // Modo automático: com ele ligado o jogo anda sozinho (pergunta → gráfico →
  // placar → próxima) e o professor fica de frente para a turma. Desligado,
  // nada avança sem o botão — útil quando a turma quer comentar cada questão.
  // Fica no localStorage porque é preferência do professor, não da sala.
  const [autoOn, setAutoOn] = useState(() => localStorage.getItem('liveAutoOff') !== '1');
  useEffect(() => { localStorage.setItem('liveAutoOff', autoOn ? '0' : '1'); }, [autoOn]);

  const emCorrecaoRef = useRef<Set<string>>(new Set());
  const acoesRef = useRef<any>({});

  // ===== Uma aba só comanda =====
  // Se o professor recarrega e sobra uma aba antiga aberta, as DUAS restauram
  // a sala e as duas rodam os temporizadores de avanço — o jogo pula
  // perguntas. A aba mais nova anuncia que assumiu; as antigas ouvem, param
  // de comandar e avisam na tela. (Cobre abas do mesmo navegador, que é o
  // caso real; dois aparelhos diferentes exigiriam gravar o dono na sala.)
  const [comando, setComando] = useState(true);
  const sessaoRef = useRef({ id: Math.random().toString(36).slice(2), nasceuEm: Date.now() });
  useEffect(() => {
    if (!code || typeof BroadcastChannel === 'undefined') return;
    const eu = sessaoRef.current;
    const canal = new BroadcastChannel('sabatina-live-host');
    canal.onmessage = (ev) => {
      const outra = ev.data;
      if (!outra || outra.code !== code || outra.id === eu.id) return;
      // Desempate determinístico: cede só para quem nasceu DEPOIS. Sem essa
      // comparação, duas abas abertas quase juntas poderiam ceder uma para a
      // outra e a sala ficaria sem ninguém comandando. O id resolve o empate
      // exato de milissegundo.
      const outraEhMaisNova = outra.nasceuEm > eu.nasceuEm
        || (outra.nasceuEm === eu.nasceuEm && outra.id > eu.id);
      if (outraEhMaisNova) setComando(false);
      else canal.postMessage({ code, ...eu });   // avisa a mais velha que eu mando
    };
    canal.postMessage({ code, ...eu });
    return () => canal.close();
  }, [code]);

  // Música de fundo (chiptune original — ver chiptune.ts). A trilha das
  // perguntas ATRAVESSA pergunta, gráfico e placar sem cortar: trocar por
  // fase daria um corte de música a cada 6 segundos. Sobram três viradas na
  // partida inteira — espera → perguntas → rodada final → pódio.
  // Silêncio só durante a contagem regressiva: o gongo e os bipes precisam
  // de espaço, e o corte é por si só o aviso de que vai começar.
  const emContagem = game?.phase === 'question' && contagem > 0;
  // A última pergunta ganha a trilha de tensão do tema: é uma troca só, num
  // momento em que a virada de música é o próprio aviso de "rodada final".
  const naRodadaFinal = perguntas.length > 0
    && typeof game?.currentIndex === 'number'
    && game.currentIndex >= perguntas.length - 1;
  // Qual trilha vale AGORA. Calculada fora do efeito porque os botões de
  // ligar o som também precisam dela: ligar a música no meio das perguntas
  // tem de trazer a música das perguntas de volta, não a da espera.
  const trilhaDaVez = (() => {
    const set = TEMAS[tema];
    const fase = game?.phase;
    if (fase === 'ended') return set.podio;
    if (!fase || fase === 'lobby') return set.lobby;
    return naRodadaFinal ? set.final : set.jogo;
  })();
  useEffect(() => {
    if (!code || !musicaOn || emContagem) { pararMusicaFundo(); return; }
    tocarMusicaFundo(trilhaDaVez);
    return () => pararMusicaFundo();
  }, [code, musicaOn, trilhaDaVez, emContagem]);

  const telao = telaLarga && !!code;
  useEffect(() => {
    document.documentElement.classList.toggle('telao', telao);
    return () => document.documentElement.classList.remove('telao');
  }, [telao]);

  // Enquanto a turma entra pelo QR não há nada acontecendo na tela: é a hora
  // de montar o buffer de palmas, que é caro (ver prepararPodio).
  useEffect(() => { if (code) prepararPodio(); }, [code]);

  // Relatório da partida: uma leitura só, no fim, com todas as respostas —
  // é o que transforma "a turma se divertiu" em "78% errou a pergunta 4".
  useEffect(() => {
    if (game?.phase !== 'ended' || !code || !perguntas.length || relatorio) return;
    setCarregandoRelatorio(true);
    buscarRelatorio(code, perguntas, jogadores)
      .then(setRelatorio)
      .catch(e => console.error('relatório', e))
      .finally(() => setCarregandoRelatorio(false));
  }, [game?.phase, code, perguntas.length]);

  // Festa do pódio: aplausos e estouros de confete, uma vez só por partida.
  const festaRef = useRef(false);
  useEffect(() => {
    if (game?.phase !== 'ended') { festaRef.current = false; return; }
    if (festaRef.current || !musicaOn) return;
    festaRef.current = true;
    somPodio();
  }, [game?.phase, musicaOn]);

  // O navegador pode recusar o áudio mesmo depois do clique (política de
  // autoplay). Sem este aviso a falha é invisível: o professor acha que a
  // música simplesmente não existe. Só fica vigiando enquanto há motivo.
  const [somBloqueado, setSomBloqueado] = useState(false);
  useEffect(() => {
    if (!code || !musicaOn || game?.phase === 'ended') { setSomBloqueado(false); return; }
    const checar = () => setSomBloqueado(!audioLiberado());
    checar();
    const iv = setInterval(checar, 1000);
    return () => clearInterval(iv);
  }, [code, musicaOn, game?.phase === 'ended']);

  // Recupera a sala depois de um F5: sem liveGamesPrivate como coleção
  // própria, o gabarito só existiria em memória e se perderia no reload.
  useEffect(() => {
    const salvo = localStorage.getItem('liveHostCode');
    if (!salvo) return;
    (async () => {
      try {
        const sala = await getSala(salvo);
        // 'ended' também restaura — sem isto, um F5 bem na hora do pódio
        // (comum: professor quer ver de novo, ou o celular só travou)
        // derrubava a sala inteira: sem `code`, nem revanche nem relatório
        // ficavam alcançáveis, e a turma continuava esperando na tela deles.
        // Limitado a 2h para uma sala de dias atrás não "ressuscitar" à toa.
        const terminouFaz = sala?.endedAt?.toMillis ? Date.now() - sala.endedAt.toMillis() : Infinity;
        if (!sala || sala.hostId !== jogador.id || (sala.phase === 'ended' && terminouFaz > 2 * 60 * 60 * 1000)) {
          localStorage.removeItem('liveHostCode');
          return;
        }
        const gabarito = await getSalaPrivada(salvo);
        if (gabarito) { setPerguntas(gabarito); setCode(salvo); }
      } catch { localStorage.removeItem('liveHostCode'); }
    })();
  }, [jogador.id]);

  useEffect(() => {
    if (!code) return;
    const unsubGame = assinarSala(code, setGame);
    const unsubPlayers = assinarJogadores(code, setJogadores);
    return () => { unsubGame(); unsubPlayers(); };
  }, [code]);

  useEffect(() => {
    onActiveChange?.(!!code && game?.phase !== 'ended');
    return () => onActiveChange?.(false);
  }, [code, game?.phase]);

  // Quantos já responderam a pergunta corrente (só o host assina isto).
  const [respostasRecebidas, setRespostasRecebidas] = useState(0);
  useEffect(() => {
    if (!code || game?.phase !== 'question' || typeof game?.currentIndex !== 'number') { setRespostasRecebidas(0); return; }
    setRespostasRecebidas(0);
    const unsub = assinarContagemRespostas(code, game.currentIndex, setRespostasRecebidas);
    return () => unsub();
  }, [code, game?.phase, game?.currentIndex]);

  const criarSalaHandler = async () => {
    setErro('');
    // Ainda dentro do clique: é a única janela em que o Safari deixa o
    // AudioContext sair de "suspended". Se isto ficasse só no useEffect que
    // toca a música, ela nunca começaria naquele navegador.
    prepararAudio();
    if (pool.length < 2) { setErro('Escolha pelo menos 2 perguntas para a partida.'); return; }
    setCriando(true);
    gongoTocadoRef.current = false;             // sala nova, gongo de novo
    if (musicaOn) tocarMusicaFundo(TEMAS[tema].lobby);   // sala nova: sempre a da espera, ainda na pilha do clique
    try {
      const novoCodigo = await criarSala({
        hostId: jogador.id, hostName: jogador.nome, track: sel.track || 'teen',
        semana: licaoDaPartida.semana, trimestre: licaoDaPartida.trimestre, licaoTitulo: licaoDaPartida.titulo,
        perguntas: pool, questionDurationSec: duracao, soNoTelao,
      });
      localStorage.setItem('liveHostCode', novoCodigo);
      setPerguntas(pool);
      setCode(novoCodigo);
    } catch (e) {
      console.error(e);
      setErro('Não foi possível criar a sala. Tente de novo.');
    }
    setCriando(false);
  };

  const encerrarESair = async () => {
    try { if (code && game?.phase !== 'ended') await encerrarJogo(code); } catch {}
    localStorage.removeItem('liveHostCode');
    setCode(null); setGame(null); setJogadores([]); setPerguntas([]);
  };

  // Cancelar derruba a sala para TODO mundo que já entrou, e não dá para
  // desfazer: quem estava no lobby teria que escanear o QR de novo. Por isso
  // pergunta antes — e diz quantas pessoas seriam afetadas.
  const cancelarComConfirmacao = () => {
    const n = jogadores.length;
    const quem = n === 0 ? 'Ninguém entrou ainda.'
      : n === 1 ? '1 jogador já está na sala e será desconectado.'
      : `${n} jogadores já estão na sala e serão desconectados.`;
    if (window.confirm(`Cancelar a partida?\n\n${quem}\n\nO código ${code} deixa de valer e não dá para voltar atrás.`)) {
      encerrarESair();
    }
  };

  // ===== Ações guardadas num ref, atualizadas a cada render =====
  // O timer é armado no início da pergunta; se ele capturasse a função de
  // revelar daquele instante, ela rodaria com a lista de respostas vazia
  // depois que mais respostas chegassem. Por isso as ações vivem num ref
  // atualizado a cada render, e o setTimeout chama sempre acoesRef.current.
  // Trava de reentrada por passo. Cada transição é identificada por fase +
  // índice; se a mesma já está em andamento (clique do professor junto com o
  // temporizador, ou dois cliques seguidos), a segunda desiste. Sem isso,
  // `iniciarPergunta` podia rodar duas vezes e reescrever questionStartedAt —
  // a contagem regressiva reiniciava na cara da turma.
  const passoEmAndamentoRef = useRef<string | null>(null);
  const comPasso = async (chave: string, fn: () => Promise<void>) => {
    if (!comando || passoEmAndamentoRef.current === chave) return;
    passoEmAndamentoRef.current = chave;
    try {
      await fn();
    } catch (e) {
      // Libera a trava quando o passo falha (queda de rede, por exemplo).
      // Mantê-la travaria a partida de vez: o professor apertaria o botão e
      // nada aconteceria, para sempre. O risco de um clique duplo repetir o
      // passo é bem menor do que o de o jogo morrer no meio.
      console.error('passo do jogo', e);
      if (passoEmAndamentoRef.current === chave) passoEmAndamentoRef.current = null;
    }
  };

  const revelar = () => comPasso(`revelar_${game?.currentIndex}`, async () => {
    if (!code || !game) return;
    // A fase precisa ser conferida aqui dentro: o temporizador foi armado no
    // início da pergunta e pode disparar depois de o professor já ter
    // revelado no botão. Revelar de novo reescreveria faseIniciadaEm e
    // esticaria a revelação.
    if (game.phase !== 'question') return;
    const idx = game.currentIndex;
    const pergunta = perguntas[idx];
    if (!pergunta) return;
    const respostas = await buscarRespostasPergunta(code, idx);
    const uidsValidos = new Set<string>(jogadores.map((j: any) => j.uid));
    const dur = duracaoDaPergunta(game);
    const tipo = pergunta.tipo || 'quiz';
    const mult = typeof pergunta.multiplicador === 'number' ? pergunta.multiplicador : 1;

    const res = await corrigirRespostas(
      code, pergunta.correta, dur, respostas, uidsValidos, emCorrecaoRef.current, jogadores, tipo, mult
    );
    // NÃO zera a sequência de quem "não respondeu" aqui: uma resposta certa
    // enviada no último instante pode ainda estar propagando pela rede e não
    // ter chegado a este `buscarRespostasPergunta` — zerar cedo demais rouba
    // os 400/500 pontos de bônus de quem acertou certinho (era exatamente
    // esse o bug: a correção seguinte, ao reconstruir o streak a partir do
    // roster, lia o zero em vez da sequência real). Essa decisão fica pra
    // `irParaPlacar`, o único ponto que roda SEMPRE antes de sair da
    // revelação — dando tempo de qualquer resposta atrasada aparecer.
    const ganhos = res?.ganhos || {};
    const streaks = res?.streaks || {};
    // Placar já com os pontos desta rodada: a assinatura de `livePlayers` só
    // chega depois do lote, e a revelação precisa publicar a classificação
    // ATUAL — é dela que sai o "você está em 3º" na tela do aluno.
    const atualizados = jogadores.map((j: any) => ({
      ...j,
      score: (Number(j.score) || 0) + (ganhos[j.uid] || 0),
      streak: streaks[j.uid] !== undefined ? streaks[j.uid] : (Number(j.streak) || 0),
    }));

    const counts = pergunta.opcoes.map((_: any, i: number) => respostas.filter(r => r.data.opcaoEscolhida === i).length);
    await revelarPergunta(code, pergunta.correta, pergunta.explicacao, counts, atualizados);
  });

  // Wi-Fi de igreja atrasa respostas: sem esta segunda varredura, quem
  // acertou depois da revelação fica sem pontos e ninguém entende por quê.
  // Fora da trava de passo de propósito: é correção, não avanço de fase, e
  // pode rodar em paralelo sem risco (o emCorrecaoRef já impede pontuar duas
  // vezes a mesma resposta).
  const varrerRetardatarios = async () => {
    if (!code || !game || !comando) return;
    const idx = game.currentIndex;
    const pergunta = perguntas[idx];
    if (!pergunta) return;
    const respostas = await buscarRespostasPergunta(code, idx);
    const uidsValidos = new Set<string>(jogadores.map((j: any) => j.uid));
    // Só corrige quem já apareceu — decidir quem "não respondeu" fica para
    // irParaPlacar (ver comentário lá): esta varredura pode nem chegar a
    // rodar, se o professor avançar rápido no manual, e não pode ser o único
    // lugar que zera sequência de ninguém.
    const res = await corrigirRespostas(
      code, pergunta.correta, duracaoDaPergunta(game), respostas, uidsValidos, emCorrecaoRef.current,
      jogadores, pergunta.tipo || 'quiz', typeof pergunta.multiplicador === 'number' ? pergunta.multiplicador : 1
    );
    // Corrigiu alguém de fato? O `placar` publicado na revelação é um retrato
    // daquele instante — sem isto, quem respondeu atrasado (Wi-Fi de igreja)
    // ficaria vendo a própria posição desatualizada até a fase de placar,
    // vários segundos depois.
    if (res?.ids?.length) {
      const ganhos = res.ganhos || {};
      const streaks = res.streaks || {};
      const atualizados = jogadores.map((j: any) => ({
        ...j,
        score: (Number(j.score) || 0) + (ganhos[j.uid] || 0),
        streak: streaks[j.uid] !== undefined ? streaks[j.uid] : (Number(j.streak) || 0),
      }));
      await atualizarPlacarSala(code, atualizados);
    }
  };

  const irParaPlacar = () => comPasso(`placar_${game?.currentIndex}`, async () => {
    if (!code || !game || game.phase !== 'reveal') return;
    const idx = game.currentIndex;
    const pergunta = perguntas[idx];
    let atualizados = jogadores;

    if (pergunta) {
      // Última chance de corrigir quem ainda estava chegando E o único ponto
      // que decide quem de fato "não respondeu" — sempre roda antes de sair
      // da revelação, ao contrário da varredura de 3.5s (que o professor
      // pode pular avançando rápido no manual). Rodar corrigirRespostas de
      // novo é seguro mesmo que nada tenha mudado: emCorrecaoRef.current já
      // filtra quem foi corrigido antes.
      const respostas = await buscarRespostasPergunta(code, idx);
      const uidsValidos = new Set<string>(jogadores.map((j: any) => j.uid));
      const tipo = pergunta.tipo || 'quiz';
      const mult = typeof pergunta.multiplicador === 'number' ? pergunta.multiplicador : 1;
      const res = await corrigirRespostas(
        code, pergunta.correta, duracaoDaPergunta(game), respostas, uidsValidos, emCorrecaoRef.current,
        jogadores, tipo, mult
      );
      const responderamFinal = new Set<string>(respostas.map(r => r.data.uid));
      await zerarSequenciaDeQuemFaltou(code, jogadores, responderamFinal, tipo);

      const ganhos = res?.ganhos || {};
      const streaks = res?.streaks || {};
      atualizados = jogadores.map((j: any) => {
        const naoRespondeu = !responderamFinal.has(j.uid);
        const streak = streaks[j.uid] !== undefined
          ? streaks[j.uid]
          : (naoRespondeu && tipo !== 'enquete' ? 0 : (Number(j.streak) || 0));
        return { ...j, score: (Number(j.score) || 0) + (ganhos[j.uid] || 0), streak };
      });
    }

    // Manda a lista junto: o placar vai para dentro do doc da sala, que os
    // alunos já assinam, em vez de cada um reler `livePlayers` (ver
    // avancarParaPlacar — é a correção de cota).
    await avancarParaPlacar(code, atualizados);
  });

  const proximaOuEncerrar = () => comPasso(`proxima_${game?.currentIndex}`, async () => {
    if (!code || !game || game.phase !== 'placar') return;
    const proximoIdx = game.currentIndex + 1;
    emCorrecaoRef.current.clear();
    if (proximoIdx < perguntas.length) await iniciarPergunta(code, proximoIdx, perguntas[proximoIdx], duracaoEfetiva(perguntas[proximoIdx]));
    else await encerrarJogo(code, jogadores);
  });

  acoesRef.current = { revelar, varrerRetardatarios, irParaPlacar, proximaOuEncerrar };

  // Botão manual "Avançar": pula a espera do timer e faz o mesmo passo que
  // aconteceria sozinho — o professor não precisa esperar todo mundo ou o
  // relógio zerar pra seguir. "Encerrar" força o fim da sala a qualquer momento.
  const avancarManual = () => {
    if (!game) return;
    if (game.phase === 'question') revelar();
    else if (game.phase === 'reveal') irParaPlacar();
    else if (game.phase === 'placar') proximaOuEncerrar();
  };
  // Encerrar no meio pula as perguntas que faltam e vai direto ao pódio —
  // menos drástico que cancelar, mas ainda assim sem volta.
  const encerrarManual = () => {
    if (!code) return;
    const faltam = perguntas.length - (game?.currentIndex ?? 0) - 1;
    const aviso = faltam > 0
      ? `Ainda faltam ${faltam} pergunta${faltam > 1 ? 's' : ''}.`
      : 'Esta era a última pergunta.';
    if (window.confirm(`Encerrar a partida agora?\n\n${aviso}\nO jogo vai direto para o pódio.`)) encerrarJogo(code, jogadores);
  };

  // Pausa: congela o cronômetro para a turma discutir sem ninguém perder ponto
  // por causa da conversa. O tempo parado é devolvido ao retomar.
  // A duração da pausa é medida com UM relógio só — o local, do próprio
  // aparelho que pausou — nunca misturando com `agoraServidor()` (que é
  // Date.now() + desvio calibrado, uma estimativa independente). Cruzar os
  // dois é o que fazia pausas rápidas encurtarem a pergunta em alguns
  // milissegundos: cada lado carrega seu próprio ruído de calibração.
  // O fallback (faseIniciadaEm do servidor) só entra se este aparelho não foi
  // quem pausou — outra aba assumiu o comando, ou este recarregou no meio.
  const pausaIniciadaEmRef = useRef<number | null>(null);
  const alternarPausa = () => {
    if (!code || !game || !comando) return;
    if (game.pausado) {
      const duracaoPausa = pausaIniciadaEmRef.current !== null
        ? Date.now() - pausaIniciadaEmRef.current
        : agoraServidor() - (game.faseIniciadaEm?.toMillis?.() ?? agoraServidor());
      pausaIniciadaEmRef.current = null;
      retomarJogo(code, Number(game.msPausados) || 0, duracaoPausa).catch(console.error);
    } else {
      pausaIniciadaEmRef.current = Date.now();
      pausarJogo(code).catch(console.error);
    }
  };

  const expulsar = async (j: any) => {
    if (!code) return;
    if (!window.confirm(`Remover "${j.nome}" da sala?\n\nA pontuação dele(a) se perde e, para voltar, precisa entrar de novo com o código.`)) return;
    try { await expulsarJogador(code, j.uid); } catch { alert('Não foi possível remover agora.'); }
  };

  // Revanche: mesma turma, mesmas perguntas, todo mundo zerado — sem ninguém
  // reescanear o QR. É o "play again" do Kahoot.
  const jogarDeNovo = async () => {
    if (!code || !game) return;
    if (!window.confirm(`Jogar de novo com ${jogadores.length} jogador${jogadores.length !== 1 ? 'es' : ''}?\n\nAs mesmas perguntas voltam e a pontuação de todo mundo zera.`)) return;
    try {
      emCorrecaoRef.current.clear();
      festaRef.current = false;
      gongoTocadoRef.current = false;
      setRelatorio(null);
      setVerRelatorio(false);
      await revanche(code, jogadores, Number(game.rodada) || 0);
    } catch (e) {
      console.error(e);
      alert('Não foi possível reiniciar a partida.');
    }
  };

  // ===== Avanço automático, ancorado no relógio do servidor =====
  // Nenhuma trava de "já agendei esta fase": rearmar o setTimeout é
  // inofensivo quando o prazo vem do servidor, e uma trava manual travaria
  // o jogo pra sempre (a limpeza do useEffect mata o timer e a trava
  // impede o próximo de nascer).
  useEffect(() => {
    if (!game) return;
    if (game.phase === 'question' && game.questionStartedAt) {
      // Pausado não avança: o prazo volta a correr quando o professor retomar
      // (o efeito roda de novo porque `pausado` está nas dependências).
      if (!autoOn || game.pausado) return;
      // O prazo agora inclui a contagem regressiva: ela consome os primeiros
      // MS_CONTAGEM da fase, e só depois o cronômetro da pergunta começa.
      // `msPausados` estica o prazo pelo tempo que a partida ficou parada.
      const inicio = game.questionStartedAt.toMillis();
      const parado = Number(game.msPausados) || 0;
      const ms = inicio + parado + MS_CONTAGEM + duracaoDaPergunta(game) * 1000 + 1500 - agoraServidor();
      const t = setTimeout(() => acoesRef.current.revelar(), Math.max(0, ms));
      return () => clearTimeout(t);
    }
    if (game.phase === 'reveal' && game.faseIniciadaEm) {
      const inicio = game.faseIniciadaEm.toMillis();
      // A varredura de retardatários roda MESMO no modo manual: ela não é
      // ritmo, é correção — quem respondeu com a rede lenta precisa pontuar
      // de qualquer jeito, o professor não tem como saber que faltou alguém.
      const tSweep = setTimeout(() => acoesRef.current.varrerRetardatarios(), Math.max(0, inicio + 3500 - agoraServidor()));
      if (!autoOn) return () => clearTimeout(tSweep);
      const tNext = setTimeout(() => acoesRef.current.irParaPlacar(), Math.max(0, inicio + 6000 - agoraServidor()));
      return () => { clearTimeout(tSweep); clearTimeout(tNext); };
    }
    if (game.phase === 'placar' && game.faseIniciadaEm) {
      if (!autoOn) return;
      const inicio = game.faseIniciadaEm.toMillis();
      const t = setTimeout(() => acoesRef.current.proximaOuEncerrar(), Math.max(0, inicio + 6000 - agoraServidor()));
      return () => clearTimeout(t);
    }
  }, [game?.phase, game?.currentIndex, game?.questionStartedAt, game?.faseIniciadaEm, game?.pausado, game?.msPausados, autoOn]);

  // Cronômetro e contagem regressiva: só re-renderizam quando o segundo
  // exibido muda. Os dois saem do mesmo instante de servidor, então host e
  // celulares contam juntos.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) { setContagem(0); return; }
    const dur = duracaoDaPergunta(game);
    const tick = () => {
      // decorridoNaPergunta já desconta o tempo pausado e congela enquanto a
      // partida está parada — host e celulares chegam ao mesmo número.
      const passou = decorridoNaPergunta(game);
      const c = Math.max(0, Math.ceil((MS_CONTAGEM - passou) / 1000));
      setContagem(prev => (prev === c ? prev : c));
      const r = Math.max(0, Math.ceil((MS_CONTAGEM + dur * 1000 - passou) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec, game?.duracaoAtualSec, game?.pausado, game?.msPausados]);

  // Som da contagem, só no telão do host: 40 celulares apitando juntos
  // viraria bagunça (no Kahoot o som também é só da projeção). O ref evita
  // repetir o bipe quando o efeito roda de novo no mesmo segundo.
  const ultimaContagemRef = useRef<number | null>(null);
  const gongoTocadoRef = useRef(false);
  useEffect(() => {
    if (!musicaOn || game?.phase !== 'question') { ultimaContagemRef.current = null; return; }
    if (ultimaContagemRef.current === contagem) return;
    // Gongo só na abertura da PRIMEIRA pergunta: é o "silêncio, vai começar"
    // da sala. Repetir a cada pergunta gastaria o efeito.
    if (!gongoTocadoRef.current && game.currentIndex === 0 && contagem > 0) {
      gongoTocadoRef.current = true;
      somGongo();
    }
    ultimaContagemRef.current = contagem;
    if (contagem > 0) somContagem(contagem);
    else somVai();
  }, [contagem, game?.phase, game?.currentIndex, musicaOn]);

  // ===== Setup =====
  if (!code) {
    return (
      <div className="scr">
        <div className="hdr">
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ width: 'auto' }}>← Voltar</button>
          <div style={{ fontWeight: 900, fontSize: 17 }}>🎮 Modo Ao Vivo</div>
          <div style={{ width: 64 }} />
        </div>
        <div style={{ padding: '20px 16px 100px' }}>
          <SeletorLicao
            track={sel.track}
            licao={licaoDaPartida}
            podeTrocarTrilha
            titulo="📖 Lição da partida"
            onChange={(l, t) => {
              // Lição nova = perguntas novas. As edições à mão (enquete, pontos
              // dobrados, perguntas removidas) eram da lição ANTERIOR — manter
              // a trava faria a tela continuar mostrando as perguntas velhas.
              poolEditadoRef.current = false;
              setSel({ licao: l, track: t });
            }}
            nota="As perguntas vêm sorteadas dos dias desta lição. Trocar aqui não mexe no seu perfil nem no progresso de ninguém — a pontuação da sala vale só para a partida."
          />
          <div className="sec-title">Nº de perguntas</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {QTDS.map(n => (
              <button key={n} onClick={() => setTotalQuestions(n)} className="btn btn-ghost btn-sm" style={{ width: 'auto', flex: 1, background: totalQuestions === n ? 'rgba(247,198,0,.15)' : undefined, borderColor: totalQuestions === n ? 'var(--gold)' : undefined }}>{n}</button>
            ))}
          </div>
          <div className="sec-title">Duração por pergunta</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {DURACOES.map(s => (
              <button key={s} onClick={() => setDuracao(s)} className="btn btn-ghost btn-sm" style={{ width: 'auto', flex: '1 0 56px', background: duracao === s ? 'rgba(247,198,0,.15)' : undefined, borderColor: duracao === s ? 'var(--gold)' : undefined }}>{s}s</button>
            ))}
          </div>

          <div className="sec-title">Trilha sonora</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {(Object.keys(TEMAS) as Tema[]).map(k => (
              <button
                key={k}
                onClick={() => setTema(k)}
                className="btn btn-ghost btn-sm"
                style={{ width: 'auto', flex: '1 0 100px', background: tema === k ? 'rgba(247,198,0,.15)' : undefined, borderColor: tema === k ? 'var(--gold)' : undefined }}
              >{TEMAS[k].emoji} {TEMAS[k].nome}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>{TEMAS[tema].resumo}</div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: 'auto', flex: 'none' }}
              onClick={() => {
                // Dentro do clique, como no botão de música: é a única janela
                // em que o Safari deixa o áudio sair de "suspended".
                prepararAudio();
                const ligar = !previa;
                setPrevia(ligar);
                if (ligar) tocarMusicaFundo(TEMAS[tema].jogo);
                else pararMusicaFundo();
              }}
            >{previa ? '⏹ Parar' : '🎧 Ouvir'}</button>
          </div>

          <div className="sec-title">Opções da partida</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            <OpcaoPartida
              ligado={embaralharOpcoes}
              onToggle={() => setEmbaralharOpcoes(v => !v)}
              titulo="🔀 Embaralhar as alternativas"
              descricao="Quem já fez o quiz do dia não acerta só de decorar a posição da resposta."
            />
            <OpcaoPartida
              ligado={soNoTelao}
              onToggle={() => setSoNoTelao(v => !v)}
              titulo="📽️ Pergunta só no telão"
              descricao="No celular aparecem só os símbolos coloridos — a turma precisa olhar para a projeção."
            />
          </div>

          <div className="sec-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Perguntas sorteadas ({pool.length})</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { poolEditadoRef.current = false; setPool(selecionarPerguntasSala(licaoDaPartida, totalQuestions, embaralharOpcoes)); }}
              style={{ width: 'auto' }}
              title="Sortear outro conjunto"
            >🎲 Sortear de novo</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--mut)', margin: '6px 0 10px', lineHeight: 1.5 }}>
            ⚡ dobra os pontos da pergunta · 📊 vira enquete (sem resposta certa e sem pontos) · ✕ tira da partida.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, maxHeight: 320, overflowY: 'auto' }}>
            {pool.length === 0 && (
              <div style={{ color: 'var(--mut)', fontSize: 13, textAlign: 'center', padding: 10 }}>
                Esta lição ainda não tem perguntas válidas.
              </div>
            )}
            {pool.map((p, i) => {
              const enquete = p.tipo === 'enquete';
              const dobro = p.multiplicador === 2;
              return (
                <div key={`${p.id}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--row-bg)', borderRadius: 10, padding: '9px 10px' }}>
                  <span style={{ color: 'var(--mut)', fontSize: 12, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pergunta}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>
                      {p.tipo === 'vf' ? '✔️✖️ verdadeiro ou falso' : enquete ? '📊 enquete' : `${p.opcoes.length} alternativas`}
                      {dobro && !enquete && ' · ⚡ pontos em dobro'}
                      {p.duracaoSec ? ` · ⏱️ ${p.duracaoSec}s` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => ciclarTempo(i, p.duracaoSec)}
                    title={p.duracaoSec ? `${p.duracaoSec}s nesta pergunta` : `Tempo da sala (${duracao}s)`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: p.duracaoSec ? 1 : .35, padding: '0 2px' }}
                  >⏱️</button>
                  <button
                    onClick={() => ajustarPergunta(i, { multiplicador: dobro ? 1 : 2, tipo: p.tipo === 'enquete' ? 'quiz' : p.tipo })}
                    title={dobro ? 'Voltar aos pontos normais' : 'Pontos em dobro'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: dobro ? 1 : .35, padding: '0 2px' }}
                  >⚡</button>
                  <button
                    onClick={() => ajustarPergunta(i, enquete
                      ? { tipo: p.opcoes.length === 2 ? 'vf' : 'quiz', multiplicador: 1 }
                      : { tipo: 'enquete', multiplicador: 0 })}
                    title={enquete ? 'Voltar a valer ponto' : 'Transformar em enquete'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: enquete ? 1 : .35, padding: '0 2px' }}
                  >📊</button>
                  <button
                    onClick={() => removerPergunta(i)}
                    title="Tirar da partida"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--mut)', padding: '0 2px' }}
                  >✕</button>
                </div>
              );
            })}
          </div>

          {erro && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{erro}</div>}
          <button className="btn btn-gold" onClick={criarSalaHandler} disabled={criando}>{criando ? '⏳ Criando...' : '🎮 CRIAR SALA'}</button>
        </div>
      </div>
    );
  }

  if (!game) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>Carregando sala...</div>;

  const joinUrl = `${window.location.origin}${window.location.pathname}?joinGame=${code}`;

  const botaoMusica = (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        // Tudo dentro do clique: destravar o áudio E começar a tocar. Deixar
        // o start só para o efeito é o que fazia o Safari engolir a música.
        prepararAudio();
        const ligar = !musicaOn;
        setMusicaOn(ligar);
        if (ligar) tocarMusicaFundo(trilhaDaVez);
        else pararMusicaFundo();
      }}
      style={{ width: 'auto', borderColor: somBloqueado ? 'var(--gold)' : undefined }}
      title={somBloqueado ? 'Toque para liberar o som' : 'Música de fundo'}
    >
      {somBloqueado ? '🔈!' : musicaOn ? '🔊' : '🔇'}
    </button>
  );

  // Rótulo do que o botão vai fazer AGORA. Um "Avançar" genérico obriga o
  // professor a adivinhar o que vem — pior ainda no telão, de longe.
  const ultimaPergunta = game.currentIndex >= perguntas.length - 1;
  const proximoPasso =
    game.phase === 'question' ? '📊 Revelar respostas'
    : game.phase === 'reveal' ? '🏆 Ver placar'
    : game.phase === 'placar' ? (ultimaPergunta ? '🏁 Ver pódio' : '➡️ Próxima pergunta')
    : '';

  // Duas abas comandando a mesma sala fazem o jogo pular perguntas. A que
  // perdeu o comando avisa, em vez de simplesmente parar de responder aos
  // botões — o professor precisa saber qual janela está valendo.
  const avisoComando = !comando && (
    <div style={{ margin: '10px 16px', padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--danger)', background: 'rgba(227,28,61,.12)', color: 'var(--danger)', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
      ⚠️ Esta aba perdeu o comando — a sala está sendo controlada por outra janela. Pode fechar esta.
    </div>
  );

  const barraControles = (
    <div className="live-controls">
      <button className="btn btn-gold" onClick={avancarManual} style={{ flex: 1 }} disabled={!comando}>{proximoPasso}</button>
      {/* Pausa só faz sentido com a pergunta no ar — nas outras fases nada
          está correndo contra o relógio. */}
      {game.phase === 'question' && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={alternarPausa}
          disabled={!comando}
          style={{ width: 'auto', borderColor: game.pausado ? 'var(--gold)' : undefined, color: game.pausado ? 'var(--gold)' : 'var(--mut)' }}
          title={game.pausado ? 'Retomar a partida' : 'Pausar o cronômetro'}
        >
          {game.pausado ? '▶️' : '⏸️'}
        </button>
      )}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setAutoOn(v => !v)}
        style={{ width: 'auto', borderColor: autoOn ? 'var(--teal)' : undefined, color: autoOn ? 'var(--teal)' : 'var(--mut)' }}
        title={autoOn ? 'Automático ligado — o jogo anda sozinho' : 'Manual — só avança pelo botão'}
      >
        {autoOn ? '🔁 Auto' : '✋ Manual'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={encerrarManual} style={{ width: 'auto', borderColor: 'var(--danger)', color: 'var(--danger)' }}>⏹️</button>
    </div>
  );

  // ===== Lobby =====
  if (game.phase === 'lobby') {
    return (
      <div className="scr">
        <div className="hdr">
          <button className="btn btn-ghost btn-sm" onClick={cancelarComConfirmacao} style={{ width: 'auto' }}>✕ Cancelar</button>
          <div style={{ fontWeight: 900, fontSize: 17 }}>Lobby</div>
          {botaoMusica}
        </div>
        <div className="live-lobby">
          {avisoComando}
          {somBloqueado && (
            <div
              onClick={() => { prepararAudio(); tocarMusicaFundo(trilhaDaVez); }}
              style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--gold)', background: 'rgba(247,198,0,.1)', color: 'var(--gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              🔈 O navegador bloqueou o som — toque aqui para liberar a música
            </div>
          )}
          {/* Duas caixas: "como entrar" e "quem já entrou". No celular elas
              seguem empilhadas; no telão viram as duas colunas do 16:9. */}
          <div className="live-lobby-entrada">
            <div className="live-code">{code}</div>
            <div className="live-lobby-como">Entre em {window.location.host} e digite o código, ou escaneie:</div>
            <div className="live-qr">
              <QRCodeSVG value={joinUrl} size={telao ? 340 : 180} />
            </div>
          </div>
          <div className="live-lobby-turma">
          <div className="sec-title">{jogadores.length} jogador{jogadores.length !== 1 ? 'es' : ''} na sala</div>
          {/* Cada ficha tem um ✕: apelido impróprio no telão é o problema
              clássico de Kahoot em sala, e sem isto a única saída era
              cancelar a partida inteira. */}
          <div className="live-lobby-fichas">
            {jogadores.map(j => (
              <div key={j.uid} className="live-ficha">
                {j.avatar?.length > 10 ? <img src={j.avatar} style={{ width: 20, height: 20, borderRadius: '50%' }} alt="" /> : j.avatar} {j.nome}
                <button
                  onClick={() => expulsar(j)}
                  title={`Remover ${j.nome}`}
                  style={{ background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
                >✕</button>
              </div>
            ))}
          </div>
          <div
            onClick={() => setAutoOn(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16, padding: '8px 14px', borderRadius: 30, border: `1.5px solid ${autoOn ? 'var(--teal)' : 'var(--b3)'}`, background: autoOn ? 'rgba(30,158,134,.12)' : 'transparent', fontSize: 13, fontWeight: 700, color: autoOn ? 'var(--teal)' : 'var(--mut)', fontFamily: 'Poppins,sans-serif' }}
          >
            {autoOn ? '🔁 Automático ligado' : '✋ Manual'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 18, lineHeight: 1.5 }}>
            {autoOn
              ? 'O jogo anda sozinho: pergunta → gráfico → placar → próxima. Você fica de frente para a turma.'
              : 'Nada avança sem você tocar em "Avançar" — bom quando a turma comenta cada questão.'}
          </div>
          <button
            className="btn btn-gold"
            onClick={() => comPasso('iniciar', () => iniciarPergunta(code, 0, perguntas[0], duracaoEfetiva(perguntas[0])))}
            disabled={perguntas.length === 0 || !comando}
          >▶️ INICIAR</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Contagem regressiva (primeiros 5s da fase 'question') =====
  if (game.phase === 'question' && contagem > 0) {
    return (
      <div className="scr-full">
        <div className="hdr">
          <div style={{ width: 64 }} />
          <div style={{ fontWeight: 900, fontSize: 17 }}>{game.currentIndex + 1}/{perguntas.length}</div>
          {botaoMusica}
        </div>
        <Contagem n={contagem} pergunta={game.currentQuestion?.pergunta} />
      </div>
    );
  }

  // ===== Pergunta =====
  if (game.phase === 'question') {
    const opcoes: string[] = game.currentQuestion?.opcoes || [];
    const tipoQ = game.currentQuestion?.tipo || 'quiz';
    const multQ = game.currentQuestion?.multiplicador;
    const estilos = estiloOpcoes(tipoQ);
    const jaResponderam = respostasRecebidas;
    return (
      <div className="scr-full">
        <div className="live-q-topo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="live-q-tempo">{game.pausado ? '⏸️' : '⏱️'} {tempoRestante}s</span>
            <div className="live-q-passo">{game.currentIndex + 1}/{perguntas.length}</div>
            {botaoMusica}
          </div>
        </div>
        <div className="live-q-cabeca">
          <SeloTipo tipo={tipoQ} multiplicador={multQ} />
          <div className="live-q-enunciado">{game.currentQuestion?.pergunta}</div>
        </div>
        <div className="live-q-corpo">
          <div className={`quiz-grid${tipoQ === 'vf' ? ' vf' : ''}`}>
            {opcoes.map((op, i) => (
              <div key={i} className={`qbtn ${estilos[i]?.cls}`} style={{ cursor: 'default' }}>
                <span className="sym">{estilos[i]?.sym}</span>
                <span>{op}</span>
              </div>
            ))}
          </div>
          {/* Contador de respostas: é o que diz ao professor se já pode
              avançar ou se ainda falta gente digitando. */}
          <div className="live-q-contador">
            {game.pausado
              ? '⏸️ Partida pausada — ninguém pode responder agora.'
              : `${jaResponderam} de ${jogadores.length} já responderam`}
          </div>
        </div>
        {barraControles}
      </div>
    );
  }

  // ===== Revelação =====
  if (game.phase === 'reveal') {
    const pergunta = perguntas[game.currentIndex];
    const tipoR = game.currentQuestion?.tipo || 'quiz';
    const totalRespostas = (game.revealCounts || []).reduce((s: number, n: number) => s + n, 0);
    const acertaram = (game.revealCounts || [])[game.revealCorrectIndex] || 0;
    return (
      <div className="live-screen">
        <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>{tipoR === 'enquete' ? '📊 Resultado' : 'Revelação'}</div>{botaoMusica}</div>
        <div className="live-body live-reveal">
          <div className="live-reveal-pergunta">{game.currentQuestion?.pergunta}</div>
          <div className="live-reveal-resumo">
            {tipoR === 'enquete'
              ? `${totalRespostas} resposta${totalRespostas !== 1 ? 's' : ''} — enquete não vale ponto`
              : `✅ ${acertaram} de ${totalRespostas} acertaram`}
          </div>
          <BarraRespostas opcoes={game.currentQuestion?.opcoes || []} counts={game.revealCounts || []} correctIndex={game.revealCorrectIndex} tipo={tipoR} />
          {pergunta?.explicacao && <div className="live-reveal-explica">{pergunta.explicacao}</div>}
        </div>
        {barraControles}
      </div>
    );
  }

  // ===== Placar =====
  if (game.phase === 'placar') {
    return (
      <div className="live-screen">
        <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>🏆 Placar</div>{botaoMusica}</div>
        <div className="live-body">
          <FaixaRodada indice={game.currentIndex} total={perguntas.length} jogadores={jogadores.length} />
          <Placar jogadores={jogadores} roundKey={game.currentIndex} comSom={musicaOn} onExpulsar={expulsar} telao={telao} />
        </div>
        {barraControles}
      </div>
    );
  }

  // ===== Fim de jogo =====
  return (
    <div className="scr">
      <Confetti show={true} />
      <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>🏁 Fim de jogo</div>{botaoMusica}</div>
      <div style={{ padding: '10px 16px 100px' }}>
        <LivePodium jogadores={jogadores} telao={telao} />

        {/* Relatório: o dado de todas as respostas já existia desde a primeira
            versão e nunca era lido de volta. É o que o professor leva para o
            próximo encontro. */}
        <div style={{ marginTop: 26 }}>
          <div
            onClick={() => setVerRelatorio(v => !v)}
            className="sec-title"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 8 }}
          >
            <span>📋 Relatório da partida</span>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>{verRelatorio ? '▲ ocultar' : '▼ ver'}</span>
          </div>
          {verRelatorio && (
            carregandoRelatorio ? (
              <div style={{ color: 'var(--mut)', fontSize: 13, padding: 8 }}>Carregando...</div>
            ) : !relatorio ? (
              <div style={{ color: 'var(--mut)', fontSize: 13, padding: 8 }}>Nenhuma resposta registrada nesta partida.</div>
            ) : (
              <RelatorioPartida relatorio={relatorio} />
            )
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {jogadores.length > 0 && (
            <button className="btn btn-gold" onClick={jogarDeNovo} disabled={!comando}>🔁 Jogar de novo (mesma turma)</button>
          )}
          <button className="btn btn-ghost" onClick={encerrarESair}>🎮 Nova sala</button>
          <button className="btn btn-ghost" onClick={onBack}>← Voltar ao Admin</button>
        </div>
      </div>
    </div>
  );
};

// ===== Relatório da partida =====
// Três leituras que o professor realmente usa: quanto a turma acertou no
// geral, o que ela mais errou (para revisar), e quem ficou para trás (para
// procurar depois). Nada de gráfico bonito sem uso.
const RelatorioPartida = ({ relatorio }: { relatorio: any }) => {
  const { porPergunta, porAluno, mediaTurma, maisDificeis, precisamAjuda, feedback } = relatorio;
  return (
    <div style={{ background: 'var(--panel-bg)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--gold)' }} className="num">{mediaTurma}%</div>
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>de acerto médio</div>
        </div>
        {feedback && (
          <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--b3)' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--gold)' }} className="num">{feedback.mediaEstrelas}⭐</div>
            <div style={{ fontSize: 12, color: 'var(--mut)' }}>
              {feedback.aprenderam} de {feedback.respostas} disseram que aprenderam
            </div>
          </div>
        )}
      </div>

      {maisDificeis.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔻 O que a turma mais errou</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {maisDificeis.map((p: any) => (
              <div key={p.idx} style={{ background: 'var(--row-bg)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 4 }}>{p.idx + 1}. {p.pergunta}</div>
                <div style={{ fontSize: 12, color: 'var(--mut)' }}>
                  ✅ {p.acertos}/{p.responderam} acertaram · <b style={{ color: p.percentual < 50 ? 'var(--danger)' : 'var(--txt2)' }}>{p.percentual}%</b>
                  {' · '}resposta certa: <b style={{ color: 'var(--success)' }}>{p.opcoes[p.correta]}</b>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {precisamAjuda.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🤝 Podem precisar de reforço</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {precisamAjuda.map((a: any) => (
              <span key={a.uid} style={{ background: 'var(--row-bg)', borderRadius: 30, padding: '5px 11px', fontSize: 12, fontWeight: 700 }}>
                {a.nome} <span style={{ color: 'var(--mut)' }}>{a.percentual}%</span>
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>📊 Pergunta a pergunta</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
        {porPergunta.map((p: any) => (
          <div key={p.idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--mut)', width: 20, textAlign: 'right' }}>{p.idx + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pergunta}</div>
              <div style={{ height: 5, background: 'var(--row-bg)', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p.percentual}%`, background: p.tipo === 'enquete' ? 'var(--blu)' : p.percentual >= 50 ? 'var(--success)' : 'var(--danger)' }} />
              </div>
            </div>
            <span style={{ color: 'var(--mut)', minWidth: 34, textAlign: 'right' }}>
              {p.tipo === 'enquete' ? '—' : `${p.percentual}%`}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🧑‍🎓 Por aluno</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
        {porAluno.map((a: any, i: number) => (
          <div key={a.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px', background: 'var(--row-bg)', borderRadius: 8 }}>
            <span style={{ color: 'var(--mut)', width: 18 }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nome}</span>
            <Chama streak={a.maxStreak} tamanho={11} />
            <span style={{ color: 'var(--mut)' }}>{a.acertos}/{a.responderam}</span>
            <span style={{ color: 'var(--gold)', fontWeight: 900, minWidth: 42, textAlign: 'right' }} className="num">{a.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
