import React, { useEffect, useRef, useState } from 'react';
import { auth, signInWithGoogle, signInAsGuest, waitForAuthInit } from '../firebase';
import { AVTS, shareApp } from '../utils';
import {
  getSala, entrarNaSala, assinarSala, assinarJogadores,
  assinarMeuJogador, assinarMinhaResposta, responder,
} from './liveGameApi';
import { BarraRespostas, Placar, LivePodium, OPCOES_ESTILO } from './LiveShared';

// Renderiza inteiramente FORA da máquina de telas do App: um convidado sem
// conta nenhuma não pode passar pelo gate de login, e este fluxo não deve
// tocar em nada do resto do app (perfil, lições, progresso) — só lê a sala.
export const LiveJoin = ({ code, onExit, onActiveChange }: any) => {
  const [etapa, setEtapa] = useState<'entrada' | 'jogando'>('entrada');
  const [codigo, setCodigo] = useState(code || '');
  const [nome, setNome] = useState('');
  const [avatar, setAvatar] = useState(AVTS[0]);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);

  const [meuUid, setMeuUid] = useState<string | null>(null);
  const [meuNomeAvatar, setMeuNomeAvatar] = useState<{ nome: string; avatar: string; isGuest: boolean } | null>(null);
  const [game, setGame] = useState<any>(null);
  const [jogadores, setJogadores] = useState<any[]>([]);
  const [minhaResposta, setMinhaResposta] = useState<any>(null);
  const [respostaEscolhida, setRespostaEscolhida] = useState<number | null>(null);
  const [tempoRestante, setTempoRestante] = useState(0);
  const questionShownAtRef = useRef<number>(0);

  useEffect(() => { waitForAuthInit().then(u => setUsuarioAtual(u)); }, []);

  const validarEEntrar = async (uid: string, nomeFinal: string, avatarFinal: string, isGuest: boolean) => {
    setErro('');
    const cod = codigo.trim().toUpperCase();
    if (cod.length !== 6) { setErro('Digite o código de 6 letras da sala.'); return; }
    setEntrando(true);
    try {
      const sala = await getSala(cod);
      if (!sala) { setErro('Sala não encontrada. Confira o código.'); setEntrando(false); return; }
      if (sala.phase === 'ended') { setErro('Esta sala já terminou.'); setEntrando(false); return; }
      await entrarNaSala(cod, uid, nomeFinal, avatarFinal, isGuest);
      setCodigo(cod);
      setMeuUid(uid);
      setMeuNomeAvatar({ nome: nomeFinal, avatar: avatarFinal, isGuest });
      setEtapa('jogando');
    } catch (e) {
      console.error(e);
      setErro('Não foi possível entrar na sala. Verifique sua conexão.');
    }
    setEntrando(false);
  };

  // Autentica antes de ler a sala: as regras exigem isAuthenticated() até
  // pro get() de liveGames — checar o código primeiro dá "permissão negada".
  const continuarComGoogle = async () => {
    setErro('');
    setEntrando(true);
    try {
      let user = auth.currentUser;
      if (!user) { const cred = await signInWithGoogle(); user = cred.user; }
      await validarEEntrar(user.uid, user.displayName || 'Jogador', user.photoURL || '🦁', false);
    } catch (e) {
      console.error(e);
      setErro('Não foi possível entrar com Google.');
      setEntrando(false);
    }
  };

  const entrarComoConvidado = async () => {
    if (!nome.trim()) { setErro('Digite seu nome.'); return; }
    setErro('');
    setEntrando(true);
    try {
      const cred = await signInAsGuest();
      await validarEEntrar(cred.user.uid, nome.trim().slice(0, 50), avatar, true);
    } catch (e: any) {
      console.error(e);
      if (e?.code === 'auth/operation-not-allowed') setErro('Login de convidado está desativado neste app. Peça pra entrar com Google.');
      else setErro('Não foi possível entrar como convidado.');
      setEntrando(false);
    }
  };

  useEffect(() => {
    if (etapa !== 'jogando' || !codigo) return;
    const unsub = assinarSala(codigo, setGame);
    return () => unsub();
  }, [etapa, codigo]);

  useEffect(() => {
    onActiveChange?.(etapa === 'jogando' && game?.phase !== 'ended');
    return () => onActiveChange?.(false);
  }, [etapa, game?.phase]);

  // Custo de leitura: lista completa só no lobby/placar/pódio; durante
  // pergunta/revelação, só o próprio doc (doc de origem, seção 1.8).
  useEffect(() => {
    if (etapa !== 'jogando' || !codigo || !game || !meuUid) return;
    if (['lobby', 'placar', 'ended'].includes(game.phase)) {
      const unsub = assinarJogadores(codigo, setJogadores);
      return () => unsub();
    }
  }, [etapa, codigo, game?.phase, meuUid]);

  // Reseta a cada pergunta nova e guarda, num ref, o instante em que ELA
  // apareceu NESTE aparelho — o tempo de resposta usa só esse relógio local,
  // nunca misturado com o relógio do servidor (doc de origem, seção 1.6):
  // um aparelho com o relógio atrasado não pode zerar os próprios pontos.
  useEffect(() => {
    if (game?.phase === 'question') {
      setRespostaEscolhida(null);
      setMinhaResposta(null);
      questionShownAtRef.current = Date.now();
    }
  }, [game?.phase, game?.currentIndex]);

  useEffect(() => {
    if (game?.phase !== 'reveal' || !codigo || !meuUid) return;
    const unsub = assinarMinhaResposta(codigo, meuUid, game.currentIndex, setMinhaResposta);
    return () => unsub();
  }, [game?.phase, game?.currentIndex, codigo, meuUid]);

  // Cronômetro: ancorado no relógio do servidor, só re-renderiza quando o
  // segundo exibido muda.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) return;
    const inicio = game.questionStartedAt.toMillis();
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((inicio + game.questionDurationSec * 1000 - Date.now()) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    }, 200);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec]);

  const responderClick = (i: number) => {
    if (respostaEscolhida !== null || !codigo || !meuUid || !game) return;
    setRespostaEscolhida(i);
    const tempoRespostaMs = Date.now() - questionShownAtRef.current;
    responder(codigo, meuUid, game.currentIndex, i, tempoRespostaMs).catch(e => console.error(e));
  };

  // ===== Entrada =====
  if (etapa === 'entrada') {
    return (
      <div className="scr" style={{ minHeight: '100dvh' }}>
        <div style={{ padding: '40px 24px 60px' }}>
          <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 8 }}>🎮</div>
          <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 22, marginBottom: 24 }}>Entrar na sala</div>
          <input
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="CÓDIGO"
            maxLength={6}
            className="live-code"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1.5px solid var(--input-border)', borderRadius: 14, padding: '14px 0', marginBottom: 20, letterSpacing: 8, textAlign: 'center' }}
          />
          {usuarioAtual ? (
            <button className="btn btn-gold" onClick={() => validarEEntrar(usuarioAtual.uid, usuarioAtual.displayName || 'Jogador', usuarioAtual.photoURL || '🦁', false)} disabled={entrando} style={{ marginBottom: 12 }}>
              {entrando ? '⏳ Entrando...' : `▶️ Continuar como ${usuarioAtual.displayName || 'jogador'}`}
            </button>
          ) : (
            <button className="btn btn-gold" onClick={continuarComGoogle} disabled={entrando} style={{ marginBottom: 12 }}>
              {entrando ? '⏳ Entrando...' : '🔵 Entrar com Google'}
            </button>
          )}
          <div style={{ textAlign: 'center', color: 'var(--mut)', fontSize: 12, margin: '14px 0' }}>ou entre como convidado</div>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Seu nome"
            maxLength={50}
            style={{ width: '100%', background: 'var(--input-bg)', border: '1.5px solid var(--input-border)', borderRadius: 14, padding: '12px 16px', marginBottom: 12, fontSize: 15, color: 'var(--txt)' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {AVTS.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{ fontSize: 22, width: 42, height: 42, borderRadius: '50%', border: avatar === a ? '2px solid var(--gold)' : '1.5px solid var(--input-border)', background: avatar === a ? 'rgba(247,198,0,.15)' : 'transparent' }}>{a}</button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={entrarComoConvidado} disabled={entrando}>{entrando ? '⏳ Entrando...' : '👤 Entrar como convidado'}</button>
          {erro && <div style={{ color: '#E31C3D', fontSize: 13, marginTop: 14, textAlign: 'center' }}>{erro}</div>}
          <button className="btn btn-ghost btn-sm" onClick={onExit} style={{ marginTop: 24, opacity: .7 }}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (!game) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>Entrando na sala...</div>;

  // ===== Lobby =====
  if (game.phase === 'lobby') {
    return (
      <div className="scr" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>
          {(meuNomeAvatar?.avatar?.length || 0) > 10 ? <img src={meuNomeAvatar!.avatar} style={{ width: 60, height: 60, borderRadius: '50%' }} alt="" /> : meuNomeAvatar?.avatar}
        </div>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>{meuNomeAvatar?.nome}</div>
        <div style={{ color: 'var(--mut)', fontSize: 14, marginBottom: 30 }}>Você está dentro! Aguarde o professor iniciar...</div>
        <div className="sec-title">{jogadores.length} jogador{jogadores.length !== 1 ? 'es' : ''} na sala</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          {jogadores.map(j => (
            <div key={j.uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--g4)', borderRadius: 30, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
              {j.avatar?.length > 10 ? <img src={j.avatar} style={{ width: 18, height: 18, borderRadius: '50%' }} alt="" /> : j.avatar} {j.nome}
            </div>
          ))}
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
            <div style={{ fontWeight: 800, color: 'var(--mut)', fontSize: 15 }}>{game.currentIndex + 1}/{game.totalQuestions}</div>
          </div>
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ background: 'var(--g5)', borderRadius: 18, padding: '20px 18px', textAlign: 'center', fontWeight: 800, fontSize: 17, lineHeight: 1.4, border: '1.5px solid rgba(247,198,0,.2)', minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {game.currentQuestion?.pergunta}
          </div>
        </div>
        <div style={{ padding: '14px 16px', flex: 1 }}>
          <div className="quiz-grid">
            {opcoes.map((op, i) => (
              <button key={i} className={`qbtn ${OPCOES_ESTILO[i]?.cls}${respostaEscolhida === i ? ' correct' : respostaEscolhida !== null ? ' locked' : ''}`} onClick={() => responderClick(i)} disabled={respostaEscolhida !== null}>
                <span className="sym">{OPCOES_ESTILO[i]?.sym}</span>
                <span style={{ fontSize: 13, lineHeight: 1.3 }}>{op}</span>
              </button>
            ))}
          </div>
          {respostaEscolhida !== null && <div style={{ textAlign: 'center', color: 'var(--mut)', marginTop: 16, fontSize: 13 }}>Resposta enviada! Aguardando os outros...</div>}
        </div>
      </div>
    );
  }

  // ===== Revelação =====
  if (game.phase === 'reveal') {
    const acertou = minhaResposta?.correta === true;
    const pontos = minhaResposta?.pontos || 0;
    return (
      <div className="scr">
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          {minhaResposta?.graded ? (
            <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: acertou ? 'rgba(79,184,92,.15)' : 'rgba(227,28,61,.15)', border: `1.5px solid ${acertou ? '#4FB85C' : '#E31C3D'}` }}>
              <div style={{ fontSize: 34, marginBottom: 4 }}>{acertou ? '✅' : '❌'}</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: acertou ? '#4FB85C' : '#E31C3D' }}>{acertou ? `+${pontos} pontos!` : 'Não foi essa'}</div>
            </div>
          ) : (
            <div style={{ marginBottom: 18, color: 'var(--mut)', fontSize: 13 }}>Corrigindo...</div>
          )}
          <BarraRespostas opcoes={game.currentQuestion?.opcoes || []} counts={game.revealCounts || []} correctIndex={game.revealCorrectIndex} />
          {game.revealExplicacao && <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'var(--g3)', fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5, textAlign: 'left' }}>{game.revealExplicacao}</div>}
        </div>
      </div>
    );
  }

  // ===== Placar =====
  if (game.phase === 'placar') {
    return (
      <div className="scr">
        <div className="hdr"><div style={{ fontWeight: 900, fontSize: 17, margin: '0 auto' }}>🏆 Placar</div></div>
        <Placar jogadores={jogadores} roundKey={game.currentIndex} meuUid={meuUid || undefined} />
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
          {meuNomeAvatar?.isGuest && (
            <div className="purple-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Gostou? Crie sua conta e acompanhe seu progresso todo dia! 🎯</div>
              <button className="btn btn-gold" onClick={() => shareApp()}>📤 Compartilhar o app</button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={onExit}>← Sair</button>
        </div>
      </div>
    </div>
  );
};
