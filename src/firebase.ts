import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { isRankingHidden, computeRealStreak, aggregateWeekRanking } from './utils';

const firebaseConfig = {
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  appId:             import.meta.env.VITE_FB_APP_ID,
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
};
const firestoreDatabaseId = import.meta.env.VITE_FB_FIRESTORE_DB;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let authInitialized = false;
let authPromise: Promise<User | null> | null = null;

export const waitForAuthInit = () => {
  if (authInitialized) return Promise.resolve(auth.currentUser);
  if (!authPromise) {
    authPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authInitialized = true;
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authPromise;
};


export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Modo Ao Vivo: convidado sem conta nenhuma, só nome + emoji. Precisa de
// Auth Anônimo habilitado no Firebase Console (Authentication > Sign-in
// method > Anonymous) — nunca foi usado no resto do app até aqui.
export const signInAsGuest = () => signInAnonymously(auth);

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
    throw error;
  }
};

export const saveUser = async (userProfile: any) => {
  const userRef = doc(db, 'users', userProfile.id);
  const snap = await getDoc(userRef);

  const { isNew, ...cleanProfile } = userProfile;
  if (!snap.exists() && cleanProfile.email && cleanProfile.email.toLowerCase() === 'robsonbraz67@gmail.com') {
     cleanProfile.isAdmin = true;
  }

  // Campos novos só entram quando têm valor: as regras publicadas antes
  // deles rejeitam documentos com chaves desconhecidas (save falhava p/ todos)
  if (!cleanProfile.telefone) delete cleanProfile.telefone;
  if (!cleanProfile.whatsappOptIn) delete cleanProfile.whatsappOptIn;
  if (!cleanProfile.isGuest) delete cleanProfile.isGuest;
  if (!cleanProfile.track) delete cleanProfile.track;
  if (!cleanProfile.locationId) delete cleanProfile.locationId;
  if (!cleanProfile.inviteCode) delete cleanProfile.inviteCode;

  await setDoc(userRef, {
    ...cleanProfile,
    criadoEm: cleanProfile.criadoEm || new Date().toISOString()
  }, { merge: true });
};

export const getUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    if (data.email && data.email.toLowerCase() === 'robsonbraz67@gmail.com' && !data.isAdmin) {
      data.isAdmin = true;
      await saveUser(data);
    }
    return data;
  }
  return null;
};

export const getAllUsers = async () => {
  const usersCol = collection(db, 'users');
  const snap = await getDocs(usersCol);
  const users: any[] = [];
  snap.forEach(doc => {
    users.push({ id: doc.id, ...doc.data() });
  });
  return users;
};

export const toggleAdmin = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isAdmin: targetValue }, { merge: true });
};

export const toggleGuest = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isGuest: targetValue }, { merge: true });
};

export const toggleProfessor = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isProfessor: targetValue }, { merge: true });
};

export const blockUser = async (userId: string, blocked: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { bloqueado: blocked }, { merge: true });
};

export const deleteUser = async (userId: string) => {
  await deleteDoc(doc(db, 'users', userId));
};

// Locais de estudo (igreja/grupo). Lista completa é pequena — ok carregar tudo
// de uma vez pro seletor do cadastro.
export const getStudyLocations = async (): Promise<{ id: string; name: string; createdBy: string }[]> => {
  const snap = await getDocs(collection(db, 'studyLocations'));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
};

export const createStudyLocation = async (name: string, createdBy: string): Promise<string> => {
  const ref = doc(collection(db, 'studyLocations'));
  await setDoc(ref, { name: name.trim(), createdBy, createdAt: serverTimestamp() });
  return ref.id;
};

// Só admin altera o local de um usuário depois do cadastro (correção de erro, mudança de igreja etc.)
export const adminSetUserLocation = async (userId: string, locationId: string) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { locationId }, { merge: true });
};

// Admin define em qual local cada professor pode gerar convite
export const assignTeacherLocation = async (teacherId: string, locationId: string, assignedBy: string) => {
  const ref = doc(db, 'teacherAssignments', teacherId);
  await setDoc(ref, { locationId, assignedBy, assignedAt: serverTimestamp() });
};

export const removeTeacherAssignment = async (teacherId: string) => {
  await deleteDoc(doc(db, 'teacherAssignments', teacherId));
};

