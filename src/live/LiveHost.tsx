import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  criarSala, getSala, getSalaPrivada, assinarSala, assinarJogadores,
  iniciarPergunta, revelarPergunta, avancarParaPlacar, encerrarJogo,
  buscarRespostasPergunta, corrigirRespostas, selecionarPerguntasSala,
} from './liveGameApi';
import { BarraRespostas, Placar, LivePodium, OPCOES_ESTILO, Contagem, MS_CONTAGEM } from './LiveShared';
import { agoraServidor } from './relogio';
import { tocarMusicaFundo, pararMusicaFundo, prepararAudio, audioLiberado, somContagem, somVai, somGongo, somPodio, prepararPodio } from './chiptune';
import { Confetti } from '../components';

const DURACOES = [15, 20, 30];
const QTDS = [5, 8, 10, 12];

export const LiveHost = ({ licao, jogador, onBack, onActiveChange }: any) => {
  const [code, setCode] = useState<string | null>(null);
  const [game, setGame] = useState<any>(null);
  const [jogadores, setJogadores] = useState<any[]>([]);
  const [perguntas, setPerguntas] = useState<any[]>([]); // gabarito completo — só existe aqui, do lado do host
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [duracao, setDuracao] = useState(20);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [tempoRestante, setTempoRestante] = useState(0);
  const [contagem, setContagem] = useState(0);   // 5..1 antes da pergunta; 0 = valendo
  const [musicaOn, setMusicaOn] = useState(true);
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

  // Música de fundo (chiptune original — ver chiptune.ts). A trilha de
  // suspense vale a partida inteira, do lobby às perguntas: como ela não
  // muda de fase para fase, não há corte de música a cada 6 segundos.
  // Silêncio só durante a contagem regressiva — o gongo e os bipes precisam
  // de espaço, e o corte é por si só o aviso de que vai começar.
  // No pódio a trilha vira a animada: é o único momento em que a troca de
  // música não corta nada — ela marca o fim da partida.
  const emContagem = game?.phase === 'question' && contagem > 0;
  useEffect(() => {
    if (!code || !musicaOn || emContagem) { pararMusicaFundo(); return; }
    tocarMusicaFundo(game?.phase === 'ended' ? 'jogo' : 'lobby');
    return () => pararMusicaFundo();
  }, [code, musicaOn, game?.phase, emContagem]);

  // Enquanto a turma entra pelo QR não há nada acontecendo na tela: é a hora
  // de montar o buffer de palmas, que é caro (ver prepararPodio).
  useEffect(() => { if (code) prepararPodio(); }, [code]);

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
        if (!sala || sala.hostId !== jogador.id || sala.phase === 'ended') {
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

  const criarSalaHandler = async () => {
    setErro('');
    // Ainda dentro do clique: é a única janela em que o Safari deixa o
    // AudioContext sair de "suspended". Se isto ficasse só no useEffect que
    // toca a música, ela nunca começaria naquele navegador.
    prepararAudio();
    const pool = selecionarPerguntasSala(licao, totalQuestions);
    if (pool.length < 2) { setErro('Esta lição ainda não tem perguntas suficientes.'); return; }
    setCriando(true);
    gongoTocadoRef.current = false;             // sala nova, gongo de novo
    if (musicaOn) tocarMusicaFundo('lobby');    // ainda na mesma pilha do clique
    try {
      const novoCodigo = await criarSala({
        hostId: jogador.id, hostName: jogador.nome, track: jogador.track || 'teen',
        semana: licao.semana, trimestre: licao.trimestre, licaoTitulo: licao.titulo,
        perguntas: pool, questionDurationSec: duracao,
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
    await corrigirRespostas(code, pergunta.correta, game.questionDurationSec, respostas, uidsValidos, emCorrecaoRef.current);
    const counts = pergunta.opcoes.map((_: any, i: number) => respostas.filter(r => r.data.opcaoEscolhida === i).length);
    await revelarPergunta(code, pergunta.correta, pergunta.explicacao, counts);
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
    await corrigirRespostas(code, pergunta.correta, game.questionDurationSec, respostas, uidsValidos, emCorrecaoRef.current);
  };

  const irParaPlacar = () => comPasso(`placar_${game?.currentIndex}`, async () => {
    if (!code || game?.phase !== 'reveal') return;
    // Manda a lista junto: o placar vai para dentro do doc da sala, que os
    // alunos já assinam, em vez de cada um reler `livePlayers` (ver
    // avancarParaPlacar — é a correção de cota).
    await avancarParaPlacar(code, jogadores);
  });

  const proximaOuEncerrar = () => comPasso(`proxima_${game?.currentIndex}`, async () => {
    if (!code || !game || game.phase !== 'placar') return;
    const proximoIdx = game.currentIndex + 1;
    emCorrecaoRef.current.clear();
    if (proximoIdx < perguntas.length) await iniciarPergunta(code, proximoIdx, perguntas[proximoIdx]);
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

  // ===== Avanço automático, ancorado no relógio do servidor =====
  // Nenhuma trava de "já agendei esta fase": rearmar o setTimeout é
  // inofensivo quando o prazo vem do servidor, e uma trava manual travaria
  // o jogo pra sempre (a limpeza do useEffect mata o timer e a trava
  // impede o próximo de nascer).
  useEffect(() => {
    if (!game) return;
    if (game.phase === 'question' && game.questionStartedAt) {
      if (!autoOn) return;
      // O prazo agora inclui a contagem regressiva: ela consome os primeiros
      // MS_CONTAGEM da fase, e só depois o cronômetro da pergunta começa.
      const inicio = game.questionStartedAt.toMillis();
      const ms = inicio + MS_CONTAGEM + game.questionDurationSec * 1000 + 1500 - agoraServidor();
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
  }, [game?.phase, game?.currentIndex, game?.questionStartedAt, game?.faseIniciadaEm, autoOn]);

  // Cronômetro e contagem regressiva: só re-renderizam quando o segundo
  // exibido muda. Os dois saem do mesmo instante de servidor, então host e
  // celulares contam juntos.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) { setContagem(0); return; }
    const inicio = game.questionStartedAt.toMillis();
    const tick = () => {
      const agora = agoraServidor();
      const c = Math.max(0, Math.ceil((inicio + MS_CONTAGEM - agora) / 1000));
      setContagem(prev => (prev === c ? prev : c));
      const r = Math.max(0, Math.ceil((inicio + MS_CONTAGEM + game.questionDurationSec * 1000 - agora) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec]);

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
          <div className="purple-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📖 {licao?.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--mut)' }}>As perguntas vêm sorteadas dos dias desta lição. Pontuação da sala é só daquela partida — não altera XP nem progresso.</div>
          </div>
          <div className="sec-title">Nº de perguntas</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {QTDS.map(n => (
              <button key={n} onClick={() => setTotalQuestions(n)} className="btn btn-ghost btn-sm" style={{ width: 'auto', flex: 1, background: totalQuestions === n ? 'rgba(247,198,0,.15)' : undefined, borderColor: totalQuestions === n ? 'var(--gold)' : undefined }}>{n}</button>
            ))}
          </div>
          <div className="sec-title">Duração por pergunta</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {DURACOES.map(s => (
              <button key={s} onClick={() => setDuracao(s)} className="btn btn-ghost btn-sm" style={{ width: 'auto', flex: 1, background: duracao === s ? 'rgba(247,198,0,.15)' : undefined, borderColor: duracao === s ? 'var(--gold)' : undefined }}>{s}s</button>
            ))}
          </div>
          {erro && <div style={{ color: '#E31C3D', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{erro}</div>}
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
        if (ligar) tocarMusicaFundo('lobby');
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
    <div style={{ margin: '10px 16px', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E31C3D', background: 'rgba(227,28,61,.12)', color: '#E31C3D', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
      ⚠️ Esta aba perdeu o comando — a sala está sendo controlada por outra janela. Pode fechar esta.
    </div>
  );

  const barraControles = (
    <div className="live-controls">
      <button className="btn btn-gold" onClick={avancarManual} style={{ flex: 1 }} disabled={!comando}>{proximoPasso}</button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setAutoOn(v => !v)}
        style={{ width: 'auto', borderColor: autoOn ? 'var(--teal)' : undefined, color: autoOn ? 'var(--teal)' : 'var(--mut)' }}
        title={autoOn ? 'Automático ligado — o jogo anda sozinho' : 'Manual — só avança pelo botão'}
      >
        {autoOn ? '🔁 Auto' : '✋ Manual'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={encerrarManual} style={{ width: 'auto', borderColor: '#E31C3D', color: '#E31C3D' }}>⏹️</button>
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
        <div style={{ padding: '20px 16px 100px', textAlign: 'center' }}>
          {avisoComando}
          {somBloqueado && (
            <div
              onClick={() => { prepararAudio(); tocarMusicaFundo('lobby'); }}
              style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--gold)', background: 'rgba(247,198,0,.1)', color: 'var(--gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              🔈 O navegador bloqueou o som — toque aqui para liberar a música
            </div>
          )}
          <div className="live-code">{code}</div>
          <div style={{ fontSize: 13, color: 'var(--mut)', margin: '8px 0 18px' }}>Entre em {window.location.host} e digite o código, ou escaneie:</div>
          <div style={{ background: '#fff', display: 'inline-block', padding: 12, borderRadius: 16, marginBottom: 22 }}>
            <QRCodeSVG value={joinUrl} size={180} />
          </div>
          <div className="sec-title">{jogadores.length} jogador{jogadores.length !== 1 ? 'es' : ''} na sala</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '10px 0 24px' }}>
            {jogadores.map(j => (
              <div key={j.uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--g4)', borderRadius: 30, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
                {j.avatar?.length > 10 ? <img src={j.avatar} style={{ width: 20, height: 20, borderRadius: '50%' }} alt="" /> : j.avatar} {j.nome}
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
            onClick={() => comPasso('iniciar', () => iniciarPergunta(code, 0, perguntas[0]))}
            disabled={perguntas.length === 0 || !comando}
          >▶️ INICIAR</button>
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
    return (
      <div className="scr-full">
        <div style={{ padding: '14px 20px', background: 'var(--hdr-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 900, fontSize: 22 }}>⏱️ {tempoRestante}s</span>
            <div style={{ fontWeight: 800, color: 'var(--mut)', fontSize: 15 }}>{game.currentIndex + 1}/{perguntas.length}</div>
            {botaoMusica}
          </div>
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ background: 'var(--g5)', borderRadius: 18, padding: '24px 18px', textAlign: 'center', fontWeight: 800, fontSize: 20, lineHeight: 1.4, border: '1.5px solid rgba(247,198,0,.2)', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {game.currentQuestion?.pergunta}
          </div>
        </div>
        <div style={{ padding: '18px 16px', flex: 1 }}>
          <div className="quiz-grid">
            {opcoes.map((op, i) => (
              <div key={i} className={`qbtn ${OPCOES_ESTILO[i]?.cls}`} style={{ cursor: 'default' }}>
                <span className="sym">{OPCOES_ESTILO[i]?.sym}</span>
                <span style={{ fontSize: 14, lineHeight: 1.3 }}>{op}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--mut)', marginTop: 18, fontSize: 13 }}>Aguardando respostas dos jogadores...</div>
        </div>
        {barraControles}
      </div>
    );
  }

  // ===== Revelação =====
  if (game.phase === 'reveal') {
    const pergunta = perguntas[game.currentIndex];
    const totalRespostas = (game.revealCounts || []).reduce((s: number, n: number) => s + n, 0);
    const acertaram = (game.revealCounts || [])[game.revealCorrectIndex] || 0;
    return (
      <div className="live-screen">
        <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>Revelação</div>{botaoMusica}</div>
        <div className="live-body" style={{ padding: '10px 16px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 16, textAlign: 'center', marginBottom: 10 }}>{game.currentQuestion?.pergunta}</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--mut)', marginBottom: 4 }}>
            ✅ {acertaram} de {totalRespostas} acertaram
          </div>
          <BarraRespostas opcoes={game.currentQuestion?.opcoes || []} counts={game.revealCounts || []} correctIndex={game.revealCorrectIndex} />
          {pergunta?.explicacao && <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--g3)', fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>{pergunta.explicacao}</div>}
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
          <Placar jogadores={jogadores} roundKey={game.currentIndex} comSom={musicaOn} />
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
        <LivePodium jogadores={jogadores} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          <button className="btn btn-gold" onClick={encerrarESair}>🎮 Nova sala</button>
          <button className="btn btn-ghost" onClick={onBack}>← Voltar ao Admin</button>
        </div>
      </div>
    </div>
  );
};
