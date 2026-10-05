// ===== A decisão do backfill de turmas, separada de quem executa =====
// Quem entra na turma e qual progresso é carimbado não depende de rede
// nenhuma — e é exatamente onde um erro custaria caro. Fica aqui, puro, para
// ser testado com objetos comuns (tests/backfill/planejar.test.ts) e para que
// os DOIS executores usem a mesma decisão: o painel Admin, na sessão do
// próprio admin, e a função Netlify, com conta de serviço.
//
// Ver docs/PLANO-EXPANSAO.md, Fase 2.

// Antes das trilhas, todo progresso era teen — e a chave legada
// `${uid}_${week}` (sem trilha no meio) É teen. Perfil sem track segue a
// mesma leitura, senão o aluno mais antigo da escola ficaria de fora.
export const trackDe = (v: unknown) => (typeof v === 'string' && v ? v : 'teen');

export type PerfilBackfill = {
  id: string;
  nome?: string;
  email?: string;
  isGuest?: boolean;
  turmaId?: string;
  track?: string;
  locationId?: string;
};
export type ProgressoBackfill = { id: string; userId?: string; turmaId?: string; track?: string };
export type TurmaBackfill = { id: string; nome?: string; locationId: string; track: string };

export const planejarBackfill = ({ usuarios, progressos, turma, incluirSemIgreja = false }: {
  usuarios: PerfilBackfill[];
  progressos: ProgressoBackfill[];
  turma: TurmaBackfill;
  incluirSemIgreja?: boolean;
}) => {
  const contagem = {
    total: usuarios.length,
    convidados: 0,
    jaNestaTurma: 0,
    emOutraTurma: 0,
    outraIgreja: 0,
    outraTrilha: 0,
    semIgreja: 0,
    elegiveis: 0,
  };
  const elegiveis: { id: string; nome: string }[] = [];

  for (const u of usuarios) {
    // Convidado do Modo Ao Vivo não é aluno matriculado — não entra em turma.
    if (u.isGuest) { contagem.convidados++; continue; }
    if (u.turmaId === turma.id) { contagem.jaNestaTurma++; continue; }
    // Nunca sobrescrever: mover alguém de turma é decisão humana, não backfill.
    if (u.turmaId) { contagem.emOutraTurma++; continue; }
    if (trackDe(u.track) !== trackDe(turma.track)) { contagem.outraTrilha++; continue; }
    if (!u.locationId) {
      contagem.semIgreja++;
      if (!incluirSemIgreja) continue;
    } else if (u.locationId !== turma.locationId) {
      contagem.outraIgreja++;
      continue;
    }
    contagem.elegiveis++;
    elegiveis.push({ id: u.id, nome: u.nome || u.email || u.id });
  }

  // O progresso segue os donos: os que acabam de entrar e os que já estavam.
  // Nunca um progresso cujo dono não esteja carimbado com esta mesma turma —
  // a regra exige turmaId == ownTurmaId(), e a diferença travaria o aluno.
  const daTurma = new Set([
    ...elegiveis.map(e => e.id),
    ...usuarios.filter(u => u.turmaId === turma.id).map(u => u.id),
  ]);

  // A turma define a igreja (ver Anexo A do plano: o perfil herda as duas).
  // Quem está na turma sem `locationId` no perfil fica fora de tudo que é
  // recortado por igreja — a escalação de duplas, por exemplo. Só PREENCHE o
  // que falta: perfil apontando para OUTRA igreja é conflito de dado, e
  // sobrescrever escondeira o problema em vez de resolvê-lo.
  const igrejaFaltando: { id: string; nome: string }[] = [];
  let igrejaDivergente = 0;
  for (const u of usuarios) {
    const entra = u.turmaId === turma.id || elegiveis.some(e => e.id === u.id);
    if (!entra) continue;
    if (!u.locationId) igrejaFaltando.push({ id: u.id, nome: u.nome || u.email || u.id });
    else if (u.locationId !== turma.locationId) igrejaDivergente++;
  }

  const progContagem = { total: progressos.length, jaNestaTurma: 0, emOutraTurma: 0, deOutroDono: 0, outraTrilha: 0, elegiveis: 0 };
  const progElegiveis: { id: string; userId: string }[] = [];
  // Progresso de quem JÁ é desta turma, na trilha dela, mas apontando para
  // outra turma: sobra de quem foi mudado de turma. Não entra no carimbo
  // automático (nunca sobrescreve); o painel oferece realinhar à parte.
  const progDesalinhados: { id: string; userId: string; de: string }[] = [];
  const membros = new Set(usuarios.filter(u => u.turmaId === turma.id).map(u => u.id));

  for (const p of progressos) {
    if (!p.userId || !daTurma.has(p.userId)) { progContagem.deOutroDono++; continue; }
    if (p.turmaId === turma.id) { progContagem.jaNestaTurma++; continue; }
    if (p.turmaId) {
      progContagem.emOutraTurma++;
      if (membros.has(p.userId) && trackDe(p.track) === trackDe(turma.track)) {
        progDesalinhados.push({ id: p.id, userId: p.userId, de: p.turmaId });
      }
      continue;
    }
    // Só o progresso da MESMA trilha da turma: quem trocou de trilha tem
    // histórico de outra, e carimbá-lo aqui o poria no ranking errado.
    if (trackDe(p.track) !== trackDe(turma.track)) { progContagem.outraTrilha++; continue; }
    progContagem.elegiveis++;
    progElegiveis.push({ id: p.id, userId: p.userId });
  }

  // Nome de quem tem progresso a carimbar: é o que deixa o admin conferir
  // "o André está aí?" antes de aplicar, em vez de só ver um número.
  const nomePorId = new Map(usuarios.map(u => [u.id, u.nome || u.email || u.id]));
  const donosDoProgresso = Array.from(new Set([...progElegiveis, ...progDesalinhados].map(p => p.userId)))
    .map(id => nomePorId.get(id) || id);

  return { contagem, elegiveis, progContagem, progElegiveis, progDesalinhados, donosDoProgresso, igrejaFaltando, igrejaDivergente };
};

