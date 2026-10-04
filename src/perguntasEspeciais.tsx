import React, { useState, useEffect, useRef } from 'react';
import { embaralhar, playSound } from './utils';

// ===== Perguntas em formato especial =====
// A pergunta clássica é `{ pergunta, opcoes, correta }` (4 alternativas ou
// Verdadeiro/Falso). Estas usam o campo `tipo` e têm estrutura própria:
//
//   multipla  — { opcoes: string[4], corretas: number[] }   marcar TODAS as certas
//   ordenar   — { itens: string[] }   na ordem certa; o aluno vê embaralhado
//   pares     — { pares: [string, string][] }   ligar esquerda ↔ direita
//   digitar   — { resposta: string, aceitas?: string[] }   tolera erro de digitação
//   relampago — { itens: { texto, verdadeiro }[] }   5 V/F com 5 s cada
//
// Cada uma ainda conta como UMA pergunta do dia (acertou ou não), e o XP de um
// acerto fica na mesma faixa da clássica (75–100 × multiplicador): o relatório
// de temporada usa essa faixa para inferir "estudou no dia certo" em registros
// antigos (relatorioTemporada.ts:faixaXP), e um bônus fora dela confundiria a
// conta. O modo Ao Vivo não usa estas perguntas (a sala só sabe desenhar
// alternativas) — ver selecionarPerguntasSala.
export const TIPOS_ESPECIAIS = ['multipla', 'ordenar', 'pares', 'digitar', 'relampago'] as const;
export type TipoEspecial = typeof TIPOS_ESPECIAIS[number];
export const ehEspecial = (q: any): boolean => !!q && TIPOS_ESPECIAIS.includes(q.tipo);

export const RELAMPAGO_SEG_POR_ITEM = 5;
export const RELAMPAGO_MIN_ACERTOS = 4;

// Tempo do cronômetro principal por tipo: arrumar 4 itens ou digitar pede mais
// que tocar num botão. A relâmpago tem relógio próprio (por afirmação).
export const duracaoPergunta = (q: any): number => {
  switch (q?.tipo) {
    case 'ordenar': return 60;
    case 'pares': return 60;
    case 'multipla': return 45;
    case 'digitar': return 45;
    default: return 40;
  }
};

const textoOk = (s: any) => typeof s === 'string' && s.trim().length > 0;

// Saneamento: a mesma ideia do Quiz clássico — pergunta malformada some da
// rodada em vez de derrubar a tela. Devolve a pergunta pronta para jogar
// (com a ordem de exibição já sorteada) ou null.
export const prepararEspecial = (q: any): any | null => {
  if (!ehEspecial(q) || !textoOk(q.pergunta)) return null;
  switch (q.tipo as TipoEspecial) {
    case 'multipla': {
      const opcoes = Array.isArray(q.opcoes) ? q.opcoes : [];
      const corretas = Array.isArray(q.corretas) ? q.corretas : [];
      if (opcoes.length < 3 || opcoes.length > 4 || !opcoes.every(textoOk)) return null;
      if (!corretas.length || !corretas.every((i: any) => Number.isInteger(i) && i >= 0 && i < opcoes.length)) return null;
      const ordem = embaralhar(opcoes.map((_: string, i: number) => i));
      return { ...q, opcoes: ordem.map((i: number) => opcoes[i]), corretas: corretas.map((c: number) => ordem.indexOf(c)) };
    }
    case 'ordenar': {
      const itens = Array.isArray(q.itens) ? q.itens : [];
      if (itens.length < 3 || itens.length > 5 || !itens.every(textoOk) || new Set(itens).size !== itens.length) return null;
      let ordem = embaralhar(itens.map((_: string, i: number) => i));
      // Embaralhar pode devolver a própria ordem certa — aí não há o que fazer.
      if (ordem.every((v: number, i: number) => v === i)) ordem = [...ordem.slice(1), ordem[0]];
      return { ...q, embaralhados: ordem };
    }
    case 'pares': {
      const pares = Array.isArray(q.pares) ? q.pares : [];
      if (pares.length < 3 || pares.length > 4) return null;
      if (!pares.every((p: any) => Array.isArray(p) && p.length === 2 && textoOk(p[0]) && textoOk(p[1]))) return null;
      if (new Set(pares.map((p: string[]) => p[1])).size !== pares.length) return null;
      return { ...q, direita: embaralhar(pares.map((_: any, i: number) => i)) };
    }
    case 'digitar': {
      if (!textoOk(q.resposta)) return null;
      return q;
    }
    case 'relampago': {
      const itens = Array.isArray(q.itens) ? q.itens : [];
      if (itens.length < 3 || itens.length > 6) return null;
      if (!itens.every((it: any) => it && textoOk(it.texto) && typeof it.verdadeiro === 'boolean')) return null;
      return q;
    }
  }
  return null;
};

