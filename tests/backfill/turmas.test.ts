import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import backfill from '../../netlify/functions/backfill-turmas.mts';

// O backfill escreve na base de PRODUÇÃO inteira, uma vez, e desfazer é na mão.
// Estes testes o exercitam contra o emulador com dados semeados, cobrindo os
// dois erros que custariam caro: carimbar quem não devia, e carimbar progresso
// de um dono que ficou sem turma (o apagão parcial dos invariantes #47/#48).

const PROJECT_ID = 'demo-backfill';
const TOKEN = 'token-de-teste';
const SEMANA = '2026-W26';

let db: any;

const chamar = (qs: string) =>
  backfill(new Request(`https://exemplo.test/api/backfill-turmas?${qs}`)).then(r => r.json());

const semear = async () => {
  const batch = db.batch();

  // A turma alvo: igreja1 + trilha teen
  batch.set(db.doc('turmas/turmaPadrao'), {
    locationId: 'igreja1', track: 'teen', nome: 'Turma Padrão',
    professores: [], active: true, createdBy: 'admin1',
  });

  // Entram no escopo local-trilha
  batch.set(db.doc('users/aluno1'), { id: 'aluno1', nome: 'Ana', locationId: 'igreja1', track: 'teen' });
  batch.set(db.doc('users/aluno2'), { id: 'aluno2', nome: 'Bia', locationId: 'igreja1' }); // sem track == teen
  // Fora do escopo: outra igreja, e outra trilha
  batch.set(db.doc('users/aluno3'), { id: 'aluno3', nome: 'Caio', locationId: 'igreja2', track: 'teen' });
  batch.set(db.doc('users/aluno4'), { id: 'aluno4', nome: 'Duda', locationId: 'igreja1', track: 'adult' });
  // Sem igreja nenhuma: só entra com escopo=todos
  batch.set(db.doc('users/aluno5'), { id: 'aluno5', nome: 'Edu' });
  // Já carimbado numa rodada anterior — não pode ser tocado
  batch.set(db.doc('users/aluno6'), { id: 'aluno6', nome: 'Fê', locationId: 'igreja1', track: 'teen', turmaId: 'outraTurma' });

  batch.set(db.doc(`progress/aluno1_${SEMANA}`), { userId: 'aluno1', week: SEMANA, xp: 100 });
  batch.set(db.doc(`progress/aluno2_${SEMANA}`), { userId: 'aluno2', week: SEMANA, xp: 200 });
  batch.set(db.doc(`progress/aluno3_${SEMANA}`), { userId: 'aluno3', week: SEMANA, xp: 300 });
  batch.set(db.doc(`progress/aluno5_${SEMANA}`), { userId: 'aluno5', week: SEMANA, xp: 500 });
  batch.set(db.doc(`progress/aluno6_${SEMANA}`), { userId: 'aluno6', week: SEMANA, xp: 600 });
  // Progresso de usuário que não existe mais
  batch.set(db.doc(`progress/fantasma_${SEMANA}`), { userId: 'fantasma', week: SEMANA, xp: 999 });

  await batch.commit();
};

const limpar = async () => {
  for (const col of ['users', 'progress', 'turmas']) {
    const snap = await db.collection(col).get();
    const batch = db.batch();
    snap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
  }
};

const turmaDe = async (col: string, id: string) => {
  const snap = await db.doc(`${col}/${id}`).get();
  return snap.exists ? (snap.data() as any).turmaId : undefined;
};

