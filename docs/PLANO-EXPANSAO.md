# Plano de Expansão — Multi-igreja, Turmas e Trilhas

> Documento vivo. Atualizar o estado de cada fase conforme for concluída.
> Criado em 2026-09-10.

## Objetivo

Levar o SabatinaQuest de **uma escola sabatina, uma turma, uma trilha** para
**várias igrejas, várias turmas independentes e quatro trilhas** (adolescente,
juvenil, jovem, adulto), com professores gerenciando as próprias turmas por
convite — sem parar o sistema que já está em uso.

## Decisões travadas

| Decisão | Escolha | Data |
|---|---|---|
| Banco Firestore | Passa a ser **exclusivo** do SabatinaQuest. O LUM07 foi descontinuado. | 2026-09-10 |
| Escopo do ranking | Três níveis: **turma**, **igreja**, **geral**. | 2026-09-10 |
| Conteúdo das lições | Continua **embarcado no código** (custo zero de leitura, funciona offline). Importado a cada trimestre. | 2026-09-10 |
| Exclusão de turma | Não existe. Turma se **arquiva** (`active: false`) para não orfanar histórico. | 2026-09-10 |

---

## Protocolo de trabalho

**Uma fase por vez.** Cada fase sobe sozinha, é reversível e não depende da
seguinte estar pronta.

**Parar antes de cada troca de modelo.** Onde este documento marca `⏸️ PARE`, a
sessão termina e o usuário decide se troca de modelo antes de continuar. Nunca
atravessar um checkpoint sem confirmação.

**Nunca usar `[deploy]` na mensagem de commit sem autorização explícita** (ver
`CLAUDE.md`). Sem `[deploy]`, o Netlify pula o build e não custa nada.

---

## Modelos recomendados por fase

Referência de custo relativo (API, por milhão de tokens):
Opus 5 `$5/$25` · Sonnet 5 `$2/$10` · Haiku 4.5 `$1/$5`.

| Fase | Etapa | Modelo | Por quê |
|---|---|---|---|
| 0 | Desenhar o que testar | **Opus 5** | Exige ler `firestore.rules` inteiro e deduzir os invariantes que não podem quebrar. Julgamento, não digitação. |
| 0 | Escrever os testes | **Sonnet 5** | Depois da lista pronta, é repetição mecânica de um molde. |
| 1 | Alterar as regras | **Opus 5** | Maior risco do repositório. Erro em regra falha **em silêncio** e derruba todo mundo de uma vez. |
| 2 | Painel de turmas (UI) | **Sonnet 5** | CRUD com molde pronto no próprio arquivo (`InviteCodesPanel`). |
| 2 | Backfill | **Opus 5** | Escreve em dados reais de produção, uma vez, sem desfazer fácil. |
| 3 | Convite + painel do professor | **Opus 5** | Única mudança que **remove** permissão de gente que já tem. |
| 4 | Query, índice e custo | **Opus 5** | Query sem índice falha em produção; escolha errada de escopo vira conta alta. |
| 4 | Matrícula (UI) | **Sonnet 5** | Formulário e fluxo de tela, bem especificados. |
| 5 | Importar conteúdo | **Sonnet 5** | Volume alto, julgamento baixo — mas erro vira lição errada para aluno. Haiku 4.5 só para reformatação puramente mecânica, sempre com script de validação. |

`/fast` (Opus com saída mais rápida) vale para as fases longas de UI. Não muda a
qualidade do modelo, só a velocidade.

---

## Princípios invioláveis

Estes três saíram de bugs reais que já aconteceram neste repositório.

### 1. Regra sobe antes do código

O `hasOnly()` do Firestore rejeita o **documento inteiro** ao ver uma chave que
não conhece — não só o campo novo. Já existem três remendos disso no código
(`firebase.ts:66-71`, `firebase.ts:295-304`, `firebase.ts:393-403`).

**Sempre:** publicar a regra que aceita o campo → confirmar em produção → só
então subir o código que grava o campo.

### 2. Nomes internos ficam, rótulos mudam

- `teen` continua `teen` no banco. Está na chave de todo documento de progresso
  (`${uid}_${week}` legado **é** teen), nas chaves do `localStorage` e nos ids de
  `conteudoOverrides`. Na tela vira "Adolescente".
- `studyLocations` / `locationId` continuam com esse nome. Estão em `users`,
  `progress`, `pairs`, `pairsPublic`, `inviteCodes` e `pairInvites`. Na tela
  viram "Igreja".

