import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { loadTrackLessons } from './data';
import { hojeLocalISO, somLigado, tocarSorteioTambor, precarregarSorteioTambor, tocarEfeito, precarregarEfeitos } from './utils';
import { getSeasonProgress, getUsersDaTurma, registrarSorteio } from './firebase';
import {
  montarResumoTemporada, perfisDosAlunos, conquistasDosAlunos, pistasDoPodio, tituloCurtoDaLicao, totalDeDias,
  ResumoTemporada, PerfilAluno, Licao,
} from './relatorioTemporada';
import { REGRA_TEXTO, RegraSorteio, Participante } from './sorteio';
import {
  Confetti, SeletorLicao, SeletorTurmaAtiva, useTurmaAtiva, useSorteador, AvatarSorteio, detalheDoGanhador,
  BotaoRegistrar, EstadoRegistro,
} from './components';

// ===== APRESENTAÇÃO DE ENCERRAMENTO (semana ou temporada) =====
//
// A versão dentro do app do PPT de encerramento de Provado pelo Fogo: os
// slides se montam sozinhos a partir do progresso da turma, com as regras de
// src/relatorioTemporada.ts (ver docs/relatorio-temporada.md) e as técnicas
// de condução de docs/manual-apresentacao-encerramento.md (tecla N mostra a
// dica de cada slide). O palco é o mesmo do telão do Sorteador — quadro 16:9
// medido em cqh — e o slide do sorteio usa o useSorteador de verdade.

type Modo = 'semana' | 'temporada';

export type Dados = {
  modo: Modo;
  resumo: ResumoTemporada;
  perfis: PerfilAluno[];
  conquistas: Record<string, string>;
  pistas: string[][];           // [1º, 2º, 3º]
  licoes: Licao[];
  rotulo: string;               // "Provado pelo Fogo" ou "Lição 3 — Fé Notável"
  turmaNome: string;
  proxima?: { nome: string; licao: string };
};

type TipoSlide = 'capa' | 'numeros' | 'diaMais' | 'melhorSemana' | 'lideranca' | 'maratonistas' | 'chama'
  | 'clube' | 'suspense' | 'misterio' | 'revelacao' | 'turma' | 'sorteio' | 'virada' | 'fechamento';

type Slide = { tipo: TipoSlide; titulo: string; passos: number; pos?: number; nota: string; anim: 'fade' | 'zoom' | 'sobe' | 'lado' };

const NOTAS: Record<TipoSlide, string> = {
  capa: 'Tela preta antes de abrir. Som ambiente subindo nos 3 segundos antes do título.',
  numeros: 'Pergunte antes de revelar: "quantos dias vocês acham que a turma estudou?" Deixe 2 ou 3 chutes em voz alta.',
  diaMais: 'Conte como história, não como dado: o que aconteceu nesse dia? Qual era a lição?',
  melhorSemana: 'Pergunte qual lição foi a mais estudada antes de avançar.',
  lideranca: 'Quem conduz também estudou — puxe um aplauso para a liderança.',
  maratonistas: 'Chame o 1º lugar para ficar em pé enquanto lê o número.',
  chama: 'Leia o número antes do nome e faça 1 segundo de silêncio antes de apontar quem é.',
  clube: 'Chame essas pessoas para ficarem em pé, uma a uma — elas voltam no sorteio.',
  suspense: 'Pausa real de 2 a 3 segundos, em silêncio, olhando para quem está de pé.',
  misterio: 'Leia uma pista por vez, devagar. Deixe a turma chutar entre uma e outra.',
  revelacao: 'O rufar toca sozinho e o nome aparece na batida. Puxe os aplausos!',
  turma: 'Um aluno por vez: leia a conquista, aplausos rápidos, próximo.',
  sorteio: 'Convide alguém que NÃO concorre para apertar Espaço. Quem já saiu vai para baixo.',
  virada: 'Troque o clima: do intenso para o leve. É o único ponto em que a direção muda.',
  fechamento: 'Não deixe a tela vazia: peça para todos abrirem o app e começarem a próxima lição juntos.',
};

const fmt = (n: number) => n.toLocaleString('pt-BR');
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const dataCurta = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const diaDaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()];
const primeiroNome = (n?: string) => (n || '').trim().split(/\s+/)[0] || '—';

