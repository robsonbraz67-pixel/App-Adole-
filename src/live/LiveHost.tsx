import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  criarSala, getSala, getSalaPrivada, assinarSala, assinarJogadores,
  iniciarPergunta, revelarPergunta, avancarParaPlacar, encerrarJogo,
  buscarRespostasPergunta, corrigirRespostas, selecionarPerguntasSala,
} from './liveGameApi';
import { BarraRespostas, Placar, LivePodium, OPCOES_ESTILO } from './LiveShared';
import { tocarMusicaFundo, pararMusicaFundo } from './chiptune';

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
  const [musicaOn, setMusicaOn] = useState(true);

  const emCorrecaoRef = useRef<Set<string>>(new Set());
  const acoesRef = useRef<any>({});

  // Música de fundo (chiptune original — ver chiptune.ts): toca enquanto a
  // sala está aberta, silencia ao encerrar. O toggle só troca o estado; quem
  // liga/desliga o áudio de fato é o efeito abaixo.
  useEffect(() => {
    if (!code || game?.phase === 'ended') { pararMusicaFundo(); return; }
    if (musicaOn) tocarMusicaFundo();
    return () => pararMusicaFundo();
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
    const pool = selecionarPerguntasSala(licao, totalQuestions);
    if (pool.length < 2) { setErro('Esta lição ainda não tem perguntas suficientes.'); return; }
    setCriando(true);
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

  // ===== Ações guardadas num ref, atualizadas a cada render =====
  // O timer é armado no início da pergunta; se ele capturasse a função de
  // revelar daquele instante, ela rodaria com a lista de respostas vazia
  // depois que mais respostas chegassem. Por isso as ações vivem num ref
  // atualizado a cada render, e o setTimeout chama sempre acoesRef.current.
  const revelar = async () => {
    if (!code || !game) return;
    const idx = game.currentIndex;
    const pergunta = perguntas[idx];
    if (!pergunta) return;
    const respostas = await buscarRespostasPergunta(code, idx);
    const uidsValidos = new Set<string>(jogadores.map((j: any) => j.uid));
    await corrigirRespostas(code, pergunta.correta, game.questionDurationSec, respostas, uidsValidos, emCorrecaoRef.current);
    const counts = pergunta.opcoes.map((_: any, i: number) => respostas.filter(r => r.data.opcaoEscolhida === i).length);
    await revelarPergunta(code, pergunta.correta, pergunta.explicacao, counts);
  };

  // Wi-Fi de igreja atrasa respostas: sem esta segunda varredura, quem
  // acertou depois da revelação fica sem pontos e ninguém entende por quê.
  const varrerRetardatarios = async () => {
    if (!code || !game) return;
    const idx = game.currentIndex;
    const pergunta = perguntas[idx];
    if (!pergunta) return;
    const respostas = await buscarRespostasPergunta(code, idx);
    const uidsValidos = new Set<string>(jogadores.map((j: any) => j.uid));
    await corrigirRespostas(code, pergunta.correta, game.questionDurationSec, respostas, uidsValidos, emCorrecaoRef.current);
  };

  const irParaPlacar = async () => { if (code) await avancarParaPlacar(code); };

  const proximaOuEncerrar = async () => {
    if (!code || !game) return;
    const proximoIdx = game.currentIndex + 1;
    emCorrecaoRef.current.clear();
    if (proximoIdx < perguntas.length) await iniciarPergunta(code, proximoIdx, perguntas[proximoIdx]);
    else await encerrarJogo(code);
  };

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
  const encerrarManual = () => { if (code) encerrarJogo(code); };

  // ===== Avanço automático, ancorado no relógio do servidor =====
  // Nenhuma trava de "já agendei esta fase": rearmar o setTimeout é
  // inofensivo quando o prazo vem do servidor, e uma trava manual travaria
  // o jogo pra sempre (a limpeza do useEffect mata o timer e a trava
  // impede o próximo de nascer).
  useEffect(() => {
    if (!game) return;
    if (game.phase === 'question' && game.questionStartedAt) {
      const inicio = game.questionStartedAt.toMillis();
      const ms = inicio + game.questionDurationSec * 1000 + 1500 - Date.now();
      const t = setTimeout(() => acoesRef.current.revelar(), Math.max(0, ms));
      return () => clearTimeout(t);
    }
    if (game.phase === 'reveal' && game.faseIniciadaEm) {
      const inicio = game.faseIniciadaEm.toMillis();
      const tSweep = setTimeout(() => acoesRef.current.varrerRetardatarios(), Math.max(0, inicio + 3500 - Date.now()));
      const tNext = setTimeout(() => acoesRef.current.irParaPlacar(), Math.max(0, inicio + 6000 - Date.now()));
      return () => { clearTimeout(tSweep); clearTimeout(tNext); };
    }
    if (game.phase === 'placar' && game.faseIniciadaEm) {
      const inicio = game.faseIniciadaEm.toMillis();
      const t = setTimeout(() => acoesRef.current.proximaOuEncerrar(), Math.max(0, inicio + 6000 - Date.now()));
      return () => clearTimeout(t);
    }
  }, [game?.phase, game?.currentIndex, game?.questionStartedAt, game?.faseIniciadaEm]);

  // Cronômetro exibido: só re-renderiza quando o segundo mudar.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) return;
    const inicio = game.questionStartedAt.toMillis();
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((inicio + game.questionDurationSec * 1000 - Date.now()) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    }, 200);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec]);

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
    <button className="btn btn-ghost btn-sm" onClick={() => setMusicaOn(v => !v)} style={{ width: 'auto' }} title="Música de fundo">
      {musicaOn ? '🔊' : '🔇'}
    </button>
  );

  const barraControles = (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, zIndex: 50 }}>
      <button className="btn btn-ghost btn-sm" onClick={avancarManual} style={{ width: 'auto', background: 'var(--card)' }}>⏭️ Avançar</button>
      <button className="btn btn-ghost btn-sm" onClick={encerrarManual} style={{ width: 'auto', background: 'var(--card)', borderColor: '#E31C3D', color: '#E31C3D' }}>⏹️ Encerrar</button>
    </div>
  );

  // ===== Lobby =====
  if (game.phase === 'lobby') {
    return (
      <div className="scr">
        <div className="hdr">
          <button className="btn btn-ghost btn-sm" onClick={encerrarESair} style={{ width: 'auto' }}>✕ Cancelar</button>
          <div style={{ fontWeight: 900, fontSize: 17 }}>Lobby</div>
          {botaoMusica}
        </div>
        <div style={{ padding: '20px 16px 100px', textAlign: 'center' }}>
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
          <button className="btn btn-gold" onClick={() => iniciarPergunta(code, 0, perguntas[0])} disabled={perguntas.length === 0}>▶️ INICIAR</button>
        </div>
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
    return (
      <div className="scr">
        <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>Revelação</div>{botaoMusica}</div>
        <div style={{ padding: '10px 16px 100px' }}>
          <div style={{ fontWeight: 800, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>{game.currentQuestion?.pergunta}</div>
          <BarraRespostas opcoes={game.currentQuestion?.opcoes || []} counts={game.revealCounts || []} correctIndex={game.revealCorrectIndex} />
          {pergunta?.explicacao && <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'var(--g3)', fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>{pergunta.explicacao}</div>}
        </div>
        {barraControles}
      </div>
    );
  }

  // ===== Placar =====
  if (game.phase === 'placar') {
    return (
      <div className="scr">
        <div className="hdr"><div style={{ width: 64 }} /><div style={{ fontWeight: 900, fontSize: 17 }}>🏆 Placar</div>{botaoMusica}</div>
        <Placar jogadores={jogadores} roundKey={game.currentIndex} />
        {barraControles}
      </div>
    );
  }

  // ===== Fim de jogo =====
  return (
    <div className="scr">
      <div className="hdr"><div style={{ fontWeight: 900, fontSize: 17, margin: '0 auto' }}>🏁 Fim de jogo</div></div>
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
