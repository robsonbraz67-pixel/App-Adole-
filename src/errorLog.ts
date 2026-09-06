import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { BUILD_ID } from './version';

// O ErrorBoundary só vê erro de render. Erro de efeito assíncrono, listener do
// Firebase ou promise sem .catch nunca passa por ele — por isso os dois
// listeners globais abaixo, que pegam o resto.
//
// Nenhum destes handlers roda dentro de um componente, então não têm acesso
// a `jogador`/`tela` do React — App.tsx empurra esse contexto aqui a cada
// mudança (setErroContexto), e os handlers só leem a cópia mais recente.
type Contexto = { userId?: string | null; nome?: string | null; email?: string | null; tela?: string | null };
let contexto: Contexto = {};
export const setErroContexto = (c: Contexto) => { contexto = c; };

const camposComuns = () => ({
  userId: contexto.userId ?? auth.currentUser?.uid ?? null,
  nome: contexto.nome ?? null,
  email: contexto.email ?? auth.currentUser?.email ?? null,
  tela: contexto.tela ?? null,
  buildId: BUILD_ID,
  userAgent: navigator.userAgent,
});

// Fire-and-forget: um log que falha (offline, regra, o que for) não pode virar
// um segundo erro nem travar quem já está vendo a tela de erro.
export const registrarErro = (origem: 'boundary' | 'window' | 'promise', mensagem: string, detalhe?: string) => {
  try {
    addDoc(collection(db, 'errorLogs'), {
      ...camposComuns(),
      origem,
      mensagem: String(mensagem || '(sem mensagem)').slice(0, 2000),
      detalhe: String(detalhe || '').slice(0, 4000),
      url: location.href,
      criadoEm: serverTimestamp(),
    }).catch(() => {});
  } catch { /* nunca deixa o log de erro virar um erro novo */ }
};

export const instalarCapturaGlobalDeErros = () => {
  window.addEventListener('error', (ev) => {
    registrarErro('window', ev.message, ev.error?.stack || `${ev.filename}:${ev.lineno}:${ev.colno}`);
  });
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const r: any = ev.reason;
    registrarErro('promise', r?.message || String(r), r?.stack || '');
  });
};

// Relato manual do usuário (botão "Reportar um problema" ou a tela de erro).
// Ao contrário do log automático, aqui vale saber se deu certo — a UI precisa
// confirmar o envio (ou avisar para tentar de novo).
export const reportarProblema = async (mensagem: string, ultimoErro?: string): Promise<boolean> => {
  try {
    await addDoc(collection(db, 'userReports'), {
      ...camposComuns(),
      mensagem: String(mensagem || '').slice(0, 1000),
      ultimoErro: String(ultimoErro || '').slice(0, 2000),
      status: 'novo',
      criadoEm: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
};
