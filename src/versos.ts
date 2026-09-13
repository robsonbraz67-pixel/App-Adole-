// Versículos clicáveis: acha as referências bíblicas que já existem no texto da
// lição ("Leia Romanos 12:5", "1Coríntios 12:4-13,27,28") e busca o texto na
// Almeida (domínio público) pela bible-api.com.
//
// Por que o texto bíblico NÃO vem embutido no app: uma Bíblia inteira são
// alguns MB no bundle que todo aluno baixaria para ler três versículos — e
// versículo digitado errado num app de estudo é pior do que versículo nenhum.
// Buscar da fonte evita as duas coisas. O que foi aberto uma vez fica no
// localStorage e continua abrindo sem internet.

type Livro = { re: string; nome: string; numerado?: boolean };

// A ordem importa pouco (o motor faz backtracking), mas os nomes toleram a
// falta de acento — o conteúdo das lições é digitado por gente, não gerado.
const LIVROS: Livro[] = [
  { re: 'G[êe]nesis', nome: 'Gênesis' },
  { re: '[ÊE]xodo', nome: 'Êxodo' },
  { re: 'Lev[íi]tico', nome: 'Levítico' },
  { re: 'N[úu]meros', nome: 'Números' },
  { re: 'Deuteron[ôo]mio', nome: 'Deuteronômio' },
  { re: 'Josu[ée]', nome: 'Josué' },
  { re: 'Ju[íi]zes', nome: 'Juízes' },
  { re: 'Rute', nome: 'Rute' },
  { re: 'Samuel', nome: 'Samuel', numerado: true },
  { re: 'Reis', nome: 'Reis', numerado: true },
  { re: 'Cr[ôo]nicas', nome: 'Crônicas', numerado: true },
  { re: 'Esdras', nome: 'Esdras' },
  { re: 'Neemias', nome: 'Neemias' },
  { re: 'Ester', nome: 'Ester' },
  // Só com acento de propósito: "Jo 3:16" quase sempre quer dizer João, e sem
  // o acento esta entrada roubaria a referência para o livro de Jó.
  { re: 'Jó', nome: 'Jó' },
  { re: 'Salmos?', nome: 'Salmos' },
  { re: 'Prov[ée]rbios', nome: 'Provérbios' },
  { re: 'Eclesiastes', nome: 'Eclesiastes' },
  { re: 'C[âa]ntico(?: dos C[âa]nticos)?', nome: 'Cântico dos Cânticos' },
  { re: 'Isa[íi]as', nome: 'Isaías' },
  { re: 'Jeremias', nome: 'Jeremias' },
  { re: 'Lamenta[çc][õo]es(?: de Jeremias)?', nome: 'Lamentações' },
  { re: 'Ezequiel', nome: 'Ezequiel' },
  { re: 'Daniel', nome: 'Daniel' },
  { re: 'Os[ée]ias', nome: 'Oséias' },
  { re: 'Joel', nome: 'Joel' },
  { re: 'Am[óo]s', nome: 'Amós' },
  { re: 'Obadias', nome: 'Obadias' },
  { re: 'Jonas', nome: 'Jonas' },
  { re: 'Miqu[ée]ias', nome: 'Miquéias' },
  { re: 'Naum', nome: 'Naum' },
  { re: 'Habacuque', nome: 'Habacuque' },
  { re: 'Sofonias', nome: 'Sofonias' },
  { re: 'Ageu', nome: 'Ageu' },
  { re: 'Zacarias', nome: 'Zacarias' },
  { re: 'Malaquias', nome: 'Malaquias' },
  { re: 'Mateus', nome: 'Mateus' },
  { re: 'Marcos', nome: 'Marcos' },
  { re: 'Lucas', nome: 'Lucas' },
  { re: 'Jo[ãa]o', nome: 'João', numerado: true },
  { re: 'Atos(?: dos Ap[óo]stolos)?', nome: 'Atos' },
  { re: 'Romanos', nome: 'Romanos' },
  { re: 'Cor[íi]ntios', nome: 'Coríntios', numerado: true },
  { re: 'G[áa]latas', nome: 'Gálatas' },
  { re: 'Ef[ée]sios', nome: 'Efésios' },
  { re: 'Filipenses', nome: 'Filipenses' },
  { re: 'Colossenses', nome: 'Colossenses' },
  { re: 'Tessalonicenses', nome: 'Tessalonicenses', numerado: true },
  { re: 'Tim[óo]teo', nome: 'Timóteo', numerado: true },
  { re: 'Tito', nome: 'Tito' },
  { re: 'Filem[oó]m|Filemon', nome: 'Filemom' },
  { re: 'Hebreus', nome: 'Hebreus' },
  { re: 'Tiago', nome: 'Tiago' },
  { re: 'Pedro', nome: 'Pedro', numerado: true },
  { re: 'Judas', nome: 'Judas' },
  { re: 'Apocalipse', nome: 'Apocalipse' },
];

