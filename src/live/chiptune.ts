// Trilhas de fundo do Modo Ao Vivo: composições ORIGINAIS, nenhuma delas é a
// melodia de música existente. São duas, com papéis diferentes:
//
//   'lobby' — enquanto a turma entra pelo QR. Lenta, em tom menor, grave
//             pesado e timbres mais encorpados (osciladores desafinados
//             entre si, na linha do som de 16 bits): clima de expectativa.
//   'jogo'  — durante as perguntas. Rápida, maior, batida dançante 8-bit.
//
// Por que agendamento próprio e não setTimeout encadeado: setTimeout erra
// dezenas de milissegundos e o erro ACUMULA — em um minuto a batida já
// desanda. Aqui um relógio de baixa frequência (a cada 25ms) só enfileira o
// que vai tocar nos próximos 120ms, e cada nota recebe o instante exato no
// relógio do próprio AudioContext, que não desliza.

export type Trilha = 'jogo' | 'lobby';

let ctx: AudioContext | null = null;
let mestre: GainNode | null = null;
let ruido: AudioBuffer | null = null;
let relogio: any = null;
let passo = 0;
let proximoPassoEm = 0;
let trilhaAtual: Trilha | null = null;

const INTERVALO_RELOGIO_MS = 25;
const JANELA_S = 0.12;               // quanto agendar à frente

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ===== Trilha 'jogo' =====
// Progressão I–V–vi–IV, um acorde por compasso: alegre e conclusiva, é o que
// dá o clima de "vitória" sem precisar de melodia complicada.
const BAIXOS = [36, 31, 33, 29];                    // C2, G1, A1, F1
const ARPEJOS = [
  [72, 76, 79, 84],   // C
  [71, 74, 79, 83],   // G
  [69, 72, 76, 81],   // Am
  [65, 69, 72, 77],   // F
];

// Bumbo four-on-the-floor + contratempo: a base do "animado".
const BUMBO = new Set([0, 4, 8, 12]);
const CAIXA = new Set([4, 12]);

// ===== Trilha 'lobby' =====
// i–VI–III–V em lá menor: a última (E maior) não resolve, deixa pendurado —
// é o que dá a sensação de "vai começar alguma coisa".
const LOBBY_BAIXOS = [33, 29, 36, 28];              // A1, F1, C2, E1
const LOBBY_ACORDES = [
  [57, 60, 64],   // Am
  [53, 57, 60],   // F
  [48, 52, 55],   // C
  [52, 56, 59],   // E
];
// Melodia rala, só notas soltas: em música de suspense o silêncio entre elas
// é que segura a tensão. -1 = compasso sem nota nenhuma.
const LOBBY_MELODIA = [81, -1, 84, 76];

const criarRuido = (c: AudioContext) => {
  const buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
  const dados = buf.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  return buf;
};

const montar = () => {
  const c = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Cadeia mestre. O lowshelf é o "realce de graves" pedido: tudo abaixo de
  // ~170Hz sobe junto. O compressor logo depois evita que esse reforço estoure
  // o alto-falante quando bumbo e baixo caem no mesmo instante.
  const grave = c.createBiquadFilter();
  grave.type = 'lowshelf';
  grave.frequency.value = 170;
  // 8dB e não mais: medindo a saída real, com 10dB o grave ficava ~31dB acima
  // dos médios e a melodia sumia embaixo do baixo. O alvo é grave dominante,
  // não grave sozinho.
  grave.gain.value = 8;

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  // Limitador de segurança, o último da fila. O compressor acima trabalha o
  // corpo do som (ataque de 3ms, joelho macio), mas deixa passar o transiente
  // — e era por ali que o grave do lobby estourava. Este aqui é rápido e
  // quase vertical: não molda nada, só impede que a soma passe de 0 dBFS.
  const limitador = c.createDynamicsCompressor();
  limitador.threshold.value = -2;
  limitador.knee.value = 0;
  limitador.ratio.value = 20;
  limitador.attack.value = 0.001;
  limitador.release.value = 0.06;

  // Folga proposital. Medindo a saída, com 0.34 o pico batia -0.3 dBFS e o
  // limitador ficava agarrado no sinal o tempo todo — mesmo sem clipar, um
  // limitador sempre trabalhando abafa e "bombeia", que é como o grave
  // estourado se manifesta em caixinha ruim. Aqui ele só entra nos picos.
  // É música de FUNDO: quem levanta o volume é o amplificador da sala.
  const g = c.createGain();
  g.gain.value = 0.2;

  g.connect(grave).connect(comp).connect(limitador).connect(c.destination);

  ctx = c;
  mestre = g;
  ruido = criarRuido(c);
};