// ===== Digitar: comparação tolerante =====
// Sem acento, sem pontuação, sem artigo na frente ("o Filho" = "filho"), e um
// erro de digitação por palavra curta (dois nas longas). Nome próprio errado
// por uma letra conta como certo: o objetivo é lembrar, não soletrar.
export const normalizarResposta = (s: string) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^(o|a|os|as|um|uma) /, '');

const distancia = (a: string, b: string) => {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
};

export const respostaConfere = (digitado: string, q: any): boolean => {
  const d = normalizarResposta(digitado);
  if (!d) return false;
  return [q.resposta, ...(Array.isArray(q.aceitas) ? q.aceitas : [])].some((alvo: string) => {
    const a = normalizarResposta(alvo);
    if (!a) return false;
    const tolerancia = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
    return distancia(d, a) <= tolerancia;
  });
};

// ===== Componentes =====
// Todos recebem `revelado` do Quiz: vira true quando o aluno confirma OU quando
// o tempo acaba. Ao revelar, mostram a solução certa ao lado do que o aluno fez.

type Props = { q: any; revelado: boolean; onResponder: (ok: boolean, extra?: any) => void };

const BTNS = ['qA', 'qB', 'qC', 'qD'];

const BotaoConfirmar = ({ habilitado, onClick, rotulo = 'Confirmar' }: any) => (
  <button className={`btn btn-gold esp-confirmar${habilitado ? '' : ' btn-dis'}`} disabled={!habilitado} onClick={onClick}>{rotulo}</button>
);

const Multipla = ({ q, revelado, onResponder }: Props) => {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const alternar = (i: number) => setMarcadas(m => m.includes(i) ? m.filter(x => x !== i) : [...m, i]);
  const confirmar = () => {
    const certas = [...q.corretas].sort().join(',');
    onResponder([...marcadas].sort().join(',') === certas);
  };
  return (
    <>
      <div className="esp-dica">☑️ Marque <b>todas</b> as corretas — pode ser mais de uma</div>
      <div className="quiz-grid">
        {q.opcoes.map((op: string, i: number) => {
          const marcada = marcadas.includes(i);
          const certa = q.corretas.includes(i);
          let ex = '';
          if (revelado) ex = certa ? (marcada ? ' correct' : ' esp-faltou') : (marcada ? ' wrong' : ' locked');
          else if (marcada) ex = ' esp-marcada';
          return (
            <button key={i} className={`qbtn ${BTNS[i]}${ex}`} onClick={() => alternar(i)} disabled={revelado}>
              <span className="sym">{marcada ? '☑️' : '⬜'}</span>
              <span style={{ fontSize: 13, lineHeight: 1.3 }}>{op}</span>
            </button>
          );
        })}
      </div>
      {!revelado && <BotaoConfirmar habilitado={marcadas.length > 0} onClick={confirmar} />}
    </>
  );
};

