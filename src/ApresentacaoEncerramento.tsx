import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Confetti } from './components';
import { fmtNum, montarApresentacao, type ContextoApresentacao, type Slide } from './apresentacaoEncerramento';
import type { ResumoTemporada } from './relatorioTemporada';
import { precarregarDeixas, silenciar, tocarDeixa } from './somEncerramento';

// ===== Apresentação de encerramento — o telão =====
//
// Desenha os slides que src/apresentacaoEncerramento.ts monta. Tudo em 16:9,
// medido em cqh/cqw (container queries), do mesmo jeito que o Sorteador no
// modo telão: a mesma tela serve um notebook e um projetor 4K. As medidas
// vêm do PPT original (13,33" × 7,5"): 1pt = 100/540 cqh.
//
// Controles pensados para quem está de pé longe do teclado, com passador de
// slides: → / Espaço / PageDown avançam (revelam o próximo passo dentro do
// slide antes de trocar de slide), ← / PageUp voltam, N mostra as notas do
// apresentador, B ou . apaga a tela (tela preta), S abre o sorteio.
// Esc NÃO fecha: no telão, um Esc sem querer derrubaria a noite. Quem fecha
// é o ✕ no canto.

type Props = {
  slides: Slide[];
  chaveMemoria: string;              // onde lembrar o slide atual (sessão)
  onSair: () => void;
  renderSorteio: (fechar: () => void) => React.ReactNode;
};

type Fase = 'antes' | 'silencio' | 'revelado';

export const entrarTelaCheia = () => {
  const el = document.documentElement as any;
  const pedir = el.requestFullscreen || el.webkitRequestFullscreen;
  try { const p = pedir?.call(el); p?.catch?.(() => {}); } catch {}
};

const sairTelaCheia = () => {
  const d = document as any;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    try { (d.exitFullscreen || d.webkitExitFullscreen).call(d)?.catch?.(() => {}); } catch {}
  }
};

const lerMemoria = (chave: string, total: number) => {
  try {
    const v = JSON.parse(sessionStorage.getItem(chave) || 'null');
    if (v && v.idx >= 0 && v.idx < total) return v as { idx: number; passo: number };
  } catch {}
  return { idx: 0, passo: 0 };
};