// Grupo 1: o número do livro (1, 2, 3 ou I, II, III), quando houver — pode vir
// colado, que é como as lições escrevem ("1Coríntios").
// Grupo 2: o livro. Grupo 3: capítulo. Grupo 4: versículo(s), incluindo
// intervalo e lista ("4-13,27,28").
//
// Sem lookbehind de propósito: iPhone antigo (Safari < 16.4) não entende, e um
// erro de sintaxe aqui quebraria o app inteiro na hora de importar o módulo.
const RE_REFERENCIA = new RegExp(
  '(?:([123]|III|II|I)\\s*)?(' + LIVROS.map(l => l.re).join('|') + ')' +
  '\\s+(\\d{1,3}):(\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?(?:\\s*,\\s*\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)*)',
  'g',
);

const ROMANOS: Record<string, string> = { I: '1', II: '2', III: '3' };

const acharLivro = (trecho: string): Livro | undefined => {
  for (const l of LIVROS) {
    if (new RegExp('^(?:' + l.re + ')$').test(trecho)) return l;
  }
  return undefined;
};

export type Pedaco = { tipo: 'texto'; valor: string } | { tipo: 'ref'; valor: string; ref: string };

// Quebra um texto em pedaços de texto puro e referências bíblicas. `valor` é o
// que aparece na tela (exatamente como está na lição) e `ref` é a referência
// normalizada que a API entende ("1Coríntios 12:4" -> "1 Coríntios 12:4").
export const partirEmVersos = (texto: string): Pedaco[] => {
  const pedacos: Pedaco[] = [];
  let cursor = 0;
  RE_REFERENCIA.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RE_REFERENCIA.exec(texto)) !== null) {
    const [inteiro, numeroBruto, livroBruto, capitulo, versiculos] = m;
    const livro = acharLivro(livroBruto);
    if (!livro) continue;

    const numero = numeroBruto ? (ROMANOS[numeroBruto] || numeroBruto) : '';
    // Número antes de livro que não é numerado ("...ponto 2 Daniel 7:1") não é
    // parte da referência: fica no texto comum.
    const usaNumero = !!numero && !!livro.numerado;
    const inicio = m.index + (numeroBruto && !usaNumero ? inteiro.indexOf(livroBruto) : 0);

    if (inicio > cursor) pedacos.push({ tipo: 'texto', valor: texto.slice(cursor, inicio) });
    pedacos.push({
      tipo: 'ref',
      valor: texto.slice(inicio, m.index + inteiro.length),
      ref: `${usaNumero ? numero + ' ' : ''}${livro.nome} ${capitulo}:${versiculos.replace(/\s+/g, '')}`,
    });
    cursor = m.index + inteiro.length;
  }

  if (cursor < texto.length) pedacos.push({ tipo: 'texto', valor: texto.slice(cursor) });
  return pedacos;
};

// A referência é uma referência inteira e nada mais? (o versiculoChave da lição
// às vezes traz "Reflexão" ou "História" no lugar de uma passagem)
export const ehReferencia = (texto: string): string | null => {
  const pedacos = partirEmVersos((texto || '').trim());
  return pedacos.length === 1 && pedacos[0].tipo === 'ref' ? pedacos[0].ref : null;
};

export type Verso = { referencia: string; texto: string };

const CHAVE_CACHE = 'verso_';

export const buscarVerso = async (ref: string): Promise<Verso> => {
  const chave = CHAVE_CACHE + ref;
  try {
    const salvo = localStorage.getItem(chave);
    if (salvo) return JSON.parse(salvo);
  } catch {}

  const r = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=almeida`);
  if (!r.ok) throw new Error('Não deu para carregar agora.');
  const d = await r.json();
  if (!d?.text) throw new Error('Não encontrei essa passagem.');

  const verso: Verso = { referencia: d.reference || ref, texto: String(d.text).replace(/\s+/g, ' ').trim() };
  try { localStorage.setItem(chave, JSON.stringify(verso)); } catch {}
  return verso;
};