// ===== Mover (ou inserir) UM aluno numa turma =====
// A turma define igreja e trilha (Anexo A do plano), então o perfil herda as
// duas. O progresso que acompanha é o da trilha da turma — de todas as
// semanas, para o histórico dele aparecer no ranking da turma nova. Progresso
// de outra trilha fica onde está: é outro ranking.
export const planejarMovimentacao = ({ usuario, progressos, turma }: {
  usuario: PerfilBackfill;
  progressos: ProgressoBackfill[];
  turma: TurmaBackfill;
}) => {
  const perfil: { turmaId: string; locationId?: string; track?: string } = { turmaId: turma.id };
  if (usuario.locationId !== turma.locationId) perfil.locationId = turma.locationId;
  if (trackDe(usuario.track) !== trackDe(turma.track)) perfil.track = turma.track;

  const doDono = progressos.filter(p => p.userId === usuario.id);
  const mesmaTrilha = doDono.filter(p => trackDe(p.track) === trackDe(turma.track));
  const progresso = mesmaTrilha.filter(p => p.turmaId !== turma.id).map(p => p.id);

  return {
    perfil,
    progresso,
    jaEstava: usuario.turmaId === turma.id,
    deTurma: usuario.turmaId || null,
    mudaIgreja: 'locationId' in perfil,
    mudaTrilha: 'track' in perfil,
    outraTrilha: doDono.length - mesmaTrilha.length,
    nadaAFazer: usuario.turmaId === turma.id && !('locationId' in perfil) && !('track' in perfil) && progresso.length === 0,
  };
};

// ===== Reparo automático (roda de hora em hora no backfill do ranking) =====
// O ranking da turma consulta progress por turmaId. Progresso SEM o campo —
// semana gravada antes de o aluno ganhar turma, ou save que caiu no fallback
// sem carimbo — some do ranking da turma sem erro nenhum. Este reparo só
// PREENCHE o que falta, com a turma atual do dono, e só na trilha da turma.
// Nunca troca um turmaId existente: isso é movimentação, decisão humana.
export const planejarReparoDeTurma = ({ usuarios, progressos, turmas }: {
  usuarios: PerfilBackfill[];
  progressos: ProgressoBackfill[];
  turmas: TurmaBackfill[];
}) => {
  const turmaPorId = new Map(turmas.map(t => [t.id, t]));
  const turmaDoDono = new Map<string, TurmaBackfill>();
  for (const u of usuarios) {
    if (u.isGuest || !u.turmaId) continue;
    const t = turmaPorId.get(u.turmaId);
    if (t) turmaDoDono.set(u.id, t);
  }
  const reparos: { id: string; turmaId: string }[] = [];
  for (const p of progressos) {
    if (p.turmaId || !p.userId) continue;
    const t = turmaDoDono.get(p.userId);
    if (!t || trackDe(p.track) !== trackDe(t.track)) continue;
    reparos.push({ id: p.id, turmaId: t.id });
  }
  return reparos;
};