// ===== Instrumentos =====

const tocarBumbo = (t: number) => {
  const c = ctx!, saida = mestre!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  // Varredura de 150Hz para 45Hz: é isso que dá o "soco" do bumbo, em vez de
  // um bip grave sem ataque.
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
  g.gain.setValueAtTime(0.78, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  osc.connect(g).connect(saida);
  osc.start(t);
  osc.stop(t + 0.26);
};

const tocarCaixa = (t: number) => {
  const c = ctx!, saida = mestre!;
  const src = c.createBufferSource();
  const filtro = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = ruido!;
  filtro.type = 'bandpass';
  filtro.frequency.value = 1900;
  filtro.Q.value = 0.8;
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  src.connect(filtro).connect(g).connect(saida);
  src.start(t);
  src.stop(t + 0.15);
};

const tocarChimbal = (t: number, aberto: boolean) => {
  const c = ctx!, saida = mestre!;
  const src = c.createBufferSource();
  const filtro = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = ruido!;
  filtro.type = 'highpass';
  filtro.frequency.value = 7000;
  const dur = aberto ? 0.12 : 0.04;
  g.gain.setValueAtTime(aberto ? 0.17 : 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filtro).connect(g).connect(saida);
  src.start(t);
  src.stop(t + dur + 0.02);
};

// Baixo: dente-de-serra por um filtro passa-baixa (o "corpo") somado a um
// seno uma oitava abaixo (o sub, que se sente mais do que se ouve).
const tocarBaixo = (t: number, midi: number, dur: number, ganho = 1) => {
  const c = ctx!, saida = mestre!;

  const osc = c.createOscillator();
  const filtro = c.createBiquadFilter();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = midiHz(midi);
  filtro.type = 'lowpass';
  filtro.Q.value = 6;
  filtro.frequency.setValueAtTime(1400, t);
  filtro.frequency.exponentialRampToValueAtTime(320, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4 * ganho, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filtro).connect(g).connect(saida);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  const sub = c.createOscillator();
  const gs = c.createGain();
  sub.type = 'sine';
  sub.frequency.value = midiHz(midi - 12);
  gs.gain.setValueAtTime(0.0001, t);
  gs.gain.exponentialRampToValueAtTime(0.46 * ganho, t + 0.015);
  // No lobby a nota é longa: sustenta boa parte do compasso e só cai no fim,
  // senão o grave "some" no meio e a sensação de peso vai junto.
  if (dur > 1.5) gs.gain.setValueAtTime(0.46 * ganho, t + dur * 0.7);
  gs.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sub.connect(gs).connect(saida);
  sub.start(t);
  sub.stop(t + dur + 0.02);
};

// Melodia/arpejo: onda quadrada, que é o som "8-bit" clássico.
const tocarNota = (t: number, midi: number, dur: number, volume: number, tipo: OscillatorType = 'square') => {
  const c = ctx!, saida = mestre!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.value = midiHz(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(saida);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

// Naipe encorpado da trilha do lobby: duas serras levemente desafinadas uma
// da outra. É o desafino que engorda o som — dois osciladores afinados
// idênticos soariam como um só, fino. Filtro passa-baixa abrindo devagar dá
// o movimento lento que o clima de suspense pede.
const tocarPad = (t: number, midis: number[], dur: number, volume: number) => {
  const c = ctx!, saida = mestre!;
  const filtro = c.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.Q.value = 3;
  filtro.frequency.setValueAtTime(340, t);
  filtro.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
  filtro.frequency.linearRampToValueAtTime(500, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + dur * 0.25);   // entrada lenta
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filtro.connect(g).connect(saida);
  midis.forEach(m => {
    [-7, 7].forEach(cents => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(m) * Math.pow(2, cents / 1200);
      osc.connect(filtro);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  });
};

// Batida cardíaca do lobby: tom grave e surdo, sem ataque metálico.
const tocarTom = (t: number, midi: number, volume: number) => {
  const c = ctx!, saida = mestre!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(midiHz(midi) * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(midiHz(midi), t + 0.09);
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(g).connect(saida);
  osc.start(t);
  osc.stop(t + 0.55);
};

// ===== Efeitos de jogo =====
// Ficam FORA do ganho mestre da trilha: são avisos, precisam ser ouvidos por
// cima da música, e não podem sumir junto quando a música é mutada.
// Todos desistem em silêncio se o áudio ainda não foi liberado — é melhor
// não ter efeito do que estourar erro no meio de uma partida.
const efeitoPronto = () => !!ctx && !!mestre && ctx.state === 'running';

const blip = (
  atrasoS: number, midiDe: number, midiPara: number, dur: number, vol: number, tipo: OscillatorType = 'square'
) => {
  const c = ctx!;
  const t = c.currentTime + atrasoS;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(midiHz(midiDe), t);
  if (midiPara !== midiDe) osc.frequency.exponentialRampToValueAtTime(midiHz(midiPara), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

// Gongo de abertura, antes da contagem da primeira pergunta: o "silêncio,
// vai começar" da sala. Um gongo não é uma nota — é um monte de parciais que
// NÃO são múltiplos inteiros da fundamental (por isso soa metálico, e não
// afinado), com uma pancada de ruído no ataque e um rabo longo de vários
// segundos. É isso que está montado aqui.
export const somGongo = () => {
  if (!efeitoPronto()) return;
  const c = ctx!;
  const t = c.currentTime;
  const DUR = 4.2;
  const fundamental = 92;

  const filtro = c.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(6000, t);
  filtro.frequency.exponentialRampToValueAtTime(1200, t + DUR);  // brilho cai com o tempo
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + DUR);
  filtro.connect(g).connect(c.destination);

  // Razões inarmônicas — o que separa um gongo de um simples acorde grave.
  // As três últimas passam de 600Hz de propósito: sem elas, medindo o
  // espectro, TODA a energia ficava abaixo disso e o resultado soava como
  // bumbo grave, não como metal. O brilho é o que faz ler como gongo.
  [1, 1.47, 2.09, 2.88, 3.71, 5.06, 6.93, 9.4, 12.7].forEach((razao, i) => {
    const osc = c.createOscillator();
    const gi = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fundamental * razao, t);
    // Leve queda de afinação: metal batido abaixa um pouco enquanto soa.
    osc.frequency.exponentialRampToValueAtTime(fundamental * razao * 0.985, t + DUR);
    gi.gain.value = 0.9 / (i + 1.4);          // parciais agudos entram mais fracos
    // Agudo morre antes do grave, como em metal de verdade.
    if (razao > 5) {
      gi.gain.setValueAtTime(gi.gain.value, t);
      gi.gain.exponentialRampToValueAtTime(0.0001, t + DUR * 0.35);
    }
    osc.connect(gi).connect(filtro);
    osc.start(t);
    osc.stop(t + DUR + 0.1);
  });

  // Pancada: ruído curtíssimo, é o que dá o "tá" do baqueta batendo.
  const src = c.createBufferSource();
  const gr = c.createGain();
  src.buffer = ruido!;
  gr.gain.setValueAtTime(0.35, t);
  gr.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(gr).connect(filtro);
  src.start(t);
  src.stop(t + 0.14);
};

// ===== Pódio: confete e aplausos =====

// Estouro de confete: a rolha (varredura descendente rápida) mais o esguicho
// de papel (ruído agudo caindo). Chamado algumas vezes com atrasos diferentes
// para virar uma salva, e não um "pop" solitário.
export const somConfete = (atrasoS = 0) => {
  if (!efeitoPronto()) return;
  const c = ctx!;
  const t = c.currentTime + atrasoS;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1100, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.055);   // a "rolha"
  g.gain.setValueAtTime(0.34, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.1);

  const src = c.createBufferSource();
  const hp = c.createBiquadFilter();
  const gr = c.createGain();
  src.buffer = ruido!;
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2600, t);
  hp.frequency.exponentialRampToValueAtTime(900, t + 0.4);      // o papel caindo
  gr.gain.setValueAtTime(0.26, t);
  gr.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(hp).connect(gr).connect(c.destination);
  src.start(t);
  src.stop(t + 0.5);
};

// Aplausos. Palma não é ruído contínuo: é um monte de estalos curtos e
// desencontrados. Por isso o buffer é montado somando centenas de rajadas
// curtas em posições aleatórias — ruído puro com envelope soaria como
// chuveiro ligado, não como plateia. Fica em cache: montar custa alguns
// milhões de operações e o pódio pode ser reaberto.
let bufferPalmas: AudioBuffer | null = null;
const criarPalmas = (c: AudioContext) => {
  const DUR = 5;
  const n = Math.floor(c.sampleRate * DUR);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  const palmas = 1400;
  for (let k = 0; k < palmas; k++) {
    // Concentra o começo: a plateia irrompe junta e depois se espalha.
    const quando = Math.floor(Math.pow(Math.random(), 0.7) * n * 0.9);
    const tau = c.sampleRate * (0.004 + Math.random() * 0.02);
    const amp = 0.25 + Math.random() * 0.75;
    const comp = Math.min(n - quando, Math.floor(tau * 4));
    for (let i = 0; i < comp; i++) {
      d[quando + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / tau);
    }
  }
  // Normaliza: com 1400 rajadas somadas o pico é imprevisível, e sem isto o
  // volume final dependeria da sorte do sorteio.
  let pico = 0;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(d[i]));
  if (pico > 0) for (let i = 0; i < n; i++) d[i] /= pico;
  return buf;
};

// Monta o buffer de palmas antes da hora. Medido: a montagem custa ~100ms de
// thread principal — feita na hora do pódio, ela trava a tela exatamente no
// quadro em que o confete começa a cair. Chamada no lobby, onde 100ms num
// momento ocioso não incomodam ninguém.
export const prepararPodio = () => {
  if (!ctx || bufferPalmas) return;
  const c = ctx;
  const montarAgora = () => { if (!bufferPalmas) bufferPalmas = criarPalmas(c); };
  const ric = (window as any).requestIdleCallback;
  // O `timeout` não é opcional na prática: medindo, o requestIdleCallback
  // sem prazo simplesmente não disparou em 1,5s (o navegador pode adiá-lo
  // indefinidamente se nunca enxergar um momento ocioso), e o buffer acabava
  // sendo montado no pódio de qualquer jeito. Com prazo, ele roda no ocioso
  // se houver um, e no limite do prazo se não houver.
  if (ric) ric(montarAgora, { timeout: 1500 });
  else setTimeout(montarAgora, 300);
};

export const somAplausos = () => {
  if (!efeitoPronto()) return;
  const c = ctx!;
  if (!bufferPalmas) bufferPalmas = criarPalmas(c);
  const t = c.currentTime;
  const src = c.createBufferSource();
  const bp = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = bufferPalmas;
  bp.type = 'bandpass';        // corpo da palma vive na região média-aguda
  bp.frequency.value = 1900;
  bp.Q.value = 0.6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);   // irrompe
  g.gain.setValueAtTime(0.5, t + 2.2);                  // sustenta
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.8); // e vai baixando
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + 5);
};

