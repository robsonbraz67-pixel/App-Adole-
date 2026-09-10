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

### Estado (2026-09-10): concluída e publicada

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

**Passo 6 feito.** O push para `main` (`c8fb679` + `c07e448`) disparou o
workflow `Deploy Firestore Rules` (run `34508965401`, 10/09 17:33): 54/54 testes
verdes no emulador e, em seguida, `released rules firestore.rules to
cloud.firestore`. As regras alargadas estão **no ar em produção**.

Nada no app grava campo novo ainda — `turmaId` continua sem ser escrito por
ninguém —, então esta publicação é puro alargamento: o que passava antes
continua passando (é o que os 31 testes da Fase 0, inalterados, provam).

**Próximo passo: Fase 2 — turmas nos bastidores.** O plano recomenda Sonnet 5
para a UI do painel, `⏸️ PARE`, e Opus 5 para o backfill em dados reais.

---

## Fase 2 — Turmas nos bastidores

**Entrega:** painel de turmas no Admin + todos os dados atuais dentro de uma turma.
**Visível para o aluno:** nada.
**Modelo:** Sonnet 5 para a UI → `⏸️ PARE` → Opus 5 para o backfill.

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

### Estado (2026-09-10): UI pronta; backfill é o próximo `⏸️ PARE`

Passos 1 a 6 concluídos. Seção **🏫 Turmas** no Admin: criar, editar, arquivar
e emitir convite de aluno já vinculado à turma.

Três decisões que a lista de passos não previa:

1. **Fora das flags `MULTI_*`.** O painel responde só a `isAdmin`, não a
   `MULTI_LOCATION_ENABLED`/`MULTI_TRACK_ENABLED`. É o que permite arrumar as
   turmas com calma antes de os alunos verem qualquer coisa — quando as flags
   virarem na Fase 4, as turmas já existem e estão povoadas. (Efeito colateral
   de as flags estarem `false`: o `InviteCodesPanel` está invisível hoje, então
   os convites emitidos pela turma são revogáveis dentro da própria linha da
   turma, não só naquele painel.)
2. **"➕ Nova igreja" dentro do formulário.** Fora do cadastro, não existia
   outro lugar no app para criar uma igreja — sem isso, um admin sem
   `studyLocations` não conseguiria criar turma nenhuma.
3. **A trilha `juvenil` não aparece no seletor**, embora a regra a aceite desde
   a Fase 1. Criar turma juvenil hoje daria uma turma sem lição nenhuma; a
   opção entra na Fase 5, junto com o conteúdo.

**Custo de leitura: uma consulta.** A contagem de alunos e os nomes dos
professores saem da lista de usuários que o Admin já carrega.

### Verificação feita

- `tsc --noEmit` e `vite build` limpos.
- Painel exercitado no navegador com o `./firebase` trocado por um mock
  (mesmo método usado na auditoria de pontuação): criar com igreja nova, editar
  nome/igreja/trilha/professores, arquivar e reativar, gerar convite, revogar e
  reativar código, e 375 px sem estouro horizontal. Um bug apareceu e foi
  corrigido: a turma arquivada saía da lista mas continuava marcada como
  aberta, e o clique seguinte nela fechava em vez de abrir.
- **62/62 testes de regra verdes** (54 anteriores + 8 novos).

Os 8 novos cobrem o que os antigos não cobriam: os formatos que este painel
grava de verdade — lista de professores vazia, `updatedAt` na edição e no
arquivamento, convite carregando `turmaId`, convite antigo sem o campo, e a
recusa de trocar a turma de um convite ao revogá-lo.

Validados no sentido negativo, como manda a Fase 0: com `updatedAt` removido do
`hasOnly` de `isValidTurma`, os dois testes de edição falham e **todos os
antigos continuam passando** — que é exatamente o buraco que existia. Regra
restaurada e conferida idêntica ao original depois do teste.

### Estado do backfill (2026-09-10): **executado em produção**

`netlify/functions/backfill-turmas.mts`, no molde do `backfill-ranking-data`.
Três travas, cada uma vinda de um jeito conhecido de isto quebrar:

1. **Ensaio por padrão.** Só escreve com `POST` **e** `?aplicar=1`. Um GET —
   de navegador, de prefetch, de crawler — nunca escreve.
2. **Perfil antes do progresso, e nunca um sem o outro.** A regra do progresso
   exige `turmaId == ownTurmaId()`: um doc de progresso carimbado com turma que
   não bate com o perfil do dono faria **todo save seguinte daquele aluno
   falhar em silêncio** — a mesma família do apagão de 2026-07-25.
3. **Nunca sobrescreve.** Quem já tem `turmaId` é contado e ignorado; a segunda
   passada não escreve nada. É o que torna seguro repetir se a execução
   estourar o tempo no meio.

Além disso o carimbo respeita igreja e trilha: quem é `adult` não entra em
turma `teen`, quem é de outra igreja não entra, e o histórico de outra trilha
do mesmo aluno fica de fora (ele o poria no ranking de uma turma que nunca
frequentou naquela trilha). Convidado do Ao Vivo nunca entra em turma.

