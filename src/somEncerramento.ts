import { getAudioCtx, somLigado, playSound } from './utils';
import type { Deixa } from './apresentacaoEncerramento';

// ===== Sons da apresentação de encerramento =====
//
// Cada deixa do manual (docs/manual-apresentacao-encerramento.md) procura um
// arquivo GRAVADO em public/sons/encerramento/<deixa>.mp3 — fogo crepitando,
// trilha de suspense, aplausos. Esses arquivos não vêm com o app: quem
// conduz coloca os que quiser (lista em docs/manual-apresentacao-encerramento.md,
// seção "Sons").
// Sem o arquivo, a deixa cai num som sintetizado do próprio app (utils.ts)
// ou em silêncio — nunca trava a apresentação.
//
// O Hosting reescreve qualquer caminho inexistente para /index.html (200),
// então "o arquivo existe?" é decidido pelo Content-Type, não pelo status.

export const DEIXAS: Deixa[] = ['abertura', 'swoosh', 'suspense', 'impacto', 'campeao', 'aplausos', 'virada'];

const buffers: Partial<Record<Deixa, Promise<AudioBuffer | null>>> = {};

const carregar = (d: Deixa): Promise<AudioBuffer | null> =>
  buffers[d] ??= fetch(`/sons/encerramento/${d}.mp3`)
    .then(async r => {
      const tipo = r.headers.get('content-type') || '';
      if (!r.ok || !tipo.startsWith('audio')) return null;
      return getAudioCtx().decodeAudioData(await r.arrayBuffer());
    })
    .catch(() => null);

export const precarregarDeixas = () => { try { DEIXAS.forEach(carregar); } catch {} };

type Tocando = { src: AudioBufferSourceNode; gain: GainNode };
const tocando = new Set<Tocando>();

// Para tudo o que está tocando, com um fade curto (um corte seco estala na
// caixa de som). É o "silêncio antes do boom" do manual.
export const silenciar = (fadeS = 0.25) => {
  try {
    const c = getAudioCtx();
    for (const t of tocando) {
      t.gain.gain.cancelScheduledValues(c.currentTime);
      t.gain.gain.setValueAtTime(t.gain.gain.value, c.currentTime);
      t.gain.gain.linearRampToValueAtTime(0, c.currentTime + fadeS);
      try { t.src.stop(c.currentTime + fadeS + 0.02); } catch {}
    }
  } catch {}
  tocando.clear();
};

const sintetizado = (d: Deixa, pos?: number) => {
  switch (d) {
    case 'swoosh': playSound('praticar'); break;
    case 'impacto': playSound(pos === 2 ? 'prata' : 'bronze'); break;
    case 'campeao': playSound('ouro'); playSound('promocao', { t: 0.35 }); break;
    case 'virada': playSound('subiu'); break;
    // abertura, suspense e aplausos não têm versão sintetizada que preste:
    // sem arquivo, ficam em silêncio (e o apresentador usa o som da igreja).
  }
};

export const tocarDeixa = async (d: Deixa, opts: { loop?: boolean; volume?: number; pos?: number } = {}) => {
  if (!somLigado()) return;
  const buf = await carregar(d);
  if (!buf) { sintetizado(d, opts.pos); return; }
  try {
    const c = getAudioCtx();
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    const gain = c.createGain();
    gain.gain.value = opts.volume ?? 0.8;
    src.connect(gain); gain.connect(c.destination);
    const t = { src, gain };
    tocando.add(t);
    src.onended = () => tocando.delete(t);
    src.start();
  } catch { sintetizado(d, opts.pos); }
};