// Festa completa do pódio: aplausos + uma salva de confete desencontrada.
export const somPodio = () => {
  if (!efeitoPronto()) return;
  somAplausos();
  [0, 0.13, 0.31, 0.62, 0.94].forEach(a => somConfete(a));
};

// Contagem regressiva: mesma nota a cada segundo, subindo uma sexta no
// último — é a subida que faz a turma sentir que "vai começar agora".
export const somContagem = (restante: number) => {
  if (!efeitoPronto()) return;
  const grave = restante <= 1;
  blip(0, grave ? 76 : 69, grave ? 76 : 69, grave ? 0.22 : 0.1, grave ? 0.3 : 0.22);
};

// Largada: arpejo ascendente curto.
export const somVai = () => {
  if (!efeitoPronto()) return;
  [72, 76, 79, 84].forEach((m, i) => blip(i * 0.055, m, m, 0.12, 0.26));
};

// Tique da soma de pontos: bem curto e agudo, para tocar dezenas de vezes
// seguidas enquanto o número sobe sem virar zumbido.
export const somTickPonto = () => {
  if (!efeitoPronto()) return;
  blip(0, 96, 98, 0.035, 0.1);
};

// Alguém ultrapassou alguém no placar: varredura ascendente rápida.
export const somSubiuPosicao = () => {
  if (!efeitoPronto()) return;
  blip(0, 72, 88, 0.16, 0.2, 'triangle');
};

