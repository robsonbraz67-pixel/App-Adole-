import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

// Projeto `demo-` faz o firebase-tools tratar como projeto de demonstração:
// nunca toca em credencial real nem em banco de verdade.
const PROJECT_ID = 'demo-sabatina';

let testEnv: RulesTestEnvironment | null = null;

// As regras são passadas explicitamente ao emulador, e não lidas do
// firebase.json — assim o teste roda contra o arquivo que está no disco agora,
// independente de qual banco nomeado a configuração de produção aponta.
export const setup = async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
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
