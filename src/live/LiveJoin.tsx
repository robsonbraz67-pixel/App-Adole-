import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, signInWithGoogle, signInAsGuest, waitForAuthInit } from '../firebase';
import { AVTS, shareApp, nomeSugerido } from '../utils';
import {
  getSala, entrarNaSala, assinarSala, assinarJogadores,
  assinarMeuJogador, assinarMinhaResposta, responder, enviarFeedback,
} from './liveGameApi';
import {
  BarraRespostas, Placar, LivePodium, Contagem, MS_CONTAGEM, FaixaRodada,
  estiloOpcoes, decorridoNaPergunta, duracaoDaPergunta, Chama, SeloTipo,
} from './LiveShared';
import { Confetti } from '../components';

// Reconexão: Wi-Fi de igreja cai, adolescente troca de app, celular bloqueia.
// Sem isto, voltar significava digitar o código e logar de novo no meio da
// partida — e como o doc do jogador já existia, a regra recusava a reentrada.
const CHAVE_SESSAO = 'liveJoinSessao';
const salvarSessao = (dados: { code: string; uid: string; nome: string; avatar: string; isGuest: boolean }) => {
  try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ ...dados, ts: Date.now() })); } catch {}
};
const lerSessao = () => {
  try {
    const raw = localStorage.getItem(CHAVE_SESSAO);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 6h: mesma validade do deep link. Depois disso é outra aula.
    if (!s?.code || !s?.uid || Date.now() - (s.ts || 0) > 6 * 60 * 60 * 1000) return null;
    return s;
  } catch { return null; }
};
const limparSessao = () => { try { localStorage.removeItem(CHAVE_SESSAO); } catch {} };

// Pesquisa de fim de partida: duas perguntas, uma tela. É a única devolutiva
// que o professor recebe que não vem de pontuação. Some depois de enviada
// para não ficar pedindo de novo a cada render.
const PesquisaFinal = ({ codigo, meuUid }: { codigo: string; meuUid: string }) => {
  const [estrelas, setEstrelas] = useState(0);
  const [enviado, setEnviado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const responder = async (aprendeu: boolean) => {
    if (!estrelas) return;
    setEnviando(true);
    setFalhou(false);
    const ok = await enviarFeedback(codigo, meuUid, estrelas, aprendeu);
    setEnviando(false);
    // Sem fingir que deu certo: a regra recusa uma segunda resposta e a rede
    // pode cair. Dizer "obrigado" nos dois casos seria mentira barata.
    if (ok) setEnviado(true);
    else setFalhou(true);
  };

  if (enviado) {
    return (
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--mut)', padding: '10px 0' }}>
        ✅ Obrigado pela resposta!
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--row-bg)', borderRadius: 14, padding: 16, textAlign: 'center' }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Como foi essa partida?</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => setEstrelas(n)}
            aria-label={`${n} de 5`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, padding: 0, opacity: n <= estrelas ? 1 : .3, transition: 'opacity .15s' }}
          >⭐</button>
        ))}
      </div>
      {estrelas > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 10 }}>Você aprendeu algo hoje?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={enviando} onClick={() => responder(false)}>Nem tanto</button>
            <button className="btn btn-gold btn-sm" style={{ flex: 1 }} disabled={enviando} onClick={() => responder(true)}>Sim! 🎯</button>
          </div>
          {falhou && (
            <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 8 }}>
              Não deu para enviar agora — pode ser que você já tenha respondido.
            </div>
          )}
        </>
      )}
    </div>
  );
};

