import React, { useEffect, useRef, useState } from 'react';
import { somTickPonto, somSubiuPosicao, somPlacarPronto } from './chiptune';
import { agoraServidor } from './relogio';

// ===== Tempo da pergunta, à prova de pausa =====
// Host e celulares precisam contar EXATAMENTE o mesmo tempo, inclusive depois
// de uma pausa. O truque: enquanto `pausado` é true, o "agora" congela no
// instante em que a pausa começou (`faseIniciadaEm`, reescrito ao pausar).
// Ao retomar, `msPausados` acumula quanto tempo ficou parado e é descontado —
// então ninguém precisa recalcular prazo nenhum por conta própria.
export const duracaoDaPergunta = (game: any) =>
  Number(game?.duracaoAtualSec) || Number(game?.questionDurationSec) || 20;

export const decorridoNaPergunta = (game: any) => {
  const inicio = game?.questionStartedAt?.toMillis?.();
  if (!inicio) return 0;
  const agora = (game?.pausado && game?.faseIniciadaEm?.toMillis)
    ? game.faseIniciadaEm.toMillis()
    : agoraServidor();
  return Math.max(0, agora - inicio - (Number(game?.msPausados) || 0));
};

// Mesma paleta/símbolos já usados no Quiz diário (components.tsx) — mantém
// o Modo Ao Vivo visualmente consistente com o resto do app, em vez de
// introduzir uma segunda paleta "estilo Kahoot" com cores diferentes.
export const OPCOES_ESTILO = [
  { cls: 'qA', sym: '🔺' },
  { cls: 'qB', sym: '🔷' },
  { cls: 'qC', sym: '🔶' },
  { cls: 'qD', sym: '🟢' },
];

// Verdadeiro/Falso usa só duas casas e símbolos próprios — é o que faz a
// pergunta ser reconhecida de longe, no projetor, sem ler o enunciado.
export const OPCOES_VF = [
  { cls: 'qA', sym: '✔️' },
  { cls: 'qB', sym: '✖️' },
];

export const estiloOpcoes = (tipo?: string) => (tipo === 'vf' ? OPCOES_VF : OPCOES_ESTILO);

// Selo acima do enunciado dizendo o que esta pergunta é e quanto vale. Sem
// ele, "enquete" e "pontos em dobro" seriam invisíveis: o aluno responderia
// achando que vale o mesmo de sempre e reclamaria do placar depois.
export const SeloTipo = ({ tipo, multiplicador }: { tipo?: string; multiplicador?: number }) => {
  const selos: { txt: string; cor: string }[] = [];
  if (tipo === 'vf') selos.push({ txt: '✔️✖️ Verdadeiro ou falso', cor: 'var(--blu)' });
  if (tipo === 'enquete') selos.push({ txt: '📊 Enquete — não vale ponto', cor: 'var(--mut)' });
  if (tipo !== 'enquete' && multiplicador === 2) selos.push({ txt: '⚡ Pontos em dobro', cor: 'var(--gold)' });
  if (tipo !== 'enquete' && multiplicador === 0) selos.push({ txt: '🎈 Sem pontos', cor: 'var(--mut)' });
  if (!selos.length) return null;
  return (
    <div className="selos-tipo">
      {selos.map(s => (
        <span key={s.txt} className="selo-tipo" style={{ color: s.cor, borderColor: s.cor }}>{s.txt}</span>
      ))}
    </div>
  );
};

// Chama da sequência de acertos. Só aparece a partir de 2 — uma sequência de
// 1 é só "acertou", e mostrar 🔥1 na primeira pergunta esvazia o símbolo.
export const Chama = ({ streak, tamanho = 13 }: { streak?: number; tamanho?: number }) => {
  if (!streak || streak < 2) return null;
  return (
    <span className="live-streak" style={{ fontSize: tamanho }} title={`${streak} acertos seguidos`}>
      🔥{streak}
    </span>
  );
};

const Avatar = ({ avatar, size, ring }: { avatar?: string; size: number; ring?: boolean }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.55),
    overflow: 'hidden', flexShrink: 0, border: ring ? '2.5px solid #F5C842' : undefined,
  }}>
    {avatar && avatar.length > 10
      ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
      : <span>{avatar || '⭐'}</span>}
  </div>
);