// Fim da contagem de pontos: acorde curto de resolução.
export const somPlacarPronto = () => {
  if (!efeitoPronto()) return;
  [72, 76, 79].forEach(m => blip(0, m, m, 0.35, 0.14, 'triangle'));
};

// ===== Sequenciador =====

// Um passo da trilha 'jogo' (semicolcheia a 96 BPM).
const passoJogo = (n: number, t: number, durPasso: number) => {
  const compasso = Math.floor(n / 16) % 4;
  const dentro = n % 16;
  const arpejo = ARPEJOS[compasso];
  const raiz = BAIXOS[compasso];

  if (BUMBO.has(dentro)) tocarBumbo(t);
  if (CAIXA.has(dentro)) tocarCaixa(t);
  if (dentro % 2 === 0) tocarChimbal(t, dentro === 14);

  // Baixo em colcheias, com a oitava no fim do compasso puxando a virada.
  if (dentro % 2 === 0) {
    const oitava = dentro === 10 || dentro === 14 ? 12 : 0;
    tocarBaixo(t, raiz + oitava, durPasso * 1.7);
  }

  // Arpejo correndo em semicolcheias — é o que dá a sensação de pressa boa.
  tocarNota(t, arpejo[dentro % arpejo.length], durPasso * 0.9, 0.3);

  // Contracanto mais grave, só nos tempos fortes, para engrossar sem poluir.
  if (dentro === 0 || dentro === 6) tocarNota(t, arpejo[0] - 12, durPasso * 3, 0.18, 'triangle');
};