**Testes.** A decisão de quem entra vive em `src/backfillTurmas.ts`, pura e
compartilhada pelos dois executores, testada com objetos comuns — 14 casos em
`tests/backfill/planejar.test.ts`, sem emulador, `npm run test:unit`. E dois
testes de regra novos provam o estado que o backfill deixa: depois do carimbo o
aluno **salva normalmente sem mandar `turmaId`** (o save é merge, e a regra
avalia o documento mesclado); e com o progresso carimbado e o perfil sem turma,
o save é **recusado** — que é justamente o motivo da ordem. Suíte em 64/64.

### O que foi carimbado (2026-09-10, pelo painel Admin)

| Turma | Id | Perfis | Progresso |
|---|---|---|---|
| Adolescentes — ASA NORTE (`teen`) | `vhaDdRAvuY9uQhGIVYxV` | 28 | 157 |
| 1 e 2 Coríntios — ASA NORTE (`adult`) | `TL0WckZsdCX42rEoaCFY` | 1 | 7 |

Nenhuma escrita recusada pela regra. Os 28 são os 23 com ASA NORTE no perfil
mais os 5 que estavam sem igreja — incluídos por decisão do usuário, já que
ASA NORTE é a única igreja cadastrada, ou seja, "sem igreja" ali é cadastro
incompleto, não outra congregação. A turma teen ficou com os 7 professores já
marcados no sistema.

O único perfil da trilha adulto é a conta do próprio admin, que alterna de
trilha para testar. Os **6 documentos de progresso teen dessa conta ficaram de
fora** do carimbo adulto — é a regra de "não misturar trilha" funcionando em
dados reais.

Rodar o ensaio de novo depois disso devolve `0 e 0` com o botão de aplicar
desabilitado: a idempotência está confirmada em produção, não só nos testes.

**Ninguém ficou sem turma.** E nada disso é visível ao aluno ainda: as flags
`MULTI_*` continuam `false`, e o app publicado nem tem o painel — o que existe
é o dado, pronto para a Fase 4 usar.

### Dois executores para a mesma decisão

A decisão de quem entra na turma mora em `src/backfillTurmas.ts`, pura e
testada. Quem a executa é que muda:

| | Painel Admin | Função Netlify |
|---|---|---|
| Credencial | a sessão do próprio admin | conta de serviço |
| Precisa de deploy? | não — `npm run dev` já fala com produção | sim, e de `BACKFILL_TOKEN` |
| Regras | **cada escrita passa pela regra** | o SDK de servidor as ignora |
| `updatedAt` do progresso | reescrito (a regra exige `== request.time`) | preservado |
| Falha num documento | isolada e relatada | derruba o lote |

O painel é o caminho de quem tem o app à mão; a função é o de quem prefere
`curl` e não quer abrir o app. Nada no app lê `updatedAt` do progresso — a
diferença está registrada aqui por honestidade, não por consequência.

**No painel:** abrir a turma → **🧪 Ensaio do carimbo** (lê e não escreve nada)
→ conferir os números → **✅ Aplicar o carimbo**. O ensaio mostra quem entra,
quem fica de fora e por quê, e oferece incluir quem está sem igreja. Rodar de
novo depois mostra `0 e 0`: a segunda passada não tem o que escrever.

### Como executar pela função Netlify (passos 7 a 10)

Antes de tudo, definir **`BACKFILL_TOKEN`** nas variáveis do Netlify: a função
fica numa URL pública e escreve no banco de produção. Sem o token configurado,
ela responde 503 e não roda.

```bash
URL=https://<site>.netlify.app; T=<BACKFILL_TOKEN>

# 1. o mapa — quantas turmas precisam existir, por igreja e trilha
curl "$URL/.netlify/functions/backfill-turmas?token=$T&mapa=1"

# 2. criar no Admin (🏫 Turmas) uma turma por grupo do mapa; o id aparece ao
#    abrir a linha da turma, com botão de copiar

# 3. o ensaio, por turma — o que ACONTECERIA, sem escrever nada
curl "$URL/.netlify/functions/backfill-turmas?token=$T&turmaId=$ID"

# 4. o carimbo, depois de conferir o ensaio
curl -X POST "$URL/.netlify/functions/backfill-turmas?token=$T&turmaId=$ID&aplicar=1"
```

A função só existe numa URL depois de um build. Produção exige `[deploy]` no
commit (e autorização — ver `CLAUDE.md`); um **branch deploy** builda sempre e
dá uma URL real que fala com o mesmo banco de produção, o que permite rodar o
mapa e o ensaio sem tocar no build de produção.

O branch deploy desta fase é `claude/turmas-backfill-fase2`, e o Netlify o serve
em `https://claude-turmas-backfill-fase2--<site>.netlify.app`. Atenção ao que
isso significa: **é o banco de produção**, não uma cópia. O ensaio é seguro
porque não escreve, não porque os dados sejam de mentira.

`incluirSemIgreja=1` acrescenta quem está sem igreja nenhuma. O padrão é
deixá-los de fora: com mais de uma igreja no sistema, "sem igreja" é ambíguo, e
o ensaio os conta separadamente para a decisão ser consciente.