// `**trecho**` vira negrito — é como as pistas marcam o que importa.
const Negrito = ({ texto }: { texto: string }) => (
  <>{texto.split('**').map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <React.Fragment key={i}>{t}</React.Fragment>))}</>
);

const Av = ({ a, className = '' }: { a?: string; className?: string }) =>
  a?.startsWith('data:')
    ? <img src={a} className={`${className} ap-av-img`} alt="" />
    : <span className={className}>{a || '👤'}</span>;

// ---------- montar os slides a partir dos dados ----------
export const montarSlides = (d: Dados): Slide[] => {
  const s: Slide[] = [];
  const r = d.resumo;
  const add = (tipo: TipoSlide, titulo: string, anim: Slide['anim'], passos = 1, pos?: number) =>
    s.push({ tipo, titulo, passos, pos, nota: NOTAS[tipo], anim });
  add('capa', 'Capa', 'fade');
  add('numeros', 'Números', 'zoom', 2);
  if (r.diaMaisEstudado[0]) add('diaMais', 'Dia mais estudado', 'lado');
  if (d.modo === 'temporada' && r.melhorSemana.length) add('melhorSemana', 'Melhor semana', 'sobe');
  if (r.liderancaPeloExemplo.length) add('lideranca', 'Liderança pelo exemplo', 'lado');
  if (r.maratonistas.length) add('maratonistas', 'Maratonistas', 'sobe');
  if (r.ofensivaReal[0]?.dias >= 2) add('chama', 'Chama acesa', 'zoom');
  if (r.clubeDaTemporada.length) add('clube', d.modo === 'semana' ? 'Semana completa' : 'Clube da temporada', 'fade');
  const podio = Math.min(3, d.perfis.length);
  if (podio) {
    add('suspense', 'Suspense', 'fade');
    for (let pos = podio - 1; pos >= 0; pos--) {
      add('misterio', `Mistério do ${pos + 1}º lugar`, 'lado', Math.max(1, d.pistas[pos]?.length || 1), pos);
      add('revelacao', `Revelação do ${pos + 1}º lugar`, 'zoom', 1, pos);
    }
  }
  if (d.perfis.length) add('turma', 'A turma inteira', 'sobe', d.perfis.length);
  add('sorteio', 'Sorteio ao vivo', 'zoom');
  if (d.modo === 'temporada' && d.proxima) add('virada', 'Próxima temporada', 'fade');
  add('fechamento', 'Fechamento', 'fade');
  return s;
};

// ---------- carregar os dados da turma ----------
const carregarDados = async (args: {
  modo: Modo; licao: any; turma: any; turmaId: string;
}): Promise<Dados> => {
  const { modo, licao, turma, turmaId } = args;
  const todas: any[] = ((await loadTrackLessons(turma.track)) || []).filter((l: any) => !l.isAdminOnly && l.dias?.length);
  const licoes: Licao[] = modo === 'semana' ? [licao] : todas.filter(l => l.trimestre === licao.trimestre);
  if (!licoes.length) throw new Error('Não achei as lições desse período.');
  const [rows, alunos] = await Promise.all([getSeasonProgress(licoes.map(l => l.semana)), getUsersDaTurma(turmaId)]);
  const linhasDaTurma = (rows as any[]).filter(r => r.turmaId === turmaId && (r.track || 'teen') === turma.track);
  const conduzem = new Set(turma.professores || []);
  const lideranca = (rows as any[]).filter(r => r.isAdmin || conduzem.has(r.userId));
  const criadoEm: Record<string, string> = {};
  for (const a of alunos) if (a.criadoEm) criadoEm[a.id] = String(a.criadoEm).slice(0, 10);
  const hoje = hojeLocalISO();
  const resumo = montarResumoTemporada({
    linhasDaTurma, linhasLiderancaTodasTrilhas: lideranca, licoes, criadoEmPorAluno: criadoEm,
    turmaNome: turma.nome, trimestre: licao.trimestre, hojeISO: hoje,
  });
  const perfis = perfisDosAlunos(linhasDaTurma, licoes, criadoEm, hoje);
  let proxima: Dados['proxima'];
  if (modo === 'temporada') {
    const fim = licoes.map(l => l.dias[l.dias.length - 1]?.data || '').sort().pop() || '';
    const depois = todas
      .filter(l => l.trimestre !== licao.trimestre && (l.dias[0]?.data || '') > fim)
      .sort((a, b) => (a.dias[0].data < b.dias[0].data ? -1 : 1))[0];
    if (depois) proxima = { nome: depois.trimestre, licao: depois.titulo?.replace(/\s*\([^)]*\)\s*$/, '') || '' };
  }
  return {
    modo, resumo, perfis, licoes, proxima,
    conquistas: conquistasDosAlunos(perfis, licoes),
    pistas: [0, 1, 2].map(i => pistasDoPodio(perfis, i, licoes)),
    rotulo: modo === 'semana' ? `${(licao.titulo || '').split(' - ')[0]} — ${tituloCurtoDaLicao(licao)}` : licao.trimestre,
    turmaNome: turma.nome,
  };
};

