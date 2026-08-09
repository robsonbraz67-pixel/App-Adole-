// Relógio compartilhado do Modo Ao Vivo.
//
// O problema: toda contagem faz `questionStartedAt` (relógio do SERVIDOR)
// menos `Date.now()` (relógio do APARELHO). Um celular com a hora 30s errada
// pula a contagem regressiva inteira e vê um cronômetro errado — e ninguém
// percebe que a causa é o relógio.
//
// A correção não custa leitura nem escrita extra: quando chega um instante
// do servidor RECÉM-ESCRITO, a diferença entre ele e a hora local naquele
// momento já é o desvio (mais a latência de rede, pequena perto de um
// relógio errado).
//
// O detalhe que faz isso funcionar é o "recém-escrito". Numa amostra isolada,
// um celular 30s adiantado e uma sala aberta há 10 minutos produzem
// exatamente o mesmo número negativo — não dá para distinguir. Por isso a
// calibração só acontece quando o instante MUDA: aí sabemos que a escrita
// acabou de ocorrer, e o que sobra na conta é desvio de relógio de verdade.

// Abaixo disto é latência de rede e variação normal; corrigir só traria ruído.
const DESVIO_MINIMO_MS = 3000;
// Teto de sanidade: acima disso é dado corrompido, não relógio torto.
const DESVIO_MAXIMO_MS = 6 * 60 * 60 * 1000;

let desvioMs = 0;
let calibrado = false;
let ultimoInstante = 0;

/**
 * Recebe um instante do servidor e a hora local em que ele chegou.
 * Chamadas repetidas com o MESMO instante são ignoradas: só o primeiro
 * avistamento prova que a escrita é recente.
 */
export const calibrarRelogio = (instanteServidorMs: number, recebidoEmMs: number) => {
  if (instanteServidorMs === ultimoInstante) return;
  ultimoInstante = instanteServidorMs;

  const bruto = instanteServidorMs - recebidoEmMs;
  if (Math.abs(bruto) > DESVIO_MAXIMO_MS) return;
  // Vale para os dois lados: negativo = aparelho adiantado, positivo =
  // atrasado. Rejeitar o positivo (como eu fazia antes) deixava justamente
  // os celulares atrasados sem correção nenhuma.
  desvioMs = Math.abs(bruto) < DESVIO_MINIMO_MS ? 0 : bruto;
  calibrado = true;
};

/** Hora atual na escala do servidor. É o que as contagens devem usar. */
export const agoraServidor = () => Date.now() + desvioMs;

export const relogioCalibrado = () => calibrado;
export const desvioRelogioMs = () => desvioMs;

/**
 * Quanto tempo passou desde um instante do servidor, na escala dele. Nunca
 * devolve negativo: se o aparelho ainda achar que o instante está no futuro
 * (desvio residual), trata como "acabou de começar" — o pior caso vira uma
 * contagem cheia, que é o comportamento seguro.
 */
export const decorridoDesde = (instanteServidorMs: number) =>
  Math.max(0, agoraServidor() - instanteServidorMs);
