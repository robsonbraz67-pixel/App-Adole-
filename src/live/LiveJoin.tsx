import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, signInWithGoogle, signInAsGuest, waitForAuthInit } from '../firebase';
import { AVTS, shareApp } from '../utils';
import {
  getSala, entrarNaSala, assinarSala, assinarJogadores,
  assinarMeuJogador, assinarMinhaResposta, responder,
} from './liveGameApi';
import { BarraRespostas, Placar, LivePodium, OPCOES_ESTILO, Contagem, MS_CONTAGEM } from './LiveShared';
import { Confetti } from '../components';
import { agoraServidor } from './relogio';

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
  const [contagem, setContagem] = useState(0);
  const questionShownAtRef = useRef<{ idx: number; at: number }>({ idx: -1, at: 0 });

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

  // ===== Custo de leitura =====
  // O aluno assina a lista de `livePlayers` UMA vez, no lobby, e só. Fora
  // dali a classificação chega dentro do próprio doc da sala (campo
  // `placar`), que ele já assina de graça.
  //
  // Antes daqui, o efeito reassinava a lista a cada placar — e cada
  // reassinatura paga a leitura inicial dos N documentos de novo. Com 40
  // alunos × 12 perguntas isso passava de 20.000 leituras por partida, e o
  // plano gratuito dá 50.000 por DIA: duas partidas derrubariam ranking e
  // progresso do app inteiro.
  useEffect(() => {
    if (etapa !== 'jogando' || !codigo || !game || !meuUid) return;
    if (game.phase !== 'lobby') return;
    const unsub = assinarJogadores(codigo, setJogadores);
    return () => unsub();
  }, [etapa, codigo, game?.phase === 'lobby', meuUid]);

  // Avatares vistos no lobby, guardados para enfeitar o placar agregado —
  // que não os carrega de propósito (um avatar pode ser um data URL de 1MB
  // e 40 deles estourariam o limite do documento).
  const avataresRef = useRef<Record<string, string>>({});
  useEffect(() => {
    jogadores.forEach((j: any) => { if (j?.uid && j.avatar) avataresRef.current[j.uid] = j.avatar; });
  }, [jogadores]);

  // Classificação exibida: vem do doc da sala quando existe; se as regras
  // publicadas ainda não conhecerem o campo `placar` (elas são compartilhadas
  // com o LUM07), cai de volta na lista assinada — mais cara, mas funciona.
  const classificacao = useMemo(() => {
    if (Array.isArray(game?.placar) && game.placar.length) {
      return game.placar.map((p: any) => ({ ...p, avatar: avataresRef.current[p.uid] || '⭐' }));
    }
    return jogadores;
  }, [game?.placar, jogadores]);

  useEffect(() => {
    if (game?.phase === 'question') {
      setRespostaEscolhida(null);
      setMinhaResposta(null);
    }
  }, [game?.phase, game?.currentIndex]);

  useEffect(() => {
    if (game?.phase !== 'reveal' || !codigo || !meuUid) return;
    const unsub = assinarMinhaResposta(codigo, meuUid, game.currentIndex, setMinhaResposta);
    return () => unsub();
  }, [game?.phase, game?.currentIndex, codigo, meuUid]);

  // Cronômetro + contagem regressiva, ancorados no relógio do servidor. Só
  // re-renderiza quando o segundo exibido muda.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) { setContagem(0); return; }
    const inicio = game.questionStartedAt.toMillis();
    const tick = () => {
      const agora = agoraServidor();
      const c = Math.max(0, Math.ceil((inicio + MS_CONTAGEM - agora) / 1000));
      setContagem(prev => (prev === c ? prev : c));
      // O cronômetro de PONTUAÇÃO começa no instante em que a pergunta
      // aparece NESTE aparelho — um relógio só, nunca misturado com o do
      // servidor (doc de origem, 1.6): um celular atrasado não pode zerar os
      // próprios pontos. Marcado no fim da contagem, e não quando a fase
      // muda (que é quando a contagem COMEÇA). Guardar o índice junto cobre
      // quem entrou com a pergunta já rolando: aí vale o primeiro instante
      // em que este aparelho viu a pergunta, que é o que se quer medir.
      if (c === 0 && questionShownAtRef.current.idx !== game.currentIndex) {
        questionShownAtRef.current = { idx: game.currentIndex, at: Date.now() };
      }
      const r = Math.max(0, Math.ceil((inicio + MS_CONTAGEM + game.questionDurationSec * 1000 - agora) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec]);

  // 'enviando' → 'ok' → nada mais; 'tarde'/'falhou' avisam o aluno.
  // Antes daqui a escrita era disparada e esquecida, e a tela já dizia
  // "Resposta enviada!" sem nenhuma confirmação. Como a regra do Firestore
  // recusa a escrita depois que a fase vira, quem respondia no limite ficava
  // sem ponto achando que tinha respondido.
  const [envio, setEnvio] = useState<'nada' | 'enviando' | 'ok' | 'tarde' | 'falhou'>('nada');
  useEffect(() => { setEnvio('nada'); }, [game?.currentIndex, game?.phase === 'question']);

  const responderClick = async (i: number) => {
    if (respostaEscolhida !== null || !codigo || !meuUid || !game) return;
    setRespostaEscolhida(i);
    setEnvio('enviando');
    const tempoRespostaMs = Date.now() - questionShownAtRef.current.at;
    const r = await responder(codigo, meuUid, game.currentIndex, i, tempoRespostaMs);
    setEnvio(r === 'ok' ? 'ok' : r);
    // Só devolve o botão quando dá para tentar de novo: se a pergunta já
    // fechou ('tarde'), reabrir seria enganar o aluno duas vezes.
    if (r === 'falhou') setRespostaEscolhida(null);
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

  // ===== Contagem regressiva (primeiros segundos da fase 'question') =====
  // O celular não emite som: com 40 aparelhos juntos viraria bagunça — quem
  // apita é só o telão do professor.
  if (game.phase === 'question' && contagem > 0) {
    return (
      <div className="scr-full">
        <Contagem n={contagem} />
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
          {envio === 'enviando' && <div style={{ textAlign: 'center', color: 'var(--mut)', marginTop: 16, fontSize: 13 }}>⏳ Enviando...</div>}
          {envio === 'ok' && <div style={{ textAlign: 'center', color: 'var(--teal)', marginTop: 16, fontSize: 13, fontWeight: 700 }}>✅ Resposta registrada! Aguardando os outros...</div>}
          {envio === 'tarde' && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(227,28,61,.15)', border: '1.5px solid #E31C3D', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#E31C3D', marginBottom: 4 }}>⏱️ Tempo esgotado</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>Sua resposta chegou depois que a pergunta fechou e não pôde ser contada.</div>
            </div>
          )}
          {envio === 'falhou' && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(247,198,0,.15)', border: '1.5px solid var(--gold)', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--gold)', marginBottom: 4 }}>📶 Não deu para enviar</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>Sua conexão falhou. Toque de novo na sua resposta enquanto der tempo.</div>
            </div>
          )}
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
        <Placar jogadores={classificacao} roundKey={game.currentIndex} meuUid={meuUid || undefined} />
      </div>
    );
  }

  // ===== Fim de jogo =====
  // Confete sim, som não: quem apita é só o telão (ver comentário da
  // contagem regressiva acima).
  return (
    <div className="scr">
      <Confetti show={true} />
      <div className="hdr"><div style={{ fontWeight: 900, fontSize: 17, margin: '0 auto' }}>🏁 Fim de jogo</div></div>
      <div style={{ padding: '10px 16px 100px' }}>
        <LivePodium jogadores={classificacao} />
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