Renomear qualquer um dos dois é migração de massa em cima de dados de gente
real, com ganho zero.

### 3. Ausência de campo nunca significa exclusão

Todo aluno de hoje está sem `turmaId`. Todo código novo precisa tratar a
ausência como "turma padrão", jamais como "não pertence a nada". É o que
garante que ninguém suma do ranking no dia da virada.

---

## Fase 0 — Rede de segurança

**Entrega:** testes automáticos das regras atuais rodando no CI.
**Visível para o usuário:** nada.
**Modelo:** Opus 5 para desenhar → `⏸️ PARE` → Sonnet 5 para escrever.

**Estado (2026-09-10): concluída.** Os 6 passos feitos; os 30 invariantes de
`tests/rules/INVARIANTES.md` estão escritos, `npm run test:rules` roda 31/31
verde no CI antes de qualquer deploy de regras.

Validado nos dois sentidos, não só que os testes passam: contra uma cópia das
regras com `ownLocationId()` removida (o apagão de 2026-07-25), o emulador
responde `Function not found error` e o teste do invariante #1 falha; contra
uma cópia com o invariante #10 quebrado de propósito (isProfessor liberado no
`hasOnly` do dono), o teste correspondente falha com "Expected request to
fail, but it succeeded." A rede pega apagão silencioso e escalada de
privilégio, os dois riscos que mais importam a partir daqui.

Lição registrada em `tests/rules/INVARIANTES.md` para a Fase 1: o vitest roda
arquivos de teste em paralelo contra o mesmo projeto do emulador por padrão —
sem isolar cada arquivo em seu próprio projeto (`setup(sufixo)`), o
`clearFirestore()` de um arquivo apaga o que outro acabou de semear no meio do
teste. Todo arquivo de teste novo precisa de um sufixo próprio.

**Próximo passo: Fase 1 — regras alargadas, recomendada em Opus 5** (é o
maior risco do repositório: erro em regra falha em silêncio).

### Por que primeiro

`firestore.rules:387-399` documenta o apagão de 2026-07-25: uma função de regra
foi apagada por engano, o `firebase deploy` publicou assim mesmo (a CLI não pega
função indefinida — só quebra em tempo de execução), e **toda gravação de
progresso de todo aluno matriculado passou a falhar em silêncio**. Foi descoberto
por relato de usuário.

As fases 1, 3 e 4 mexem muito mais nas regras do que aquilo.

### Passos

1. Adicionar bloco `emulators` ao `firebase.json` (porta do Firestore).
2. Instalar `@firebase/rules-unit-testing` e `vitest` como devDependencies.
3. Criar `tests/rules/` com um caso por invariante atual:
   - aluno grava o próprio progresso; não grava o de outro;
   - aluno não lê `studyNotes` de outro;
   - professor emite convite só do local atribuído;
   - admin corrige progresso alheio; não-admin não;
   - `progress` é legível por qualquer autenticado (ranking depende disso);
   - `liveAnswers` não é listável por aluno comum.
4. Adicionar script `test:rules` ao `package.json`.
5. Adicionar passo de teste ao `.github/workflows/firestore-rules.yml`, **antes**
   do `deploy`.
6. Adicionar uma checagem de função indefinida no `firestore.rules` (o que teria
   pego o bug de julho).

### Verificação
`npm run test:rules` passa com as regras atuais, sem alterar nenhuma delas.

### Rollback
Nada a reverter — não toca no app nem nas regras publicadas.

---

## Fase 1 — Regras alargadas

**Entrega:** `firestore.rules` aceitando os campos e coleções novos.
**Visível para o usuário:** nada.
**Modelo:** Opus 5.

### Por que é segura

Alargar um enum e aceitar um campo **opcional** nunca invalida documento
existente. É o único tipo de mudança de regra com risco praticamente nulo — e
precisa vir antes de qualquer código (Princípio 1).

### Passos

1. Adicionar `'juvenil'` ao enum de trilha nos **8 pontos**:
   `firestore.rules` linhas 61, 191, 252, 296, 356, 408, 481, 542.
2. Aceitar `turmaId` como **opcional** em `users`, `progress` e `inviteCodes`
   (validador + a lista do `hasOnly` de cada bloco).
3. Criar o bloco `match /turmas/{turmaId}` — leitura por autenticado, escrita só
   por admin (professor entra na Fase 3).
4. Criar o bloco `match /teacherInvites/{code}` — mesmo molde do `inviteCodes`.
5. Rodar `npm run test:rules` (Fase 0 tem que estar verde).
6. Publicar via workflow.

