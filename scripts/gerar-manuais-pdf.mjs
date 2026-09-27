import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ===== Gera os PDFs dos manuais que o painel do professor oferece para
// download (aba 📊 Temporada) =====
//
// Entrada: docs/*.md (texto puro, sem dado de aluno — por isso pode virar um
// PDF estático servido a QUALQUER professor, de qualquer turma). Saída:
// public/manuais/*.pdf, versionado no repositório — o app é 100% estático
// (Firebase Hosting), então o PDF precisa existir como arquivo antes do
// deploy, não pode ser gerado na hora pelo navegador do professor.
//
// Rode de novo sempre que editar um dos .md:
//   node scripts/gerar-manuais-pdf.mjs
//
// Depende só de um Chrome instalado na máquina (--headless=new --print-to-pdf)
// — sem lib de PDF nem de markdown no projeto, só para não carregar o app com
// uma dependência que só serve para gerar 2 arquivos estáticos.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Caminhos comuns do Chrome/Chromium — pega o primeiro que existir. Script de
// manutenção local, não roda em CI, então não precisa de mais que isso.
const CANDIDATOS_CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
];
const CHROME = CANDIDATOS_CHROME.find((c) => c.startsWith('/') ? existsSync(c) : (() => {
  try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; }
})());
if (!CHROME) throw new Error('Nenhum Chrome/Chromium encontrado. Instale um para gerar os PDFs.');

const MANUAIS = [
  { md: 'docs/relatorio-temporada.md', pdf: 'public/manuais/relatorio-temporada.pdf', titulo: 'Relatório de encerramento de temporada — manual' },
  { md: 'docs/manual-apresentacao-encerramento.md', pdf: 'public/manuais/manual-apresentacao-encerramento.pdf', titulo: 'Manual de apresentação de encerramento' },
];

// ===== Conversor Markdown -> HTML mínimo =====
// Cobre só o que os manuais usam: #/##/###, **negrito**, `código`, [link](url),
// listas (com/sem checklist), listas numeradas, tabelas e parágrafos. Não é um
// parser geral — se o próximo manual usar algo fora disso, estenda aqui.
const inline = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const mdParaHtml = (md) => {
  const linhas = md.split('\n');
  const out = [];
  let i = 0;
  let emLista = null; // 'ul' | 'ol' | null
  let paragrafo = []; // linhas de texto corrido acumuladas até a próxima quebra
  const fecharParagrafo = () => { if (paragrafo.length) { out.push(`<p>${inline(paragrafo.join(' '))}</p>`); paragrafo = []; } };
  const fecharLista = () => { fecharParagrafo(); if (emLista) { out.push(`</${emLista}>`); emLista = null; } };
  // Uma linha continua o <li> anterior — igual a um item de lista cujo texto
  // quebrou em mais de uma linha física no .md (recuo, sem marcador novo).
  const continuarItem = (texto) => {
    const ultimo = out[out.length - 1];
    out[out.length - 1] = ultimo.replace(/<\/li>$/, ` ${inline(texto)}</li>`);
  };

  while (i < linhas.length) {
    const l = linhas[i];

    if (/^\s*$/.test(l)) { fecharLista(); i++; continue; }

    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) { fecharLista(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\|/.test(l)) {
      fecharLista();
      const linhasTabela = [];
      while (i < linhas.length && /^\|/.test(linhas[i])) { linhasTabela.push(linhas[i]); i++; }
      const [cabecalho, , ...corpo] = linhasTabela;
      const cel = (row) => row.split('|').slice(1, -1).map((c) => c.trim());
      out.push('<table><thead><tr>' + cel(cabecalho).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      for (const row of corpo) out.push('<tr>' + cel(row).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }

    // Linha indentada dentro de uma lista aberta, sem marcador novo: é a
    // continuação do <li> anterior (texto de item que quebrou de linha).
    if (emLista && /^\s+\S/.test(l) && !/^\s*[-\d]/.test(l)) {
      continuarItem(l.trim());
      i++; continue;
    }

    const check = l.match(/^-\s+\[([ x])\]\s+(.*)$/);
    if (check) {
      if (emLista !== 'ul') { fecharLista(); out.push('<ul class="check">'); emLista = 'ul'; }
      out.push(`<li>${check[1] === 'x' ? '☑' : '☐'} ${inline(check[2])}</li>`);
      i++; continue;
    }

    const item = l.match(/^-\s+(.*)$/);
    if (item) {
      if (emLista !== 'ul') { fecharLista(); out.push('<ul>'); emLista = 'ul'; }
      out.push(`<li>${inline(item[1])}</li>`);
      i++; continue;
    }

    const num = l.match(/^\d+\.\s+(.*)$/);
    if (num) {
      if (emLista !== 'ol') { fecharLista(); out.push('<ol>'); emLista = 'ol'; }
      out.push(`<li>${inline(num[1])}</li>`);
      i++; continue;
    }

    const quote = l.match(/^>\s?(.*)$/);
    if (quote) { fecharLista(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); i++; continue; }

    fecharLista();
    paragrafo.push(l.trim());
    i++;
  }
  fecharLista();
  return out.join('\n');
};

const CSS = `
@page { size: 900px 1273px; margin: 0 }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
body { margin: 0; font-family: -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; color: #2a1c12; background: #fff9f2; }
.page { padding: 56px 64px 40px }
h1 { font-size: 32px; color: #7a2a0a; margin: 0 0 4px }
h2 { font-size: 22px; color: #b5541c; margin: 32px 0 8px; border-top: 1px solid #f0c9a0; padding-top: 20px }
h2:first-of-type { border-top: none; padding-top: 0 }
h3 { font-size: 17px; color: #7a2a0a; margin: 20px 0 6px }
p { font-size: 14px; line-height: 1.6; margin: 0 0 10px; color: #3a2416 }
code { background: #f3ddc4; padding: 1px 5px; border-radius: 4px; font-size: 12.5px }
a { color: #b5541c }
ul, ol { margin: 4px 0 14px; padding-left: 22px }
ul.check { list-style: none; padding-left: 0 }
li { font-size: 14px; line-height: 1.55; margin-bottom: 4px; color: #3a2416 }
table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 12.5px }
th { text-align: left; background: #c2410c; color: #fff; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em }
td { padding: 6px 8px; border-bottom: 1px solid #f0c9a0; vertical-align: top }
tr:nth-child(even) td { background: #fff3e8 }
blockquote { margin: 10px 0; padding: 12px 16px; background: #fff3e8; border-radius: 10px; font-size: 14px; color: #3a2416; line-height: 1.55 }
.subt { font-size: 13px; color: #a37a5c; margin-bottom: 24px }
`;

for (const m of MANUAIS) {
  const md = readFileSync(join(ROOT, m.md), 'utf8');
  const semTitulo = md.replace(/^#\s+.*\n/, ''); // o <h1> vem do template, não do corpo (evita duplicar)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${m.titulo}</title><style>${CSS}</style></head>` +
    `<body><div class="page"><h1>${m.titulo}</h1><div class="subt">SabatinaQuest — gerado de ${m.md}</div>${mdParaHtml(semTitulo)}</div></body></html>`;

  const tmpHtml = join(ROOT, 'scripts', '.manual-tmp.html');
  writeFileSync(tmpHtml, html);
  const destino = join(ROOT, m.pdf);
  mkdirSync(dirname(destino), { recursive: true });
  execSync(`"${CHROME}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${destino}" "file://${tmpHtml}"`, { stdio: 'ignore' });
  console.log(`${m.pdf} ok (${(readFileSync(destino).length / 1024).toFixed(0)} KB)`);
}