const Ordenar = ({ q, revelado, onResponder }: Props) => {
  // `escolhidos` guarda índices ORIGINAIS (0 = primeiro na ordem certa).
  const [escolhidos, setEscolhidos] = useState<number[]>([]);
  const restantes = q.embaralhados.filter((i: number) => !escolhidos.includes(i));
  const confirmar = () => onResponder(escolhidos.every((v, pos) => v === pos));
  return (
    <>
      <div className="esp-dica">🔢 Toque nos itens <b>na ordem certa</b>. Toque de novo para desfazer.</div>
      <div className="esp-lista">
        {q.itens.map((_: string, pos: number) => {
          const idx = escolhidos[pos];
          const preenchido = idx !== undefined;
          const ok = revelado && preenchido && idx === pos;
          const cls = revelado ? (ok ? ' esp-ok' : ' esp-erro') : preenchido ? ' esp-cheio' : '';
          return (
            <button key={pos} className={`esp-slot${cls}`} disabled={revelado || !preenchido}
              onClick={() => setEscolhidos(e => e.slice(0, pos))}>
              <span className="esp-num">{pos + 1}</span>
              <span className="esp-txt">{preenchido ? q.itens[idx] : '—'}</span>
              {revelado && !ok && <span className="esp-certo">✔ {q.itens[pos]}</span>}
            </button>
          );
        })}
      </div>
      {!revelado && restantes.length > 0 && (
        <div className="esp-banco">
          {restantes.map((i: number) => (
            <button key={i} className="esp-chip" onClick={() => setEscolhidos(e => [...e, i])}>{q.itens[i]}</button>
          ))}
        </div>
      )}
      {!revelado && <BotaoConfirmar habilitado={restantes.length === 0} onClick={confirmar} />}
    </>
  );
};

const CORES_PAR = ['#FF5C7A', '#8E7BFF', '#FFC93C', '#38E0B0'];

const Pares = ({ q, revelado, onResponder }: Props) => {
  // ligacao[esquerda] = índice ORIGINAL do item da direita escolhido.
  const [ligacao, setLigacao] = useState<(number | undefined)[]>(() => q.pares.map(() => undefined));
  const [selEsq, setSelEsq] = useState<number | null>(null);
  const corDaDireita = (d: number) => {
    const e = ligacao.indexOf(d);
    return e >= 0 ? CORES_PAR[e % CORES_PAR.length] : undefined;
  };
  const tocarEsq = (e: number) => {
    if (ligacao[e] !== undefined) { setLigacao(l => l.map((v, i) => i === e ? undefined : v)); setSelEsq(e); return; }
    setSelEsq(s => s === e ? null : e);
  };
  const tocarDir = (d: number) => {
    const dono = ligacao.indexOf(d);
    if (selEsq === null) {
      if (dono >= 0) setLigacao(l => l.map((v, i) => i === dono ? undefined : v));
      return;
    }
    setLigacao(l => l.map((v, i) => i === selEsq ? d : (v === d ? undefined : v)));
    setSelEsq(null);
  };
  const completo = ligacao.every(v => v !== undefined);
  const confirmar = () => onResponder(ligacao.every((v, i) => v === i));
  return (
    <>
      <div className="esp-dica">🔗 Toque num item da esquerda e depois no seu par da direita</div>
      <div className="esp-pares">
        <div className="esp-col">
          {q.pares.map((p: string[], e: number) => {
            const cor = ligacao[e] !== undefined ? CORES_PAR[e % CORES_PAR.length] : undefined;
            const ok = revelado && ligacao[e] === e;
            const cls = revelado ? (ok ? ' esp-ok' : ' esp-erro') : selEsq === e ? ' esp-sel' : '';
            return (
              <button key={e} className={`esp-par${cls}`} disabled={revelado} onClick={() => tocarEsq(e)}
                style={cor && !revelado ? { borderColor: cor, boxShadow: `inset 6px 0 0 ${cor}` } : undefined}>
                {p[0]}
                {revelado && !ok && <span className="esp-certo">✔ {p[1]}</span>}
              </button>
            );
          })}
        </div>
        <div className="esp-col">
          {q.direita.map((d: number) => {
            const cor = corDaDireita(d);
            return (
              <button key={d} className={`esp-par${revelado ? ' locked' : ''}`} disabled={revelado} onClick={() => tocarDir(d)}
                style={cor && !revelado ? { borderColor: cor, boxShadow: `inset -6px 0 0 ${cor}` } : undefined}>
                {q.pares[d][1]}
              </button>
            );
          })}
        </div>
      </div>
      {!revelado && <BotaoConfirmar habilitado={completo} onClick={confirmar} />}
    </>
  );
};

