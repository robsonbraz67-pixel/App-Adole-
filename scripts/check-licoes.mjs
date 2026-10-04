// Valida o conteúdo das lições ANTES de ele chegar num aluno.
//
// O risco aqui não é o app quebrar — é a lição sair errada: uma pergunta com
// gabarito apontando para fora das opções faz o aluno perder ponto respondendo
// certo, e ninguém descobre até alguém reclamar. Conteúdo é volume alto e
// julgamento baixo; exatamente onde erro mecânico passa despercebido.
//
// Roda no `npm run lint:licoes` e no CI.

import { readFileSync, existsSync } from 'node:fs';

const TRILHAS = [
  { id: 'teen', entrada: 'src/lessonsTeen.ts' },
  { id: 'adult', entrada: 'src/lessonsAdult.ts' },
  { id: 'youngAdult', entrada: 'src/lessonsYoung.ts' },
];

const erros = [];
const avisos = [];
let totalLicoes = 0, totalDias = 0, totalPerguntas = 0;

// Carrega o módulo via tsx (o conteúdo é TypeScript com imports entre arquivos)
const { execSync } = await import('node:child_process');

for (const trilha of TRILHAS) {
  let licoes;
  try {
    const saida = execSync(
      `npx tsx -e "import l from './${trilha.entrada}'; console.log(JSON.stringify(l))"`,
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    licoes = JSON.parse(saida.trim().split('\n').pop());
  } catch (e) {
    erros.push(`${trilha.id}: não foi possível carregar ${trilha.entrada} — ${String(e.message).slice(0, 200)}`);
    continue;
  }

  if (!Array.isArray(licoes) || licoes.length === 0) {
    erros.push(`${trilha.id}: nenhuma lição exportada`);
    continue;
  }

  const semanasVistas = new Set();
  // Data repetida entre lições da MESMA trilha: duas lições cobrindo o mesmo
  // dia fazem a lição "ativa" ficar ambígua (o app pega a primeira que
  // casa) e o aluno nunca vê a outra. Acontece fácil ao importar um PDF cuja
  // semana começa no sábado: a sexta de uma lição e o sábado da seguinte
  // ficam a um dia de distância, e um deslize de OCR numa data os iguala.
  const datasVistas = new Map();

  licoes.forEach((licao, i) => {
    const onde = `${trilha.id}[${i}] "${licao?.titulo || 'sem título'}"`;
    totalLicoes++;

    if (!licao.titulo) erros.push(`${onde}: sem titulo`);
    if (!licao.semana) erros.push(`${onde}: sem semana`);
    if (licao.semana && semanasVistas.has(licao.semana)) {
      erros.push(`${onde}: semana ${licao.semana} repetida — o id do progresso é \`uid_semana\`, então duas lições na mesma semana disputam o MESMO documento`);
    }
    semanasVistas.add(licao.semana);

    const dias = licao.dias || [];
    if (dias.length !== 7 && !licao.isComingSoon) {
      erros.push(`${onde}: ${dias.length} dia(s), esperado 7`);
    }

    let dataAnterior = null;
    dias.forEach(dia => {
      totalDias++;
      const ondeDia = `${onde} dia ${dia.id}`;
      if (typeof dia.id !== 'number') erros.push(`${ondeDia}: id não é número`);
      if (!dia.conteudo) avisos.push(`${ondeDia}: sem conteúdo`);

      if (dia.data) {
        if (datasVistas.has(dia.data)) {
          erros.push(`${ondeDia}: data ${dia.data} repetida — já é de ${datasVistas.get(dia.data)}`);
        }
        datasVistas.set(dia.data, ondeDia);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia.data)) {
          erros.push(`${ondeDia}: data "${dia.data}" fora do formato AAAA-MM-DD`);
        } else if (dataAnterior && dia.data <= dataAnterior) {
          erros.push(`${ondeDia}: data ${dia.data} não avança em relação a ${dataAnterior}`);
        }
        dataAnterior = dia.data;
      }

      if (dia.imagem) {
        const im = dia.imagem;
        if (!im.src || !im.alt || !im.descricao) erros.push(`${ondeDia}: imagem precisa de src, alt e descricao`);
        else if (!existsSync(`public/${im.src}`)) erros.push(`${ondeDia}: imagem public/${im.src} não existe`);
        for (const q of im.quadros || []) {
          if (!q?.src || !existsSync(`public/${q.src}`)) erros.push(`${ondeDia}: quadro da tirinha public/${q?.src} não existe`);
        }
        if (im.quadros && im.quadros.filter(q => !q.faixa).length < 2) erros.push(`${ondeDia}: imagem.quadros precisa de 2+ quadros (fora as faixas)`);
      }

      (dia.perguntas || []).forEach(p => {
        totalPerguntas++;
        const ondeP = `${ondeDia} pergunta ${p.id || '(sem id)'}`;
        if (!p.pergunta) erros.push(`${ondeP}: sem enunciado`);
        if (p.tipo) {
          // Formatos especiais (src/perguntasEspeciais.tsx) — mesmas regras do
          // prepararEspecial: o que não passar aqui some do quiz do aluno.
          const txt = s => typeof s === 'string' && s.trim().length > 0;
          const ruim = m => erros.push(`${ondeP} (${p.tipo}): ${m}`);
          if (p.tipo === 'multipla') {
            const ops = p.opcoes || [], c = p.corretas || [];
            if (ops.length < 3 || ops.length > 4 || !ops.every(txt)) ruim(`${ops.length} opção(ões) / opção vazia`);
            if (!c.length || !c.every(i => Number.isInteger(i) && i >= 0 && i < ops.length)) ruim(`corretas ${JSON.stringify(c)} inválidas`);
          } else if (p.tipo === 'ordenar') {
            const it = p.itens || [];
            if (it.length < 3 || it.length > 5 || !it.every(txt) || new Set(it).size !== it.length) ruim(`itens inválidos (${it.length})`);
          } else if (p.tipo === 'pares') {
            const pr = p.pares || [];
            if (pr.length < 3 || pr.length > 4 || !pr.every(x => Array.isArray(x) && x.length === 2 && txt(x[0]) && txt(x[1]))) ruim(`pares inválidos (${pr.length})`);
            else if (new Set(pr.map(x => x[1])).size !== pr.length) ruim('lado direito repetido');
          } else if (p.tipo === 'digitar') {
            if (!txt(p.resposta)) ruim('sem resposta');
          } else if (p.tipo === 'relampago') {
            const it = p.itens || [];
            if (it.length < 3 || it.length > 6 || !it.every(x => x && txt(x.texto) && typeof x.verdadeiro === 'boolean')) ruim(`itens inválidos (${it.length})`);
          } else ruim('tipo desconhecido');
          return;
        }
        const ops = p.opcoes || [];
        // 2 opções = pergunta Verdadeiro/Falso (o quiz e o modo Ao Vivo já
        // suportam esse tamanho nativamente, ver src/components.tsx).
        if (ops.length !== 4 && ops.length !== 2) erros.push(`${ondeP}: ${ops.length} opção(ões), esperado 4 (ou 2 para V/F)`);
        if (ops.some(o => typeof o !== 'string' || !o.trim())) erros.push(`${ondeP}: opção vazia`);
        if (new Set(ops).size !== ops.length) avisos.push(`${ondeP}: opções repetidas`);
        // O erro que mais custa: gabarito apontando para fora das opções faz o
        // aluno perder ponto respondendo certo.
        if (typeof p.correta !== 'number' || p.correta < 0 || p.correta >= ops.length) {
          erros.push(`${ondeP}: gabarito ${p.correta} fora das ${ops.length} opções`);
        }
      });
    });
  });
}

console.log(`Lições: ${totalLicoes} · dias: ${totalDias} · perguntas: ${totalPerguntas}`);
avisos.slice(0, 20).forEach(a => console.log(`⚠️  ${a}`));
if (avisos.length > 20) console.log(`⚠️  ... e mais ${avisos.length - 20} aviso(s)`);

if (erros.length) {
  console.error(`\n❌ ${erros.length} problema(s) no conteúdo:`);
  erros.slice(0, 40).forEach(e => console.error(`   ${e}`));
  if (erros.length > 40) console.error(`   ... e mais ${erros.length - 40}`);
  process.exit(1);
}
console.log('✅ conteúdo das lições íntegro.');