### Verificação
Depois de publicar: abrir o app, fazer um quiz, confirmar que o progresso
sincroniza. Nenhum campo novo é gravado ainda — se algo quebrar aqui, a causa é
regressão nas regras, não dado novo.

### Rollback
`git revert` do commit de regras + rodar o workflow. Volta ao estado anterior em
minutos, sem perda de dado.

### Estado (2026-09-10): **PUBLICADA em produção** ✅

Regras no ar desde 2026-09-10 17:35Z (`released rules firestore.rules to
cloud.firestore`). O CI rodou o verificador estático e os 54 testes **antes**
do deploy, como projetado — a rede da Fase 0 funcionou no seu primeiro uso
real. Netlify não buildou: nenhum commit levou `[deploy]`, e `src/` não mudou.

Passos 1 a 5 concluídos. 54/54 testes verdes, incluindo os 31 anteriores sem
nenhuma alteração — alargar enum e aceitar campo opcional não invalidou
documento nenhum.

O que entrou: `juvenil` nos 9 enums de trilha, `turmaId` opcional em `users`,
`progress` e `inviteCodes`, e as coleções `turmas` e `teacherInvites`, ambas
nascendo fechadas (só admin escreve; nem professor lista convite de professor).

Duas decisões ficaram travadas na regra, não só na documentação: turma se
arquiva e nunca se exclui (`delete: if false`), e convite de professor exige
`exists(turmas/{id})`.

Um buraco não previsto na lista original apareceu na revisão do diff e foi
fechado — invariante #46: o progresso era obrigado a bater com o `turmaId` do
perfil, mas nada obrigava o perfil a apontar para uma turma **real**.

Passo 6 (publicar) concluído: `main` recebeu o trabalho por fast-forward, o
workflow disparou e as regras subiram depois de o CI passar.

---

## Fase 2 — Turmas nos bastidores

**Entrega:** painel de turmas no Admin + todos os dados atuais dentro de uma turma.
**Visível para o aluno:** nada.
**Modelo:** Sonnet 5 para a UI → `⏸️ PARE` → Opus 5 para o backfill.

### Estado (2026-09-10): UI pronta na branch; **backfill ainda não começou**

Passos 1 a 6 concluídos: `TurmasPanel` no Admin (gated por `jogador.isAdmin`,
não pelas flags de aluno), CRUD completo (criar/editar/arquivar), contagem de
alunos por turma derivada do `turmaId` já carregado em `users`, e o botão
"Gerar convite" reaproveitando `generateInviteCode` com o `turmaId` novo da
Fase 1.

`tsc`/`vite build`/os 54 testes de regras passam. **Não testado clique-a-clique
no navegador**: o app não sobe além da tela de boot neste sandbox por falta de
credenciais Firebase reais (`.env` ausente) — confirmado que o mesmo erro
(`auth/invalid-api-key`) ocorre no código antes desta mudança, então é
limitação do ambiente, não bug introduzido aqui. Empurrado para a branch, que
o Netlify builda automaticamente (branch deploy) — **verificação pendente do
usuário**, logado como admin de verdade, antes de considerar a UI fechada.

Achado ao revisar o próprio diff antes de commitar: o formulário de edição
mostrava o dropdown de igreja mas `handleSalvar` não enviava `locationId` no
update — mudar a igreja na tela seria descartado em silêncio. Corrigido.

### Backfill (passos 7-10): escrito e testado; **ainda não executado**

`netlify/functions/backfill-turmas.mts`. Protegido por token (`BACKFILL_TOKEN`),
**falha fechado** — sem a variável configurada o endpoint não faz nada. Três
modos, e nenhum escreve sem `&aplicar=1`.

**A ordem users → progress não é preferência, é obrigação.** Depois de
carimbado, todo save de quiz carrega o `turmaId` do documento (o cliente salva
com merge) e a regra confere contra o `turmaId` do PERFIL. Carimbar `progress`
sem carimbar `users` recusa **todo quiz daquele aluno, em silêncio** — o apagão
de 2026-07-25 em versão parcial. Está provado nos invariantes #47/#48, a função
grava os perfis primeiro e **confere que chegaram** antes de tocar em progresso,
e nunca carimba progresso de dono sem turma.

9 testes contra o emulador, incluindo `integracao.test.ts`, que roda o backfill
de verdade e depois faz um save de cliente sob as regras reais — a prova de que
o carimbo não quebra o quiz do aluno.

