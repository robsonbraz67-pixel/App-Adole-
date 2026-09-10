// Verificador de função indefinida no firestore.rules.
//
// POR QUE ISTO EXISTE (ver o comentário longo em firestore.rules, ~L387):
// em 2026-07-25 a função ownLocationId() foi apagada por engano numa limpeza
// feita por range de texto. A referência a ela ficou órfã dentro de
// isValidProgress, e o `firebase deploy` PUBLICOU assim mesmo — a validação da
// CLI não pega função indefinida, o erro só aparece em tempo de execução.
// Resultado: toda gravação de progresso de todo aluno matriculado falhou em
// silêncio até dois usuários reclamarem.
//
// Os testes do emulador pegam isso quando algum teste passa pelo caminho da
// função quebrada. Este script pega ANTES, e pega também as funções que nenhum
// teste exercita hoje.

import { readFileSync } from 'node:fs';

const arquivo = process.argv[2] || 'firestore.rules';
const fonte = readFileSync(arquivo, 'utf8');

// Comentários viram espaço para não confundir a varredura
const limpo = fonte.replace(/\/\/[^\n]*/g, '');

// Funções definidas no próprio arquivo
const definidas = new Set(
  [...limpo.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]),
);

// Globais da linguagem de regras (chamadas sem ponto antes)
const GLOBAIS = new Set([
  'exists', 'existsAfter', 'get', 'getAfter', 'debug',
  'float', 'int', 'string', 'bool', 'path', 'duration', 'timestamp',
  'if', 'return', 'function', 'allow', 'match', 'service',
]);

// Chamadas que NÃO são método (sem '.' nem caractere de palavra antes).
// Métodos como .hasOnly() e .size() são da linguagem e não precisam existir aqui.
const chamadas = [...limpo.matchAll(/(?<![.\w])(\w+)\s*\(/g)].map(m => ({
  nome: m[1],
  linha: limpo.slice(0, m.index).split('\n').length,
}));

const orfas = chamadas.filter(
  c => !definidas.has(c.nome) && !GLOBAIS.has(c.nome),
);

if (orfas.length === 0) {
  console.log(`✅ ${arquivo}: ${definidas.size} funções definidas, nenhuma chamada órfã.`);
  process.exit(0);
}

console.error(`❌ ${arquivo}: chamada a função que não existe.\n`);
for (const o of orfas) {
  console.error(`   linha ${o.linha}: ${o.nome}()`);
}
console.error(
  '\nUma regra que chama função inexistente é PUBLICADA sem erro e falha em',
  '\ntempo de execução, recusando gravações em silêncio. Corrija antes do deploy.',
);
process.exit(1);