// Número que "sobe" até o valor ao ser revelado — o efeito de contador do manual.
const Contador = ({ valor }: { valor: number }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(Math.round(valor * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{fmtNum(v)}</>;
};

const Topo = ({ eyebrow, titulo, classe = '' }: { eyebrow: string; titulo: string; classe?: string }) => (
  <>
    <div className="ap-eyebrow">{eyebrow}</div>
    <div className={`ap-titulo ${classe}`}>{titulo}</div>
  </>
);

const SlideView = ({ s, passo, fase, onAbrirSorteio }: { s: Slide; passo: number; fase: Fase; onAbrirSorteio: () => void }) => {
  switch (s.tipo) {
    case 'capa':
      return (
        <div className={`ap-capa${s.cortina && passo === 0 ? ' cortina' : ''}`}>
          <div className="ap-eyebrow ap-canto">{s.eyebrow}</div>
          <div className="ap-emoji">{s.emoji}</div>
          <div className="ap-capa-titulo">{s.titulo}</div>
          <div className="ap-capa-sub">{s.subtitulo}</div>
          <div className="ap-capa-linha">{s.linha}</div>
        </div>
      );
    case 'numeros':
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} />
          <div className="ap-numeros">
            {s.cards.map((c, i) => (
              <div key={c.rotulo} className="ap-num-card">
                <div className="ap-num-valor">{i < passo ? <Contador valor={c.valor} /> : '?'}</div>
                <div className="ap-num-rotulo">{c.rotulo}</div>
              </div>
            ))}
          </div>
          {s.rodape && passo >= s.passos && <div className="ap-rodape ap-entra">{s.rodape}</div>}
        </div>
      );
    case 'dia':
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} />
          <div className="ap-dia">
            <div>
              <div className="ap-dia-data">{passo > 0 ? <span className="ap-pop">{s.data}</span> : '??/??'}</div>
              {passo > 0 && <div className="ap-dia-legenda ap-entra">{s.legenda}</div>}
            </div>
            {passo > 0 && (
              <div className="ap-dia-lateral ap-entra">
                {s.lateral.map((t, i) => <div key={i} className={i ? 'claro' : ''}>{t}</div>)}
              </div>
            )}
          </div>
        </div>
      );
    case 'podio': {
      const n = s.itens.length;
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} />
          <div className="ap-podio">
            {s.itens.map(it => {
              const revelado = it.pos > n - passo;
              return (
                <div key={it.pos} className={`ap-podio-card ap-p${it.pos}${revelado ? ' on' : ''}`}>
                  <div className="ap-podio-pos">{it.pos}º</div>
                  <div className="ap-podio-titulo">{revelado ? <span className="ap-pop">{it.titulo}</span> : '?'}</div>
                  <div className="ap-podio-destaque">{it.destaque}</div>
                  <div className="ap-podio-detalhe">{it.detalhe}</div>
                </div>
              );
            })}
          </div>
          {s.rodape && passo >= s.passos && <div className="ap-rodape ap-entra">{s.rodape}</div>}
        </div>
      );
    }
    case 'grade': {
      const cols = s.nomes.length <= 9 ? 3 : s.nomes.length <= 16 ? 4 : 5;
      const visiveis = s.passos ? passo : s.nomes.length;
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} />
          <div className="ap-sub">{s.subtitulo}</div>
          <div className={`ap-grade c${cols}`}>
            {s.nomes.map((nome, i) => (
              <div key={i} className={`ap-chip${i < visiveis ? ' on' : ''}`}>
                {i < visiveis ? <span className="ap-pop">{s.bilhete ? '🎟️ ' : ''}{nome}</span> : ''}
              </div>
            ))}
          </div>
          {visiveis >= s.nomes.length && <div className="ap-rodape ap-entra">{s.rodape}</div>}
        </div>
      );
    }
    case 'frase':
      return (
        <div className="ap-centro">
          {s.emoji && <div className="ap-emoji">{s.emoji}</div>}
          {s.linhas.map((l, i) => <div key={i} className={`ap-frase ${l.cor}`}>{l.texto}</div>)}
          {s.legenda && <div className="ap-frase-legenda">{s.legenda}</div>}
        </div>
      );
    case 'misterio':
      return (
        <div className="ap-conteudo">
          <div className="ap-eyebrow">{s.eyebrow}</div>
          <div className="ap-misterio-titulo">{s.titulo}</div>
          <div className="ap-pistas">
            {s.pistas.map((p, i) => (
              <div key={i} className={`ap-pista${i < passo ? ' on' : ''}`}>
                <span className="ap-pista-n">{i + 1}</span>
                <span className="ap-pista-txt">{i < passo ? p : ''}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'revelacao':
      return (
        <div className={`ap-centro ap-revela ${fase}`}>
          <div className="ap-revela-rotulo">{s.pos}º LUGAR</div>
          {fase === 'revelado' ? (
            <>
              <div className="ap-revela-avatar ap-pop">
                {s.avatar.startsWith('data:') ? <img src={s.avatar} alt="" /> : s.avatar}
              </div>
              <div className="ap-revela-nome ap-pop">{s.nome}</div>
              <div className="ap-revela-detalhe ap-entra">{s.detalhe}</div>
            </>
          ) : (
            <div className="ap-revela-interroga">?</div>
          )}
        </div>
      );
    case 'turma': {
      const a = s.alunos[Math.min(passo, s.alunos.length - 1)];
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} classe="menor" />
          <div className="ap-turma-destaque" key={passo}>
            <div className="ap-turma-avatar ap-pop">{a.avatar}</div>
            <div>
              <div className="ap-turma-nome">{a.nome}</div>
              <div className="ap-turma-conquista">{a.conquista}</div>
              <div className="ap-turma-num">{a.dias} dias · {fmtNum(a.xp)} XP</div>
            </div>
          </div>
          <div className="ap-turma-fila">
            {s.alunos.map((x, i) => (
              <span key={i} className={`ap-turma-chip${i === passo ? ' atual' : i < passo ? ' feito' : ''}`}>{x.nome}</span>
            ))}
          </div>
        </div>
      );
    }
    case 'sorteio':
      return (
        <div className="ap-centro">
          <div className="ap-emoji">{s.emoji}</div>
          <div className="ap-frase claro grande">{s.titulo}</div>
          <div className="ap-frase-legenda">{s.subtitulo}</div>
          <div className="ap-capa-linha">{s.regra}</div>
          <button className="btn btn-gold ap-btn-sorteio" onClick={e => { e.stopPropagation(); onAbrirSorteio(); }}>🎲 Abrir o sorteio</button>
        </div>
      );
    case 'cartoes':
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} />
          <div className="ap-cartoes">
            {s.cartoes.map(c => (
              <div key={c.titulo} className="ap-cartao">
                <div className="ap-cartao-titulo">{c.titulo}</div>
                <div className="ap-cartao-texto">{c.texto}</div>
              </div>
            ))}
          </div>
          <div className="ap-rodape">{s.rodape}</div>
        </div>
      );
    case 'simulacao':
      return (
        <div className="ap-conteudo">
          <Topo eyebrow={s.eyebrow} titulo={s.titulo} classe="menor" />
          <div className={`ap-sim${s.exemplo ? '' : ' so-tabela'}`}>
            <table className="ap-tabela">
              <thead><tr><th>Aluno</th><th>Semanas 100% no dia certo</th></tr></thead>
              <tbody>
                {s.tabela.map(t => <tr key={t.nome}><td>{t.nome}</td><td>{t.semanas} de {s.totalSemanas} semanas</td></tr>)}
              </tbody>
            </table>
            {s.exemplo && (
              <div className="ap-cartao ap-sim-ex">
                <div className="ap-cartao-titulo pequeno">Exemplo (ilustrativo — não é um resultado real)</div>
                <div className="ap-sim-linha">{s.exemplo.licao}</div>
                <div className="ap-sim-linha fraco">{s.exemplo.concorrentes.length} concorrentes: {s.exemplo.concorrentes.join(', ')}</div>
                <div className="ap-cartao-titulo pequeno">Ordem sorteada (simulação):</div>
                <div className="ap-sim-ordem">{s.exemplo.ordem.join('  ›  ')}</div>
              </div>
            )}
          </div>
          <div className="ap-rodape">{s.rodape}</div>
        </div>
      );
  }
};