// ===== Slide: revelação com o rufar sincronizado =====
// Monta de novo a cada entrada no slide (key no pai): o rufar começa, os
// avatares giram e o nome aparece na BATIDA do arquivo — a mesma
// sincronização do Sorteador (SORTEIO_BATIDA_S em utils.ts).
const SlideRevelacao = ({ perfil, candidatos, pos }: { perfil: PerfilAluno; candidatos: PerfilAluno[]; pos: number }) => {
  const [revelado, setRevelado] = useState(false);
  const [giro, setGiro] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    const lista = candidatos.length ? candidatos : [perfil];
    let revelou = false;
    const revelar = () => {
      if (!vivo || revelou) return;
      revelou = true;
      setRevelado(true);
      tocarEfeito('impacto', { vol: 0.7 });
      if (pos === 0) tocarEfeito('fanfarra', { vol: 0.6, em: 0.4 });
      tocarEfeito('aplausos', { vol: 0.55, em: pos === 0 ? 2.4 : 0.8, dur: 8 });
    };
    (async () => {
      const tambor = somLigado() ? await tocarSorteioTambor() : null;
      if (!vivo) return;
      let i = 0;
      if (!tambor) {
        let passos = 0;
        const tick = () => {
          if (!vivo) return;
          setGiro(++i % lista.length);
          if (++passos >= 26) { revelar(); return; }
          timer.current = setTimeout(tick, passos < 14 ? 70 : passos < 21 ? 130 : 220);
        };
        tick();
        return;
      }
      const { ctx, batidaEm } = tambor;
      const limite = setTimeout(revelar, (batidaEm - ctx.currentTime + 1.5) * 1000); // se o relógio de áudio parar
      const tick = () => {
        if (!vivo || revelou) { clearTimeout(limite); return; }
        const restante = batidaEm - ctx.currentTime;
        if (restante <= 0.05) { revelar(); return; }
        setGiro(++i % lista.length);
        timer.current = setTimeout(tick, Math.min(0.26, Math.max(0.055, restante * 0.16), restante) * 1000);
      };
      tick();
    })();
    return () => { vivo = false; if (timer.current) clearTimeout(timer.current); };
  }, []);

  const girando = (candidatos.length ? candidatos : [perfil])[giro];
  return (
    <div className="ap-slide centro ap-revela">
      {revelado && <Confetti show={true} />}
      <div className="ap-eyebrow">{pos + 1}º lugar</div>
      {revelado ? (
        <>
          <Av a={perfil.avatar} className="av ap-pulso" />
          <div className="nome ap-pulso">{perfil.nome}</div>
          <div className="ap-sub">{fmt(perfil.xp)} XP · {perfil.dias} dias</div>
        </>
      ) : (
        <>
          <Av a={girando?.avatar} className="av" />
          <div className="nome girando">{primeiroNome(girando?.nome)}</div>
          <div className="ap-sub">Quem será?</div>
        </>
      )}
    </div>
  );
};

