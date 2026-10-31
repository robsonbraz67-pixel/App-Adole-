import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { loadTrackLessonsComHistorico } from './data';
import { listenToWeekProgress } from './firebase';
import {
  aggregateWeekRanking, hojeLocalISO, ehRankingMisto, somLigado, tocarSorteioTambor, tocarEfeito,
  precarregarSorteioTambor, precarregarEfeitos, ATAQUE_S, SomTocando,
} from './utils';
import { situacaoSorteioSemanal } from './relatorioTemporada';
import { Confetti, COR_TRILHA_MISTA, useTurmaAtiva, useRegraSemana, AlternarRegraSemana, Track } from './components';
import { SlideSorteio } from './Apresentacao';

// ===== TELÃO AO VIVO: campeões → ranking → sorteio =====
//
// Três cenas no mesmo palco 16:9 (.st-palco + quadro em cqh, como o telão do
// Sorteador e a Apresentação). Diferente da Apresentação, que é um roteiro
// linear de slides, aqui as cenas ficam TODAS montadas: ir ao sorteio e voltar
// ao ranking não perde nada. Abre nos campeões: o pódio é a abertura, e o
// ranking completo vem depois dele — o pódio continua revelado e quem já saiu
// sorteado continua na lista. O ranking é a mesma assinatura ao vivo do app
// (listenToWeekProgress por turma): quem termina o quiz sobe na tela na hora.
//
// Teclas: 1/2/3 escolhem a cena, ←/→ andam entre elas, Espaço revela o pódio
// (um lugar por vez, do 3º ao 1º) ou sorteia, Esc sai.

type Cena = 'ranking' | 'campeoes' | 'sorteio';
const CENAS: { k: Cena; rotulo: string; tecla: string }[] = [
  { k: 'campeoes', rotulo: '👑 Campeões', tecla: '1' },
  { k: 'ranking', rotulo: '🏆 Ranking', tecla: '2' },
  { k: 'sorteio', rotulo: '🎰 Sorteio', tecla: '3' },
];

const fmt = (n: number) => (n || 0).toLocaleString('pt-BR');
const primeiroNome = (n?: string) => (n || '').trim().split(/\s+/)[0] || '—';
const MAX_LINHAS = 20;

const Av = ({ a, className = '' }: { a?: string; className?: string }) =>
  a && a.length > 10
    ? <img src={a} className={`${className} img`} alt="" />
    : <span className={className}>{a || '👤'}</span>;

