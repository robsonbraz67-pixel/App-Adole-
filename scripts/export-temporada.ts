import { writeFileSync } from 'node:fs';
import { dbAdmin } from './lib/firebaseAdmin';

// ===== Export bruto de uma temporada (para o encerramento) =====
//
// Só leitura. Grava temporada.json com o mínimo para os números do
// encerramento: progresso das semanas da temporada (history reduzido a data e
// XP — nada de nota), perfil enxuto de quem aparece nele, turmas, igrejas e
// sorteios. O workflow criptografa o arquivo antes de subir como artefato: o
// repositório é público e aqui tem nome de adolescente.

const SEMANAS = (process.env.SEMANAS || '').split(',').map(s => s.trim()).filter(Boolean);

export const run = async () => {
  if (!SEMANAS.length) throw new Error('SEMANAS vazio');
  const db = dbAdmin();

  const progress: any[] = [];
  for (let i = 0; i < SEMANAS.length; i += 30) {
    const snap = await db.collection('progress').where('week', 'in', SEMANAS.slice(i, i + 30)).get();
    snap.forEach(d => {
      const p = d.data();
      const history: Record<string, any> = {};
      for (const [dia, e] of Object.entries<any>(p.history || {})) history[dia] = { emISO: e?.emISO ?? null, xp: e?.xp ?? 0 };
      progress.push({
        id: d.id, userId: p.userId, week: p.week, track: p.track || 'teen', trimestre: p.trimestre ?? null,
        turmaId: p.turmaId ?? null, locationId: p.locationId ?? null,
        nome: p.nome, avatar: p.avatar, xp: p.xp || 0, done: p.done || [], history,
        isAdmin: !!p.isAdmin, isProfessor: !!p.isProfessor, isGuest: !!p.isGuest,
      });
    });
  }

  const ids = new Set(progress.map(p => p.userId));
  const users: any[] = [];
  (await db.collection('users').get()).forEach(d => {
    if (!ids.has(d.id)) return;
    const u = d.data();
    users.push({
      id: d.id, nome: u.nome ?? u.name ?? null, track: u.track ?? null, turmaId: u.turmaId ?? null,
      locationId: u.locationId ?? null, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor,
      isGuest: !!u.isGuest, criadoEm: u.criadoEm ?? null,
    });
  });

  const turmas: any[] = [];
  (await db.collection('turmas').get()).forEach(d => {
    const t = d.data();
    turmas.push({ id: d.id, nome: t.nome ?? t.name ?? null, track: t.track ?? null, locationId: t.locationId ?? null, professores: t.professores ?? [] });
  });

  const locais: any[] = [];
  (await db.collection('studyLocations').get()).forEach(d => locais.push({ id: d.id, nome: d.data().name ?? null }));

  const sorteios: any[] = [];
  (await db.collection('sorteios').get()).forEach(d => {
    const s = d.data();
    sorteios.push({ id: d.id, ...s, criadoEm: s.criadoEm?.toDate?.().toISOString() ?? null });
  });

  writeFileSync('temporada.json', JSON.stringify({ geradoEm: new Date().toISOString(), semanas: SEMANAS, progress, users, turmas, locais, sorteios }));
  // Só contagens no log: o log de um repositório público é público.
  console.log(`progress=${progress.length} users=${users.length} turmas=${turmas.length} locais=${locais.length} sorteios=${sorteios.length}`);
};

run().catch(e => { console.error(e); process.exit(1); });
