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

export const recarregar = () => {
  // replace() em vez de reload() para a versão antiga não voltar no botão
  // "voltar" do navegador.
  window.location.replace(window.location.pathname + window.location.search);
};

export const INTERVALO_CHECAGEM_MS = 15 * 60 * 1000;