// ===== Slide: sorteio ao vivo (o Sorteador de verdade) =====
const SlideSorteio = ({ modo, licao, turmaId, track, turmaNome, jogador, registrarTecla }: {
  modo: Modo; licao: any; turmaId: string; track: string; turmaNome: string; jogador: any;
  registrarTecla: (fn: ((e: KeyboardEvent) => boolean) | null) => void;
}) => {
  const regra: RegraSorteio = modo === 'semana' ? 'semana-completa' : 'temporada-tudo';
  const { users, ganhador, idx, animando, loading, carregar, iniciar, sorteados } = useSorteador(licao, turmaId, track, regra);
  const [registro, setRegistro] = useState<EstadoRegistro>('livre');
  useEffect(() => { carregar(); }, []);
  useEffect(() => { setRegistro('livre'); }, [ganhador]);

  const sorteadosIds = new Set(sorteados.map(u => u.id));
  const naFila = users.filter(u => !sorteadosIds.has(u.id));
  const atual = users[idx];

  // Espaço/Enter sorteiam neste slide (→ continua avançando).
  useEffect(() => {
    registrarTecla((e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !animando && naFila.length > 0) { iniciar(); return true; }
      return false;
    });
    return () => registrarTecla(null);
  }, [animando, naFila.length, iniciar]);

  const registrar = async () => {
    if (!ganhador || registro === 'salvando' || registro === 'salvo') return;
    setRegistro('salvando');
    try {
      await registrarSorteio({
        turmaId, track, tipo: modo, periodo: modo === 'semana' ? licao.semana : licao.trimestre, regra,
        ganhadorId: ganhador.id,
        ganhadorNome: (ganhador.nome || 'Sem nome').slice(0, 80),
        ganhadorAvatar: ganhador.avatar?.startsWith('data:') ? '' : (ganhador.avatar || '').slice(0, 64),
        participantes: users.length,
        bilhetes: Math.max(users.reduce((s, u) => s + u.bilhetes, 0), users.length),
        sorteadoPor: jogador.id,
        sorteadoPorNome: (jogador.nome || 'Liderança').slice(0, 80),
      });
      setRegistro('salvo');
    } catch (e) {
      console.error('registrarSorteio', e);
      setRegistro('erro');
    }
  };

  return (
    <div className="ap-slide centro">
      {ganhador && !animando && <Confetti show={true} />}
      <div className="ap-eyebrow">Sorteio ao vivo · {turmaNome}</div>
      <div className="ap-sub">{REGRA_TEXTO[regra]}</div>
      {loading ? (
        <div className="ap-sub">Carregando participantes…</div>
      ) : users.length === 0 ? (
        <div className="ap-sub">Ninguém concorre neste período.</div>
      ) : ganhador && !animando ? (
        <div className="ap-revela">
          <AvatarSorteio u={ganhador} className="av ap-pulso" />
          <div className="nome ap-pulso">{ganhador.nome}</div>
          <div className="ap-sub">{detalheDoGanhador(ganhador as Participante, regra)}</div>
        </div>
      ) : animando ? (
        <div className="ap-revela">
          <AvatarSorteio u={atual} className="av" />
          <div className="nome girando">{primeiroNome(atual?.nome)}</div>
        </div>
      ) : (
        <div className="ap-chips">
          {naFila.map(u => <span key={u.id} className="ap-chip"><AvatarSorteio u={u} className="" />{primeiroNome(u.nome)}</span>)}
        </div>
      )}
      {users.length > 0 && (
        <div className="ap-acoes">
          <button className={`btn btn-gold st-btn${animando || !naFila.length ? ' btn-dis' : ''}`} onClick={iniciar} disabled={animando || !naFila.length}>
            {animando ? '🎰 Sorteando…' : !naFila.length ? 'Todos já sorteados' : ganhador ? '🔁 Sortear de novo' : '🎰 Sortear!'}
          </button>
          {ganhador && !animando && <BotaoRegistrar estado={registro} onRegistrar={registrar} className="st-btn st-btn-reg" />}
        </div>
      )}
      {sorteados.length > 0 && (
        <div className="ap-chips ap-sorteados">
          {sorteados.map((u, i) => <span key={u.id} className="ap-chip done"><b>{i + 1}º</b>{primeiroNome(u.nome)}</span>)}
        </div>
      )}
    </div>
  );
};