// Um passo da trilha 'lobby' (colcheia a 66 BPM = quase 1s por passo).
// Bem menos eventos por compasso: o vazio entre eles é o que cria suspense.
const passoLobby = (n: number, t: number, durPasso: number) => {
  const compasso = Math.floor(n / 8) % 4;
  const dentro = n % 8;
  const raiz = LOBBY_BAIXOS[compasso];
  const acorde = LOBBY_ACORDES[compasso];

  // Grave pesado segurando o compasso inteiro: sub em seno (o que se sente)
  // somado à serra filtrada (o que se ouve). Volume alto de propósito — é o
  // "grave bem forte" que a trilha do lobby pede.
  if (dentro === 0) {
    // O ganho ficou em 1.35, e não nos 2.2 de antes: com 2.2 o baixo e a
    // batida caíam no mesmo instante e a soma passava de 0 dBFS — era o
    // estouro. Peso agora vem do limitador da cadeia mestre e da nota longa,
    // não de empurrar o ganho para cima.
    tocarBaixo(t, raiz, durPasso * 7.5, 1.35);
    tocarPad(t, acorde, durPasso * 7.6, 0.14);
  }

  // Batida cardíaca: "lub-dub" no começo e no meio do compasso. Volumes
  // contidos justamente porque ela cai junto com o baixo no tempo 1.
  if (dentro === 0) { tocarTom(t, 28, 0.5); tocarTom(t + durPasso * 0.42, 28, 0.3); }
  if (dentro === 4) tocarTom(t, 28, 0.34);

  // Nota solta da melodia, entrando depois do acorde assentar.
  const nota = LOBBY_MELODIA[compasso];
  if (dentro === 3 && nota > 0) tocarNota(t, nota, durPasso * 2.2, 0.11, 'triangle');
  if (dentro === 6 && nota > 0) tocarNota(t, nota - 5, durPasso * 1.4, 0.07, 'triangle');

  // Chimbal raro, só para o compasso não parecer parado.
  if (dentro === 2 || dentro === 6) tocarChimbal(t, false);
};

// Cada trilha traz seu andamento, sua subdivisão e seu padrão. Trocar de
// trilha é trocar esta linha inteira — nada de espalhar `if (lobby)` pelos
// instrumentos.
const TRILHAS: Record<Trilha, { bpm: number; divisao: number; passos: number; passo: (n: number, t: number, dur: number) => void }> = {
  jogo:  { bpm: 96, divisao: 4, passos: 64, passo: passoJogo },   // semicolcheias, 4 compassos
  lobby: { bpm: 66, divisao: 2, passos: 32, passo: passoLobby },  // colcheias, 4 compassos
};