---

## Fase 3 — Convite de professor e painel do professor

**Entrega:** professor entra por link e gerencia só a turma dele.
**Modelo:** Opus 5 na fase inteira.

### A fase se parte em duas metades, com riscos opostos

**3a — só acrescenta.** Convite de professor (emitir, revogar, resgatar), o
professor entrando na própria turma e emitindo convite de aluno para ela.
Ninguém perde permissão; rollback é `git revert`.

**3b — remove permissão.** Professor deixa de ver todos os alunos e todos os
logs. Aqui mora o risco, e por um detalhe do Firestore: `allow list` é
tudo-ou-nada contra a **consulta**, não por documento. Se a regra passar a
exigir `turmaId == o meu` e o painel continuar pedindo todos os usuários, a
consulta inteira falha — professor real travado. Por isso o painel do professor
tem de vir **antes** da regra estreitar, e não depois.

Isso também corrige uma promessa que o plano fazia e não se sustentava: "flag
para false devolve o comportamento global na hora, sem deploy de regras". Não
devolve — regra estreitada é servidor, e flag é cliente. O que a flag protege é
a UI; desfazer a regra exige revert e publicação.

### Estado da 3a (2026-09-10): escrita e testada; **não publicada**

Regras: resgate do convite (queimar o convite é o PRIMEIRO passo, um
compare-and-set num só documento — se duas pessoas abrem o mesmo link, uma
ganha; e a regra de `users` exige que o convite tenha sido queimado *por quem
está escrevendo*, o que fecha a corrida); auto-promoção limitada a
`isProfessor`, `turmaId` e `inviteCode`, com `isAdmin` fora de propósito;
professor renomeia a própria turma, entra sozinho na lista de professores sem
poder tirar ninguém, e emite convite de aluno para a própria turma.

Código: o admin gera e revoga o convite dentro da linha da turma; quem já tem
conta resgata pelo Perfil, num campo recolhido atrás de "🎓 Tenho um convite de
professor".

21 testes novos (85/85 no total), metade deles sobre o que **não** pode: sem
convite não vira professor, convite dos outros não serve, convite não queimado
não serve, convite de uma turma não abre outra, e o resgate não dá `isAdmin`
junto. Validado no sentido negativo: afrouxando a checagem de "queimado por
mim", os dois testes correspondentes falham e os demais seguem passando.

### Estado da 3b (2026-09-10): painel pronto; regras ainda **não** estreitadas

`PainelProfessor`, atrás de `PROFESSOR_ESCOPO_TURMA` (começa em `false`).
Com a flag ligada, quem é professor e não é admin passa a ver a própria turma
no lugar do painel do sistema: alunos com ofensiva, ranking da semana recortado
para a turma, e a auditoria de pontuação **em modo leitura**.

A auditoria em leitura não é economia de trabalho: corrigir pontuação exige
`isUserAdmin()` na regra, então botão de zerar ali voltaria "permissão negada".
Mostrar o que a regra recusa é pior do que não mostrar.

O ponto que faz esta ordem valer a pena: **todas as leituras do painel já pedem
os dados com o filtro de turma** (`getUsersDaTurma`). Como `allow list` é
tudo-ou-nada contra a consulta, uma tela que pedisse "todos os usuários"
quebraria inteira no dia em que a regra exigisse `turmaId == o meu`. Escrita
assim, ela atravessa a mudança sem perceber — e é por isso que o painel vem
antes da regra, não depois.

O ranking da turma reusa a consulta por semana que o app já faz e recorta no
cliente. O recorte no servidor, com índice composto, é a Fase 4 — aqui não
custa índice novo nem leitura nova.

**Publicado em 2026-09-10** (`a3c4f1f`, com `[deploy]`): a flag está **ligada**
em produção e as regras seguem permissivas, então o painel novo funciona com
folga enquanto é conferido. Quem é professor e não é admin já vê a própria
turma no lugar do painel do sistema.

Desligar de volta é um deploy do cliente — não um deploy de regras — porque
nada no servidor mudou ainda.

**Falta:** conferir com um professor de verdade que o painel abre e, só então,
publicar as regras estreitadas, que estão prontas e testadas na branch
`claude/fase3b-painel-professor` (commit `b74aa06`), com o passo a passo na
seção "A ORDEM DE PUBLICAÇÃO" que sobe junto com elas.

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

**Rodar a suíte de regras localmente exige Java** — o emulador do Firestore roda
em JVM. Num Mac sem JDK, `npm run test:rules` morre com "Unable to locate a Java
Runtime"; `brew install openjdk` resolve, mas é *keg-only*, então o PATH precisa
do prefixo na hora de rodar:

```
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:rules
```

`netlify.toml:22-27` faz **branch deploys e deploy previews buildarem sempre**,
sem exigir `[deploy]` no commit. Cada fase pode ser testada numa URL real, com
dados reais, sem tocar em produção e sem consumir build de produção.

Produção só builda com `[deploy]` na mensagem — e isso exige autorização
explícita do usuário, conforme `CLAUDE.md`.