// ---------- cena 2: ranking ao vivo ----------
// Linhas em posição absoluta: quando a assinatura reordena, cada linha DESLIZA
// até o lugar novo (transição de top/left) em vez de pular.
const CenaRanking = ({ alunos, licao, turmaNome, misto, subiram }: {
  alunos: any[]; licao: any; turmaNome: string; misto: boolean; subiram: Set<string>;
}) => {
  const lista = alunos.slice(0, MAX_LINHAS);
  const cols = lista.length > 8 ? 2 : 1;
  const porCol = Math.max(1, Math.ceil(lista.length / cols));
  const h = Math.min(9, 62 / porCol);
  const hoje = hojeLocalISO();
  return (
    <div className="tv-ranking">
      <div className="tv-cab">
        <div className="tv-eyebrow">Ranking da semana · {turmaNome}</div>
        <div className="tv-titulo">{(licao?.titulo || '').replace(/\s*\([^)]*\)\s*$/, '')}</div>
        {misto && (
          <div className="tv-legenda">
            {(['youngAdult', 'adult'] as Track[]).map(t => (
              <span key={t}><i style={{ background: COR_TRILHA_MISTA[t]!.cor }} />{COR_TRILHA_MISTA[t]!.rotulo}</span>
            ))}
          </div>
        )}
      </div>
      {lista.length === 0 ? (
        <div className="tv-vazio">Ninguém pontuou ainda nesta semana. 📖</div>
      ) : (
        <div className="tv-lista" style={{ ['--h' as any]: h }}>
          {lista.map((r, i) => {
            const col = Math.floor(i / porCol), lin = i % porCol;
            const sit = licao?.dias?.length ? situacaoSorteioSemanal(r, licao, hoje).status : null;
            const cor = misto ? COR_TRILHA_MISTA[(r.track || 'teen') as Track]?.cor : undefined;
            return (
              <div key={r.id}
                className={`tv-linha${i < 3 ? ` top${i + 1}` : ''}${subiram.has(r.id) ? ' subiu' : ''}`}
                style={{
                  top: `${lin * h}cqh`, height: `${h - 0.9}cqh`,
                  left: cols === 2 ? (col ? '51%' : '0%') : '14%', width: cols === 2 ? '49%' : '72%',
                  ...(cor ? { borderLeft: `1.1cqh solid ${cor}` } : {}),
                }}>
                <span className="pos">{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}º`}</span>
                <Av a={r.avatar} className="av" />
                <span className="nome">{r.nome}</span>
                {sit === 'dentro' && <span className="tag" title="No sorteio da semana">🎰</span>}
                <span className="dias">📅 {r.dias || 0}</span>
                <span className="xp">{fmt(r.xp)} <small>XP</small></span>
              </div>
            );
          })}
        </div>
      )}
      {alunos.length > MAX_LINHAS && <div className="tv-mais">+ {alunos.length - MAX_LINHAS} na turma</div>}
    </div>
  );
};

// ---------- cena 1: campeões (pódio premium) ----------
const METAL = ['ouro', 'prata', 'bronze'];
const CenaCampeoes = ({ top, revelados, suspense, misto }: {
  top: any[]; revelados: number; suspense: boolean; misto: boolean;
}) => {
  const k = top.length;
  const ordem = k >= 3 ? [1, 0, 2] : k === 2 ? [1, 0] : [0];
  const aberto = (p: number) => p >= k - revelados;
  return (
    <div className="tv-campeoes">
      {revelados >= k && k > 0 && <Confetti show={true} />}
      <div className="tv-holofote esq" /><div className="tv-holofote dir" />
      <div className="tv-cab centro">
        <div className="tv-eyebrow ouro">Campeões da semana</div>
        {revelados === 0 && k > 0 && <div className="tv-dica">Aperte Espaço para revelar o 3º lugar</div>}
      </div>
      {k === 0 ? (
        <div className="tv-vazio">O pódio aparece quando alguém pontuar. 🏆</div>
      ) : (
        <div className="tv-podio" style={{ ['--n' as any]: ordem.length }}>
          {ordem.map(p => {
            const u = top[p];
            const ok = aberto(p);
            const esperando = !ok && suspense && p === 0;
            const cor = misto ? COR_TRILHA_MISTA[(u.track || 'teen') as Track]?.cor : undefined;
            return (
              <div key={p} className={`tv-lugar ${METAL[p]}${ok ? ' aberto' : ''}${esperando ? ' tenso' : ''}`}>
                {p === 0 && ok && <div className="tv-raios" aria-hidden="true" />}
                <div className="tv-campeao">
                  {p === 0 && ok && <div className="tv-coroa">👑</div>}
                  <div className="tv-anel">
                    {ok ? <Av a={u.avatar} className="av" /> : <span className="av misterio">?</span>}
                  </div>
                  <div className="tv-nome">{ok ? u.nome : esperando ? 'Quem será?' : '· · ·'}</div>
                  {ok && (
                    <div className="tv-num">
                      {fmt(u.xp)} XP · 📅 {u.dias || 0} dia{u.dias === 1 ? '' : 's'}
                      {cor && <i className="tv-trilha" style={{ background: cor }} />}
                    </div>
                  )}
                </div>
                <div className="tv-pedestal"><span>{p + 1}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------- o palco ----------
export const TelaoAoVivo = ({ licao: licaoInicial, jogador, onSair }: { licao: any; jogador: any; onSair: () => void }) => {
  const conducao = useTurmaAtiva(jogador);
  const turma = conducao.turma;
  const turmaId = conducao.turmaId;
  const [cena, setCena] = useState<Cena>('campeoes');
  const [dir, setDir] = useState<1 | -1>(1);

  // A lição da trilha DA TURMA na mesma semana (as semanas são ISO, iguais em
  // todas as trilhas): é dela que saem os dias do sorteio e o título.
  const [licao, setLicao] = useState<any>(licaoInicial);
  useEffect(() => {
    if (!turma?.track) return;
    let vivo = true;
    loadTrackLessonsComHistorico(turma.track)
      .then(ls => { if (vivo) setLicao((ls || []).find((l: any) => l.semana === licaoInicial?.semana) || licaoInicial); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [turma?.track, licaoInicial?.semana]);

  // Ranking ao vivo da turma escolhida.
  const [linhas, setLinhas] = useState<any[]>([]);
  const xpAntes = useRef<Map<string, number>>(new Map());
  const [subiram, setSubiram] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!turmaId || !licao?.semana) return;
    setLinhas([]);
    xpAntes.current = new Map();
    return listenToWeekProgress(licao.semana, rows => {
      const agregadas = aggregateWeekRanking(rows.filter((r: any) => r.turmaId === turmaId));
      // Quem ganhou XP desde a última foto pisca na tela — é o "acabou de
      // terminar o quiz" visível do fundo da sala.
      const novos = new Set<string>();
      if (xpAntes.current.size) {
        agregadas.forEach((r: any) => { if ((r.xp || 0) > (xpAntes.current.get(r.id) ?? 0)) novos.add(r.id); });
      }
      xpAntes.current = new Map(agregadas.map((r: any) => [r.id, r.xp || 0]));
      setLinhas(agregadas);
      if (novos.size) setSubiram(novos);
    }, turmaId);
  }, [turmaId, licao?.semana]);
  useEffect(() => {
    if (!subiram.size) return;
    const t = setTimeout(() => setSubiram(new Set()), 2600);
    return () => clearTimeout(t);
  }, [subiram]);

  const alunos = useMemo(() => linhas.filter(r => !r.isAdmin && !r.isProfessor), [linhas]);
  const misto = ehRankingMisto(alunos);

  // Pódio: revela do 3º ao 1º. A foto do top 3 CONGELA na primeira revelação —
  // sem isso, alguém terminando o quiz no meio da cerimônia trocaria o nome
  // que acabou de ser anunciado. Trocar de turma ou semana fecha tudo de novo.
  const [revelados, setRevelados] = useState(0);
  const [suspense, setSuspense] = useState(false);
  const [podioFixo, setPodioFixo] = useState<any[] | null>(null);
  const top = podioFixo || alunos.slice(0, 3);
  const esconderPodio = () => { setRevelados(0); setPodioFixo(null); };
  const sons = useRef<SomTocando[]>([]);
  const vivo = useRef(true);
  useEffect(() => { esconderPodio(); setSuspense(false); }, [turmaId, licao?.semana]);
  useEffect(() => {
    vivo.current = true;
    precarregarSorteioTambor();
    precarregarEfeitos(['impacto', 'fanfarra', 'aplausos', 'whoosh']);
    return () => { vivo.current = false; sons.current.forEach(s => s.parar(0.5)); };
  }, []);
  const guardar = (p: Promise<SomTocando | null>) => p.then(s => { if (s) sons.current.push(s); });

  const revelarProximo = useCallback(async () => {
    const k = top.length;
    if (!k || suspense || revelados >= k) return;
    if (!podioFixo) setPodioFixo(top);
    const pos = k - revelados - 1;
    if (pos > 0) {
      guardar(tocarEfeito('impacto', { vol: 0.7, desde: ATAQUE_S.impacto - 0.05 }));
      guardar(tocarEfeito('aplausos', { vol: 0.4, dur: 5, em: 0.3 }));
      setRevelados(r => r + 1);
      return;
    }
    // 1º lugar: rufar, e o nome entra na batida.
    setSuspense(true);
    const tambor = somLigado() ? await tocarSorteioTambor() : null;
    const espera = tambor ? Math.max(0, (tambor.batidaEm - tambor.ctx.currentTime) * 1000) : 2200;
    setTimeout(() => {
      if (!vivo.current) return;
      setSuspense(false);
      setRevelados(r => r + 1);
      guardar(tocarEfeito('fanfarra', { vol: 0.6 }));
      guardar(tocarEfeito('aplausos', { vol: 0.55, dur: 9, em: 1.2 }));
    }, espera);
  }, [top, podioFixo, revelados, suspense]);

  // O sorteio só monta na primeira visita: assim os participantes saem da
  // foto de QUANDO se chega nele (depois da lição feita na hora), e não da
  // abertura do telão. Depois disso fica montado — voltar não apaga nada.
  const [sorteioMontado, setSorteioMontado] = useState(false);
  useEffect(() => { if (cena === 'sorteio') setSorteioMontado(true); }, [cena]);
  useEffect(() => { setSorteioMontado(cena === 'sorteio'); }, [turmaId, licao?.semana]);
  const teclaSorteio = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const [regraSemana, setRegraSemana] = useRegraSemana();

  const irPara = useCallback((c: Cena) => {
    setCena(atual => {
      if (atual === c) return atual;
      setDir(CENAS.findIndex(x => x.k === c) > CENAS.findIndex(x => x.k === atual) ? 1 : -1);
      tocarEfeito('whoosh', { vol: 0.22, desde: ATAQUE_S.whoosh - 0.12 });
      return c;
    });
  }, []);
  const andar = useCallback((passo: 1 | -1) => {
    const i = CENAS.findIndex(x => x.k === cena) + passo;
    if (i >= 0 && i < CENAS.length) irPara(CENAS[i].k);
  }, [cena, irPara]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Escape') { onSair(); return; }
      const c = CENAS.find(x => x.tecla === e.key);
      if (c) { e.preventDefault(); irPara(c.k); return; }
      if (cena === 'sorteio' && teclaSorteio.current?.(e)) { e.preventDefault(); return; }
      if (cena === 'campeoes' && [' ', 'Enter', 'ArrowRight', 'PageDown'].includes(e.key) && revelados < top.length) {
        e.preventDefault(); revelarProximo(); return;
      }
      if (['ArrowRight', 'PageDown'].includes(e.key) || (cena === 'campeoes' && [' ', 'Enter'].includes(e.key))) { e.preventDefault(); andar(1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); andar(-1); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cena, revelados, top.length, revelarProximo, andar, irPara, onSair]);

  const idxCena = CENAS.findIndex(x => x.k === cena);
  const classeCena = (c: Cena) => {
    const i = CENAS.findIndex(x => x.k === c);
    return `tv-cena${i === idxCena ? ' ativa' : i < idxCena ? ' antes' : ' depois'}`;
  };

  return createPortal(
    <div className="st-palco tv-palco" role="dialog" aria-modal="true" aria-label="Telão: campeões, ranking e sorteio">
      <div className="tv-tela" data-dir={dir}>
        <div className="tv-topo">
          <nav className="tv-nav" style={{ ['--i' as any]: idxCena }}>
            <span className="tv-nav-luz" aria-hidden="true" />
            {CENAS.map(c => (
              <button key={c.k} className={cena === c.k ? 'on' : ''} onClick={() => irPara(c.k)}>
                {c.rotulo}<kbd>{c.tecla}</kbd>
              </button>
            ))}
          </nav>
          {conducao.turmas.length > 1 && (
            <select className="tv-turma" value={turmaId} onChange={e => conducao.escolher(e.target.value)} aria-label="Turma">
              {conducao.turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          )}
        </div>

        <div className="tv-cenas">
          <section className={classeCena('ranking')} aria-hidden={cena !== 'ranking'}>
            <CenaRanking alunos={alunos} licao={licao} turmaNome={turma?.nome || ''} misto={misto} subiram={subiram} />
          </section>
          <section className={classeCena('campeoes')} aria-hidden={cena !== 'campeoes'}>
            {cena === 'campeoes' || revelados > 0
              ? <CenaCampeoes top={top} revelados={revelados} suspense={suspense} misto={misto} />
              : null}
            {cena === 'campeoes' && revelados < top.length && !suspense && (
              <button className="btn btn-gold tv-revelar" onClick={revelarProximo}>
                ✨ Revelar {top.length - revelados}º lugar
              </button>
            )}
            {cena === 'campeoes' && revelados > 0 && !suspense && (
              <button className="tv-refazer" onClick={esconderPodio} title="Esconder o pódio de novo (pega o top 3 atual)">↺</button>
            )}
          </section>
          <section className={classeCena('sorteio')} aria-hidden={cena !== 'sorteio'}>
            {sorteioMontado && turma && licao && (
              <SlideSorteio
                key={`${turmaId}_${licao.semana}`}
                modo="semana" licao={licao} turmaId={turmaId} track={turma.track} turmaNome={turma.nome} jogador={jogador}
                registrarTecla={fn => { teclaSorteio.current = fn; }}
                regraSemana={regraSemana}
                topo={<AlternarRegraSemana regra={regraSemana} onTrocar={setRegraSemana} className="tv-regra" />}
              />
            )}
          </section>
        </div>

        <div className="tv-rodape">
          1 · 2 · 3 escolhem a cena · ← → navegam · Espaço revela o pódio ou sorteia · Esc sai
        </div>
      </div>
      <button className="st-sair" onClick={onSair} aria-label="Sair do telão">✕</button>
    </div>,
    document.body
  );
};
