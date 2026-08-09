import React, { useEffect, useRef, useState } from 'react';
import { somTickPonto, somSubiuPosicao, somPlacarPronto } from './chiptune';

// Mesma paleta/símbolos já usados no Quiz diário (components.tsx) — mantém
// o Modo Ao Vivo visualmente consistente com o resto do app, em vez de
// introduzir uma segunda paleta "estilo Kahoot" com cores diferentes.
export const OPCOES_ESTILO = [
  { cls: 'qA', sym: '🔺' },
  { cls: 'qB', sym: '🔷' },
  { cls: 'qC', sym: '🔶' },
  { cls: 'qD', sym: '🟢' },
];

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
export const BarraRespostas = ({ opcoes, counts, correctIndex }: { opcoes: string[]; counts: number[]; correctIndex: number }) => {
  const [cresceu, setCresceu] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCresceu(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(1, ...counts);
  return (
    <div className="live-chart">
      {opcoes.map((op, i) => {
        const n = counts[i] || 0;
        // Altura é % do "trilho" (flex:1), não do bloco todo: sem esse trilho
        // entre o número e o rótulo, a barra cheia invade o texto de baixo.
        const pct = cresceu ? Math.max(n > 0 ? 6 : 0, (n / max) * 100) : 0;
        const isCorrect = i === correctIndex;
        return (
          <div key={i} className={`live-chart-col${isCorrect ? ' certa' : ' errada'}`}>
            <div className="live-chart-count">{n}</div>
            <div className="live-chart-track">
              <div className={`live-chart-bar ${OPCOES_ESTILO[i]?.cls}`} style={{ height: pct + '%' }} />
            </div>
            <div className="live-chart-label">
              <span style={{ fontSize: 18 }}>{isCorrect ? '✅' : OPCOES_ESTILO[i]?.sym}</span>
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

const ALTURA_LINHA = 68;   // altura da linha + respiro; usada no posicionamento
const MS_SOMA = 1400;      // duração da contagem dos pontos da rodada

// Placar estilo Kahoot: as linhas COMEÇAM na posição da rodada anterior, os
// pontos sobem contando, e a troca de posição acontece no instante em que um
// número ultrapassa o outro. A ordem exibida é derivada dos pontos EXIBIDOS
// (não dos finais), então o movimento e a contagem contam a mesma história —
// não precisa de nenhuma coreografia manual de "quem passa quem".
//
// Cada linha é posicionada por translateY em vez de entrar na ordem do fluxo:
// no fluxo normal, reordenar faz os elementos saltarem de lugar, sem como
// animar a passagem de um pelo outro.
export const Placar = ({ jogadores, roundKey, meuUid, comSom }: { jogadores: any[]; roundKey: any; meuUid?: string; comSom?: boolean }) => {
  // Pontuação com que cada um ENTROU nesta rodada. Guardada num ref e só
  // atualizada ao virar a rodada: é o ponto de partida da contagem.
  const anterioresRef = useRef<Record<string, number>>({});
  const rodadaRef = useRef<any>(null);
  const [progresso, setProgresso] = useState(1);

  const primeiraDaRodada = rodadaRef.current !== roundKey;
  if (primeiraDaRodada) rodadaRef.current = roundKey;

  useEffect(() => {
    const de = { ...anterioresRef.current };
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

  if (jogadores.length === 0) {
    return <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>Ninguém entrou ainda.</div>;
  }

  return (
    <div style={{ padding: '4px 16px', position: 'relative', height: jogadores.length * ALTURA_LINHA }}>
      {exibidos.map(j => (
        <div
          key={j.uid}
          className="live-placar-row"
          style={{
            transform: `translateY(${posicoes[j.uid] * ALTURA_LINHA}px)`,
            transition: posicionado ? undefined : 'none',
            border: j.uid === meuUid ? '1.5px solid var(--gold)' : undefined,
          }}
        >
          <div style={{ fontWeight: 900, color: 'var(--mut)', fontSize: 14, width: 22, textAlign: 'center' }}>{posicoes[j.uid] + 1}</div>
          <Avatar avatar={j.avatar} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.nome}</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${(j.exibido / max) * 100}%` }} /></div>
          </div>
          {/* O "+750" some quando a contagem termina: a partir daí o número
              da esquerda já conta a história toda. */}
          {j.ganho > 0 && progresso < 1 && (
            <div style={{ fontWeight: 900, color: 'var(--teal)', fontSize: 13, whiteSpace: 'nowrap' }}>+{j.ganho}</div>
          )}
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: 15, minWidth: 44, textAlign: 'right' }}>{j.exibido}</div>
        </div>
      ))}
    </div>
  );
};

// Pódio final — mesma estrutura de .podium/.pod-col/.pod-base do Ranking,
// só troca xp/dias por nome+pontuação da sala (efêmera, não é XP real).
export const LivePodium = ({ jogadores }: { jogadores: any[] }) => {
  if (jogadores.length < 1) return <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 30 }}>Ninguém pontuou nesta sala.</div>;
  const [p1, p2, p3] = jogadores;
  return (
    <div className="podium">
      {p2 && (
        <div className="pod-col">
          <Avatar avatar={p2.avatar} size={44} />
          <div style={{ fontWeight: 800, fontSize: 12, maxWidth: 74, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p2.nome}</div>
          <div className="pod-base p2">🥈</div>
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: 12 }}>{p2.score} pts</div>
        </div>
      )}
      <div className="pod-col">
        <div style={{ fontSize: 20, animation: 'bounce 2s ease-in-out infinite' }}>👑</div>
        <Avatar avatar={p1.avatar} size={62} ring />
        <div style={{ fontWeight: 900, fontSize: 14, maxWidth: 86, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--gold)' }}>{p1.nome}</div>
        <div className="pod-base p1">🥇</div>
        <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: 14 }}>{p1.score} pts</div>
      </div>
      {p3 && (
        <div className="pod-col">
          <Avatar avatar={p3.avatar} size={44} />
          <div style={{ fontWeight: 800, fontSize: 11, maxWidth: 70, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p3.nome}</div>
          <div className="pod-base p3">🥉</div>
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: 12 }}>{p3.score} pts</div>
        </div>
      )}
    </div>
  );
};

export { Avatar };