const Digitar = ({ q, revelado, onResponder }: Props) => {
  const [texto, setTexto] = useState('');
  const [acertou, setAcertou] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const confirmar = () => {
    if (!texto.trim() || revelado) return;
    const ok = respostaConfere(texto, q);
    setAcertou(ok);
    onResponder(ok);
  };
  return (
    <>
      <div className="esp-dica">⌨️ Digite a palavra que falta — acento e pequenos erros não contam</div>
      <input ref={inputRef} className={`esp-input${revelado ? (acertou ? ' esp-ok' : ' esp-erro') : ''}`} value={texto}
        onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
        disabled={revelado} placeholder="Sua resposta" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60} />
      {revelado && <div className="esp-gabarito">Resposta: <b>{q.resposta}</b></div>}
      {!revelado && <BotaoConfirmar habilitado={texto.trim().length > 0} onClick={confirmar} />}
    </>
  );
};

// Relâmpago: tela de largada (o relógio só começa quando o aluno toca), depois
// 5 afirmações em sequência, 5 s cada. Acertar 4 vale a pergunta (75 XP base);
// acertar as 5 vale o máximo (100 XP base) — o bônus de perfeição.
const Relampago = ({ q, revelado, onResponder }: Props) => {
  const [fase, setFase] = useState<'largada' | 'jogo' | 'fim'>('largada');
  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<(boolean | null)[]>([]);
  const [resta, setResta] = useState(RELAMPAGO_SEG_POR_ITEM);
  const [flash, setFlash] = useState<'ok' | 'erro' | null>(null);
  const inicioRef = useRef(0);
  const travaRef = useRef(false);
  const total = q.itens.length;

  const responder = (v: boolean | null) => {
    if (travaRef.current) return;
    travaRef.current = true;
    const certo = v !== null && v === q.itens[i].verdadeiro;
    const nr = [...respostas, v];
    setRespostas(nr);
    setFlash(certo ? 'ok' : 'erro');
    if (certo) playSound('correct', { seq: nr.filter((r, k) => r === q.itens[k].verdadeiro).length });
    else playSound('wrong');
    setTimeout(() => {
      setFlash(null);
      if (i + 1 < total) { setI(i + 1); travaRef.current = false; }
      else {
        setFase('fim');
        const acertos = nr.filter((r, k) => r === q.itens[k].verdadeiro).length;
        onResponder(acertos >= Math.min(RELAMPAGO_MIN_ACERTOS, total), { acertos, total, perfeito: acertos === total });
      }
    }, 550);
  };

  useEffect(() => {
    if (fase !== 'jogo') return;
    inicioRef.current = Date.now();
    setResta(RELAMPAGO_SEG_POR_ITEM);
    const t = setInterval(() => {
      const r = Math.max(0, RELAMPAGO_SEG_POR_ITEM - (Date.now() - inicioRef.current) / 1000);
      setResta(r);
      if (r <= 0) { clearInterval(t); responder(null); }
    }, 60);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, i]);

  if (fase === 'largada') {
    return (
      <div className="esp-relampago-largada">
        <div style={{ fontSize: 54, lineHeight: 1 }}>⚡</div>
        <div className="esp-relampago-titulo">Rodada relâmpago!</div>
        <div className="esp-relampago-regra">
          {total} afirmações · {RELAMPAGO_SEG_POR_ITEM} segundos cada<br />
          Acerte {Math.min(RELAMPAGO_MIN_ACERTOS, total)} para valer a pergunta.<br />
          Acerte <b>todas</b> e ganhe o XP máximo! 🔥
        </div>
        <BotaoConfirmar habilitado onClick={() => setFase('jogo')} rotulo="Valendo! ⚡" />
      </div>
    );
  }

  if (fase === 'jogo' && !revelado) {
    const it = q.itens[i];
    const pct = resta / RELAMPAGO_SEG_POR_ITEM * 100;
    return (
      <div className={`esp-relampago${flash ? ` esp-flash-${flash}` : ''}`}>
        <div className="esp-relampago-topo">
          <span>⚡ {i + 1}/{total}</span>
          <span style={{ color: pct > 40 ? 'var(--success)' : '#E31C3D' }}>{Math.ceil(resta)}s</span>
        </div>
        <div className="timer-wrap" style={{ marginBottom: 14 }}>
          <div className="timer-bar" style={{ width: pct + '%', background: pct > 40 ? '#2ECC71' : '#E31C3D' }} />
        </div>
        <div className="esp-relampago-afirmacao">{it.texto}</div>
        <div className="quiz-grid vf">
          <button className="qbtn qD" onClick={() => responder(true)} disabled={!!flash}><span className="sym">✔️</span>Verdadeiro</button>
          <button className="qbtn qA" onClick={() => responder(false)} disabled={!!flash}><span className="sym">✖️</span>Falso</button>
        </div>
      </div>
    );
  }

  // Fim (ou tempo esgotado pelo Quiz): o placar das afirmações com o gabarito.
  return (
    <div className="esp-lista">
      {q.itens.map((it: any, k: number) => {
        const r = respostas[k];
        const ok = r === it.verdadeiro;
        return (
          <div key={k} className={`esp-slot esp-relampago-item${ok ? ' esp-ok' : ' esp-erro'}`}>
            <span className="esp-num">{ok ? '✓' : '✗'}</span>
            <span className="esp-txt">{it.texto}<span className="esp-certo">{it.verdadeiro ? 'Verdadeiro' : 'Falso'}{r === null || r === undefined ? ' · sem resposta' : ''}</span></span>
          </div>
        );
      })}
    </div>
  );
};

