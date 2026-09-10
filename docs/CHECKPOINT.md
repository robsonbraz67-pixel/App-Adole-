# Checkpoint — retomar a expansão multi-igreja

> Leia isto primeiro em qualquer sessão nova do Claude Code que continue
> este trabalho. Depois leia `docs/PLANO-EXPANSAO.md` (o plano completo,
> fase a fase) e `tests/rules/INVARIANTES.md` (o contrato de regras).

**Salvo em:** 2026-09-10, sessão Claude Code, branch `claude/kind-hamilton-4q9hea`.
**Último commit:** `384ee4d` — "feat: backfill de turmas, protegido e testado (Fase 2)"
**Árvore de trabalho:** limpa, tudo commitado e empurrado para o remoto.

---

## Onde estamos exatamente

| Fase | Estado |
|---|---|
| 0 — Rede de segurança (testes das regras) | ✅ concluída |
| 1 — Regras alargadas (`juvenil`, `turmaId`, `turmas`, `teacherInvites`) | ✅ **publicada em produção** |
| 2 — Painel de turmas + backfill | ✅ escrito e testado · ⏸️ **backfill ainda não executado** |
| 3 — Convite de professor + painel do professor | não iniciada |
| 4 — Ligar para os alunos (matrícula, ranking por turma) | não iniciada |
| 5 — Conteúdo das trilhas novas | não iniciada |

## O que falta fazer AGORA (antes de tudo mais)

O código do backfill está pronto e testado (`netlify/functions/backfill-turmas.mts`,
65 testes verdes), mas **nunca rodou contra dados reais**. Passos, na ordem:

1. No Netlify, criar a variável de ambiente **`BACKFILL_TOKEN`** (um valor
   secreto qualquer). Sem ela o endpoint fica inerte de propósito.
2. No preview da branch, criar a **Turma Padrão** pelo painel Admin → 🎓 Turmas
   (igreja e trilha em uso hoje).
3. **Relatório** (não escreve nada):
   `<preview>/api/backfill-turmas?token=SEU_TOKEN`
   → confira a distribuição por igreja. Se muita gente estiver sem igreja
   (provável — o seletor está oculto desde julho), o passo 4 vai precisar de
   `&escopo=todos`.
4. **Simulação** (ainda não escreve):
   `...&turmaId=<id da turma>` (+ `&escopo=todos` se for o caso)
5. **Aplicar**:
   `...&turmaId=<id>&aplicar=1`
6. Verificar: abrir o app, fazer um dia do quiz, confirmar que sincroniza.
   O painel de turmas deve mostrar a contagem de alunos preenchida.

Depois disso, a Fase 2 está 100% concluída e dá para seguir para a Fase 3.

---

## Decisões já travadas (não reabrir)

- **Banco Firestore exclusivo** do SabatinaQuest — o LUM07 foi descontinuado,
  não há mais risco de outro projeto sobrescrever as regras.
- **Ranking em três níveis**: turma (ao vivo) → igreja → geral (sob demanda).
- **Conteúdo das lições continua embarcado no código** (não vai para o
  Firestore) — custo zero de leitura, funciona offline. Importado via arquivos
  TS a cada trimestre, como hoje.
- **Turma se arquiva, nunca se exclui** (`active: false`) — travado na própria
  regra do Firestore (`delete: if false`), porque o progresso carrega
  `turmaId` e apagar a turma deixaria histórico órfão.
- **Nomes internos ficam, rótulos mudam**: `teen` continua `teen` no banco
  (vira "Adolescente" só na tela); `studyLocations`/`locationId` continuam com
  esse nome (viram "Igreja" na tela). Só entra um id novo: `juvenil`.

## Os três princípios invioláveis (todo trabalho novo segue isto)

1. **Regra sobe antes do código.** O `hasOnly()` do Firestore recusa o
   documento INTEIRO ao ver uma chave desconhecida. Publicar a regra que
   aceita o campo, confirmar, só então subir o código que grava.
2. **Ausência de campo nunca significa exclusão.** Todo aluno de hoje está
   sem `turmaId`. Código novo trata isso como "turma padrão", nunca como
   "não pertence a nada".