export const getTeacherAssignment = async (teacherId: string) => {
  const ref = doc(db, 'teacherAssignments', teacherId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() as { locationId: string; assignedBy: string; assignedAt: any } : null;
};

// Painel Admin: mapa completo {teacherId: {...}} para exibir o local de cada professor
export const getAllTeacherAssignments = async (): Promise<Record<string, { locationId: string; assignedBy: string; assignedAt: any }>> => {
  const snap = await getDocs(collection(db, 'teacherAssignments'));
  const map: Record<string, any> = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
};

// ===== Turmas (Fase 2) =====
// A turma é o escopo primário da expansão: pertence a uma igreja (locationId),
// define a trilha, e o aluno herda as duas ao se matricular. Ver
// docs/PLANO-EXPANSAO.md.
//
// Só admin escreve — é o que a regra publicada na Fase 1 permite. O professor
// gerenciar a própria turma é a Fase 3, e sobe junto com os testes do que ele
// passa a NÃO poder fazer.
export interface Turma {
  id: string;
  locationId: string;
  track: string;
  nome: string;
  professores: string[];
  active: boolean;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

// Os mesmos limites que a regra impõe (isValidTurma). Conferir aqui é o que
// transforma um 'permission-denied' silencioso numa mensagem que diz o que
// fazer — a regra continua sendo a autoridade, esta checagem é só o aviso.
const LIMITES_TURMA = { nome: 80, locationId: 200, professores: 20 };

const checarNomeTurma = (nome: string) => {
  const limpo = (nome || '').trim();
  if (!limpo) throw new Error('Dê um nome à turma.');
  if (limpo.length > LIMITES_TURMA.nome) throw new Error(`O nome da turma pode ter no máximo ${LIMITES_TURMA.nome} caracteres.`);
  return limpo;
};

const checarLocationTurma = (locationId: string) => {
  if (!locationId) throw new Error('Escolha a igreja da turma.');
  if (locationId.length > LIMITES_TURMA.locationId) throw new Error('Igreja inválida.');
};

const checarProfessoresTurma = (professores: string[]) => {
  if (professores.length > LIMITES_TURMA.professores) {
    throw new Error(`Uma turma pode ter no máximo ${LIMITES_TURMA.professores} professores.`);
  }
};

// Lista completa. A coleção é pequena por natureza (uma turma por classe de
// escola sabatina), então não vale paginar. Ativas primeiro, depois por nome.
export const getTurmas = async (): Promise<Turma[]> => {
  const snap = await getDocs(collection(db, 'turmas'));
  const list: Turma[] = [];
  snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
  return list.sort((a, b) =>
    (a.active === b.active)
      ? (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      : (a.active ? -1 : 1)
  );
};

export const createTurma = async (
  dados: { locationId: string; track: string; nome: string; professores?: string[] },
  createdBy: string
): Promise<string> => {
  const nome = checarNomeTurma(dados.nome);
  checarLocationTurma(dados.locationId);
  checarProfessoresTurma(dados.professores || []);
  const ref = doc(collection(db, 'turmas'));
  await setDoc(ref, {
    locationId: dados.locationId,
    track: dados.track,
    nome,
    // Sempre lista, mesmo vazia: a regra exige `professores is list`, e mandar
    // o campo só quando tem alguém faria a criação falhar sem turma nenhuma.
    professores: dados.professores || [],
    active: true,
    createdBy,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

// updateDoc (não setDoc merge) porque a regra valida o documento RESULTANTE:
// os campos que não vão no patch precisam continuar existindo no servidor.
export const updateTurma = async (
  turmaId: string,
  patch: Partial<Pick<Turma, 'nome' | 'locationId' | 'track' | 'professores'>>
) => {
  const limpo: any = { ...patch };
  if (patch.nome !== undefined) limpo.nome = checarNomeTurma(patch.nome);
  if (patch.locationId !== undefined) checarLocationTurma(patch.locationId);
  if (patch.professores !== undefined) checarProfessoresTurma(patch.professores);
  await updateDoc(doc(db, 'turmas', turmaId), { ...limpo, updatedAt: serverTimestamp() });
};

// Turma se ARQUIVA, nunca se exclui: os documentos de progresso carregam
// turmaId, e apagar a turma deixaria esse histórico órfão. A regra trava isso
// (`delete: if false`) — aqui só existe o caminho certo.
export const arquivarTurma = async (turmaId: string, active: boolean) => {
  await updateDoc(doc(db, 'turmas', turmaId), { active, updatedAt: serverTimestamp() });
};

// ===== Backfill de turmas rodando no navegador do admin (Fase 2) =====
// A decisão de quem entra fica em backfillTurmas.ts, compartilhada com a
// função Netlify. Aqui só a parte que fala com o Firestore.
//
// Por que o admin pode: a regra dá a ele a exceção nos dois lados
// (`isUserAdmin()` em isValidProgress e o branch de admin no update de users).
// Rodar assim dispensa conta de serviço, token e deploy — e tem uma vantagem
// sobre o SDK de servidor: cada escrita ainda passa pela regra, uma a uma.

// Lê a coleção inteira de progresso. É caro (uma leitura por documento) e só
// existe para o backfill: nenhuma tela do dia a dia chama isto.
export const getTodosProgressos = async (): Promise<any[]> => {
  const snap = await getDocs(collection(db, 'progress'));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
};

const LOTE_CARIMBO = 100;

// Escreve em lotes, mas isola a falha: um documento legado inválido faria o
// lote inteiro voltar, e sem o reteste individual não daria para saber qual
// era. Assim o carimbo termina o que dá para terminar e diz o que sobrou.
const carimbarEmLotes = async (
  refs: { id: string; patch: Record<string, any>; colecao: string }[],
  aoAvancar?: (feitos: number, total: number) => void,
) => {
  const falhas: { id: string; erro: string }[] = [];
  let feitos = 0;

  for (let i = 0; i < refs.length; i += LOTE_CARIMBO) {
    const fatia = refs.slice(i, i + LOTE_CARIMBO);
    try {
      const batch = writeBatch(db);
      fatia.forEach(r => batch.update(doc(db, r.colecao, r.id), r.patch));
      await batch.commit();
      feitos += fatia.length;
    } catch {
      for (const r of fatia) {
        try {
          await updateDoc(doc(db, r.colecao, r.id), r.patch);
          feitos++;
        } catch (e: any) {
          falhas.push({ id: r.id, erro: e?.code || e?.message || 'erro desconhecido' });
        }
      }
    }
    aoAvancar?.(feitos + falhas.length, refs.length);
  }
  return { feitos, falhas };
};

// Carimba a turma: PERFIL PRIMEIRO, progresso depois — e o progresso de quem
// falhou no perfil fica de fora. A regra exige turmaId == ownTurmaId(), então
// progresso carimbado sem o dono travaria TODO save seguinte daquele aluno,
// em silêncio (a mesma família do apagão de 2026-07-25).
export const adminCarimbarTurma = async (
  turmaId: string,
  usuarios: string[],
  progressos: { id: string; userId: string }[],
  aoAvancar?: (etapa: 'perfis' | 'progresso', feitos: number, total: number) => void,
) => {
  const rPerfis = await carimbarEmLotes(
    usuarios.map(id => ({ id, colecao: 'users', patch: { turmaId } })),
    (f, t) => aoAvancar?.('perfis', f, t),
  );

  const perfisComFalha = new Set(rPerfis.falhas.map(f => f.id));
  const seguros = progressos.filter(p => !perfisComFalha.has(p.userId));

  // updatedAt precisa ir junto: isValidProgress exige `updatedAt == request.time`
  // sempre que a chave existe, e ela existe em todo progresso já salvo. Nada no
  // app lê esse campo, então rescrevê-lo não muda nenhuma tela — mas é uma
  // diferença real para o caminho da função Netlify, que o preserva.
  const rProgresso = await carimbarEmLotes(
    seguros.map(p => ({ id: p.id, colecao: 'progress', patch: { turmaId, updatedAt: serverTimestamp() } })),
    (f, t) => aoAvancar?.('progresso', f, t),
  );

  return {
    perfis: rPerfis,
    progresso: rProgresso,
    progressoAdiadoPorFalhaNoPerfil: progressos.length - seguros.length,
  };
};

// ===== Códigos de convite por local + trilha (Etapa 3) =====
// Doc id == o próprio código, para resgate por leitura direta (sem precisar de
// permissão de list para quem resgata). Alfabeto sem caracteres ambíguos (0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRACK_PREFIX: Record<string, string> = { teen: 'TEEN', youngAdult: 'JOV', adult: 'ADT' };

const randomCodeSuffix = (len = 5) => {
  let s = '';
  const arr = new Uint32Array(len);
  (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return s;
};

export const normalizeInviteCode = (code: string) => (code || '').trim().toUpperCase().replace(/\s+/g, '');

// Cria um código novo para (locationId, track). createdBy = quem gerou.
// A regra do Firestore garante que professor só cria para o local atribuído a ele.
//
// turmaId é opcional e chegou na Fase 2: o código emitido pelo painel de turmas
// carrega a turma, então quem resgata já entra matriculado nela. Os códigos
// antigos não têm o campo e continuam válidos — a regra o aceita ausente.
export const generateInviteCode = async (locationId: string, track: string, createdBy: string, turmaId?: string): Promise<string> => {
  // tenta algumas vezes para o caso raríssimo de colisão de sufixo
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${TRACK_PREFIX[track] || 'TRK'}-${randomCodeSuffix()}`;
    const ref = doc(db, 'inviteCodes', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    // O campo só vai quando existe: mandar `turmaId: undefined` quebra o SDK, e
    // mandar string vazia falharia na regra (size() > 0).
    await setDoc(ref, { code, locationId, track, active: true, createdBy, createdAt: serverTimestamp(), ...(turmaId ? { turmaId } : {}) });
    return code;
  }
  throw new Error('Não foi possível gerar um código único. Tente novamente.');
};

// Códigos de uma turma específica. Usado pelo painel de turmas para mostrar,
// dentro da própria linha, os convites que já circulam por ela.
export const getInviteCodesByTurma = async (turmaId: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'inviteCodes'), where('turmaId', '==', turmaId)));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.createdAt?.seconds || 0) < (b.createdAt?.seconds || 0) ? 1 : -1);
};

// Lista códigos. Admin vê todos; professor filtra pelo próprio local (client-side,
// já que a regra permite list para quem gerencia).
export const getInviteCodes = async (locationId?: string): Promise<any[]> => {
  const base = collection(db, 'inviteCodes');
  const snap = locationId
    ? await getDocs(query(base, where('locationId', '==', locationId)))
    : await getDocs(base);
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.createdAt?.seconds || 0) < (b.createdAt?.seconds || 0) ? 1 : -1);
};

// Revoga/reativa: a regra só deixa alterar o campo 'active'.
export const setInviteCodeActive = async (code: string, active: boolean) => {
  await setDoc(doc(db, 'inviteCodes', code), { active }, { merge: true });
};

export const deleteInviteCode = async (code: string) => {
  await deleteDoc(doc(db, 'inviteCodes', code));
};

// Resgate: leitura direta pelo código (== doc id). Retorna null se não existir.
export const getInviteCodeByCode = async (code: string): Promise<{ code: string; locationId: string; track: string; active: boolean } | null> => {
  const ref = doc(db, 'inviteCodes', normalizeInviteCode(code));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() as any : null;
};

// Alunos de UMA turma. A consulta já nasce com o filtro que a regra vai
// exigir na 3b — `allow list` do Firestore é tudo-ou-nada contra a consulta,
// então pedir "todos os usuários" deixaria de funcionar no dia em que a regra
// estreitasse. Escrito assim, a regra pode apertar sem quebrar esta tela.
export const getUsersDaTurma = async (turmaId: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'users'), where('turmaId', '==', turmaId)));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
};

export const getTurma = async (turmaId: string): Promise<Turma | null> => {
  const snap = await getDoc(doc(db, 'turmas', turmaId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
};

// ===== Convite de professor (Fase 3) =====
// Diferente do convite de aluno: resgatar este aqui TORNA a pessoa professora
// de uma turma. Como concede poder, é mais fechado — só admin emite, ninguém
// além dele lista, e a validade é obrigatória.

const TEACHER_PREFIX = 'PROF';
const VALIDADE_PADRAO_DIAS = 7;

export const generateTeacherInvite = async (
  turma: { id: string; locationId: string },
  createdBy: string,
  dias = VALIDADE_PADRAO_DIAS,
): Promise<string> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${TEACHER_PREFIX}-${randomCodeSuffix()}`;
    const ref = doc(db, 'teacherInvites', code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, {
      code,
      locationId: turma.locationId,
      turmaId: turma.id,
      active: true,
      createdBy,
      createdAt: serverTimestamp(),
      // Validade obrigatória: convite que dá poder não fica valendo para
      // sempre num grupo de WhatsApp.
      expiresAt: Timestamp.fromMillis(Date.now() + dias * 24 * 60 * 60 * 1000),
    });
    return code;
  }
  throw new Error('Não foi possível gerar um código único. Tente novamente.');
};

export const getTeacherInvitesByTurma = async (turmaId: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'teacherInvites'), where('turmaId', '==', turmaId)));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.createdAt?.seconds || 0) < (b.createdAt?.seconds || 0) ? 1 : -1);
};

export const setTeacherInviteActive = async (code: string, active: boolean) => {
  await updateDoc(doc(db, 'teacherInvites', code), { active });
};

export const getTeacherInviteByCode = async (code: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'teacherInvites', normalizeInviteCode(code)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const ehCodigoDeProfessor = (code: string) =>
  normalizeInviteCode(code).startsWith(`${TEACHER_PREFIX}-`);

// Resgate, em três escritas e nesta ordem — a ordem É a segurança:
//
// 1. QUEIMAR o convite. É um compare-and-set num único documento (a regra
//    exige active && sem usedBy), então se duas pessoas abrirem o mesmo link
//    ao mesmo tempo, exatamente uma ganha.
// 2. Marcar o próprio perfil. A regra confere que o convite foi queimado POR
//    QUEM está escrevendo. Se esta falhar, o convite fica queimado e ninguém
//    foi promovido — erra para o lado de conceder poder de menos.
// 3. Entrar na lista de professores da turma. Cosmético: quem manda é o
//    perfil. Falhar aqui não desfaz nada, e o admin corrige pelo painel.
export const resgatarConviteProfessor = async (codigo: string, jogador: any) => {
  const code = normalizeInviteCode(codigo);
  const convite = await getTeacherInviteByCode(code);
  if (!convite) throw new Error('Código não encontrado. Confira as letras.');
  if (!convite.active || convite.usedBy) throw new Error('Este convite já foi usado ou revogado.');
  if (convite.expiresAt?.toMillis && convite.expiresAt.toMillis() < Date.now()) {
    throw new Error('Este convite venceu. Peça um novo ao administrador.');
  }

  const turmaSnap = await getDoc(doc(db, 'turmas', convite.turmaId));
  if (!turmaSnap.exists()) throw new Error('A turma deste convite não existe mais.');
  const turma = turmaSnap.data() as any;

  await updateDoc(doc(db, 'teacherInvites', code), {
    active: false,
    usedBy: jogador.id,
    usedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'users', jogador.id), {
    isProfessor: true,
    turmaId: convite.turmaId,
    inviteCode: code,
  });

  try {
    if (!(turma.professores || []).includes(jogador.id)) {
      await updateDoc(doc(db, 'turmas', convite.turmaId), {
        professores: [...(turma.professores || []), jogador.id],
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Não é motivo para dizer que o resgate falhou: o perfil já é o que vale.
  }

  return { turmaId: convite.turmaId, turmaNome: turma.nome as string };
};

export const getAdminIds = async (): Promise<Set<string>> => {
  try {
    const q = query(collection(db, 'users'), where('isAdmin', '==', true));
    const snap = await getDocs(q);
    const ids = new Set<string>();
    snap.forEach(d => ids.add(d.id));
    return ids;
  } catch {
    return new Set<string>();
  }
};

// Remove nota/hl (conteúdo privado) do history antes de mandar pro Firestore:
// o doc de progresso é legível por qualquer autenticado (ranking), então nota
// e destaque NUNCA podem morar nele (Etapa 8). Eles vão para studyNotes (privado).
const stripPrivateNotes = (history: any): any => {
  if (!history || typeof history !== 'object') return history;
  const clean: any = {};
  for (const dayId of Object.keys(history)) {
    const { nota, hl, ...rest } = history[dayId] || {};
    clean[dayId] = rest; // mantém xp/acertos do quiz; descarta nota/hl
  }
  return clean;
};

// Chave do doc de progresso/nota. IMPORTANTE p/ compatibilidade: todo o
// histórico (antes da trilha adulto, quando todos eram 'teen') vive na chave
// LEGADA `${userId}_${week}`. Por isso 'teen' (e ausência de trilha) continua
// usando a chave legada — sem migração, sem perder dados. As trilhas novas
// (adult/youngAdult) usam chave própria, mantendo o progresso separado por
// trilha para quem tem acesso a mais de uma (admin/professor).
const trackKey = (userId: string, week: string, track?: string) =>
  (!track || track === 'teen') ? `${userId}_${week}` : `${userId}_${track}_${week}`;

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, track: string, isAdmin?: boolean, isGuest?: boolean, isProfessor?: boolean, locationId?: string) => {
  const progId = trackKey(userId, week, track);
  const progRef = doc(db, 'progress', progId);
  const corpo: any = {
    userId,
    week,
    track,
    trimestre,
    // Carimba o local para o ranking por local ser calculável ao vivo pelo
    // cliente (a regra confere que é mesmo o local do dono). Só quando existe:
    // usuário ainda não matriculado não tem local para gravar.
    ...(locationId ? { locationId } : {}),
    xp: prog.xp,
    streak: prog.streak,
    done: prog.done,
    history: stripPrivateNotes(prog.history),
    nome,
    avatar,
    isAdmin: !!isAdmin,
    // Só envia isGuest/isProfessor quando true: as regras publicadas antes desses
    // campos rejeitam documentos com chaves desconhecidas, o que quebrava o save de todos
    ...(isGuest ? { isGuest: true } : {}),
    ...(isProfessor ? { isProfessor: true } : {}),
    // Dias liberados pelo admin para refazer sem punição de data. Enviado
    // mesmo VAZIO: como o save é merge, mandar só quando tem item faria a
    // liberação já usada continuar para sempre no servidor. Ausente só para
    // progresso vindo de localStorage antigo, que nem conhece o campo.
    ...(Array.isArray(prog.liberados) ? { liberados: prog.liberados } : {}),
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(progRef, corpo, { merge: true });
  } catch {
    // Mesma janela de deploy de sempre: se as regras publicadas ainda não
    // conhecerem 'liberados', hasOnly() recusa o documento INTEIRO — e sem
    // este refazer NENHUM aluno conseguiria salvar quiz. A liberação se perde
    // até as regras subirem; o progresso, não.
    const { liberados, ...semLiberados } = corpo;
    await setDoc(progRef, semLiberados, { merge: true });
  }
};

// Mescla dois docs de progresso SEM perder nada: une os dias concluídos,
// junta o history por dia (fica com a entrada de maior XP), e recalcula o XP
// total a partir do history (com piso no maior XP dos dois, por segurança).
// Exportado: também serve para reconciliar o progresso LOCAL (localStorage)
// com o do servidor no boot — sem isso, um quiz que terminou mas nunca
// sincronizou (ex: bug de regra, ou só falta de rede) seria APAGADO no
// próximo login, porque o boot sobrescrevia o local com o valor do servidor.
export const mergeProgress = (a: any, b: any) => {
  if (!a) return b;
  if (!b) return a;
  const done = Array.from(new Set([...(a.done || []), ...(b.done || [])])).sort((x: any, y: any) => x - y);
  const history: any = { ...(a.history || {}) };
  for (const [dia, entry] of Object.entries(b.history || {})) {
    const cur = history[dia];
    if (!cur || ((entry as any)?.xp || 0) > (cur?.xp || 0)) history[dia] = entry;
  }
  let xp = 0;
  for (const e of Object.values(history)) xp += ((e as any)?.xp || 0);
  xp = Math.max(xp, a.xp || 0, b.xp || 0);
  const base = (a.done?.length || 0) >= (b.done?.length || 0) ? a : b; // nome/avatar/etc.
  return { ...base, done, history, xp, streak: Math.max(a.streak || 0, b.streak || 0) };
};

export const getProgress = async (userId: string, week: string, track: string) => {
  const snap = await getDoc(doc(db, 'progress', trackKey(userId, week, track)));
  const main = snap.exists() ? snap.data() : null;
  // Recuperação: durante a janela do bug de chave (deploy que gravava sempre
  // `${userId}_${track}_${week}`, inclusive teen), o progresso teen pode ter
  // ido parar em `${userId}_teen_${week}`. Se existir, MESCLA (une os dias),
  // para ninguém perder o que fez naquele intervalo. O próximo save do usuário
  // grava o resultado mesclado na chave legada, então isso se auto-corrige.
  if (!track || track === 'teen') {
    try {
      const janelaSnap = await getDoc(doc(db, 'progress', `${userId}_teen_${week}`));
      if (janelaSnap.exists()) return mergeProgress(main, janelaSnap.data());
    } catch { /* ignora — a recuperação é best-effort */ }
  }
  return main;
};

// ===== Anotações privadas (Etapa 8) =====
// nota/destaque do usuário ficam aqui, legíveis SÓ pelo dono — nunca no
// progress (que é público para o ranking).
export const saveStudyNote = async (userId: string, week: string, track: string, dayId: number, nota: string, hl: any) => {
  const ref = doc(db, 'studyNotes', trackKey(userId, week, track));
  await setDoc(ref, {
    userId,
    week,
    track,
    notes: { [String(dayId)]: { nota: nota || '', hl: hl || {} } },
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const getStudyNotes = async (userId: string, week: string, track: string): Promise<Record<string, { nota: string; hl: any }>> => {
  const ref = doc(db, 'studyNotes', trackKey(userId, week, track));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().notes || {}) : {};
};

// Mapa { semana: [diaIds concluídos] } das semanas do usuário — usado para
// marcar dias já feitos em semanas anteriores. Consulta só por userId: os
// docs legados (histórico) não têm campo `track`, então filtrar por trilha
// no servidor excluiria justamente o histórico.
// ===== Auditoria e correção de pontuação (admin) =====
// Sai tudo da coleção progress, que já é pública para o ranking: auditar um
// aluno inteiro custa UMA consulta, não uma leitura por semana. Cada doc traz
// a semana, o XP dela e o `history` dia a dia — que é onde mora a resposta de
// "de onde veio esse número".
export const getProgressoDoUsuario = async (userId: string) => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
};

// Toda correção de admin carimba `zeradoEm`. O motivo: o aparelho do aluno
// guarda o progresso no localStorage e, no boot, MESCLA local com servidor
// pegando o maior XP e a união dos dias (ver mergeProgress). Sem um marcador,
// o próximo login do aluno desfaria a correção em silêncio, e o admin não
// teria como saber. O cliente compara este carimbo com o último que já
// honrou; sendo diferente, descarta o local e adota o servidor.
//
// Devolve 'completo' ou 'parcial': se as regras publicadas ainda não
// conhecerem os campos novos, hasOnly() recusa o update INTEIRO — então a
// correção é refeita sem eles, e quem chamou precisa avisar que ela pode ser
// desfeita pelo aparelho do aluno.
type ResultadoCorrecao = 'completo' | 'parcial';
const gravarCorrecao = async (progId: string, patch: any): Promise<ResultadoCorrecao> => {
  const ref = doc(db, 'progress', progId);
  try {
    await updateDoc(ref, { ...patch, zeradoEm: Date.now(), updatedAt: serverTimestamp() });
    return 'completo';
  } catch {
    const { liberados, ...semCamposNovos } = patch;
    await updateDoc(ref, { ...semCamposNovos, updatedAt: serverTimestamp() });
    return 'parcial';
  }
};

// XP da semana é sempre a soma do histórico que sobrou — nunca um número
// digitado à mão. Assim o total e o dia a dia não têm como divergir.
const somarHistorico = (history: any) =>
  Object.values(history || {}).reduce((t: number, e: any) => t + (Number(e?.xp) || 0), 0);

// Zera UM dia. `streak` no doc de progresso é o contador de dias daquela
// semana (ver handleDoneQuiz em App.tsx), então volta a ser done.length.
// Com `liberar`, o dia entra em `liberados`: ao refazer, vale 100% em vez dos
// 75% de quem atrasou.
export const adminZerarDia = async (progId: string, atual: any, diaId: number, liberar: boolean) => {
  const done = (atual.done || []).filter((d: number) => d !== diaId);
  const history = { ...(atual.history || {}) };
  delete history[diaId];
  const liberados = liberar
    ? Array.from(new Set([...(atual.liberados || []), diaId]))
    : (atual.liberados || []).filter((d: number) => d !== diaId);
  return gravarCorrecao(progId, {
    done, history, xp: somarHistorico(history), streak: done.length,
    ...(liberados.length ? { liberados } : {}),
  });
};

export const adminZerarSemana = async (progId: string) =>
  gravarCorrecao(progId, { done: [], history: {}, xp: 0, streak: 0, liberados: [] });

export const getUserAllDone = async (userId: string, _track?: string): Promise<Record<string, number[]>> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId)));
  const map: Record<string, number[]> = {};
  snap.forEach(doc => {
    const data = doc.data();
    // Se houver mais de um doc para a mesma semana (ex.: legado + janela do
    // bug), fica com o mais completo para não "desmarcar" dias já feitos.
    const done = data.done || [];
    if (!map[data.week] || done.length > map[data.week].length) map[data.week] = done;
  });
  return map;
};

export const getDayOverride = async (track: string, semana: string, diaId: number) => {
  const ref = doc(db, 'conteudoOverrides', `${track}_${semana}_${diaId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

export const saveDayOverride = async (track: string, semana: string, diaId: number, data: any) => {
  const ref = doc(db, 'conteudoOverrides', `${track}_${semana}_${diaId}`);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

// ===== Estudo em Dupla (Etapa 4) =====
const PAIR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const randomId = (len = 20) => {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint32Array(len);
  (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
  let s = '';
  for (let i = 0; i < len; i++) s += alpha[arr[i] % alpha.length];
  return s;
};

export type PairType = 'family' | 'couple' | 'friend';

// Dupla ativa do usuário (no máx. 1). Usa só array-contains (índice automático)
// e filtra 'active' no cliente — evita exigir índice composto no Firestore.
export const getActivePair = async (userId: string): Promise<any | null> => {
  const snap = await getDocs(query(collection(db, 'pairs'), where('members', 'array-contains', userId)));
  let pair: any = null;
  snap.forEach(d => { const data = d.data(); if (!pair && data.active) pair = { id: d.id, ...data }; });
  return pair;
};

// Cria o convite de dupla. Só quem tem locationId+track (matriculado) pode.
export const createPairInvite = async (jogador: any, type: PairType): Promise<string> => {
  if (!jogador.locationId || !jogador.track) throw new Error('Complete seu cadastro (local e trilha) antes de convidar.');
  const inviteId = randomId();
  await setDoc(doc(db, 'pairInvites', inviteId), {
    createdBy: jogador.id,
    createdByName: jogador.nome || '',
    createdByAvatar: jogador.avatar || '',
    locationId: jogador.locationId,
    track: jogador.track,
    type,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + PAIR_INVITE_TTL_MS),
  });
  return inviteId;
};

export const getPairInvite = async (inviteId: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'pairInvites', inviteId));
  return snap.exists() ? { id: inviteId, ...snap.data() } : null;
};

// Motivos de recusa amigáveis para a UI decidir a mensagem.
export type AcceptPairResult =
  | { ok: true; pairId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'self' | 'mismatch' | 'already_paired' | 'error' };

export const acceptPairInvite = async (inviteId: string, jogador: any): Promise<AcceptPairResult> => {
  try {
    const inv = await getPairInvite(inviteId);
    if (!inv || inv.status !== 'pending') return { ok: false, reason: 'not_found' };
    const expMs = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : 0;
    if (expMs && expMs < Date.now()) return { ok: false, reason: 'expired' };
    if (inv.createdBy === jogador.id) return { ok: false, reason: 'self' };
    if (inv.locationId !== jogador.locationId || inv.track !== jogador.track) return { ok: false, reason: 'mismatch' };
    // Uma dupla ativa por vez (checagem no cliente; a regra garante o resto).
    // Só dá pra checar a PRÓPRIA dupla aqui — a regra do Firestore não deixa
    // consultar as duplas de outro usuário (query 'array-contains' exige que o
    // uid buscado seja o do próprio autenticado). Se quem convidou já tiver
    // uma dupla ativa, o pior caso é um vínculo extra que fica invisível pra
    // ele (getActivePair só retorna a primeira encontrada) — não é falha de
    // segurança, só uma checagem de UX que não dá pra fazer nos dois lados.
    const mine = await getActivePair(jogador.id);
    if (mine) return { ok: false, reason: 'already_paired' };

    const batch = writeBatch(db);
    batch.set(doc(db, 'pairs', inviteId), {
      inviteId,
      members: [inv.createdBy, jogador.id],
      userA: inv.createdBy,
      userB: jogador.id,
      userAName: inv.createdByName || '',
      userAAvatar: inv.createdByAvatar || '',
      userBName: jogador.nome || '',
      userBAvatar: jogador.avatar || '',
      locationId: inv.locationId,
      track: inv.track,
      type: inv.type,
      active: true,
      createdAt: serverTimestamp(),
      sharesA: {},
      sharesB: {},
    });
    // Espelho público da escalação, no MESMO batch — é o que permite montar o
    // ranking de duplas ao vivo sem expor as anotações que ficam em pairs/.
    batch.set(doc(db, 'pairsPublic', inviteId), {
      pairId: inviteId,
      members: [inv.createdBy, jogador.id],
      aId: inv.createdBy,
      aNome: inv.createdByName || '',
      aAvatar: inv.createdByAvatar || '🦁',
      bId: jogador.id,
      bNome: jogador.nome || '',
      bAvatar: jogador.avatar || '🦁',
      locationId: inv.locationId,
      track: inv.track,
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'pairInvites', inviteId), { status: 'accepted' });
    await batch.commit();
    return { ok: true, pairId: inviteId };
  } catch (e) {
    console.error('acceptPairInvite', e);
    return { ok: false, reason: 'error' };
  }
};

// Desfaz nos dois lugares atomicamente: se só um caísse, a dupla sumiria do
// feed mas continuaria no ranking (ou o contrário).
export const unpair = async (pairId: string) => {
  const pubRef = doc(db, 'pairsPublic', pairId);
  // Duplas anteriores a pairsPublic ainda não têm espelho; o backfill cria com
  // o active certo. Um `set` com merge viraria create e a regra (com razão)
  // recusaria um doc só com `active`, derrubando o batch inteiro.
  const pub = await getDoc(pubRef).catch(() => null);
  const batch = writeBatch(db);
  batch.set(doc(db, 'pairs', pairId), { active: false }, { merge: true });
  if (pub?.exists()) batch.update(pubRef, { active: false });
  await batch.commit();
};

// Escuta a dupla em tempo real (feed). Retorna unsubscribe.
export const listenToPair = (pairId: string, cb: (pair: any | null) => void) => {
  return onSnapshot(doc(db, 'pairs', pairId), snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
};

// Define/remove o compartilhamento de um item (nota ou destaques) de um dia.
// Cada membro só escreve no próprio campo (sharesA xor sharesB) — garantido na regra.
export const setPairShare = async (
  pairId: string,
  isUserA: boolean,
  week: string,
  dayId: number,
  data: { note?: string; highlights?: string[] } | null
) => {
  const field = isUserA ? 'sharesA' : 'sharesB';
  const key = `${week}__${dayId}`;
  await setDoc(doc(db, 'pairs', pairId), {
    [field]: { [key]: data === null ? deleteField() : data },
  }, { merge: true });
};

// ===== Rankings ao vivo =====
// Tudo é derivado da coleção progress, que já é pública para o ranking. Nada
// de doc pré-calculado no meio do caminho: a escala aqui (uma escola sabatina,
// ~100 pessoas) torna o cálculo no cliente mais barato E instantâneo.
//
// Um usuário pode ter mais de um doc na mesma semana (chave legada + chave por
// trilha da janela do bug, ou trilhas diferentes para admin/professor). Todo
// agregador colapsa por (usuário, semana) ficando com o doc MAIS COMPLETO —
// nunca duplica a linha nem soma duas trilhas, o que seria injusto no ranking.

// Linha crua de progresso, já filtrada (convidado e nomes ocultos ficam fora)
export type ProgressRow = {
  id: string; userId: string; week: string; trimestre?: string; track?: string;
  locationId?: string; nome: string; avatar: string; done: number[]; dias: number;
  xp: number; isAdmin: boolean; isProfessor: boolean;
};

const rowsFromSnap = (snap: any, adminIds: Set<string>): ProgressRow[] => {
  const rows: ProgressRow[] = [];
  snap.forEach((d: any) => {
    const data = d.data();
    if (isRankingHidden(data.nome)) return;
    if (data.isGuest) return;
    rows.push({
      ...data,
      id: data.userId,
      done: data.done || [],
      dias: data.done?.length || 0,
      xp: data.xp || 0,
      isAdmin: data.isAdmin || adminIds.has(data.userId),
      isProfessor: !!data.isProfessor,
    });
  });
  return rows;
};

// Assina o progresso de uma semana. É a base ao vivo do ranking da semana e do
// de duplas — ~1 doc por aluno, o caminho quente e mais barato do app.
export const listenToWeekProgress = (week: string, cb: (rows: ProgressRow[]) => void) => {
  let stop = false;
  let unsub: (() => void) | null = null;
  getAdminIds().then(adminIds => {
    if (stop) return;
    unsub = onSnapshot(
      query(collection(db, 'progress'), where('week', '==', week)),
      snap => cb(rowsFromSnap(snap, adminIds)),
      err => console.error('listenToWeekProgress', err),
    );
  });
  return () => { stop = true; unsub?.(); };
};

// Progresso da campanha inteira (13 semanas). Leitura pontual, não assinatura:
// é ~13× mais docs que a semana e muda devagar. A semana corrente é sobreposta
// ao vivo por cima disto (ver mergeLiveWeek), então o total nunca fica atrasado.
//
// Busca pelas SEMANAS, não pelo trimestre: 'week' é obrigatório nas regras
// (todo doc de progresso tem), enquanto 'trimestre' é opcional e só passou a
// ser gravado em 27/06 — filtrar por ele fazia as semanas antigas sumirem do
// acumulado sem erro nenhum, só faltando pontos.
export const getSeasonProgress = async (semanas: string[]): Promise<ProgressRow[]> => {
  if (!semanas?.length) return [];
  // 'in' aceita até 30 valores; uma campanha tem 13, mas o lote protege o caso
  // de alguém montar uma campanha maior no futuro.
  const lotes: string[][] = [];
  for (let i = 0; i < semanas.length; i += 30) lotes.push(semanas.slice(i, i + 30));
  const [adminIds, ...snaps] = await Promise.all([
    getAdminIds(),
    ...lotes.map(lote => getDocs(query(collection(db, 'progress'), where('week', 'in', lote)))),
  ]);
  return (snaps as any[]).flatMap(snap => rowsFromSnap(snap, adminIds));
};

export const getWeeklyRanking = async (week: string) => {
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('week', '==', week))),
    getAdminIds(),
  ]);
  return aggregateWeekRanking(rowsFromSnap(snap, adminIds));
};


// ===== Escalação pública das duplas (ao vivo) =====
// pairs/ só pode ser lido pelos dois membros — guarda as anotações
// compartilhadas. pairsPublic/ é o espelho enxuto (quem forma cada dupla, sem
// anotações e sem o tipo do vínculo) que deixa o ranking de duplas ser montado
// ao vivo no cliente. Escrito no mesmo batch de pairs/, nunca diverge.
export type PairRosterEntry = {
  id: string;
  aId: string; aNome: string; aAvatar: string;
  bId: string; bNome: string; bAvatar: string;
  locationId: string; track: string;
};

const rosterFromSnap = (snap: any, track: string): PairRosterEntry[] => {
  const out: PairRosterEntry[] = [];
  snap.forEach((d: any) => {
    const p = d.data();
    // active/track filtrados aqui: a query usa só locationId (índice
    // automático de campo único), evitando exigir índice composto.
    if (!p.active || p.track !== track) return;
    out.push({
      id: d.id,
      aId: p.aId, aNome: p.aNome || '', aAvatar: p.aAvatar || '🦁',
      bId: p.bId, bNome: p.bNome || '', bAvatar: p.bAvatar || '🦁',
      locationId: p.locationId, track: p.track,
    });
  });
  return out;
};

export const listenToPairRoster = (locationId: string, track: string, cb: (roster: PairRosterEntry[]) => void) => {
  if (!locationId) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, 'pairsPublic'), where('locationId', '==', locationId)),
    snap => cb(rosterFromSnap(snap, track)),
    err => { console.error('listenToPairRoster', err); cb([]); },
  );
};

// Ofensiva real de todos os usuários da temporada (para o painel Admin/Professor)
// `licoes` vem de fora: o conteúdo é carregado sob demanda por trilha, então
// firebase.ts não pode mais importá-lo estaticamente (e nem deveria). A busca é
// pelas SEMANAS dessas lições — mesma razão do getSeasonProgress: 'trimestre'
// falta nos docs antigos e a ofensiva vinha curta sem dar erro.
export const getAllUsersStreaks = async (licoes: any[]): Promise<Record<string, { nome: string; avatar: string; streak: number; isAdmin: boolean; isProfessor: boolean }>> => {
  const semanas = (licoes || []).map((l: any) => l.semana).filter(Boolean);
  if (!semanas.length) return {};
  const lotes: string[][] = [];
  for (let i = 0; i < semanas.length; i += 30) lotes.push(semanas.slice(i, i + 30));
  const snaps = await Promise.all(lotes.map(lote => getDocs(query(collection(db, 'progress'), where('week', 'in', lote)))));
  const porUsuario: Record<string, { nome: string; avatar: string; done: Record<string, number[]>; isAdmin?: boolean; isProfessor?: boolean }> = {};
  snaps.forEach(snap => snap.forEach(doc => {
    const d = doc.data();
    if (!porUsuario[d.userId]) porUsuario[d.userId] = { nome: d.nome, avatar: d.avatar, done: {}, isAdmin: d.isAdmin, isProfessor: d.isProfessor };
    porUsuario[d.userId].done[d.week] = d.done || [];
  }));
  const resultado: Record<string, any> = {};
  for (const uid of Object.keys(porUsuario)) {
    const u = porUsuario[uid];
    resultado[uid] = { nome: u.nome, avatar: u.avatar, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor, streak: computeRealStreak(u.done, licoes) };
  }
  return resultado;
};

// ===== Painel Admin: logs de erro + relatos de usuário =====
// Escrita (registrarErro/reportarProblema) mora em src/errorLog.ts, que roda
// fora da árvore React (inclusive antes de qualquer login). Só a LEITURA/
// gestão fica aqui, junto do resto das ferramentas do Admin.
export const getErrorLogs = async (max = 50): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'errorLogs'), orderBy('criadoEm', 'desc'), limit(max)));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
};

export const excluirErrorLog = async (id: string) => {
  await deleteDoc(doc(db, 'errorLogs', id));
};

export const getRelatosUsuarios = async (): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'userReports'), orderBy('criadoEm', 'desc')));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
};

export const marcarRelatoStatus = async (id: string, status: 'lido' | 'resolvido') => {
  await setDoc(doc(db, 'userReports', id), { status }, { merge: true });
};

export const excluirRelato = async (id: string) => {
  await deleteDoc(doc(db, 'userReports', id));
};
