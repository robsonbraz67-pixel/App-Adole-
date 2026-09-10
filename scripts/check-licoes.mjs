// Valida o conteúdo das lições ANTES de ele chegar num aluno.
//
// O risco aqui não é o app quebrar — é a lição sair errada: uma pergunta com
// gabarito apontando para fora das opções faz o aluno perder ponto respondendo
// certo, e ninguém descobre até alguém reclamar. Conteúdo é volume alto e
// julgamento baixo; exatamente onde erro mecânico passa despercebido.
//
// Roda no `npm run lint:licoes` e no CI.

import { readFileSync } from 'node:fs';

const TRILHAS = [
  { id: 'teen', entrada: 'src/lessonsTeen.ts' },
  { id: 'adult', entrada: 'src/lessonsAdult.ts' },
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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia.data)) {
          erros.push(`${ondeDia}: data "${dia.data}" fora do formato AAAA-MM-DD`);
        } else if (dataAnterior && dia.data <= dataAnterior) {
          erros.push(`${ondeDia}: data ${dia.data} não avança em relação a ${dataAnterior}`);
        }
        dataAnterior = dia.data;
      }

      (dia.perguntas || []).forEach(p => {
        totalPerguntas++;
        const ondeP = `${ondeDia} pergunta ${p.id || '(sem id)'}`;
        if (!p.pergunta) erros.push(`${ondeP}: sem enunciado`);
        const ops = p.opcoes || [];
        if (ops.length !== 4) erros.push(`${ondeP}: ${ops.length} opção(ões), esperado 4`);
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