#### Como executar (na ordem)

1. No Netlify, criar a variável de ambiente **`BACKFILL_TOKEN`** com um valor
   secreto qualquer. Sem ela o endpoint fica inerte.
2. No preview da branch, criar a **Turma Padrão** pelo painel (igreja e trilha
   em uso hoje).
3. **Relatório** — `<preview>/api/backfill-turmas?token=SEU_TOKEN`
   Mostra a realidade: quantos usuários, distribuição por igreja e trilha,
   quantos já têm turma. Não escreve nada. *Confira a distribuição por igreja
   antes de seguir: ela decide o escopo do passo 4.*
4. **Simulação** — `...&turmaId=<id da turma>`
   Mostra o que SERIA carimbado. Ainda não escreve. Se o relatório mostrou
   muita gente sem igreja, acrescente `&escopo=todos`.
5. **Aplicar** — `...&turmaId=<id>&aplicar=1` (mais `&escopo=todos` se for o
   caso). Rodar de novo depois não muda nada.

#### Verificação depois de aplicar

Abrir o app e fazer um dia do quiz: tem de sincronizar normalmente. O painel de
turmas passa a mostrar a contagem de alunos preenchida, e o ranking da semana
continua idêntico ao de antes.

### Passos — UI (Sonnet 5)

1. `firebase.ts`: `getTurmas`, `createTurma`, `updateTurma`, `arquivarTurma`.
2. `components.tsx`: componente `TurmasPanel`, no molde do `InviteCodesPanel`
   (`components.tsx:2153`).
3. Cada linha: nome, igreja, trilha, nº de alunos, professores, ativa/arquivada.
4. Botão **"+ Nova turma"**: nome, igreja (dropdown de `studyLocations`), trilha,
   professor(es).
5. Ações por turma: editar, gerar convite de aluno, arquivar.
6. Ligar a seção no `Admin` (`components.tsx:2499`), atrás de `isAdmin`.

### Passos — Backfill (Opus 5)

7. Criar a turma padrão pela própria UI, com a igreja e a trilha em uso hoje.
8. `netlify/functions/backfill-turmas.mts`, no molde de
   `backfill-ranking-data.mts`: carimba `turmaId` em `users` e `progress`.
9. **Idempotente**: rodar duas vezes não pode mudar nada na segunda.
10. **Dry-run primeiro**: rodar em modo relatório e conferir a contagem antes de
    escrever qualquer coisa.

### Verificação
Contagem de alunos da turma padrão bate com o total de usuários ativos. Ranking
da semana continua idêntico ao de antes do backfill.

### Rollback
UI: flag ou revert. Backfill: o campo `turmaId` é **aditivo** — nada é
sobrescrito, então basta ignorá-lo. Não apagar campo carimbado.

---

## Fase 3 — Convite de professor e painel do professor

**Entrega:** professor entra por link e gerencia só a turma dele.
**Modelo:** Opus 5 na fase inteira.

### Por que é a mais arriscada

É a **única** mudança que remove permissão de quem já tem. Hoje `isProfessor` é
global: lê todos os usuários, edita conteúdo de todas as trilhas e lê todos os
logs. Estreitar isso erra para o lado de travar professor real.

### Passos

1. `teacherInvites`: gerar código (molde do `generateInviteCode`,
   `firebase.ts:190`), resgatar, revogar.
2. Resgate: marca `isProfessor` **e** adiciona o uid a `turmas.professores[]`.
3. Painel do Professor: alunos da turma, ranking da turma, auditoria da turma,
   Modo Ao Vivo da turma.
4. **Atrás de flag** `PROFESSOR_ESCOPO_TURMA`, começando em `false`.
5. Estreitar as regras: professor lê só `users` da própria turma; edita só
   conteúdo da própria trilha; `errorLogs` continua só admin.
6. Testes de regra para cada permissão removida — o que ele **não** pode mais
   fazer é tão importante quanto o que pode.
7. Testar em branch deploy com uma conta de professor de verdade **antes** de
   ligar a flag.

### Verificação
Professor existente continua enxergando os próprios alunos. Professor da turma A
não enxerga aluno da turma B. Admin continua enxergando tudo.

### Rollback
Flag para `false` devolve o comportamento global na hora, sem deploy de regras.

---

## Fase 4 — Ligar para os alunos

**Entrega:** matrícula por turma e ranking em três níveis.
**Modelo:** Opus 5 para query/índice → `⏸️ PARE` → Sonnet 5 para a UI.