export const ApresentacaoEncerramento = ({ slides, chaveMemoria, onSair, renderSorteio }: Props) => {
  const inicial = lerMemoria(chaveMemoria, slides.length);
  const [idx, setIdx] = useState(inicial.idx);
  const [passo, setPasso] = useState(inicial.passo);
  const [fase, setFase] = useState<Fase>('antes');
  const [notas, setNotas] = useState(false);
  const [preto, setPreto] = useState(false);
  const [sorteio, setSorteio] = useState(false);
  const [confete, setConfete] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspense = useRef(false);
  const s = slides[idx];

  useEffect(() => { precarregarDeixas(); }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    silenciar(0.4);
    sairTelaCheia();
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(chaveMemoria, JSON.stringify({ idx, passo })); } catch {}
  }, [chaveMemoria, idx, passo]);

  // Som de entrada de cada slide. A trilha de suspense segue tocando do
  // mistério até o clique da revelação (é ali que ela corta para o silêncio).
  const aoEntrar = useCallback((novo: Slide) => {
    if (novo.som === 'suspense') {
      if (!suspense.current) { suspense.current = true; tocarDeixa('suspense', { loop: true, volume: 0.45 }); }
      return;
    }
    if (novo.tipo !== 'revelacao' && suspense.current) { suspense.current = false; silenciar(0.6); }
    if (novo.som) { silenciar(0.6); tocarDeixa(novo.som); }
  }, []);

  const irPara = useCallback((i: number, passoInicial: number) => {
    if (i < 0 || i >= slides.length) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setIdx(i);
    setPasso(passoInicial);
    const alvo = slides[i];
    setFase(alvo.tipo === 'revelacao' && passoInicial > 0 ? 'revelado' : 'antes');
    setConfete(0);
    aoEntrar(alvo);
  }, [slides, aoEntrar]);

  const avancar = useCallback(() => {
    if (sorteio) return;
    if (preto) { setPreto(false); return; }
    if (s.tipo === 'revelacao' && passo === 0) {
      if (fase !== 'antes') return;
      // O manual: corta TODO o som, segura o silêncio, e só então o nome.
      setFase('silencio');
      suspense.current = false;
      silenciar(0.15);
      timer.current = setTimeout(() => {
        setFase('revelado');
        setPasso(1);
        setConfete(c => c + 1);
        tocarDeixa(s.pos === 1 ? 'campeao' : 'impacto', { pos: s.pos });
        timer.current = setTimeout(() => tocarDeixa('aplausos', { volume: 0.7 }), 700);
      }, s.silencioMs);
      return;
    }
    if (s.tipo === 'sorteio' && passo === 0) { setPasso(1); setSorteio(true); return; }
    if (passo < s.passos) {
      const novo = passo + 1;
      setPasso(novo);
      if (s.tipo === 'capa' && s.cortina && novo === 1) tocarDeixa('abertura');
      if (s.tipo === 'numeros' || s.tipo === 'dia' || s.tipo === 'podio') tocarDeixa('swoosh');
      return;
    }
    irPara(idx + 1, 0);
  }, [sorteio, preto, s, passo, fase, idx, irPara]);

  const voltar = useCallback(() => {
    if (sorteio) return;
    if (preto) { setPreto(false); return; }
    if (passo > 0) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setPasso(passo - 1);
      if (s.tipo === 'revelacao') { setFase('antes'); setConfete(0); }
      return;
    }
    // Voltar para um slide mostra ele inteiro (já revelado) — é o que quem
    // voltou quer rever.
    if (idx > 0) irPara(idx - 1, slides[idx - 1].tipo === 'sorteio' ? 0 : slides[idx - 1].passos);
  }, [sorteio, preto, passo, s, idx, slides, irPara]);

  useEffect(() => {
    if (sorteio) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); avancar(); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); voltar(); }
      else if (k === 'n' || k === 'N') setNotas(v => !v);
      else if (k === 'b' || k === 'B' || k === '.') setPreto(v => !v);
      else if ((k === 's' || k === 'S') && s.tipo === 'sorteio') { setPasso(1); setSorteio(true); }
      else if (k === 'Home') irPara(0, 0);
      else if (k === 'Escape') setNotas(false);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [sorteio, avancar, voltar, irPara, s]);

  return createPortal(
    <div className={`ap-palco t-${s.tema}`} role="dialog" aria-modal="true" aria-label="Apresentação de encerramento">
      {confete > 0 && <Confetti key={confete} show={true} />}
      <div className="ap-tela" onClick={avancar} key={s.id}>
        <SlideView s={s} passo={passo} fase={fase} onAbrirSorteio={() => { setPasso(1); setSorteio(true); }} />
      </div>
      {preto && <div className="ap-preto" onClick={() => setPreto(false)} />}
      {notas && (
        <div className="ap-notas" onClick={e => e.stopPropagation()}>
          <b>Notas · slide {idx + 1}</b> {s.notas}
        </div>
      )}
      <div className="ap-hud" onClick={e => e.stopPropagation()}>
        <button onClick={voltar} aria-label="Voltar">◀</button>
        <span>{idx + 1} / {slides.length}{s.passos > 0 && passo < s.passos ? ' ·' : ''}</span>
        <button onClick={avancar} aria-label="Avançar">▶</button>
        <button onClick={() => setNotas(v => !v)} aria-label="Notas do apresentador" aria-pressed={notas}>📝</button>
        <button onClick={entrarTelaCheia} aria-label="Tela cheia">⛶</button>
        <button onClick={onSair} aria-label="Fechar a apresentação">✕</button>
      </div>
      {sorteio && renderSorteio(() => setSorteio(false))}
    </div>,
    document.body
  );
};

// O que o painel do professor abre: monta os slides do relatório uma vez só
// (a simulação dos vouchers sorteia uma ordem — não pode mudar a cada render).
export const ApresentacaoDoRelatorio = ({ resumo, contexto, ...resto }: Omit<Props, 'slides'> & {
  resumo: ResumoTemporada; contexto: ContextoApresentacao;
}) => {
  const slides = useMemo(() => montarApresentacao(resumo, contexto), [resumo, contexto]);
  return <ApresentacaoEncerramento slides={slides} {...resto} />;
};
