import type { ResumoTemporada } from '../../src/relatorioTemporada';

// O relatório de Provado pelo Fogo com os números que foram para o PPT do
// encerramento (SabatinaQuest3tri.pptx, setembro/2026). Os nomes aqui são
// fictícios — o teste confere que o app remonta os MESMOS slides a partir do
// relatório, não quem estava na turma.
const perfil = (userId: string, o: Partial<ResumoTemporada['perfis'][number]>): ResumoTemporada['perfis'][number] => ({
  userId, nome: userId, avatar: '🙂', dias: 91, xp: 30000, semanasCompletas: 13, criadoEm: '2026-06-01',
  pctAcertos: 90, diasNoDiaCerto: 50, gabaritos: 0, semanasPerfeitas: 0, semanasPerfeitasLista: [],
  melhorSemana: { week: '2026-W38', xp: 3000 }, ofensivaReal: 10, totalRecuperado: 0, ...o,
});

export const PERFIS = [
  perfil('Aurora', { avatar: '🐶', xp: 41769, pctAcertos: 93.1, diasNoDiaCerto: 82, gabaritos: 1, ofensivaReal: 32, semanasPerfeitas: 7,
    semanasPerfeitasLista: ['2026-W30', '2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W38'], melhorSemana: { week: '2026-W30', xp: 3364 } }),
  perfil('Brisa', { avatar: '🐶', xp: 40673, pctAcertos: 92.9, diasNoDiaCerto: 64, melhorSemana: { week: '2026-W31', xp: 3390 } }),
  perfil('Céu', { avatar: '🐬', xp: 40324, pctAcertos: 92.6, diasNoDiaCerto: 57, melhorSemana: { week: '2026-W38', xp: 3454 }, semanasPerfeitas: 1, semanasPerfeitasLista: ['2026-W38'] }),
  perfil('Duna', { xp: 40072, ofensivaReal: 84, diasNoDiaCerto: 88, semanasPerfeitas: 12, semanasPerfeitasLista: ['2026-W38'] }),
  perfil('Estrela', { xp: 38424 }),
  perfil('Fênix', { xp: 37631, diasNoDiaCerto: 87, ofensivaReal: 42 }),
  perfil('Gaia', { xp: 35381 }),
  perfil('Hélio', { xp: 33823, totalRecuperado: 44 }),
  perfil('Íris', { xp: 31398, totalRecuperado: 46 }),
  perfil('Jade', { dias: 42, xp: 11913, criadoEm: '2026-08-22', totalRecuperado: 37 }),
  perfil('Kai', { dias: 35, xp: 9819, criadoEm: '2026-08-22', totalRecuperado: 33 }),
];

export const RESUMO: ResumoTemporada = {
  turma: 'Adolescentes — ASA NORTE',
  trimestre: 'Provado pelo Fogo',
  geradoEm: '2026-09-26',
  totais: { alunos: 14, dias: 946, xp: 383349, semanasCompletas: 131, diasLiberados: 91, diasLideranca: 217 },
  ranking: PERFIS.map(p => ({ userId: p.userId, nome: p.nome, dias: p.dias, xp: p.xp, semanasCompletas: p.semanasCompletas })),
  ofensivaReal: [
    { userId: 'Duna', nome: 'Duna', dias: 84, inicio: '2026-07-04', fim: '2026-09-25' },
    { userId: 'Fênix', nome: 'Fênix', dias: 42, inicio: '2026-07-29', fim: '2026-09-08' },
    { userId: 'Aurora', nome: 'Aurora', dias: 32, inicio: '2026-07-20', fim: '2026-08-20' },
  ],
  melhorSemana: [
    { week: '2026-W38', estudosNoDia: 64, alunos: 12, pctAcertos: 91.8 },
    { week: '2026-W31', estudosNoDia: 56, alunos: 10, pctAcertos: 94.6 },
    { week: '2026-W30', estudosNoDia: 55, alunos: 10, pctAcertos: 94.1 },
  ],
  diaMaisEstudado: [
    { data: '2026-09-23', alunos: 11 },
    { data: '2026-08-08', alunos: 10 }, { data: '2026-09-22', alunos: 10 }, { data: '2026-09-25', alunos: 10 },
    { data: '2026-09-24', alunos: 9 },
  ],
  maratonistas: [
    { userId: 'Íris', nome: 'Íris', maxNumDia: 38, dataMax: '2026-09-19', totalRecuperado: 46 },
    { userId: 'Jade', nome: 'Jade', maxNumDia: 37, dataMax: '2026-09-22', totalRecuperado: 37 },
    { userId: 'Kai', nome: 'Kai', maxNumDia: 22, dataMax: '2026-09-23', totalRecuperado: 33 },
  ],
  liderancaPeloExemplo: [
    { nome: 'Prof. Um', dias: 91, porTrilha: { teen: 91 } },
    { nome: 'Prof. Dois', dias: 54, porTrilha: { teen: 54 } },
    { nome: 'Prof. Três', dias: 44, porTrilha: { adult: 36, teen: 8 } },
  ],
  clubeDaTemporada: PERFIS.filter(p => p.dias === 91).map(p => ({ userId: p.userId, nome: p.nome, xp: p.xp, dias: p.dias })),
  perfis: PERFIS,
};