### O ponto que vira dinheiro

Hoje **todo aluno assina o progresso da semana inteira** (`firebase.ts:639`,
query só por `week`). Isso cresce ao quadrado:

| Cenário | Leituras/semana só de ranking |
|---|---|
| 1 igreja, 100 alunos | ~10 mil |
| 20 igrejas, 2.000 alunos, sem escopo | **~4 milhões** |
| 20 igrejas, 2.000 alunos, escopo por turma | ~60 mil |

### Passos — Query e custo (Opus 5)

1. Criar o índice composto (`turmaId` + `week`) no console do Firebase.
   **Confirmar que está `Enabled` antes de subir código** — query sem índice
   falha em produção.
2. `listenToWeekProgress` ganha `where('turmaId','==',...)`.
3. Fallback: quem ainda não tem `turmaId` continua no comportamento atual.
4. Ranking **turma** = assinatura ao vivo (barato, muda o tempo todo).
   Ranking **igreja** e **geral** = leitura sob demanda ao abrir a aba, no
   mesmo molde da Campanha (`getSeasonProgress`, `firebase.ts:661`).

### Passos — UI (Sonnet 5)

5. `MULTI_LOCATION_ENABLED` e `MULTI_TRACK_ENABLED` → `true`
   (`components.tsx:11-12`).
6. Matrícula por código da turma no `Config`.
7. Três abas no `Ranking` (`components.tsx:1371`).

### Verificação
Medir leituras no console do Firebase antes e depois. Confirmar que o ranking da
turma bate com a soma manual dos alunos dela.

### Rollback
Flags para `false`. O índice pode ficar — não custa nada parado.

---

## Fase 5 — Conteúdo das trilhas novas

**Entrega:** `juvenil` e `youngAdult` com lições.
**Modelo:** Sonnet 5.

### Passos

1. Registrar `juvenil` em `data.ts` (`TrackId`, `cache`, `carregadores`,
   `normalize`) e em `TRACK_LABELS` (`components.tsx:15`).
2. Rótulos finais: `teen` → "Adolescente", `juvenil` → "Juvenil",
   `youngAdult` → "Jovem", `adult` → "Adulto".
3. Converter o material entregue em `lessonsJuvenil.ts` etc., no formato de
   `lessonsTeen.ts`.
4. **Script de validação** rodando no `lint`: toda pergunta tem 4 opções, todo
   `correta` é índice válido, toda semana tem 7 dias, datas em sequência.
5. Sem tocar em Firestore — conteúdo no bundle custa R$ 0 em leitura.

### Verificação
Script de validação verde + abrir cada trilha nova em branch deploy.

---

## Anexo A — Modelo de dados alvo

```
studyLocations/{id}          "Igreja" — já existe
  name, createdBy, createdAt
  + cidade?, active?

turmas/{id}                  NOVA
  locationId                 a igreja
  track                      teen | juvenil | youngAdult | adult
  nome                       "Adolescentes — Profa. Ana"
  professores: [uid]         array: 2+ professores por turma
  active, createdBy, createdAt

teacherInvites/{CODIGO}      NOVA
  locationId, turmaId, active, createdBy, createdAt, expiresAt, usedBy?

users/{uid}                  + turmaId (opcional)
inviteCodes/{CODIGO}         + turmaId (opcional)
progress/{...}               + turmaId (opcional)
```

A turma é a fonte de verdade: define a trilha e a igreja, e o perfil do aluno
herda as duas.

## Anexo B — Riscos conhecidos

| Risco | Contenção |
|---|---|
| `hasOnly()` rejeita doc inteiro | Princípio 1: regra antes do código |
| Regra quebrada falha em silêncio | Fase 0: testes no CI antes do deploy |
| Query sem índice falha em produção | Fase 4 passo 1: índice `Enabled` antes do código |
| Custo de leitura do ranking | Fase 4: escopo por turma, ~66× menos leituras |
| Estreitar professor trava professor real | Fase 3: flag + testes do que foi removido |
| Turma excluída orfana histórico | Arquivar (`active: false`), nunca excluir |

## Anexo C — Como testar sem custo

`netlify.toml:22-27` faz **branch deploys e deploy previews buildarem sempre**,
sem exigir `[deploy]` no commit. Cada fase pode ser testada numa URL real, com
dados reais, sem tocar em produção e sem consumir build de produção.

Produção só builda com `[deploy]` na mensagem — e isso exige autorização
explícita do usuário, conforme `CLAUDE.md`.
