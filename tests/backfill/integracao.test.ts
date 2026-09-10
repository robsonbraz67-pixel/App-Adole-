import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import backfill from '../../netlify/functions/backfill-turmas.mts';

// A prova de ponta a ponta da Fase 2, e a única que responde à pergunta que
// realmente importa: DEPOIS de o backfill carimbar tudo, o aluno continua
// conseguindo salvar o quiz?
//
// Os outros testes cobrem as duas metades separadas — o backfill (admin SDK,
// que ignora as regras) e as regras (cliente, com dados semeados à mão). Este
// junta as duas: roda o backfill DE VERDADE e depois tenta um save de cliente
// sob as regras REAIS publicadas. É o cenário do apagão de 2026-07-25, testado
// antes de acontecer em vez de depois.

const PROJECT_ID = 'demo-integracao';
const TOKEN = 'token-de-teste';
const SEMANA = '2026-W26';

let testEnv: RulesTestEnvironment;
let adminDb: any;

describe('backfill + regras (ponta a ponta)', () => {
  beforeAll(async () => {
    process.env.BACKFILL_TOKEN = TOKEN;
    process.env.GCLOUD_PROJECT = PROJECT_ID;

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    });

    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    adminDb = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    delete process.env.BACKFILL_TOKEN;
  });

  it('depois do backfill, o aluno continua salvando o quiz normalmente', async () => {
    await testEnv.clearFirestore();

    // Estado ANTES: como a produção está hoje — ninguém tem turmaId.
    const batch = adminDb.batch();
    batch.set(adminDb.doc('turmas/turmaPadrao'), {
      locationId: 'igreja1', track: 'teen', nome: 'Turma Padrão',
      professores: [], active: true, createdBy: 'admin1',
    });
    batch.set(adminDb.doc('users/aluno1'), {
      id: 'aluno1', nome: 'Ana', avatar: '🦁', email: 'aluno1@teste.com',
      locationId: 'igreja1', track: 'teen',
    });
    batch.set(adminDb.doc(`progress/aluno1_${SEMANA}`), {
      userId: 'aluno1', week: SEMANA, track: 'teen', locationId: 'igreja1',
      xp: 240, streak: 2, done: [1, 2], history: {}, nome: 'Ana', avatar: '🦁',
    });
    await batch.commit();

    // O backfill de verdade
    const r = await backfill(
      new Request(`https://exemplo.test/api/backfill-turmas?token=${TOKEN}&turmaId=turmaPadrao&aplicar=1`),
    ).then(res => res.json());
    expect(r.ok).toBe(true);
    expect(r.usuariosParaCarimbar).toBe(1);
    expect(r.progressoParaCarimbar).toBe(1);

    // Agora o caminho diário do aluno, sob as regras REAIS. O cliente salva com
    // merge e NÃO envia turmaId; o campo carimbado sobrevive no documento e é
    // conferido contra o turmaId do perfil (isValidProgress -> ownTurmaId()).
    const db = testEnv.authenticatedContext('aluno1', { email: 'aluno1@teste.com' }).firestore();
    await assertSucceeds(
      db.doc(`progress/aluno1_${SEMANA}`).set({
        userId: 'aluno1', week: SEMANA, track: 'teen', locationId: 'igreja1',
        xp: 360, streak: 3, done: [1, 2, 3], history: {}, nome: 'Ana', avatar: '🦁',
        isAdmin: false, updatedAt: serverTimestamp(),
      }, { merge: true }),
    );

    // E o carimbo continua lá depois do save do aluno.
    const depois = await adminDb.doc(`progress/aluno1_${SEMANA}`).get();
    expect(depois.data().turmaId).toBe('turmaPadrao');
    expect(depois.data().xp).toBe(360);
  });
});
