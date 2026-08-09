import React, { useEffect, useState } from 'react';

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

// Gráfico de barras da revelação: quantos marcaram cada opção, a certa
// destacada. Nasce em 0 e ganha a largura final num setTimeout(~40ms) —
// senão o navegador pinta tudo de uma vez e não há transição (doc de origem).
export const BarraRespostas = ({ opcoes, counts, correctIndex }: { opcoes: string[]; counts: number[]; correctIndex: number }) => {
  const [largo, setLargo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLargo(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(1, ...counts);
  return (
    <div>
      {opcoes.map((op, i) => {
        const n = counts[i] || 0;
        const pct = largo ? (n / max) * 100 : 0;
        const isCorrect = i === correctIndex;
        return (
          <div key={i} className="live-bar-row">
            <span className="sym" style={{ fontSize: 20, width: 22, textAlign: 'center' }}>{OPCOES_ESTILO[i]?.sym}</span>
            <div className="live-bar-track">
              <div className={`live-bar-fill ${OPCOES_ESTILO[i]?.cls}`} style={{ width: pct + '%', opacity: isCorrect ? 1 : 0.55 }}>
                {n > 0 && n}
              </div>
            </div>
            <span style={{ width: 22, textAlign: 'center', fontSize: 18 }}>{isCorrect ? '✅' : ''}</span>
          </div>
        );
      })}
    </div>
  );
};

// Placar animado: linhas entrando escalonadas. `roundKey` (índice da
// pergunta) entra na key das linhas pra forçar remontagem a cada rodada,
// senão a animação de entrada só toca na 1ª vez (doc de origem).
export const Placar = ({ jogadores, roundKey, meuUid }: { jogadores: any[]; roundKey: any; meuUid?: string }) => {
  const max = Math.max(1, ...jogadores.map(j => j.score || 0));
  return (
    <div style={{ padding: '4px 16px' }}>
      {jogadores.map((j, i) => (
        <div
          key={`${roundKey}_${j.uid}`}
          className="live-placar-row"
          style={{ animationDelay: `${i * 70}ms`, border: j.uid === meuUid ? '1.5px solid var(--gold)' : undefined }}
        >
          <div style={{ fontWeight: 900, color: 'var(--mut)', fontSize: 14, width: 22, textAlign: 'center' }}>{i + 1}</div>
          <Avatar avatar={j.avatar} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.nome}</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${((j.score || 0) / max) * 100}%` }} /></div>
          </div>
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: 15 }}>{j.score || 0}</div>
        </div>
      ))}
      {jogadores.length === 0 && <div style={{ textAlign: 'center', color: 'var(--mut)', padding: 20 }}>Ninguém entrou ainda.</div>}
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
