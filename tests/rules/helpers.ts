import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment | null = null;

// As regras são passadas explicitamente ao emulador, e não lidas do
// firebase.json — assim o teste roda contra o arquivo que está no disco agora,
// independente de qual banco nomeado a configuração de produção aponta.
//
// `suffix` isola cada arquivo de teste em seu PRÓPRIO projeto de demonstração
// (`demo-sabatina-<suffix>`). O vitest roda os arquivos em paralelo por
// padrão; sem isolamento, o clearFirestore() de um arquivo apaga o que outro
// acabou de semear, no meio do teste dele — mesmo cada arquivo tendo seu
// próprio módulo (o emulador é o recurso compartilhado, não o módulo JS).
export const setup = async (suffix: string) => {
  testEnv = await initializeTestEnvironment({
    projectId: `demo-sabatina-${suffix}`,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  return testEnv;
};

export const teardown = async () => {
  await testEnv?.cleanup();
  testEnv = null;
};

export const limpar = () => env().clearFirestore();

const env = () => {
  if (!testEnv) throw new Error('Chame setup() antes de usar o ambiente de teste.');
  return testEnv;
};

// ===== Contextos =====
// `email` importa: várias regras conferem o e-mail do super admin, e
// isValidUser exige o campo. O token do emulador carrega o que for passado aqui.
export const comoUsuario = (uid: string, email = `${uid}@teste.com`) =>
  env().authenticatedContext(uid, { email }).firestore();

export const comoAnonimo = () => env().unauthenticatedContext().firestore();

// ===== Semeadura =====
// Escreve ignorando as regras. É o único jeito de montar o estado inicial
// (usuário admin, sala de jogo, dupla já formada) sem depender das próprias
// regras que estão sendo testadas.
export const semear = (fn: (db: any) => Promise<void>) =>
  env().withSecurityRulesDisabled(async ctx => { await fn(ctx.firestore()); });

// Perfis prontos: a maioria das regras faz get() em users/{uid} para decidir
// papel, então quase todo teste precisa de pelo menos um destes.
export const PERFIL_BASE = {
  nome: 'Fulano',
  avatar: '🦁',
  criadoEm: '2026-01-01T00:00:00.000Z',
};

export const semearAluno = (uid: string, extra: Record<string, unknown> = {}) =>
  semear(async db => {
    await db.doc(`users/${uid}`).set({
      id: uid, email: `${uid}@teste.com`, ...PERFIL_BASE, ...extra,
    });
  });

export const semearAdmin = (uid: string, extra: Record<string, unknown> = {}) =>
  semearAluno(uid, { isAdmin: true, ...extra });

export const semearProfessor = (uid: string, extra: Record<string, unknown> = {}) =>
  semearAluno(uid, { isProfessor: true, ...extra });

// Semeadura genérica para coleções fora de users/ (teacherAssignments,
// studyLocations, inviteCodes, liveGames, pairs, etc.) — mesmo princípio:
// escreve ignorando as regras, para montar o estado inicial sem depender
// daquilo que está sendo testado.
export const semearDoc = (path: string, data: Record<string, unknown>) =>
  semear(async db => { await db.doc(path).set(data); });

// Turma (Fase 1). Vários testes precisam de uma turma que EXISTA de verdade:
// a regra exige exists(turmas/{id}) tanto para o aluno se matricular quanto
// para o admin emitir convite de professor.
export const semearTurma = (turmaId: string, extra: Record<string, unknown> = {}) =>
  semearDoc(`turmas/${turmaId}`, {
    locationId: 'igreja1',
    track: 'juvenil',
    nome: 'Turma de teste',
    professores: [],
    active: true,
    createdBy: 'admin1',
    ...extra,
  });

// Usado em várias regras para decidir quem é o super admin fixo do sistema
// (components.tsx define o mesmo valor). Os contextos de teste usam
// `${uid}@teste.com` por padrão, que nunca colide com este.
export const SUPER_ADMIN_EMAIL = 'robsonbraz67@gmail.com';