const rodar = () => {
  const c = ctx!;
  const cfg = TRILHAS[trilhaAtual || 'jogo'];
  const durPasso = 60 / cfg.bpm / cfg.divisao;
  // Com a aba em segundo plano o navegador estrangula o setInterval, e ao
  // voltar haveria uma fila de passos já vencidos para agendar de uma vez —
  // sairiam todos juntos, como um estouro. Aqui eles são descartados e o
  // sequenciador reengata no compasso atual.
  if (proximoPassoEm < c.currentTime) proximoPassoEm = c.currentTime + 0.02;
  while (proximoPassoEm < c.currentTime + JANELA_S) {
    cfg.passo(passo, proximoPassoEm, durPasso);
    proximoPassoEm += durPasso;
    passo = (passo + 1) % cfg.passos;
  }
};

// Safari só libera áudio DENTRO do gesto do usuário: um AudioContext criado
// (ou resumido) num useEffect nasce suspenso e não volta sozinho. Por isso
// esta função existe separada de tocarMusicaFundo — ela é chamada de dentro
// do onClick do botão, onde o gesto ainda vale, e deixa o contexto pronto
// para o efeito que vem logo depois.
export const prepararAudio = () => {
  if (!ctx) montar();
  const c = ctx!;
  c.resume().catch(() => {});
  // Só o resume() não basta no Safari: ele exige que um som DE VERDADE saia
  // durante o gesto para destravar o contexto. Um buffer de 1 amostra é
  // inaudível e serve exatamente para isso.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch { /* contexto ainda não utilizável: a rede de segurança pega */ }
};

export const audioLiberado = () => !!ctx && ctx.state === 'running';

// Rede de segurança para o caso de o áudio ainda vir suspenso: tenta de novo
// no primeiro toque em qualquer lugar da tela. Sem ela, o professor abre a
// sala e simplesmente não sai som, sem nenhuma pista do porquê.
let esperandoGesto = false;
const destravarNoProximoToque = () => {
  if (esperandoGesto) return;
  esperandoGesto = true;
  const tentar = () => {
    // O resume é assíncrono: conferir o state na linha seguinte sempre daria
    // "suspended" e os listeners nunca sairiam. Só desiste depois que a
    // promessa resolve e o contexto está mesmo rodando.
    prepararAudio();
    ctx?.resume().then(() => {
      if (ctx?.state !== 'running') return;
      esperandoGesto = false;
      document.removeEventListener('pointerdown', tentar);
      document.removeEventListener('touchend', tentar);
    }).catch(() => {});
  };
  document.addEventListener('pointerdown', tentar);
  document.addEventListener('touchend', tentar);
};

export const tocarMusicaFundo = (trilha: Trilha = 'jogo') => {
  if (relogio && trilhaAtual === trilha) return;   // já tocando esta: não empilhar
  if (relogio) { clearInterval(relogio); relogio = null; }
  if (!ctx) montar();
  const c = ctx!;
  c.resume().catch(() => {});
  if (c.state !== 'running') destravarNoProximoToque();
  // Só reinicia do compasso 1 quando a trilha muda de verdade. Voltar depois
  // de uma pausa (a contagem regressiva, por exemplo) retoma de onde parou —
  // recomeçar a cada pergunta faria a mesma introdução tocar 10 vezes.
  if (trilhaAtual !== trilha) passo = 0;
  trilhaAtual = trilha;
  proximoPassoEm = c.currentTime + 0.08;
  relogio = setInterval(rodar, INTERVALO_RELOGIO_MS);
};

// Parar é só desligar o sequenciador — nenhuma automação no ganho mestre.
// Como só se enfileira ~120ms à frente, o rabicho que sobra é inaudível, e
// mexer no ganho aqui só criaria estados para o play seguinte ter que
// desfazer (o efeito que chama isto monta/desmonta/monta no StrictMode).
export const pararMusicaFundo = () => {
  if (relogio) { clearInterval(relogio); relogio = null; }
};