describe('backfill de turmas', () => {
  beforeAll(async () => {
    process.env.BACKFILL_TOKEN = TOKEN;
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
  });

  afterAll(() => { delete process.env.BACKFILL_TOKEN; });

  beforeEach(async () => { await limpar(); await semear(); });

  it('recusa sem token e com token errado', async () => {
    expect((await chamar('')).ok).toBe(false);
    expect((await chamar('token=errado')).ok).toBe(false);
    // e não escreveu nada
    expect(await turmaDe('users', 'aluno1')).toBeUndefined();
  });

  it('relatório descreve a realidade sem escrever nada', async () => {
    const r = await chamar(`token=${TOKEN}`);

    expect(r.modo).toBe('relatório');
    expect(r.usuarios.total).toBe(6);
    expect(r.usuarios.jaComTurma).toBe(1);
    // aluno 1, 2, 4 e 6 em igreja1; aluno3 em igreja2; aluno5 sem igreja
    expect(r.usuarios.porIgreja).toEqual({ igreja1: 4, igreja2: 1, '(vazio)': 1 });
    expect(await turmaDe('users', 'aluno1')).toBeUndefined();
  });

  it('simulação conta o alvo certo e não grava', async () => {
    const r = await chamar(`token=${TOKEN}&turmaId=turmaPadrao`);

    expect(r.modo).toContain('simulação');
    // aluno1 e aluno2 (igreja1 + teen). aluno6 já tem turma; 3, 4 e 5 estão fora.
    expect(r.usuariosParaCarimbar).toBe(2);
    expect(await turmaDe('users', 'aluno1')).toBeUndefined();
  });

  it('aplica só no escopo: igreja e trilha da turma', async () => {
    const r = await chamar(`token=${TOKEN}&turmaId=turmaPadrao&aplicar=1`);
    expect(r.ok).toBe(true);
    expect(r.modo).toBe('aplicado');

    expect(await turmaDe('users', 'aluno1')).toBe('turmaPadrao');
    expect(await turmaDe('users', 'aluno2')).toBe('turmaPadrao');
    expect(await turmaDe('users', 'aluno3')).toBeUndefined(); // outra igreja
    expect(await turmaDe('users', 'aluno4')).toBeUndefined(); // outra trilha
    expect(await turmaDe('users', 'aluno5')).toBeUndefined(); // sem igreja
    expect(await turmaDe('users', 'aluno6')).toBe('outraTurma'); // preservado
  });

  // A trava dos invariantes #47/#48: progresso de dono sem turma NÃO pode ser
  // carimbado, senão o save de quiz daquele aluno passa a ser recusado.
  it('nunca carimba progresso de dono que ficou sem turma', async () => {
    await chamar(`token=${TOKEN}&turmaId=turmaPadrao&aplicar=1`);

    expect(await turmaDe('progress', `aluno1_${SEMANA}`)).toBe('turmaPadrao');
    expect(await turmaDe('progress', `aluno2_${SEMANA}`)).toBe('turmaPadrao');
    // donos fora do escopo continuam sem turma -> progresso intocado
    expect(await turmaDe('progress', `aluno3_${SEMANA}`)).toBeUndefined();
    expect(await turmaDe('progress', `aluno5_${SEMANA}`)).toBeUndefined();
    // dono já tinha turma de antes -> progresso segue a turma DELE, não a nova
    expect(await turmaDe('progress', `aluno6_${SEMANA}`)).toBe('outraTurma');
    // órfão nunca é tocado
    expect(await turmaDe('progress', `fantasma_${SEMANA}`)).toBeUndefined();
  });

  it('escopo=todos alcança quem não tem igreja', async () => {
    const r = await chamar(`token=${TOKEN}&turmaId=turmaPadrao&escopo=todos&aplicar=1`);

    expect(r.usuariosParaCarimbar).toBe(5); // todos menos aluno6, que já tinha
    expect(await turmaDe('users', 'aluno5')).toBe('turmaPadrao');
    expect(await turmaDe('users', 'aluno6')).toBe('outraTurma');
  });

  it('é idempotente: a segunda passada não muda nada', async () => {
    const primeira = await chamar(`token=${TOKEN}&turmaId=turmaPadrao&aplicar=1`);
    const segunda = await chamar(`token=${TOKEN}&turmaId=turmaPadrao&aplicar=1`);

    expect(primeira.usuariosParaCarimbar).toBe(2);
    expect(segunda.usuariosParaCarimbar).toBe(0);
    expect(segunda.progressoParaCarimbar).toBe(0);
    expect(await turmaDe('users', 'aluno1')).toBe('turmaPadrao');
  });

  it('recusa turma que não existe', async () => {
    const r = await chamar(`token=${TOKEN}&turmaId=naoExiste&aplicar=1`);

    expect(r.ok).toBe(false);
    expect(await turmaDe('users', 'aluno1')).toBeUndefined();
  });
});
