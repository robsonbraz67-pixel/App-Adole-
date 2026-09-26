import { dbAdmin } from './lib/firebaseAdmin';

// ===== Apaga pedidos de oração vencidos (mural) =====
//
// O cliente já para de MOSTRAR um pedido com mais de 7 dias assim que ele
// vence (ver MURAL_VALIDADE_DIAS/listenToPedidosOracao em src/firebase.ts) —
// isso é só o filtro de leitura, o documento continua existindo. Este script
// é quem apaga de verdade: roda diariamente (.github/workflows/
// expire-pedidos-oracao.yml) e usa o Admin SDK para varrer TODAS as turmas de
// uma vez, sem depender de alguém abrir o mural (a regra do cliente só deixa
// autor/professor/admin apagar, um pedido de cada vez).
const VALIDADE_DIAS = 7;

export const run = async () => {
  const db = dbAdmin();
  const corte = Date.now() - VALIDADE_DIAS * 86400000;

  const snap = await db.collection('pedidosOracao')
    .where('criadoEm', '<', new Date(corte))
    .get();

  if (snap.empty) {
    console.log('Nenhum pedido vencido.');
    return { apagados: 0 };
  }

  // Lote único: a varredura diária não passa de algumas dezenas de docs (o
  // mural já limita a 60 por turma) — bem abaixo do teto de 500 por batch.
  const batch = db.batch();
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();

  console.log(`Apagados ${snap.size} pedido(s) de oração vencido(s) (mais de ${VALIDADE_DIAS} dias).`);
  return { apagados: snap.size };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => { console.error(err); process.exitCode = 1; });
}
