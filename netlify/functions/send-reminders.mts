import type { Config } from "@netlify/functions";

// Mapeamento: JS getDay() → ID do dia na lição (Sáb=1, Dom=2, Seg=3 … Sex=7)
const DAYS_MAP: Record<number, number> = { 6: 1, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export default async (): Promise<Response> => {
  // Lazy imports so firebase-admin doesn't conflict with browser bundle
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }

  // Named Firestore database (same as VITE_FB_FIRESTORE_DB)
  const db = getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');

  // Hora atual no fuso de Brasília (UTC-3)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const week = getISOWeek(now);
  const todayDayId = DAYS_MAP[now.getDay()];

  // Busca usuários com opt-in WhatsApp ativo
  const usersSnap = await db.collection('users')
    .where('whatsappOptIn', '==', true)
    .get();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();

    // Pula: sem telefone, admin, convidado
    if (!user.telefone || user.isAdmin || user.isGuest) { skipped++; continue; }

    // Pula se já estudou hoje
    try {
      const progSnap = await db.collection('progress').doc(`${userDoc.id}_${week}`).get();
      const done: number[] = progSnap.exists ? (progSnap.data()?.done ?? []) : [];
      if (done.includes(todayDayId)) { skipped++; continue; }
    } catch {
      // Sem doc de progresso = não estudou → envia
    }

    // Envia via Meta WhatsApp Cloud API
    // Pré-requisito: template "lembrete_estudo" aprovado na conta Meta Business
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: user.telefone,
          type: 'template',
          template: {
            name: 'lembrete_estudo',
            language: { code: 'pt_BR' },
            components: [{
              type: 'body',
              parameters: [{ type: 'text', text: (user.nome ?? 'amigo').split(' ')[0] }],
            }],
          },
        }),
      }
    );

    if (resp.ok) {
      sent++;
    } else {
      const err = await resp.json().catch(() => ({}));
      console.error(`Falha ao enviar para ${userDoc.id}:`, JSON.stringify(err));
      errors.push(userDoc.id);
      skipped++;
    }
  }

  console.log(`Lembretes WhatsApp: ${sent} enviados, ${skipped} pulados, semana ${week}, dia ${todayDayId}`);

  return new Response(JSON.stringify({ sent, skipped, week, todayDayId, errors }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Roda todo dia às 8h BRT (11h UTC)
export const config: Config = {
  schedule: "0 11 * * *",
};
