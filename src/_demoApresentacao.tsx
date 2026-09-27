import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Palco, montarSlides, Dados } from './Apresentacao';
import { montarResumoTemporada, perfisDosAlunos, conquistasDosAlunos, pistasDoPodio } from './relatorioTemporada';

const semanas = ['W1','W2','W3'];
const licoes: any[] = semanas.map((w, k) => ({ semana: w, trimestre: 'Temporada Demo', titulo: `Lição ${k+1} - Título da Lição ${k+1} (datas)`,
  dias: Array.from({length:7}, (_, i) => ({ id: i+1, data: `2026-07-${String(1 + k*7 + i).padStart(2,'0')}` })) }));
const nomes = ['Aluno Alfa','Aluno Beta','Aluno Gama','Aluno Delta','Aluno Épsilon','Aluno Zeta','Aluno Eta'];
const avs = ['🦁','🐯','🦊','🐺','🦅','🐬','🌟'];
const linhas: any[] = [];
nomes.forEach((n, a) => semanas.forEach((w, k) => {
  const qtd = a < 4 ? 7 : Math.max(0, 7 - a + (k === 2 ? 1 : 0)) % 8;
  const done = Array.from({length: Math.min(7, qtd)}, (_, i) => i + 1);
  const history: any = {};
  done.forEach(d => { const data = licoes[k].dias[d-1].data; history[d] = { emISO: a % 3 === 2 && d > 4 ? '2026-07-25' : data, xp: 480 - a*12, acertos: 4 - (a % 2) }; });
  linhas.push({ userId: 'u'+a, week: w, nome: n, avatar: avs[a], done, dias: done.length, xp: done.length * (480 - a*12), isAdmin: false, isProfessor: false, turmaId: 't', track: 'teen', history });
}));
linhas.push({ userId: 'prof', week: 'W1', nome: 'Professora Demo', avatar: '🎓', done: [1,2,3,4,5,6,7], dias: 7, xp: 3000, isAdmin: false, isProfessor: true, history: {} });
const resumo = montarResumoTemporada({ linhasDaTurma: linhas, linhasLiderancaTodasTrilhas: linhas, licoes, criadoEmPorAluno: {}, turmaNome: 'Turma Demo', trimestre: 'Temporada Demo', hojeISO: '2026-07-21' });
const perfis = perfisDosAlunos(linhas, licoes, {}, '2026-07-21');
const dados: Dados = { modo: 'temporada', resumo, perfis, licoes, conquistas: conquistasDosAlunos(perfis, licoes),
  pistas: [0,1,2].map(i => pistasDoPodio(perfis, i, licoes)), rotulo: 'Temporada Demo', turmaNome: 'Turma Demo',
  proxima: { nome: 'Próxima Temporada', licao: 'Lição 1 - Começando' } };
const slides = montarSlides(dados);
(window as any).__slides = slides.map(s => s.tipo);
createRoot(document.getElementById('root')!).render(
  <Palco dados={dados} slides={slides} licao={licoes[0]} turmaId="t" track="teen" jogador={{ id: 'x', nome: 'Demo' }} onSair={() => {}} />
);