// "3º lugar · 120 pontos atrás do 2º" — no Kahoot é isto que segura a atenção
// entre uma pergunta e outra, muito mais do que o número absoluto de pontos.
const MinhaPosicao = ({ classificacao, meuUid }: { classificacao: any[]; meuUid: string | null }) => {
  if (!meuUid || !classificacao?.length) return null;
  const pos = classificacao.findIndex((j: any) => j.uid === meuUid);
  if (pos < 0) return null;
  const eu = classificacao[pos];
  const acima = pos > 0 ? classificacao[pos - 1] : null;
  const faltam = acima ? (Number(acima.score) || 0) - (Number(eu.score) || 0) : 0;
  return (
    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 14, background: 'var(--row-bg)', border: '1px solid var(--b3)' }}>
      <div style={{ fontWeight: 900, fontSize: 15 }}>
        <span className="num" style={{ color: 'var(--gold)' }}>{pos + 1}º</span> lugar
        <span style={{ color: 'var(--mut)', fontWeight: 700, fontSize: 13 }}> · {Number(eu.score) || 0} pts</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>
        {pos === 0
          ? '👑 Você está na frente!'
          : faltam === 0
            ? `Empatado com ${acima.nome}`
            : `${faltam} ponto${faltam !== 1 ? 's' : ''} atrás de ${acima.nome}`}
      </div>
    </div>
  );
};

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
  const [meuJogador, setMeuJogador] = useState<any>(null);
  const [expulso, setExpulso] = useState(false);
  const [restaurando, setRestaurando] = useState(true);
  const questionShownAtRef = useRef<{ idx: number; at: number }>({ idx: -1, at: 0 });

  // Reconexão automática: se a sessão guardada ainda vale E o Firebase Auth
  // restaurou o MESMO usuário (inclusive anônimo — ele persiste), volta direto
  // para o jogo, sem tela de entrada. É a diferença entre "perdi a partida" e
  // "voltei no lugar onde estava".
  useEffect(() => {
    let vivo = true;
    waitForAuthInit().then(u => {
      if (!vivo) return;
      setUsuarioAtual(u);
      const s = lerSessao();
      if (u && s && s.uid === u.uid && (!code || s.code === code)) {
        setCodigo(s.code);
        setMeuUid(s.uid);
        setMeuNomeAvatar({ nome: s.nome, avatar: s.avatar, isGuest: !!s.isGuest });
        setEtapa('jogando');
      }
      setRestaurando(false);
    }).catch(() => { if (vivo) setRestaurando(false); });
    return () => { vivo = false; };
  }, []);

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
      salvarSessao({ code: cod, uid, nome: nomeFinal, avatar: avatarFinal, isGuest });
      setCodigo(cod);
      setMeuUid(uid);
      setMeuNomeAvatar({ nome: nomeFinal, avatar: avatarFinal, isGuest });
      setExpulso(false);
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
    const unsub = assinarSala(codigo, sala => {
      // Sessão restaurada apontando para uma sala que não existe mais (o
      // professor abriu outra, ou faz dias). Sem isto, a pessoa ficava presa
      // para sempre num "Entrando na sala...".
      if (!sala) {
        limparSessao();
        setEtapa('entrada');
        setMeuUid(null);
        setErro('Aquela sala não está mais no ar. Digite o código da nova.');
        return;
      }
      setGame(sala);
    });
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

  // O próprio documento — 1 leitura por mudança de pontuação, nunca a lista
  // inteira. Traz a sequência de acertos ao vivo e, se sumir, quer dizer que o
  // professor removeu esta pessoa da sala.
  //
  // `jaVi` existe porque o PRIMEIRO snapshot pode chegar do cache, vazio,
  // antes de o documento ser lido do servidor. Sem essa trava, quem acabou de
  // entrar levaria um "você saiu da sala" na cara. Só conta como expulsão o
  // documento sumir DEPOIS de ter existido.
  const jaViMeuDocRef = useRef(false);
  useEffect(() => {
    if (etapa !== 'jogando' || !codigo || !meuUid) return;
    jaViMeuDocRef.current = false;
    const unsub = assinarMeuJogador(codigo, meuUid, j => {
      setMeuJogador(j);
      if (j) { jaViMeuDocRef.current = true; return; }
      if (jaViMeuDocRef.current) { setExpulso(true); limparSessao(); }
    });
    return () => unsub();
  }, [etapa, codigo, meuUid]);

  useEffect(() => {
    if (game?.phase === 'question') {
      setRespostaEscolhida(null);
      setMinhaResposta(null);
    }
  }, [game?.phase, game?.currentIndex]);

  // Revanche: a sala volta ao lobby com `rodada` maior. Sem limpar o estado
  // local, a tela continuaria mostrando a resposta da partida anterior.
  useEffect(() => {
    setRespostaEscolhida(null);
    setMinhaResposta(null);
    questionShownAtRef.current = { idx: -1, at: 0 };
  }, [game?.rodada]);

  // Também assina durante 'question' (não só na revelação): é o que permite
  // detectar, depois de um F5 no meio da pergunta, que a resposta já tinha
  // sido enviada. Sem isto, o aluno recarregava, via os botões livres de
  // novo, respondia outra vez e levava um "tempo esgotado" falso — a regra
  // recusa reescrever uma resposta que já existe, e responder() interpreta
  // essa recusa como prazo esgotado.
  // Distingue "ainda não sei se respondeu" de "confirmei que não respondeu":
  // sem isto, logo após um F5 (antes do 1º snapshot chegar) minhaResposta e
  // respostaEscolhida estão os dois em null, e a tela de revelação mostrava
  // "Você não respondeu" para quem tinha respondido — só ainda não tinha
  // chegado a confirmação.
  const [respostaConferida, setRespostaConferida] = useState(false);
  useEffect(() => {
    if ((game?.phase !== 'question' && game?.phase !== 'reveal') || !codigo || !meuUid) return;
    setRespostaConferida(false);
    const unsub = assinarMinhaResposta(codigo, meuUid, game.currentIndex, r => {
      setMinhaResposta(r);
      setRespostaConferida(true);
    });
    return () => unsub();
  }, [game?.phase, game?.currentIndex, codigo, meuUid]);

  // Restaura o estado local a partir do que já está gravado no Firestore.
  // Roda sempre que o doc da resposta chega — inclusive vazio (não faz nada
  // nesse caso) — e só preenche o que ainda está "zerado", para nunca
  // sobrescrever uma resposta que a pessoa acabou de escolher nesta sessão.
  useEffect(() => {
    if (!minhaResposta) return;
    setRespostaEscolhida(prev => (prev === null ? minhaResposta.opcaoEscolhida : prev));
    setEnvio(prev => (prev === 'nada' ? 'ok' : prev));
  }, [minhaResposta]);

  // Cronômetro + contagem regressiva, ancorados no relógio do servidor. Só
  // re-renderiza quando o segundo exibido muda.
  useEffect(() => {
    if (game?.phase !== 'question' || !game.questionStartedAt) { setContagem(0); return; }
    const dur = duracaoDaPergunta(game);
    const tick = () => {
      // Mesmo cálculo do host (decorridoNaPergunta desconta o tempo pausado e
      // congela durante a pausa), então os dois relógios batem no segundo.
      const passou = decorridoNaPergunta(game);
      const c = Math.max(0, Math.ceil((MS_CONTAGEM - passou) / 1000));
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
      const r = Math.max(0, Math.ceil((MS_CONTAGEM + dur * 1000 - passou) / 1000));
      setTempoRestante(prev => (prev === r ? prev : r));
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [game?.phase, game?.questionStartedAt, game?.questionDurationSec, game?.duracaoAtualSec, game?.pausado, game?.msPausados]);

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

  // Removido da sala pelo professor: o doc do jogador some e a assinatura
  // devolve null. Sem esta tela, o app ficaria só travado sem explicação.
  if (expulso) {
    return (
      <div className="scr" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>👋</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Você saiu da sala</div>
          <div style={{ fontSize: 14, color: 'var(--mut)', lineHeight: 1.6, marginBottom: 22 }}>
            O professor removeu seu acesso a esta partida. Se foi engano, peça o código e entre de novo.
          </div>
          <button className="btn btn-gold" onClick={() => { setExpulso(false); setEtapa('entrada'); setMeuUid(null); }}>Entrar de novo</button>
          <button className="btn btn-ghost btn-sm" onClick={onExit} style={{ marginTop: 12, opacity: .7 }}>Sair</button>
        </div>
      </div>
    );
  }

  // Enquanto o Firebase Auth ainda não disse se há sessão salva, mostrar a
  // tela de entrada faria a pessoa começar a digitar o código à toa — em um
  // piscar ela seria jogada direto de volta para o jogo.
  if (restaurando) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--mut)' }}>Carregando...</div>;
  }

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
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome"
              maxLength={50}
              style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1.5px solid var(--input-border)', borderRadius: 14, padding: '12px 16px', fontSize: 15, color: 'var(--txt)' }}
            />
            {/* Sortear apelido: a turma inteira entra em segundos e ninguém
                precisa inventar nome — que é de onde saem os apelidos que o
                professor depois tem que remover do telão. */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setNome(nomeSugerido())}
              title="Sortear um apelido"
              style={{ width: 'auto', flexShrink: 0 }}
            >🎲</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {AVTS.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{ fontSize: 22, width: 42, height: 42, borderRadius: '50%', border: avatar === a ? '2px solid var(--gold)' : '1.5px solid var(--input-border)', background: avatar === a ? 'rgba(247,198,0,.15)' : 'transparent' }}>{a}</button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={entrarComoConvidado} disabled={entrando}>{entrando ? '⏳ Entrando...' : '👤 Entrar como convidado'}</button>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14, textAlign: 'center' }}>{erro}</div>}
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
    const tipoQ = game.currentQuestion?.tipo || 'quiz';
    const estilos = estiloOpcoes(tipoQ);
    // "Só no telão": o celular vira um controle com os símbolos coloridos e
    // nada mais — é o que obriga a turma a olhar para a projeção em vez de
    // ler tudo cabisbaixa. Verdadeiro/falso mantém o rótulo mesmo assim,
    // senão ninguém sabe qual símbolo é "verdadeiro".
    const ocultarTexto = !!game.soNoTelao && tipoQ !== 'vf';
    return (
      <div className="scr-full">
        <div style={{ padding: '14px 20px', background: 'var(--hdr-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 900, fontSize: 22 }}>{game.pausado ? '⏸️' : '⏱️'} {tempoRestante}s</span>
            <Chama streak={meuJogador?.streak} tamanho={15} />
            <div style={{ fontWeight: 800, color: 'var(--mut)', fontSize: 15 }}>{game.currentIndex + 1}/{game.totalQuestions}</div>
          </div>
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <SeloTipo tipo={tipoQ} multiplicador={game.currentQuestion?.multiplicador} />
          {ocultarTexto ? (
            <div style={{ background: 'var(--g3)', borderRadius: 18, padding: '18px', textAlign: 'center', fontSize: 14, color: 'var(--mut)', lineHeight: 1.5, border: '1.5px dashed var(--b4)' }}>
              👀 Olhe para o telão — a pergunta está lá.<br />Aqui você só escolhe o símbolo.
            </div>
          ) : (
            <div style={{ background: 'var(--g5)', borderRadius: 18, padding: '20px 18px', textAlign: 'center', fontWeight: 800, fontSize: 17, lineHeight: 1.4, border: '1.5px solid rgba(247,198,0,.2)', minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {game.currentQuestion?.pergunta}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 16px', flex: 1 }}>
          <div className={`quiz-grid${tipoQ === 'vf' ? ' vf' : ''}`}>
            {opcoes.map((op, i) => (
              <button
                key={i}
                className={`qbtn ${estilos[i]?.cls}${respostaEscolhida === i ? ' correct' : respostaEscolhida !== null ? ' locked' : ''}`}
                onClick={() => responderClick(i)}
                disabled={respostaEscolhida !== null || !!game.pausado}
              >
                <span className="sym">{estilos[i]?.sym}</span>
                {!ocultarTexto && <span style={{ fontSize: 13, lineHeight: 1.3 }}>{op}</span>}
              </button>
            ))}
          </div>
          {game.pausado && (
            <div style={{ textAlign: 'center', color: 'var(--gold)', marginTop: 16, fontSize: 13, fontWeight: 700 }}>
              ⏸️ O professor pausou — ninguém perde tempo agora.
            </div>
          )}
          {/* No modo Manual o professor pode demorar para revelar — o tempo
              zerar não fecha a pergunta (só o clique dele fecha), então o
              botão continua ativo. Sem este aviso, "0s" com o botão vivo
              parecia um bug em vez do comportamento esperado do modo Manual. */}
          {!game.pausado && tempoRestante === 0 && respostaEscolhida === null && (
            <div style={{ textAlign: 'center', color: 'var(--mut)', marginTop: 16, fontSize: 13 }}>
              ⏳ Tempo esgotado — sua resposta ainda conta até o professor revelar.
            </div>
          )}
          {envio === 'enviando' && <div style={{ textAlign: 'center', color: 'var(--mut)', marginTop: 16, fontSize: 13 }}>⏳ Enviando...</div>}
          {envio === 'ok' && <div style={{ textAlign: 'center', color: 'var(--teal)', marginTop: 16, fontSize: 13, fontWeight: 700 }}>✅ Resposta registrada! Aguardando os outros...</div>}
          {envio === 'tarde' && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(227,28,61,.15)', border: '1.5px solid var(--danger)', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--danger)', marginBottom: 4 }}>⏱️ Tempo esgotado</div>
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
    const bonus = minhaResposta?.bonusStreak || 0;
    const streakAgora = minhaResposta?.streakDepois ?? meuJogador?.streak;
    const tipoR = game.currentQuestion?.tipo || 'quiz';
    const enquete = tipoR === 'enquete';
    return (
      <div className="scr">
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          {enquete ? (
            <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: 'var(--g3)', border: '1.5px solid var(--b4)' }}>
              <div style={{ fontSize: 34, marginBottom: 4 }}>📊</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--txt2)' }}>Obrigado por responder!</div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>Enquete não tem certo nem errado — e não mexe na sua sequência.</div>
            </div>
          ) : minhaResposta?.graded ? (
            <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: acertou ? 'rgba(79,184,92,.15)' : 'rgba(227,28,61,.15)', border: `1.5px solid ${acertou ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ fontSize: 34, marginBottom: 4 }}>{acertou ? '✅' : '❌'}</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: acertou ? 'var(--success)' : 'var(--danger)' }}>{acertou ? `+${pontos} pontos!` : 'Não foi essa'}</div>
              {/* A conta aberta: sem isto o aluno vê "+1050" e não entende de
                  onde veio o número — e o bônus de sequência perde a graça. */}
              {acertou && bonus > 0 && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 6 }}>
                  {pontos - bonus} pela resposta <b style={{ color: 'var(--gold)' }}>+ {bonus} de sequência 🔥{streakAgora}</b>
                </div>
              )}
              {acertou && bonus === 0 && streakAgora >= 2 && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 6 }}>🔥 {streakAgora} seguidas!</div>
              )}
              {!acertou && (
                <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 6 }}>
                  Resposta certa: <b style={{ color: 'var(--success)' }}>{(game.currentQuestion?.opcoes || [])[game.revealCorrectIndex]}</b>
                </div>
              )}
            </div>
          ) : respostaEscolhida === null && respostaConferida ? (
            <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: 'var(--g3)', border: '1.5px solid var(--b4)' }}>
              <div style={{ fontSize: 34, marginBottom: 4 }}>⏱️</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--txt2)' }}>Você não respondeu</div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>
                Resposta certa: <b style={{ color: 'var(--success)' }}>{(game.currentQuestion?.opcoes || [])[game.revealCorrectIndex]}</b>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 18, color: 'var(--mut)', fontSize: 13 }}>Corrigindo...</div>
          )}

          {/* Posição e distância para o líder — é a informação que faz o aluno
              querer a próxima pergunta. Sai do campo `placar`, publicado pelo
              host na revelação: custo de leitura zero. */}
          <MinhaPosicao classificacao={classificacao} meuUid={meuUid} />

          <BarraRespostas opcoes={game.currentQuestion?.opcoes || []} counts={game.revealCounts || []} correctIndex={game.revealCorrectIndex} tipo={tipoR} />
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
        <FaixaRodada indice={game.currentIndex} total={game.totalQuestions} jogadores={classificacao.length} />
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

        {/* Quem não subiu ao pódio precisa saber como foi — sem isso, 90% da
            turma termina a partida sem nenhum retorno pessoal. */}
        <div style={{ marginTop: 22 }}>
          <MinhaPosicao classificacao={classificacao} meuUid={meuUid} />
          {(meuJogador?.maxStreak || 0) >= 2 && (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--txt2)', marginTop: -6, marginBottom: 8 }}>
              Sua melhor sequência: <b style={{ color: 'var(--gold)' }}>🔥 {meuJogador.maxStreak} seguidas</b>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          {codigo && meuUid && <PesquisaFinal codigo={codigo} meuUid={meuUid} />}
          <div style={{ fontSize: 12, color: 'var(--mut)', textAlign: 'center', lineHeight: 1.5 }}>
            Fique nesta tela: se o professor iniciar outra rodada, você volta automaticamente.
          </div>
          {meuNomeAvatar?.isGuest && (
            <div className="purple-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Gostou? Crie sua conta e acompanhe seu progresso todo dia! 🎯</div>
              <button className="btn btn-gold" onClick={() => shareApp()}>📤 Compartilhar o app</button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={() => { limparSessao(); onExit?.(); }}>← Sair</button>
        </div>
      </div>
    </div>
  );
};