export const PerguntaEspecial = (props: Props) => {
  switch (props.q.tipo as TipoEspecial) {
    case 'multipla': return <Multipla {...props} />;
    case 'ordenar': return <Ordenar {...props} />;
    case 'pares': return <Pares {...props} />;
    case 'digitar': return <Digitar {...props} />;
    case 'relampago': return <Relampago {...props} />;
  }
  return null;
};

// Rótulo curto para o editor do admin e para o cabeçalho da pergunta.
export const ROTULO_TIPO: Record<TipoEspecial, string> = {
  multipla: '☑️ Mais de uma correta',
  ordenar: '🔢 Coloque em ordem',
  pares: '🔗 Ligue os pares',
  digitar: '⌨️ Complete digitando',
  relampago: '⚡ Rodada relâmpago',
};

// Resumo legível do gabarito (editor do admin).
export const resumoGabarito = (q: any): string => {
  switch (q?.tipo as TipoEspecial) {
    case 'multipla': return (q.corretas || []).map((i: number) => q.opcoes?.[i]).join(' · ');
    case 'ordenar': return (q.itens || []).join(' → ');
    case 'pares': return (q.pares || []).map((p: string[]) => `${p[0]} ↔ ${p[1]}`).join(' · ');
    case 'digitar': return q.resposta || '';
    case 'relampago': return (q.itens || []).map((it: any) => `${it.verdadeiro ? 'V' : 'F'} — ${it.texto}`).join('\n');
  }
  return '';
};
