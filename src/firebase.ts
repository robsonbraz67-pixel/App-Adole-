import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { isRankingHidden, computeRealStreak, aggregateWeekRanking, datasEstudoDoHistory, DatasEstudo } from './utils';

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
  invalidarTurmasQueConduzo();
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
  // Mexer na lista de professores muda quem conduz o quê (Fase 6): o cache
  // precisa cair junto, senão o admin salva a turma e o seletor continua
  // mostrando a lista velha por um minuto.
  invalidarTurmasQueConduzo();
};

// Turma se ARQUIVA, nunca se exclui: os documentos de progresso carregam
// turmaId, e apagar a turma deixaria esse histórico órfão. A regra trava isso
// (`delete: if false`) — aqui só existe o caminho certo.
export const arquivarTurma = async (turmaId: string, active: boolean) => {
  await updateDoc(doc(db, 'turmas', turmaId), { active, updatedAt: serverTimestamp() });
  invalidarTurmasQueConduzo();
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
  aoAvancar?: (etapa: 'perfis' | 'progresso' | 'igreja', feitos: number, total: number) => void,
  igreja?: { locationId: string; usuarios: string[] },
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

  // A igreja que faltava no perfil. Vem da turma, que é quem define — e só
  // para quem está SEM: perfil com outra igreja é conflito para humano olhar.
  //
  // O progresso desses alunos se conserta sozinho: backfill-ranking-data roda
  // de hora em hora e carimba locationId nos docs de quem tem um no perfil.
  const rIgreja = igreja?.usuarios.length
    ? await carimbarEmLotes(
        igreja.usuarios.map(id => ({ id, colecao: 'users', patch: { locationId: igreja.locationId } })),
        (f, t) => aoAvancar?.('igreja', f, t),
      )
    : { feitos: 0, falhas: [] as { id: string; erro: string }[] };

  return {
    perfis: rPerfis,
    progresso: rProgresso,
    igreja: rIgreja,
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
export const getInviteCodeByCode = async (code: string): Promise<{ code: string; locationId: string; turmaId?: string; track: string; active: boolean } | null> => {
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

  // turmaId só vai quando ainda NÃO existe (Fase 6). Quem já está matriculado
  // numa turma vira professor da turma do convite pela lista `professores`, e
  // continua fazendo parte da sua: antes disto, o segundo convite arrastava a
  // matrícula junto e a pessoa perdia o mural e o ranking de que fazia parte.
  // A regra impõe o mesmo (turmaDoPerfilOkNoResgate) — aqui é o caminho certo.
  await updateDoc(doc(db, 'users', jogador.id), {
    isProfessor: true,
    ...(jogador.turmaId ? {} : { turmaId: convite.turmaId }),
    inviteCode: code,
  });

  // Agora que a lista é a AUTORIDADE de quem conduz (e não mais o turmaId do
  // perfil), entrar nela deixou de ser cosmético: para quem já tinha turma, é
  // a única coisa que o torna professor daquela turma. Por isso o erro sobe em
  // vez de ser engolido — mas depois do perfil, que é o que concede o papel.
  const jaNaLista = (turma.professores || []).includes(jogador.id);
  if (!jaNaLista) {
    try {
      await updateDoc(doc(db, 'turmas', convite.turmaId), {
        professores: [...(turma.professores || []), jogador.id],
        updatedAt: serverTimestamp(),
      });
      invalidarTurmasQueConduzo();
    } catch (e) {
      console.error('entrar na lista de professores', e);
      if (jogador.turmaId && jogador.turmaId !== convite.turmaId) {
        throw new Error('Você virou professor, mas não foi possível ligar você à turma do convite. Peça a um admin para te adicionar a ela.');
      }
    }
  }

  return { turmaId: convite.turmaId, turmaNome: turma.nome as string };
};

// Matrícula por código de turma, para quem JÁ tem conta (Fase 4). No cadastro
// isso acontece sozinho (o payload leva o turmaId do convite); aqui é o caminho
// de quem entrou antes de a turma existir.
//
// Só define turma para quem ainda não tem: a regra permite ao dono ESCOLHER uma
// turma que exista, mas TROCAR de turma é ato de admin. É o que impede um aluno
// de migrar sozinho para a turma dos amigos no meio do trimestre.
export const matricularPorCodigoDaTurma = async (codigo: string, jogador: any) => {
  const code = normalizeInviteCode(codigo);
  const convite = await getInviteCodeByCode(code);
  if (!convite) throw new Error('Código não encontrado. Confira as letras.');
  if (!convite.active) throw new Error('Este código foi revogado. Peça um novo.');
  if (!convite.turmaId) throw new Error('Este código é antigo e não aponta para nenhuma turma. Peça um novo ao professor.');
  if (jogador.turmaId === convite.turmaId) throw new Error('Você já está nesta turma.');
  if (jogador.turmaId) throw new Error('Você já está em uma turma. Só um administrador pode te mudar de turma.');

  const turmaSnap = await getDoc(doc(db, 'turmas', convite.turmaId));
  if (!turmaSnap.exists()) throw new Error('A turma deste convite não existe mais.');
  const turma = turmaSnap.data() as any;
  if (turma.active === false) throw new Error('Esta turma está arquivada.');

  // locationId e track só vão quando o perfil ainda não os tem: a regra
  // congela os dois depois de definidos (ownerLocationTrackUnchanged), e
  // reenviá-los iguais é inofensivo, mas diferentes derrubaria a gravação.
  const patch: any = { turmaId: convite.turmaId, inviteCode: code };
  if (!jogador.locationId) patch.locationId = convite.locationId;
  if (!jogador.track) patch.track = convite.track;

  await updateDoc(doc(db, 'users', jogador.id), patch);
  return { turmaId: convite.turmaId, turmaNome: turma.nome as string };
};

// ===== Fase 6: as turmas que eu CONDUZO =====
// `jogador.turmaId` diz de que turma a pessoa FAZ PARTE. Conduzir é outra
// coisa, e mora em `turmas/{id}.professores` — um professor pode conduzir
// várias, inclusive turmas de que não faz parte.
//
// Três fontes, nesta ordem, e a ordem tem motivo:
//
// 1. Admin conduz todas as ativas. Ele já lê a coleção inteira, e é assim que
//    acompanha qualquer turma sem precisar entrar na lista de ninguém.
// 2. `array-contains` na lista de professores — o caminho normal.
// 3. A turma do PRÓPRIO PERFIL, mesmo que ele não esteja na lista dela.
//    Parece redundante e não é: resgatarConviteProfessor adiciona à lista
//    dentro de um try/catch que pode falhar em silêncio (e falhava, antes de
//    2026-09-13). Existe professor real em produção com turmaId e fora de
//    `professores` — e a regra continua atendendo esse caso por ownTurmaId().
//    Sem o passo 3, o painel diria a ele "você não conduz turma nenhuma".
// Três telas chamam isto (painel, sorteio, mural), e o admin paga a coleção
// inteira de turmas em cada uma. Um minuto de cache corta a repetição sem
// esconder por muito tempo a turma que ele acabou de criar no painel ao lado.
let cacheConduzo: { chave: string; em: number; turmas: Turma[] } | null = null;
const CACHE_CONDUZO_MS = 60_000;

export const invalidarTurmasQueConduzo = () => { cacheConduzo = null; };

export const getTurmasQueConduzo = async (jogador: any): Promise<Turma[]> => {
  if (!jogador?.isAdmin && !jogador?.isProfessor) return [];

  const chave = `${jogador.id}|${!!jogador.isAdmin}|${jogador.turmaId || ''}`;
  if (cacheConduzo && cacheConduzo.chave === chave && Date.now() - cacheConduzo.em < CACHE_CONDUZO_MS) {
    return cacheConduzo.turmas;
  }
  const guardar = (turmas: Turma[]) => {
    cacheConduzo = { chave, em: Date.now(), turmas };
    return turmas;
  };

  if (jogador.isAdmin) return guardar((await getTurmas()).filter(t => t.active !== false));

  const porLista: Turma[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'turmas'), where('professores', 'array-contains', jogador.id)));
    snap.forEach(d => porLista.push({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    // Consulta recusada ou sem índice não pode apagar a turma do perfil.
    console.error('getTurmasQueConduzo', e);
  }

  if (jogador.turmaId && !porLista.some(t => t.id === jogador.turmaId)) {
    const minha = await getTurma(jogador.turmaId).catch(() => null);
    if (minha) porLista.push(minha);
  }

  return guardar(
    porLista
      .filter(t => t.active !== false)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
  );
};

// Participantes do sorteio recortados por turma. Usa o índice composto
// (turmaId + week) que a Fase 4 já declarou — nenhum índice novo.
//
// Sem turma, cai no comportamento antigo (a semana inteira): é o que mantém
// o sorteio funcionando para quem ainda não tem turma nenhuma.
export const getWeeklyRankingDaTurma = async (week: string, turmaId?: string) => {
  if (!turmaId) return getWeeklyRanking(week);
  try {
    const [snap, adminIds] = await Promise.all([
      getDocs(query(collection(db, 'progress'), where('turmaId', '==', turmaId), where('week', '==', week))),
      getAdminIds(),
    ]);
    return aggregateWeekRanking(rowsFromSnap(snap, adminIds));
  } catch (e) {
    // Mesma escolha de listenToWeekProgress: índice indisponível derruba a
    // consulta INTEIRA, e um sorteio com lista vazia parece "ninguém estudou"
    // em vez de "a consulta falhou". Cair para a semana toda custa leitura e
    // mostra gente demais — o que dá para ver e corrigir.
    console.error('getWeeklyRankingDaTurma: caindo para a semana inteira', e);
    return getWeeklyRanking(week);
  }
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

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, track: string, isAdmin?: boolean, isGuest?: boolean, isProfessor?: boolean, locationId?: string, turmaId?: string) => {
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
    // Mesma ideia para a turma — e aqui não é só economia de leitura: o ranking
    // da turma CONSULTA por este campo (ver listenToWeekProgress). Enquanto só
    // o carimbo manual do admin o gravava, todo doc criado depois do último
    // carimbo — ou seja, a semana nova inteira, e quem trocou de trilha, que
    // ganha um doc com outra chave — ficava fora da lista da própria turma.
    // Era o "na minha turma eu não apareço mais".
    ...(turmaId ? { turmaId } : {}),
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
    // Um campo recusado derruba o documento INTEIRO — e o aluno perderia o
    // quiz por causa de um carimbo. Os dois suspeitos são opcionais e saem em
    // ordem, do mais provável ao mais caro de perder:
    //
    // 'turmaId': a regra exige que seja igual ao da turma real do dono
    // (users/{uid}). Um perfil em cache desatualizado — admin acabou de mudar
    // o aluno de turma — recusaria TODO save até o app recarregar o perfil.
    //
    // 'liberados': a janela de deploy de sempre. Regra publicada que ainda não
    // conhece o campo faz hasOnly() recusar tudo. A liberação se perde até as
    // regras subirem; o progresso, não.
    const { turmaId: carimboTurma, liberados: diasLiberados, ...essencial } = corpo;
    try {
      await setDoc(progRef, { ...essencial, ...(diasLiberados ? { liberados: diasLiberados } : {}) }, { merge: true });
    } catch {
      await setDoc(progRef, essencial, { merge: true });
    }
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

// Conta duplicada: o mesmo aluno logou com dois e-mails/aparelhos e acumulou
// progresso em paralelo em dois uids. A raiz é uma pessoa só, então a correção
// funde as duas na conta PRINCIPAL, semana a semana, com a MESMA regra que o
// app já usa para reconciliar local vs. servidor (mergeProgress) — nada de
// inventar uma segunda forma de somar dia e XP. A secundária não é apagada
// aqui: quem chama decide bloqueá-la depois (blockUser), mantendo o rastro.
export const adminMesclarContas = async (secundariaId: string, principalId: string): Promise<{ semanas: string[] }> => {
  const [principal, docsSecundaria, docsPrincipal] = await Promise.all([
    getUser(principalId),
    getProgressoDoUsuario(secundariaId),
    getProgressoDoUsuario(principalId),
  ]);
  if (!principal) throw new Error('Conta principal não encontrada.');

  const porSemana = new Map<string, any>();
  for (const d of docsPrincipal) porSemana.set(`${d.track || 'teen'}|${d.week}`, d);

  const semanas: string[] = [];
  for (const sec of docsSecundaria) {
    const existente = porSemana.get(`${sec.track || 'teen'}|${sec.week}`) || null;
    const mesclado = mergeProgress(existente, sec);
    const corpo: any = {
      userId: principalId,
      week: sec.week,
      track: sec.track || 'teen',
      xp: mesclado.xp,
      streak: mesclado.streak,
      done: mesclado.done,
      history: mesclado.history,
      nome: principal.nome || '',
      avatar: principal.avatar || '',
      updatedAt: serverTimestamp(),
    };
    const trimestre = existente?.trimestre || sec.trimestre;
    if (trimestre) corpo.trimestre = trimestre;
    if (principal.locationId) corpo.locationId = principal.locationId;
    if (principal.turmaId) corpo.turmaId = principal.turmaId;
    const liberados = Array.from(new Set([...(existente?.liberados || []), ...(sec.liberados || [])]));
    if (liberados.length) corpo.liberados = liberados;
    await setDoc(doc(db, 'progress', trackKey(principalId, sec.week, sec.track)), corpo, { merge: true });
    semanas.push(sec.week);
  }
  return { semanas };
};

// Devolve os dias concluídos por semana E as datas em que foram realmente
// estudados (history[diaId].emISO) — as duas coisas saem da MESMA leitura, que
// é o motivo de virem juntas em vez de em duas funções.
export const getUserAllDone = async (userId: string, _track?: string): Promise<{ done: Record<string, number[]>; datas: DatasEstudo }> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId)));
  const map: Record<string, number[]> = {};
  const datas: DatasEstudo = {};
  snap.forEach(doc => {
    const data = doc.data();
    // As datas de estudo de TODOS os docs da semana entram: a ofensiva conta
    // dia de calendário, então um dia estudado numa trilha vale como dia
    // estudado, mesmo que o doc "mais completo" seja o de outra trilha.
    datas[data.week] = { ...(datas[data.week] || {}), ...datasEstudoDoHistory(data.history) };
    // Se houver mais de um doc para a mesma semana (ex.: legado + janela do
    // bug), fica com o mais completo para não "desmarcar" dias já feitos.
    const done = data.done || [];
    if (!map[data.week] || done.length > map[data.week].length) map[data.week] = done;
  });
  return { done: map, datas };
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
// Assinatura da semana. Com `turmaId`, o cliente passa a ler só a própria
// turma — é a mudança de custo da Fase 4, e ela cresce ao quadrado sem isso:
// cada aluno assinando o progresso de todos os alunos de todas as igrejas dá
// ~4 milhões de leituras/semana num cenário de 20 igrejas. Com o recorte, ~60
// mil (ver docs/PLANO-EXPANSAO.md).
//
// Sem `turmaId` (aluno recém-cadastrado, ainda sem turma) o comportamento é o
// de sempre: a semana inteira. Ausência de turma nunca pode virar lista vazia.
//
// Exige o índice composto (turmaId + week) — declarado em
// firestore.indexes.json. Consulta sem índice FALHA em produção; o `err` do
// onSnapshot é o que denuncia isso no console em vez de sumir em silêncio.
export const listenToWeekProgress = (week: string, cb: (rows: ProgressRow[]) => void, turmaId?: string) => {
  let stop = false;
  let unsub: (() => void) | null = null;

  getAdminIds().then(adminIds => {
    if (stop) return;
    const base = collection(db, 'progress');

    const assinar = (comTurma: boolean) => {
      const consulta = comTurma
        ? query(base, where('turmaId', '==', turmaId), where('week', '==', week))
        : query(base, where('week', '==', week));
      unsub = onSnapshot(
        consulta,
        snap => cb(rowsFromSnap(snap, adminIds)),
        err => {
          console.error('listenToWeekProgress', err);
          // Índice ainda construindo, ou apagado por engano: a consulta
          // recortada falha INTEIRA, e o ranking sumiria da tela sem explicar
          // por quê. Cair para a consulta antiga custa mais leitura e mostra a
          // lista certa — degradar é melhor do que apagar.
          if (comTurma && !stop) {
            console.warn('listenToWeekProgress: caindo para a semana inteira (índice indisponível)');
            assinar(false);
          }
        },
      );
    };

    assinar(!!turmaId);
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
  const porUsuario: Record<string, { nome: string; avatar: string; done: Record<string, number[]>; datas: DatasEstudo; isAdmin?: boolean; isProfessor?: boolean }> = {};
  snaps.forEach(snap => snap.forEach(doc => {
    const d = doc.data();
    if (!porUsuario[d.userId]) porUsuario[d.userId] = { nome: d.nome, avatar: d.avatar, done: {}, datas: {}, isAdmin: d.isAdmin, isProfessor: d.isProfessor };
    porUsuario[d.userId].done[d.week] = d.done || [];
    porUsuario[d.userId].datas[d.week] = { ...(porUsuario[d.userId].datas[d.week] || {}), ...datasEstudoDoHistory(d.history) };
  }));
  const resultado: Record<string, any> = {};
  for (const uid of Object.keys(porUsuario)) {
    const u = porUsuario[uid];
    resultado[uid] = { nome: u.nome, avatar: u.avatar, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor, streak: computeRealStreak(u.done, licoes, u.datas) };
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

// ===== Mural de orações (pedidos da turma) =====
// Coleção própria, e não uma subcoleção de turmas/: a consulta é por turma +
// data e precisa do índice composto (ver firestore.indexes.json).
//
// O "anônimo" esconde o nome DA TURMA, não da liderança — autorId continua no
// documento, porque é ele que autoriza o autor a apagar o próprio pedido e o
// professor a saber quem precisa de ajuda. A tela diz isso com todas as
// letras; ver MuralOracoes em components.tsx.
export type PedidoOracao = {
  id: string;
  autorId: string;
  autorNome?: string;
  autorAvatar?: string;
  anonimo: boolean;
  categoria?: CategoriaOracao;
  turmaId: string;
  locationId?: string;
  texto: string;
  oraram: string[];
  coracoes?: string[];
  curtidas?: string[];
  respondido: boolean;
  criadoEm?: any;
};

// As três reações vivem em listas separadas (e não num mapa) porque a regra
// precisa provar, campo a campo, que cada um só mexeu no PRÓPRIO uid.
export type ReacaoPedido = 'oraram' | 'coracoes' | 'curtidas';

// ===== Categorias =====
// Os ids são internos e ficam (Princípio 2 do PLANO-EXPANSAO): eles vão para o
// documento e estão na regra (`data.categoria in [...]`). Só o rótulo muda.
//
// A lista é fechada de propósito. "Outro" existe para o que não cabe nos cinco
// — um campo livre viraria uma nuvem de categorias com uma pessoa em cada.
export type CategoriaOracao = 'saude' | 'familia' | 'escola' | 'amizades' | 'fe' | 'outro';

export const CATEGORIAS_ORACAO: { id: CategoriaOracao; rotulo: string; emoji: string }[] = [
  { id: 'saude',    rotulo: 'Saúde',     emoji: '💚' },
  { id: 'familia',  rotulo: 'Família',   emoji: '🏠' },
  { id: 'escola',   rotulo: 'Escola',    emoji: '📚' },
  { id: 'amizades', rotulo: 'Amizades',  emoji: '🤝' },
  { id: 'fe',       rotulo: 'Fé',        emoji: '✝️' },
  { id: 'outro',    rotulo: 'Outro',     emoji: '💬' },
];

const CATEGORIAS_VALIDAS = new Set(CATEGORIAS_ORACAO.map(c => c.id));

// Pedido antigo não tem categoria, e isso nunca pode virar "sumiu": cai em
// 'outro', que é onde ele já estaria se tivesse sido escrito hoje.
export const categoriaDe = (c?: string): CategoriaOracao =>
  (c && CATEGORIAS_VALIDAS.has(c as CategoriaOracao)) ? (c as CategoriaOracao) : 'outro';

export const rotuloCategoria = (c?: string) =>
  CATEGORIAS_ORACAO.find(x => x.id === categoriaDe(c))!;

export type RecadoApoio = {
  id: string;
  pedidoId: string;
  paraId: string;
  deId: string;
  deNome: string;
  deAvatar: string;
  texto: string;
  turmaId: string;
  lida: boolean;
  criadoEm?: any;
};

export const RECADO_TEXTO_MAX = 300;

export const PEDIDO_TEXTO_MAX = 500;

// Teto do que a tela mostra. A turma tem dezenas de pessoas, não milhares:
// 60 pedidos cobrem meses de mural e seguram o custo da assinatura.
const MURAL_LIMITE = 60;

export const listenToPedidosOracao = (turmaId: string, cb: (lista: PedidoOracao[]) => void) => {
  const q = query(
    collection(db, 'pedidosOracao'),
    where('turmaId', '==', turmaId),
    orderBy('criadoEm', 'desc'),
    limit(MURAL_LIMITE),
  );
  return onSnapshot(q, snap => {
    const lista: PedidoOracao[] = [];
    snap.forEach(d => lista.push({ id: d.id, ...(d.data() as any) }));
    cb(lista);
  }, e => console.error('mural de orações', e));
};

// `turmaId` explícito é o caso de quem conduz: o professor publica no mural da
// turma que está conduzindo, que nem sempre é a turma do perfil dele.
export const criarPedidoOracao = async (
  jogador: any,
  texto: string,
  anonimo: boolean,
  turmaId?: string,
  categoria?: CategoriaOracao,
) => {
  const alvo = turmaId || jogador?.turmaId;
  if (!alvo) throw new Error('sem turma');
  const ref = doc(collection(db, 'pedidosOracao'));
  await setDoc(ref, {
    autorId: jogador.id,
    // Pedido anônimo não LEVA nome nem avatar. Esconder na renderização não
    // bastaria: o mural inteiro é lido pela turma, e o campo estaria ali.
    // (As regras recusam a gravação que tentar mandá-los mesmo assim.)
    ...(anonimo ? {} : { autorNome: jogador.nome || '', autorAvatar: jogador.avatar || '' }),
    anonimo,
    // Só vai quando existe: a regra aceita o documento sem o campo (é o caso
    // de todo pedido já publicado), mas recusa um valor fora da lista.
    ...(categoria ? { categoria } : {}),
    turmaId: alvo,
    ...(jogador.locationId ? { locationId: jogador.locationId } : {}),
    texto: texto.trim().slice(0, PEDIDO_TEXTO_MAX),
    oraram: [],
    coracoes: [],
    curtidas: [],
    respondido: false,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
};

// Quem reagiu fica guardado por uid (e não como um contador solto) por dois
// motivos: dá para mostrar "você já orou" ao voltar de outro aparelho, e a
// regra consegue provar que cada um só mexe no próprio uid.
//
// Uma reação por gravação — é o que a regra aceita (ver soMexeNaPropriaReacao).
export const reagirAoPedido = async (pedidoId: string, campo: ReacaoPedido, userId: string, ativo: boolean) => {
  await updateDoc(doc(db, 'pedidosOracao', pedidoId), {
    [campo]: ativo ? arrayUnion(userId) : arrayRemove(userId),
  });
};

export const marcarPedidoRespondido = async (pedidoId: string, respondido: boolean) => {
  await updateDoc(doc(db, 'pedidosOracao', pedidoId), { respondido });
};

export const excluirPedidoOracao = async (pedidoId: string) =>
  deleteDoc(doc(db, 'pedidosOracao', pedidoId));

// ===== Recados de apoio =====
// Não é um chat: o recado nasce pendurado num pedido de oração, vai só para
// quem publicou aquele pedido, é assinado por quem escreve e não tem resposta
// encadeada. O porquê de cada uma dessas travas está na regra de
// `recadosApoio` (firestore.rules).
const RECADOS_LIMITE = 40;

export const listenToRecados = (paraId: string, cb: (lista: RecadoApoio[]) => void) => {
  const q = query(
    collection(db, 'recadosApoio'),
    where('paraId', '==', paraId),
    orderBy('criadoEm', 'desc'),
    limit(RECADOS_LIMITE),
  );
  return onSnapshot(q, snap => {
    const lista: RecadoApoio[] = [];
    snap.forEach(d => lista.push({ id: d.id, ...(d.data() as any) }));
    cb(lista);
  }, e => console.error('recados de apoio', e));
};

// A turma do RECADO é a do pedido, não a do perfil de quem escreve: é o que
// deixa quem conduz responder a um pedido de turma de que não faz parte. A
// regra confere as duas pontas (o pedido existe, é daquela turma, e eu ou faço
// parte dela ou a conduzo).
export const enviarRecado = async (jogador: any, pedido: { id: string; autorId: string; turmaId?: string }, texto: string) => {
  const alvo = pedido.turmaId || jogador?.turmaId;
  if (!alvo) throw new Error('sem turma');
  const ref = doc(collection(db, 'recadosApoio'));
  await setDoc(ref, {
    pedidoId: pedido.id,
    paraId: pedido.autorId,
    deId: jogador.id,
    // Sempre assinado: ver o comentário de isValidRecado nas regras.
    deNome: jogador.nome || '',
    deAvatar: jogador.avatar || '',
    texto: texto.trim().slice(0, RECADO_TEXTO_MAX),
    turmaId: alvo,
    lida: false,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
};

// ===== Motivos de oração particulares =====
// Coleção à parte, e não um campo dentro de pedidosOracao. As três razões estão
// na regra (firestore.rules, match /oracoesParticulares), e a que decide é esta:
// `allow list` é tudo-ou-nada contra a consulta, então um booleano de
// privacidade dentro do mural transformaria cada consulta esquecida num
// vazamento ou numa tela vazia. Aqui não existe leitor além do dono.
//
// Ninguém mais lê: nem a turma, nem o professor, nem o admin. É o que a tela
// promete antes de a pessoa escrever.
export type OracaoParticular = {
  id: string;
  autorId: string;
  texto: string;
  categoria?: CategoriaOracao;
  respondida: boolean;
  criadoEm?: any;
};

export const PARTICULAR_TEXTO_MAX = 500;

// Sem orderBy na consulta de propósito: ordenar no servidor pediria um índice
// composto (autorId + criadoEm) para uma lista que tem dezenas de itens, não
// milhares. A ordenação sai aqui, de graça.
export const listenToOracoesParticulares = (userId: string, cb: (lista: OracaoParticular[]) => void) => {
  const q = query(collection(db, 'oracoesParticulares'), where('autorId', '==', userId));
  return onSnapshot(q, snap => {
    const lista: OracaoParticular[] = [];
    snap.forEach(d => lista.push({ id: d.id, ...(d.data() as any) }));
    lista.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    cb(lista);
  }, e => console.error('motivos particulares', e));
};

export const criarOracaoParticular = async (jogador: any, texto: string, categoria?: CategoriaOracao) => {
  if (!jogador?.id) throw new Error('sem usuário');
  const ref = doc(collection(db, 'oracoesParticulares'));
  await setDoc(ref, {
    autorId: jogador.id,
    texto: texto.trim().slice(0, PARTICULAR_TEXTO_MAX),
    ...(categoria ? { categoria } : {}),
    respondida: false,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
};

export const marcarParticularRespondida = async (id: string, respondida: boolean) =>
  updateDoc(doc(db, 'oracoesParticulares', id), { respondida });

export const excluirOracaoParticular = async (id: string) =>
  deleteDoc(doc(db, 'oracoesParticulares', id));

export const marcarRecadoLido = async (recadoId: string) =>
  updateDoc(doc(db, 'recadosApoio', recadoId), { lida: true });

export const excluirRecado = async (recadoId: string) =>
  deleteDoc(doc(db, 'recadosApoio', recadoId));