// ===== O palco =====
export const Palco = ({ dados, slides, licao, turmaId, track, jogador, onSair }: {
  dados: Dados; slides: Slide[]; licao: any; turmaId: string; track: string; jogador: any; onSair: () => void;
}) => {
  const [i, setI] = useState(0);
  const [passo, setPasso] = useState(0);
  const [nota, setNota] = useState(false);
  const teclaDoSlide = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const slide = slides[i];
  const r = dados.resumo;

  useEffect(() => { precarregarSorteioTambor(); precarregarEfeitos(['whoosh', 'impacto', 'fanfarra', 'aplausos', 'sino']); }, []);

  const avancar = useCallback(() => {
    if (passo < slide.passos - 1) setPasso(p => p + 1);
    else if (i < slides.length - 1) { setI(x => x + 1); setPasso(0); }
  }, [passo, slide, i, slides.length]);
  const voltar = useCallback(() => {
    if (passo > 0) setPasso(p => p - 1);
    else if (i > 0) { const ant = slides[i - 1]; setI(x => x - 1); setPasso(ant.passos - 1); }
  }, [passo, i, slides]);

  // Sons que acompanham um passo específico.
  useEffect(() => {
    if (slide.tipo === 'numeros' && passo === 1) tocarEfeito('whoosh', { vol: 0.7 });
    if (slide.tipo === 'virada') tocarEfeito('sino', { vol: 0.6 });
    if (slide.tipo === 'misterio' && passo > 0) tocarEfeito('whoosh', { vol: 0.35 });
  }, [i, passo]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onSair(); return; }
      if (e.key === 'n' || e.key === 'N') { setNota(v => !v); return; }
      if (teclaDoSlide.current?.(e)) { e.preventDefault(); return; }
      if ([' ', 'Enter', 'ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); avancar(); }
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); voltar(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [avancar, voltar, onSair]);

  const conteudo = () => {
    switch (slide.tipo) {
      case 'capa':
        return (
          <div className="ap-slide centro">
            <div className="ap-emoji">{dados.modo === 'semana' ? '📖' : '🔥'}</div>
            <div className="ap-eyebrow">{dados.modo === 'semana' ? 'Encerramento da semana' : 'Encerramento da temporada'}</div>
            <div className="ap-titulo">{dados.rotulo}</div>
            <div className="ap-sub">{dados.turmaNome}</div>
          </div>
        );
      case 'numeros':
        return passo === 0 ? (
          <div className="ap-slide centro">
            <div className="ap-eyebrow">{dados.modo === 'semana' ? 'A semana em números' : 'A temporada em números'}</div>
            <div className="ap-titulo">Quantos dias vocês acham que a turma estudou?</div>
            <div className="ap-hero">?</div>
          </div>
        ) : (
          <div className="ap-slide centro">
            <div className="ap-eyebrow">{dados.modo === 'semana' ? 'A semana em números' : 'A temporada em números'}</div>
            <div className="ap-hero ap-pulso">{fmt(r.totais.dias)}</div>
            <div className="ap-sub">dias estudados juntos</div>
            <div className="ap-cards" style={{ ['--n' as any]: 3 }}>
              <div className="ap-card"><div className="val">{r.totais.alunos}</div><div className="det">adolescentes</div></div>
              <div className="ap-card"><div className="val">{r.totais.semanasCompletas}</div><div className="det">semanas completas</div></div>
              <div className="ap-card"><div className="val">{fmt(r.totais.xp)}</div><div className="det">XP conquistados</div></div>
            </div>
          </div>
        );
      case 'diaMais': {
        const [d1, ...resto] = r.diaMaisEstudado;
        const empate = resto.filter(x => x.alunos === resto[0]?.alunos).slice(0, 4);
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">O dia mais estudado</div>
            <div className="ap-titulo">O dia em que a turma estudou junta</div>
            <div className="ap-hero">{dataCurta(d1.data)}</div>
            <div className="ap-sub">{diaDaSemana(d1.data)} · {d1.alunos} adolescentes estudaram no dia certo</div>
            {empate.length > 0 && dados.modo === 'temporada' && (
              <div className="ap-det">Logo atrás, com {empate[0].alunos}: {empate.map(x => dataCurta(x.data)).join(', ')}</div>
            )}
          </div>
        );
      }
      case 'melhorSemana':
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">A melhor semana</div>
            <div className="ap-titulo">Mais estudos no dia certo</div>
            <Podio itens={r.melhorSemana.slice(0, 3).map(s => {
              const l = dados.licoes.find(x => x.semana === s.week) as any;
              return { nome: tituloCurtoDaLicao(l) || s.week, val: `${s.estudosNoDia} estudos no dia certo`, det: `${s.alunos} alunos · ${String(s.pctAcertos).replace('.', ',')}% de acertos` };
            })} />
          </div>
        );
      case 'lideranca':
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">Liderança pelo exemplo</div>
            <div className="ap-titulo">Quem conduz também estudou</div>
            <Podio itens={r.liderancaPeloExemplo.slice(0, 3).map(l => ({ nome: l.nome, val: `${l.dias} dias`, det: 'estudados' }))} />
          </div>
        );
      case 'maratonistas':
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">Os maratonistas</div>
            <div className="ap-titulo">Nunca é tarde para colocar em dia</div>
            <Podio itens={r.maratonistas.slice(0, 3).map(m => ({ nome: m.nome, val: `${m.maxNumDia} lições em ${dataCurta(m.dataMax)}`, det: `${m.totalRecuperado} recuperadas no total` }))} />
          </div>
        );
      case 'chama':
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">A chama acesa · maior sequência real</div>
            <div className="ap-titulo">Só o dia certo, sem pular nenhum</div>
            <Podio itens={r.ofensivaReal.filter(o => o.dias >= 2).slice(0, 3).map(o => ({ nome: o.nome, val: `${o.dias} dias seguidos`, det: o.inicio ? `de ${dataCurta(o.inicio)} a ${dataCurta(o.fim)}` : '' }))} />
          </div>
        );
      case 'clube':
        return (
          <div className="ap-slide centro">
            <div className="ap-eyebrow">{dados.modo === 'semana' ? '7 de 7 dias' : `${totalDeDias(dados.licoes)} de ${totalDeDias(dados.licoes)} dias`}</div>
            <div className="ap-titulo">{dados.modo === 'semana' ? 'Fecharam a semana inteira' : `O Clube dos ${totalDeDias(dados.licoes)}`}</div>
            <div className="ap-chips">
              {r.clubeDaTemporada.map(c => <span key={c.nome} className="ap-chip">{c.nome}</span>)}
            </div>
            <div className="ap-det">Guardem esses nomes. Eles voltam no sorteio.</div>
          </div>
        );
      case 'suspense': {
        const [a, b, c] = dados.perfis;
        return (
          <div className="ap-slide centro">
            <div className="ap-emoji">🏆</div>
            <div className="ap-titulo">Só três sobem ao pódio.</div>
            {b && c && <div className="ap-sub">Entre o 2º e o 3º lugar, apenas {fmt(b.xp - c.xp)} XP.</div>}
            {a && b && !c && <div className="ap-sub">Entre o 1º e o 2º lugar, {fmt(a.xp - b.xp)} XP.</div>}
          </div>
        );
      }
      case 'misterio': {
        const pistas = dados.pistas[slide.pos!] || [];
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">{slide.pos! + 1}º lugar · quem é?</div>
            <div className="ap-titulo">❓ O mistério do {slide.pos! + 1}º lugar</div>
            <ol className="ap-pistas">
              {pistas.slice(0, passo + 1).map((t, k) => (
                <li key={k} className={k === passo ? 'nova' : ''}><span className="n">{k + 1}</span><span><Negrito texto={t} /></span></li>
              ))}
            </ol>
          </div>
        );
      }
      case 'revelacao':
        return <SlideRevelacao key={i} perfil={dados.perfis[slide.pos!]} candidatos={dados.perfis.slice(0, 10)} pos={slide.pos!} />;
      case 'turma': {
        const p = dados.perfis[passo];
        return (
          <div className="ap-slide">
            <div className="ap-eyebrow">A turma inteira · {passo + 1} de {dados.perfis.length}</div>
            <div className="ap-aluno ap-anim-lado" key={p.userId}>
              <Av a={p.avatar} className="av" />
              <div>
                <div className="nome">{p.nome}</div>
                <div className="conq">{dados.conquistas[p.userId]}</div>
                <div className="num">{p.dias} dias · {fmt(p.xp)} XP</div>
              </div>
            </div>
            <div className="ap-mini">
              {dados.perfis.map((x, k) => <span key={x.userId} className={k === passo ? 'on' : k < passo ? 'visto' : ''}><Av a={x.avatar} /></span>)}
            </div>
          </div>
        );
      }
      case 'sorteio':
        return (
          <SlideSorteio
            modo={dados.modo} licao={licao} turmaId={turmaId} track={track} turmaNome={dados.turmaNome} jogador={jogador}
            registrarTecla={fn => { teclaDoSlide.current = fn; }}
          />
        );
      case 'virada':
        return (
          <div className="ap-slide centro ap-virada">
            <div className="ap-emoji">📖</div>
            <div className="ap-eyebrow">Próxima temporada</div>
            <div className="ap-titulo">{dados.proxima!.nome}</div>
            <div className="ap-sub">{dados.proxima!.licao}</div>
          </div>
        );
      case 'fechamento':
        return (
          <div className="ap-slide centro">
            <div className="ap-titulo">{dados.modo === 'semana' ? 'Uma semana nova começa agora.' : 'O ranking zerou.'}</div>
            <div className="ap-titulo ouro">{dados.modo === 'semana' ? 'Bora estudar juntos?' : 'Todo mundo começa igual.'}</div>
            <div className="ap-sub">📱 Abre o app e começa a próxima lição</div>
          </div>
        );
    }
  };

  return createPortal(
    <div className="st-palco" role="dialog" aria-modal="true" aria-label="Apresentação em tela cheia">
      <div className={`ap-tela${slide.tipo === 'virada' || slide.tipo === 'fechamento' ? ' ap-luz' : ''}`}>
        <div className={`ap-quadro ap-anim-${slide.anim}`} key={`${i}`}>{conteudo()}</div>
        <div className="ap-rodape">
          <button className="ap-nav" onClick={voltar} aria-label="Voltar">‹</button>
          <div className="ap-dots" aria-hidden="true">{slides.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'visto' : ''} />)}</div>
          <span>{i + 1}/{slides.length} · N: dica · Esc: sair</span>
          <button className="ap-nav" onClick={avancar} aria-label="Avançar">›</button>
        </div>
        {nota && <div className="ap-nota"><b>🎬 {slide.titulo}:</b> {slide.nota}</div>}
      </div>
      <button className="st-sair" onClick={onSair} aria-label="Sair da apresentação">✕</button>
    </div>,
    document.body
  );
};