3. **Nada em produção sem prova no emulador primeiro**, principalmente para
   regras e para qualquer coisa que escreva em massa (backfill). `npm test`
   roda tudo (regras + backfill) contra o emulador Firestore.

## Cicatrizes que justificam esses princípios (não são regras arbitrárias)

- **O apagão de 2026-07-25**: uma função de regra (`ownLocationId()`) foi
  apagada por engano numa limpeza por range de texto. O `firebase deploy`
  publicou mesmo assim — a CLI não pega função indefinida, só quebra em tempo
  de execução. Toda gravação de progresso com `locationId` (ou seja, todo
  aluno matriculado) falhou em silêncio até dois usuários reclamarem.
  Documentado em `firestore.rules` perto de `ownLocationId()`.
- **O risco equivalente que achamos na Fase 2**: se o backfill carimbasse
  `progress` com `turmaId` sem carimbar `users` primeiro, o mesmo apagão
  aconteceria de novo, em versão parcial — só para quem foi carimbado pela
  metade. Provado com testes ANTES de escrever a função (invariantes #47/#48
  em `tests/rules/progresso.test.ts`), e a função foi construída para nunca
  deixar isso acontecer (grava users, CONFERE que chegou, só então progress).

---

## Como o trabalho está organizado no repo

```
docs/
  PLANO-EXPANSAO.md       ← o plano completo, fase a fase, com passo a passo
  CHECKPOINT.md           ← este arquivo
tests/
  rules/
    INVARIANTES.md        ← contrato: todo comportamento de regra que não
                             pode mudar sem decisão, numerado (#1 a #48)
    helpers.ts             ← setup do emulador, isolado por arquivo de teste
    *.test.ts              ← 56 testes de regras, 6 arquivos por área
  backfill/
    turmas.test.ts         ← testa a função isolada (escopo, idempotência)
    integracao.test.ts     ← roda o backfill de verdade + save de cliente
                             sob as regras reais (a prova mais importante)
scripts/
  check-rules-functions.mjs ← verificador estático de função indefinida
netlify/functions/
  backfill-turmas.mts      ← o backfill da Fase 2 (não executado ainda)
  backfill-ranking-data.mts ← backfill pré-existente (rankings/duplas)
firestore.rules            ← já publicada com juvenil/turmaId/turmas/teacherInvites
```

`npm test` roda os 65 testes (regras + backfill) contra o emulador Firestore.
`npm run check:rules` roda o verificador estático. Os dois rodam no CI antes
de qualquer deploy de regras (`.github/workflows/firestore-rules.yml`).

## Protocolo de modelo (como as sessões anteriores trabalharam)

Cada fase tem um modelo recomendado, e a sessão **para** (⏸️) antes de trocar:

| Trabalho | Modelo | Por quê |
|---|---|---|
| Desenhar o que testar / invariantes | Opus 5 | julgamento sobre o que pode quebrar |
| Escrever testes a partir de um contrato pronto | Sonnet 5 | repetição de molde |
| Mexer em `firestore.rules` | Opus 5 | maior risco do repo, falha em silêncio |
| UI (painéis, formulários) | Sonnet 5 | trabalho bem especificado |
| Escrever em dados reais de produção (backfill) | Opus 5 | difícil de desfazer |

O usuário troca o modelo pelo comando `/model` entre uma etapa e outra.

## Regras de deploy (não esquecer)

- `[deploy]` na mensagem de commit dispara build de produção no Netlify —
  **nunca usar sem perguntar antes** (regra do `CLAUDE.md` do projeto).
- Branch deploys e PR previews do Netlify **sempre buildam**, sem precisar de
  `[deploy]` — é o caminho de teste real usado nesta expansão inteira.
- Regras do Firestore publicam sozinhas quando `firestore.rules` muda em
  `main` (workflow `.github/workflows/firestore-rules.yml`), e só depois de
  `npm test` passar no CI.

---

## Primeira coisa a fazer numa sessão nova

1. Confirmar branch: `git branch --show-current` deve mostrar
   `claude/kind-hamilton-4q9hea` (ou perguntar ao usuário se mudou).
2. Rodar `npm test` para confirmar que os 65 testes continuam verdes antes de
   qualquer mudança nova.
3. Ler a seção "O que falta fazer AGORA" acima — é isso que o usuário
   provavelmente vai pedir para continuar.
