import { describe, it, expect, afterEach } from 'vitest';
import handler from '../../netlify/functions/backfill-turmas.mts';

// A função fica numa URL pública e escreve no banco de produção. Estas
// checagens acontecem ANTES de qualquer acesso ao Firestore — é por isso que
// dá para testá-las sem credencial nenhuma, e é por isso que elas seguram
// mesmo se a conta de serviço estiver configurada.

const original = process.env.BACKFILL_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.BACKFILL_TOKEN;
  else process.env.BACKFILL_TOKEN = original;
});

const chamar = (url: string, init?: RequestInit) => handler(new Request(url, init));

describe('backfill-turmas — a porta', () => {
  it('sem BACKFILL_TOKEN configurado, não roda', async () => {
    delete process.env.BACKFILL_TOKEN;
    const res = await chamar('https://x/.netlify/functions/backfill-turmas?mapa=1');

    expect(res.status).toBe(503);
    expect((await res.json()).erro).toMatch(/BACKFILL_TOKEN/);
  });

  it('token errado não passa', async () => {
    process.env.BACKFILL_TOKEN = 'segredo';
    const res = await chamar('https://x/.netlify/functions/backfill-turmas?token=chute&mapa=1');

    expect(res.status).toBe(401);
  });

  it('token vazio não vira passe livre', async () => {
    process.env.BACKFILL_TOKEN = 'segredo';
    const res = await chamar('https://x/.netlify/functions/backfill-turmas?mapa=1');

    expect(res.status).toBe(401);
  });
});