const Podio = ({ itens }: { itens: { nome: string; val: string; det: string }[] }) => {
  // Visual: 2º | 1º | 3º, com o 1º maior no meio.
  const ordem = itens.length === 3 ? [1, 0, 2] : itens.length === 2 ? [1, 0] : [0];
  return (
    <div className="ap-cards" style={{ ['--n' as any]: itens.length }}>
      {ordem.map(k => itens[k] && (
        <div key={k} className={`ap-card${k === 0 ? ' um' : ''}`}>
          <div className="pos">{k + 1}º</div>
          <div className="nome">{itens[k].nome}</div>
          <div className="val">{itens[k].val}</div>
          {itens[k].det && <div className="det">{itens[k].det}</div>}
        </div>
      ))}
    </div>
  );
};

// ===== Tela de preparo (fora do telão) =====
export const Apresentacao = ({ licao, jogador, onBack }: any) => {
  const conducao = useTurmaAtiva(jogador);
  const [modo, setModo] = useState<Modo>('temporada');
  const [sel, setSel] = useState<{ licao: any; track: string }>({ licao, track: jogador?.track || 'teen' });
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [palco, setPalco] = useState(false);

  const turma = conducao.turma;
  useEffect(() => { setDados(null); }, [modo, sel.licao?.semana, sel.licao?.trimestre, conducao.turmaId]);
  useEffect(() => {
    if (turma?.track && turma.track !== sel.track) {
      loadTrackLessons(turma.track).then(ls => {
        const l = (ls || []).find((x: any) => x.semana === sel.licao?.semana) || (ls || []).find((x: any) => !x.isAdminOnly);
        if (l) setSel({ licao: l, track: turma.track });
      }).catch(() => {});
    }
  }, [turma?.track]);

  const slides = useMemo(() => (dados ? montarSlides(dados) : []), [dados]);

  const montar = async () => {
    if (!turma || !conducao.turmaId) return;
    setCarregando(true); setErro('');
    try {
      setDados(await carregarDados({ modo, licao: sel.licao, turma, turmaId: conducao.turmaId }));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível montar a apresentação.');
    } finally {
      setCarregando(false);
    }
  };

  const abrirPalco = () => {
    setPalco(true);
    const el: any = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
  };
  const fecharPalco = useCallback(() => {
    setPalco(false);
    const d: any = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)?.catch?.(() => {});
  }, []);
  useEffect(() => {
    const aoMudar = () => { const d: any = document; if (!d.fullscreenElement && !d.webkitFullscreenElement) setPalco(false); };
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  if (!jogador?.isAdmin && !jogador?.isProfessor) {
    return (
      <div className="scr"><div className="hdr"><button className="btn-back" onClick={onBack}>← Voltar</button><h2>🎬 Apresentação</h2></div>
        <div style={{ padding: 20, color: 'var(--mut)' }}>Só a liderança da turma pode montar a apresentação.</div></div>
    );
  }

  return (
    <div className="scr" style={{ paddingBottom: 100 }}>
      <div className="hdr"><button className="btn-back" onClick={onBack}>← Voltar</button><h2>🎬 Apresentação</h2></div>
      <div className="sec" style={{ paddingTop: 12 }}>
        {conducao.carregando ? (
          <div style={{ color: 'var(--mut)' }}>Carregando turmas…</div>
        ) : !turma ? (
          <div style={{ color: 'var(--mut)' }}>Você ainda não conduz nenhuma turma.</div>
        ) : (
          <>
            <SeletorTurmaAtiva turmas={conducao.turmas} turmaId={conducao.turmaId} onEscolher={conducao.escolher}
              nota="A apresentação usa só os alunos desta turma." />
            <div className="theme-toggle sorteio-modo" role="group" aria-label="Período da apresentação">
              <button className={`theme-btn${modo === 'semana' ? ' active' : ''}`} onClick={() => setModo('semana')}>📅 Semana</button>
              <button className={`theme-btn${modo === 'temporada' ? ' active' : ''}`} onClick={() => setModo('temporada')}>🏆 Temporada</button>
            </div>
            <SeletorLicao track={sel.track} licao={sel.licao} onChange={(l, t) => setSel({ licao: l, track: t })}
              nota={modo === 'semana' ? 'A apresentação fecha esta semana.' : 'Qualquer lição da temporada serve: ela diz qual temporada fechar.'} />
            <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
              <button className={`btn btn-gold${carregando ? ' btn-dis' : ''}`} onClick={montar} disabled={carregando} style={{ width: 'auto', display: 'inline-flex', padding: '12px 24px' }}>
                {carregando ? 'Montando…' : dados ? '🔄 Montar de novo' : '🎬 Montar apresentação'}
              </button>
            </div>
            {erro && <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{erro}</div>}
            {dados && (
              <div style={{ background: 'var(--panel-bg)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 10 }}>
                  <b style={{ color: 'var(--txt2)' }}>{dados.rotulo}</b> · {dados.perfis.length} aluno(s) · {slides.length} slides
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--txt2)', lineHeight: 1.7 }}>
                  {slides.map((s, k) => <li key={k}>{s.titulo}{s.passos > 1 ? <span style={{ color: 'var(--mut)' }}> · {s.passos} passos</span> : null}</li>)}
                </ol>
                <div style={{ fontSize: 12, color: 'var(--mut)', margin: '10px 0 14px', lineHeight: 1.5 }}>
                  No telão: Espaço ou → avança, ← volta, N mostra a dica de condução, Esc sai. No slide do sorteio, Espaço sorteia.
                </div>
                <button className="btn btn-gold" onClick={abrirPalco}>▶ Apresentar no telão</button>
              </div>
            )}
          </>
        )}
      </div>
      {palco && dados && turma && (
        <Palco dados={dados} slides={slides} licao={sel.licao} turmaId={conducao.turmaId} track={turma.track} jogador={jogador} onSair={fecharPalco} />
      )}
    </div>
  );
};