// Gráfico da revelação, estilo Kahoot: barras EM PÉ, uma por opção, subindo
// do chão. A certa fica em cor cheia com ✅ e um brilho; as erradas caem para
// cinza. Cada barra nasce em 0 e recebe a altura final num setTimeout(~40ms)
// — renderizando direto no valor final o navegador pinta de uma vez e não há
// transição nenhuma (doc de origem).
// `tipo === 'enquete'` desliga o conceito de certo/errado: numa sondagem
// ninguém erra, então nenhuma barra é apagada em cinza nem ganha ✅ — todas
// aparecem em cor cheia, que é o resultado que interessa ver.
export const BarraRespostas = ({ opcoes, counts, correctIndex, tipo }: { opcoes: string[]; counts: number[]; correctIndex: number; tipo?: string }) => {
  const [cresceu, setCresceu] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCresceu(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(1, ...counts);
  const enquete = tipo === 'enquete';
  const estilos = estiloOpcoes(tipo);
  const total = counts.reduce((s, n) => s + (n || 0), 0);
  return (
    <div className="live-chart">
      {opcoes.map((op, i) => {
        const n = counts[i] || 0;
        // Altura é % do "trilho" (flex:1), não do bloco todo: sem esse trilho
        // entre o número e o rótulo, a barra cheia invade o texto de baixo.
        const pct = cresceu ? Math.max(n > 0 ? 6 : 0, (n / max) * 100) : 0;
        const isCorrect = !enquete && i === correctIndex;
        return (
          <div key={i} className={`live-chart-col${enquete ? '' : isCorrect ? ' certa' : ' errada'}`}>
            <div className="live-chart-count">
              {n}
              {enquete && total > 0 && <span style={{ fontSize: 10, opacity: .7 }}> · {Math.round((n / total) * 100)}%</span>}
            </div>
            <div className="live-chart-track">
              <div className={`live-chart-bar ${estilos[i]?.cls}`} style={{ height: pct + '%' }} />
            </div>
            <div className="live-chart-label">
              <span className="sim">{isCorrect ? '✅' : estilos[i]?.sym}</span>
              <span className="txt">{op}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Respiro entre o placar e a pergunta: 5s para a turma parar de comentar o
// resultado e olhar para o telão. Vale para todo mundo porque é medido a
// partir de `questionStartedAt`, que é do servidor.
//
// Por que isto NÃO virou uma fase nova ('contagem') no doc da sala: as
// regras do Firestore enumeram as fases permitidas e são publicadas no
// MESMO banco que o LUM07 usa. Um valor a mais aqui quebraria assim que o
// outro app republicasse as regras dele. Ancorar nos primeiros 5s da fase
// 'question' dá o mesmo efeito sem tocar em nada compartilhado.
export const MS_CONTAGEM = 5000;

// Tela cheia de contagem. O número troca de identidade a cada segundo (key),
// o que reinicia a animação de "pulo" — sem isso ele só apareceria trocando
// de valor, sem vida nenhuma.
export const Contagem = ({ n, pergunta }: { n: number; pergunta?: string }) => (
  <div className="live-contagem">
    <div className="rotulo">Prepare-se!</div>
    <div key={n} className="numero">{n}</div>
    {pergunta && <div className="dica">{pergunta}</div>}
  </div>
);

// ===== Tela do apresentador =====
// Larga e deitada = projetor, TV ou notebook ligado no telão. O app inteiro é
// desenhado para 480px de largura; nessa tela ele vira uma peça de projeção,
// onde o que importa é ser lido do fundo da sala. No celular do professor a
// consulta dá falso e nada muda.
export const TELAO_QUERY = '(min-width: 900px) and (orientation: landscape)';
export const useTelao = () => {
  const [telao, setTelao] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(TELAO_QUERY).matches
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(TELAO_QUERY);
    const aoMudar = (e: MediaQueryListEvent) => setTelao(e.matches);
    setTelao(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);
  return telao;
};

// Altura da linha do placar. Precisa existir em JS (as linhas são posicionadas
// por translateY, ver Placar) e bater com o CSS — por isso o valor mora aqui e
// o CSS só define a altura visual da linha.
const ALTURA_LINHA = 74;
const ALTURA_LINHA_TELAO = 98;
const MS_SOMA = 1400;      // duração da contagem dos pontos da rodada
const MEDALHAS = ['🥇', '🥈', '🥉'];

// Faixa de contexto acima do placar. Sem ela a tela é só uma lista solta: não
// dá para saber em que ponto da partida a turma está nem quanta gente resta.
export const FaixaRodada = ({ indice, total, jogadores }: { indice?: number; total?: number; jogadores: number }) => (
  <div className="live-faixa">
    <span>
      {typeof indice === 'number' && total
        ? <>Pergunta <b className="num">{indice + 1}</b> de <b className="num">{total}</b></>
        : 'Placar da sala'}
    </span>
    <span>👥 <b className="num">{jogadores}</b> jogador{jogadores !== 1 ? 'es' : ''}</span>
  </div>
);

// Placar estilo Kahoot: as linhas COMEÇAM na posição da rodada anterior, os
// pontos sobem contando, e a troca de posição acontece no instante em que um
// número ultrapassa o outro. A ordem exibida é derivada dos pontos EXIBIDOS
// (não dos finais), então o movimento e a contagem contam a mesma história —
// não precisa de nenhuma coreografia manual de "quem passa quem".
//
// Cada linha é posicionada por translateY em vez de entrar na ordem do fluxo:
// no fluxo normal, reordenar faz os elementos saltarem de lugar, sem como
// animar a passagem de um pelo outro.
export const Placar = ({ jogadores, roundKey, meuUid, comSom, onExpulsar, telao }: { jogadores: any[]; roundKey: any; meuUid?: string; comSom?: boolean; onExpulsar?: (j: any) => void; telao?: boolean }) => {

  // Pontuação com que cada um ENTROU nesta rodada. Guardada num ref e só
  // atualizada ao virar a rodada: é o ponto de partida da contagem.
  const anterioresRef = useRef<Record<string, number>>({});
  // Posição com que cada um ENTROU nesta rodada, congelada no começo dela.
  // Não dá para derivar de `anterioresRef` na hora de desenhar: ele é
  // reescrito com os pontos NOVOS quando a contagem termina, que é
  // exatamente o momento em que o "▲2" precisa aparecer.
  const posAntesRef = useRef<Record<string, number>>({});
  const rodadaRef = useRef<any>(null);
  const [progresso, setProgresso] = useState(1);

  const primeiraDaRodada = rodadaRef.current !== roundKey;
  if (primeiraDaRodada) rodadaRef.current = roundKey;

  useEffect(() => {
    const de = { ...anterioresRef.current };
    // Só quem já estava na rodada anterior tem posição de partida — para
    // quem entrou agora não existe "subiu": ele apareceu.
    const antes: Record<string, number> = {};
    jogadores
      .filter(j => de[j.uid] !== undefined)
      .map(j => ({ uid: j.uid, pts: de[j.uid] }))
      .sort((a, b) => (b.pts - a.pts) || String(a.uid).localeCompare(String(b.uid)))
      .forEach((j, i) => { antes[j.uid] = i; });
    posAntesRef.current = antes;
    const inicio = performance.now();
    setProgresso(0);
    let raf = 0;
    const passo = () => {
      const p = Math.min(1, (performance.now() - inicio) / MS_SOMA);
      setProgresso(p);
      if (p < 1) raf = requestAnimationFrame(passo);
      else {
        // Só no fim registra os valores desta rodada como "anteriores" da
        // próxima — se fosse durante, a animação recomeçaria do meio.
        const novo: Record<string, number> = {};
        jogadores.forEach(j => { novo[j.uid] = j.score || 0; });
        anterioresRef.current = novo;
      }
    };
    raf = requestAnimationFrame(passo);
    // Congela os valores de partida desta rodada (podem ter sido zerados
    // acima por um jogador que entrou agora e ainda não está no mapa).
    anterioresRef.current = de;
    return () => cancelAnimationFrame(raf);
  }, [roundKey]);

  // Suavização: a contagem começa rápida e desacelera — soa e parece melhor
  // do que uma subida linear, que dá impressão de travamento no fim.
  const suave = 1 - Math.pow(1 - progresso, 3);

  const exibidos = jogadores.map(j => {
    const de = anterioresRef.current[j.uid] ?? 0;
    const para = j.score || 0;
    return { ...j, exibido: Math.round(de + (para - de) * suave), ganho: para - de };
  });
  exibidos.sort((a, b) => (b.exibido - a.exibido) || String(a.uid).localeCompare(String(b.uid)));

  const posicoes: Record<string, number> = {};
  exibidos.forEach((j, i) => { posicoes[j.uid] = i; });
  const max = Math.max(1, ...exibidos.map(j => j.exibido));

  // ===== Sons =====
  // Tique a cada X pontos somados (não a cada frame: a 60fps viraria zumbido)
  // e um som de ultrapassagem quando alguém troca de posição de fato.
  const ultimoTiqueRef = useRef(0);
  const posAnteriorRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!comSom) { posAnteriorRef.current = posicoes; return; }
    const somaExibida = exibidos.reduce((s, j) => s + j.exibido, 0);
    if (progresso < 1 && somaExibida - ultimoTiqueRef.current >= 120) {
      ultimoTiqueRef.current = somaExibida;
      somTickPonto();
    }
    if (progresso === 0) ultimoTiqueRef.current = somaExibida;
    const antes = posAnteriorRef.current;
    const subiu = exibidos.some(j => antes[j.uid] !== undefined && posicoes[j.uid] < antes[j.uid]);
    if (subiu) somSubiuPosicao();
    posAnteriorRef.current = posicoes;
  });

  const fimTocadoRef = useRef<any>(null);
  useEffect(() => {
    if (!comSom || progresso < 1 || fimTocadoRef.current === roundKey) return;
    fimTocadoRef.current = roundKey;
    somPlacarPronto();
  }, [progresso, roundKey, comSom]);

  // Sem isto, a PRIMEIRA pintura também é animada: as linhas ainda não têm
  // transform, então todas partem do topo e descem juntas, empilhadas. A
  // transição só deve valer para as trocas de posição seguintes.
  const [posicionado, setPosicionado] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPosicionado(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // No telão a lista precisa CABER. Rolar um ranking no projetor obriga o
  // professor a voltar para o teclado no meio da comemoração — e quem está no
  // fim da lista nunca aparece. A linha encolhe até 56px para a turma inteira
  // entrar de uma vez; só abaixo disso a lista volta a rolar.
  const [alturaJanela, setAlturaJanela] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  useEffect(() => {
    if (!telao) return;
    const aoRedimensionar = () => setAlturaJanela(window.innerHeight);
    aoRedimensionar();
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, [telao]);
  // 250px é o que cabeçalho, faixa de contexto e barra de controles ocupam.
  // Se nem com a linha no mínimo a turma couber em uma coluna, o 16:9 tem
  // largura sobrando: vira duas colunas, que é o que salva uma turma de 20.
  const disponivel = Math.max(200, alturaJanela - 250);
  const cabemEmUma = Math.max(1, Math.floor(disponivel / 56));
  const duasColunas = telao && jogadores.length > cabemEmUma;
  const porColuna = duasColunas ? Math.ceil(jogadores.length / 2) : jogadores.length;
  const alturaLinhaTelao = Math.max(
    56,
    Math.min(ALTURA_LINHA_TELAO, Math.floor(disponivel / Math.max(1, porColuna)))
  );

  if (jogadores.length === 0) {
    return (
      <div className="live-placar-vazio">
        <div style={{ fontSize: 34 }}>🪑</div>
        <div style={{ fontWeight: 800, color: 'var(--txt2)' }}>Ninguém entrou ainda</div>
        <div style={{ fontSize: 13, color: 'var(--mut)' }}>O placar aparece assim que a turma marcar ponto.</div>
      </div>
    );
  }

  return (
    <div
      className={`live-placar${duasColunas ? ' duas' : ''}`}
      style={{ height: (telao ? porColuna * alturaLinhaTelao : jogadores.length * ALTURA_LINHA) }}
    >
      {exibidos.map(j => {
        const pos = posicoes[j.uid];
        const antes = posAntesRef.current[j.uid];
        // "▲2" só depois que a contagem para: durante ela quem conta a
        // história é o "+750", e os dois juntos na mesma linha viram poluição.
        const subiu = antes !== undefined && progresso === 1 ? antes - pos : 0;
        const classes = ['live-placar-row'];
        if (pos < 3) classes.push(`r${pos + 1}`);
        if (j.uid === meuUid) classes.push('eu');
        return (
          <div
            key={j.uid}
            className={classes.join(' ')}
            style={{
              // Em duas colunas o deslocamento horizontal é de 100% da PRÓPRIA
              // largura mais o vão — assim as duas colunas fecham exatamente a
              // largura do quadro, sem depender de conta em pixel.
              transform: duasColunas
                ? `translate(${Math.floor(pos / porColuna) ? 'calc(100% + 26px)' : '0px'}, ${(pos % porColuna) * alturaLinhaTelao}px)`
                : `translateY(${pos * (telao ? alturaLinhaTelao : ALTURA_LINHA)}px)`,
              transition: posicionado ? undefined : 'none',
              ...(telao ? { height: alturaLinhaTelao - 10 } : null),
            }}
          >
            <div className="pos">{pos < 3 ? MEDALHAS[pos] : <span className="num">{pos + 1}º</span>}</div>
            <Avatar avatar={j.avatar} size={telao ? Math.max(30, Math.min(54, alturaLinhaTelao - 34)) : 40} ring={pos === 0} />
            <div className="quem">
              {/* Nada de crachá "você" aqui: com o nome, a chama e o "+750"
                  disputando a mesma linha, o crachá espremia o nome até virar
                  "V…". A borda dourada e o nome em dourado dizem o mesmo sem
                  ocupar espaço. */}
              <div className="nome">
                <span className="txt">{j.nome}</span>
                <Chama streak={j.streak} />
              </div>
              {/* A barra é a fatia do líder, não do total: é o que deixa ver
                  de longe quem está colado no primeiro e quem ficou para trás. */}
              <div className="barra"><div className="fill" style={{ width: `${(j.exibido / max) * 100}%` }} /></div>
            </div>
            {subiu > 0 && <div className="delta" title={`Subiu ${subiu} posição${subiu !== 1 ? 'ões' : ''}`}>▲{subiu}</div>}
            {/* O "+750" some quando a contagem termina: a partir daí o número
                da direita já conta a história toda. */}
            {j.ganho > 0 && progresso < 1 && <div className="ganho">+{j.ganho}</div>}
            <div className="pts num">{j.exibido}</div>
            {onExpulsar && (
              <button
                className="expulsar"
                onClick={() => onExpulsar(j)}
                title={`Remover ${j.nome} da sala`}
                aria-label={`Remover ${j.nome} da sala`}
              >✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Pódio final — mesma estrutura de .podium/.pod-col/.pod-base do Ranking,
// só troca xp/dias por nome+pontuação da sala (efêmera, não é XP real).
export const LivePodium = ({ jogadores, telao }: { jogadores: any[]; telao?: boolean }) => {
  if (jogadores.length < 1) return <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 30 }}>Ninguém pontuou nesta sala.</div>;
  const [p1, p2, p3] = jogadores;
  const g = (n: number) => (telao ? Math.round(n * 1.9) : n);
  return (
    <div className={`podium${telao ? ' telao' : ''}`}>
      {p2 && (
        <div className="pod-col dois">
          <Avatar avatar={p2.avatar} size={g(44)} />
          <div className="pod-nome">{p2.nome}</div>
          <div className="pod-base p2">🥈</div>
          <div className="pod-pts">{p2.score} pts</div>
        </div>
      )}
      <div className="pod-col um">
        <div className="pod-coroa">👑</div>
        <Avatar avatar={p1.avatar} size={g(62)} ring />
        <div className="pod-nome">{p1.nome}</div>
        <div className="pod-base p1">🥇</div>
        <div className="pod-pts">{p1.score} pts</div>
      </div>
      {p3 && (
        <div className="pod-col tres">
          <Avatar avatar={p3.avatar} size={g(44)} />
          <div className="pod-nome">{p3.nome}</div>
          <div className="pod-base p3">🥉</div>
          <div className="pod-pts">{p3.score} pts</div>
        </div>
      )}
    </div>
  );
};

export { Avatar };
