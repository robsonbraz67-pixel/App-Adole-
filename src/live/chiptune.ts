// Trilha de fundo do Modo Ao Vivo: composição ORIGINAL em estilo chiptune
// (osciladores de onda quadrada, como um jogo 8-bit), clima animado e
// vitorioso — pensada para tocar no telão enquanto a turma joga. Não é a
// melodia de nenhuma música existente.
let audioCtx: AudioContext | null = null;
let pararAtual: (() => void) | null = null;

const getCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
};

const NOTAS: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
};

// Melodia + linha de baixo, em compassos de 8 colcheias (loop de ~4.8s).
const MELODIA: [string, number][] = [
  ['C5', 0.3], ['E5', 0.3], ['G5', 0.3], ['C5', 0.3],
  ['D5', 0.3], ['E5', 0.3], ['G5', 0.6],
  ['A4', 0.3], ['C5', 0.3], ['E5', 0.3], ['A4', 0.3],
  ['G4', 0.3], ['A4', 0.3], ['C5', 0.6],
];
const BAIXO: [string, number][] = [
  ['C4', 0.6], ['C4', 0.6], ['A4', 0.6], ['G4', 0.6],
  ['F4', 0.6], ['F4', 0.6], ['G4', 0.6], ['G4', 0.6],
];

const tocarLinha = (ctx: AudioContext, linha: [string, number][], tipo: OscillatorType, volume: number, i: number, cancelRef: { v: boolean }) => {
  if (cancelRef.v) return;
  const [nome, dur] = linha[i % linha.length];
  const freq = NOTAS[nome];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  gain.gain.setTargetAtTime(0.0001, ctx.currentTime + dur * 0.85, 0.03);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
  setTimeout(() => tocarLinha(ctx, linha, tipo, volume, i + 1, cancelRef), dur * 1000);
};

export const tocarMusicaFundo = () => {
  pararMusicaFundo();
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const cancelRef = { v: false };
  tocarLinha(ctx, MELODIA, 'square', 0.05, 0, cancelRef);
  tocarLinha(ctx, BAIXO, 'triangle', 0.07, 0, cancelRef);
  pararAtual = () => { cancelRef.v = true; };
};

export const pararMusicaFundo = () => {
  pararAtual?.();
  pararAtual = null;
};
