# Apresentação de encerramento dentro do app

A versão dentro do sistema do PPT de encerramento de Provado pelo Fogo. A
liderança abre **Painel → 🎬 APRESENTAÇÃO**, escolhe **semana** ou
**temporada**, monta e projeta. Os slides saem sozinhos do progresso da turma.

Documentos relacionados:
- `docs/relatorio-temporada.md`: as regras dos números (dia certo, ofensiva
  real, maratonistas…). Mexeu numa regra, atualize lá também.
- `docs/manual-apresentacao-encerramento.md`: as técnicas de condução. As
  dicas da tecla **N** vêm dele.

## Onde está o código

| Parte | Arquivo |
|---|---|
| Tela de preparo, palco e slides | `src/Apresentacao.tsx` |
| Dados: perfis, conquistas automáticas, pistas do pódio | `src/relatorioTemporada.ts` (seção 9) |
| Sons gravados (Mixkit) e sincronia com o rufar | `src/utils.ts` (`tocarEfeito`, `tocarSorteioTambor`) |
| Estilo do palco (`.ap-*`) | `src/index.css`, logo depois do telão do Sorteador |
| Botão no painel e rota | `src/components.tsx` (`onApresentacao`), `src/App.tsx` (`tela === 'apresentacao'`) |
| Testes | `tests/relatorioTemporada/relatorioTemporada.test.ts` |

## Como funciona

- **Palco:** o mesmo quadro 16:9 do telão do Sorteador (`.st-palco`), medido
  em `cqh`. Espaço/→ avança, ← volta, **N** mostra a dica de condução, Esc sai.
  Há também botões ‹ › no rodapé, para quem apresenta sem teclado.
- **Slides:** montados em `montarSlides()` a partir do que existe. Slide sem
  dado é pulado (ex.: sem maratonistas, sem o slide de maratonistas).
- **Mistério do pódio:** cada toque revela uma pista (`pistasDoPodio`).
- **Revelação:** ao entrar no slide, toca o rufar e o nome aparece na batida
  (`SORTEIO_BATIDA_S`), com impacto, fanfarra (1º lugar) e aplausos. Se o som
  estiver desligado ou o áudio pausado, usa tempo fixo; há também uma trava
  por relógio que revela mesmo se o áudio parar no meio.
- **Turma inteira:** um aluno por toque, com a conquista gerada por
  `conquistasDosAlunos` (sem repetir título; superlativo só para quem é 1º da
  turma inteira naquilo).
- **Sorteio:** usa o `useSorteador` de verdade, com "já sorteados" embaixo e o
  botão Registrar. Nesse slide, Espaço sorteia e → avança.

## Semana × temporada

| Slide | Temporada | Semana |
|---|---|---|
| Números | dias, XP, semanas completas | os mesmos, só da semana |
| Dia mais estudado | melhor data da temporada | melhor dia da semana |
| Melhor semana | top 3 | não aparece |
| Liderança, maratonistas, chama | temporada toda | só a semana |
| Clube | completou tudo | fez 7 de 7 |
| Pódio, turma inteira | temporada | semana |
| Sorteio | regra "estudou tudo" | regra "semana completa" |
| Próxima temporada | aparece se houver lições da próxima | não aparece |

## Decisões tomadas nesta primeira versão (revisar)

1. **Conquistas automáticas, sem edição.** Se a liderança quiser ajustar o
   texto de algum aluno antes de projetar, o próximo passo é deixar editar na
   prévia (salvando só no aparelho).
2. **Vouchers ainda não.** O sorteio usa as regras atuais. A regra nova (só
   semanas 100% no dia certo no sorteio semanal) está descrita em
   `docs/relatorio-temporada.md` e precisa de mudança própria em
   `src/sorteio.ts` e no Sorteador.
3. **Nomes como estão no app**, igual ao PPT. Se for preciso, uma opção de
   "só primeiro nome" cabe na tela de preparo.

## Próximos passos sugeridos

- Testar com uma conta de professor de verdade, numa turma com dados reais,
  num projetor.
- Edição dos textos na prévia (decisão 1).
- Vouchers (decisão 2).
- Trilha de fundo opcional no mistério (o som "suspense de auditório" do
  mural de sons).
