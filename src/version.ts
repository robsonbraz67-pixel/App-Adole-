// ===== Atualização automática do PWA =====
//
// O app fica dias aberto em memória num celular, então quem não fecha a aba
// continua rodando o bundle de semanas atrás — é assim que uma correção já
// publicada continua "bugada" para parte das pessoas.
//
// Como funciona: o build embute __BUILD_ID__ no bundle e publica o MESMO id em
// /version.json. O cliente compara os dois de tempos em tempos; se diferirem,
// existe versão nova no ar e ele se recarrega.
//
// A regra que importa: NUNCA recarregar no meio de um quiz. Um reload ali
// perderia as respostas e o XP daquela rodada. Em tela segura o app se atualiza
// sozinho e em silêncio; em tela sensível ele espera, avisando com um aviso
// discreto, e aplica assim que a pessoa sair.

declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

// Telas em que recarregar não custa nada: nenhum trabalho em andamento se perde.
// 'oracoes' NÃO entra: quem está ali pode estar no meio de escrever um pedido,
// e um reload jogaria o texto fora — o aviso discreto espera a pessoa sair.
const TELAS_SEGURAS = new Set(['splash', 'login', 'home', 'ranking', 'sorteador', 'dupla', 'config', 'admin']);

export const telaPermiteReload = (tela: string) => TELAS_SEGURAS.has(tela);

// Busca o id publicado. Sem cache: é justamente esse arquivo que não pode vir
// velho. Falha de rede devolve null — ficar offline não é motivo de aviso.
export const buscarBuildPublicado = async (): Promise<string | null> => {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.buildId === 'string' ? d.buildId : null;
  } catch {
    return null;
  }
};

// Aviso de troca de endereço (migração Netlify → Firebase Hosting): busca o
// campo opcional avisoNovoEndereco de version.json — o mesmo arquivo que já
// existe para o build id, mas separado do BUILD_ID para não mexer em quem já
// lê buscarBuildPublicado (App.tsx, ErrorBoundary.tsx). Ausente/null na
// maior parte do tempo; só vem preenchido no deploy que liga o interruptor
// (ver vite.config.ts).
export const buscarAvisoNovoEndereco = async (): Promise<string | null> => {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.avisoNovoEndereco === 'string' ? d.avisoNovoEndereco : null;
  } catch {
    return null;
  }
};

// Trava do loop de recarregar: depois de recarregar por versão nova, o
// próprio reload conta como "abriu de novo" — se o bundle continuar
// desatualizado (cache do navegador ainda não convergiu com o servidor, mais
// comum no Safari/iOS nos primeiros segundos depois de um deploy), o app
// cai num loop que nunca sai do lugar. Este contador em sessionStorage (por
// aba — zera ao fechar) trava depois de algumas tentativas na mesma sessão:
// melhor continuar com a versão de alguns segundos atrás do que nunca abrir.
const RELOAD_GUARD_KEY = 'sq_reload_guard';
const RELOAD_GUARD_MAX = 3;

export const podeRecarregarDeNovo = (): boolean => {
  try {
    return Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0') < RELOAD_GUARD_MAX;
  } catch {
    return true;
  }
};

export const recarregar = () => {
  try {
    const n = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(n + 1));
  } catch { /* sessionStorage indisponível (modo privado etc.) — segue sem contar */ }
  // replace() em vez de reload() para a versão antiga não voltar no botão
  // "voltar". Cache-bust (_r=timestamp) em vez de reconstruir a MESMA URL:
  // o Safari às vezes reaproveita o documento em cache num reload pra uma
  // URL idêntica mesmo com no-cache/must-revalidate — uma URL genuinamente
  // nova nunca vem do cache, então força a rede a responder de verdade.
  const separador = window.location.search ? '&' : '?';
  window.location.replace(`${window.location.pathname}${window.location.search}${separador}_r=${Date.now()}`);
};

export const INTERVALO_CHECAGEM_MS = 15 * 60 * 1000;
