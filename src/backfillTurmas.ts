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

  for (const p of progressos) {
    if (!p.userId || !daTurma.has(p.userId)) { progContagem.deOutroDono++; continue; }
    if (p.turmaId === turma.id) { progContagem.jaNestaTurma++; continue; }
    if (p.turmaId) { progContagem.emOutraTurma++; continue; }
    // Só o progresso da MESMA trilha da turma: quem trocou de trilha tem
    // histórico de outra, e carimbá-lo aqui o poria no ranking errado.
    if (trackDe(p.track) !== trackDe(turma.track)) { progContagem.outraTrilha++; continue; }
    progContagem.elegiveis++;
    progElegiveis.push({ id: p.id, userId: p.userId });
  }

  return { contagem, elegiveis, progContagem, progElegiveis, igrejaFaltando, igrejaDivergente };
};
