# Invariantes das regras do Firestore

Contrato dos testes da Fase 0. Cada linha é um comportamento das regras atuais
que **não pode mudar sem alguém decidir que muda**. Os testes existem para que
uma alteração acidental apareça no CI, e não num relato de aluno.

Referências de linha apontam para `firestore.rules` no estado de 2026-09-10.

**Como ler o resultado esperado:** ✅ = a operação deve ser aceita.
❌ = deve ser recusada. Um teste que espera ❌ e passa a receber ✅ é um vazamento
de privilégio; o contrário é um apagão.

**Estado (2026-09-10): os 30 invariantes estão escritos, `npm run test:rules`
roda 31/31 verde** (mais um controle positivo do #8/#9, ver a tabela do Tier 2).
Validado nos dois sentidos: contra as regras reais tudo passa; contra uma cópia
com `ownLocationId()` removida (o apagão de 2026-07-25) e contra uma cópia com
o invariante #10 quebrado de propósito, os testes correspondentes falham como
esperado — a rede pega regressão real, não só passa por acidente.

---

## Invariantes que mudaram de propósito

Um teste que passa a falhar é ou uma regressão, ou uma decisão. Esta seção é
onde as decisões ficam registradas — se não estiver aqui, é regressão.

### #21 — leitura de `users` pelo professor (Fase 3b, 2026-09-10)

**Era:** professor lê o perfil de qualquer usuário do sistema.
**Passou a ser:** professor lê os perfis da própria turma; admin continua lendo
tudo.

**Por quê:** `isProfessor` era global — quem tivesse o selo enxergava todos os
alunos de todas as igrejas. Com turmas, o escopo natural do professor é a turma
dele. É a única mudança do plano de expansão que REMOVE permissão de quem já
tem, e por isso vem acompanhada de `escopo-professor.test.ts`, que testa cada
permissão removida.

**O que quebra se a ordem for invertida:** `allow list` do Firestore é
tudo-ou-nada contra a CONSULTA. Uma tela que peça "todos os usuários" passa a
ser recusada por completo — não filtrada. Por isso o painel do professor
(`getUsersDaTurma`, que já consulta `where('turmaId','==', a minha)`) precisa
estar **no ar** antes de esta regra ser publicada.

---

## Tier 1 — O app para de funcionar

Quebrar qualquer um destes derruba o uso normal, e o repositório já provou que
isso acontece **em silêncio**: o aluno vê "Progresso não sincronizado" e mais
nada aparece em lugar nenhum.

| # | Invariante | Regra | Esperado | Estado |
|---|---|---|---|---|
| 1 | Aluno matriculado grava o próprio progresso **com `locationId`** | 445-450 | ✅ | ✔️ feito |
| 2 | Qualquer autenticado **lê** `progress` (o ranking inteiro depende disso) | 440 | ✅ | ✔️ feito |
| 3 | Aluno cria o próprio perfil no primeiro login | 121-126 | ✅ | ✔️ feito |
| 4 | Aluno atualiza nome e avatar do próprio perfil | 128-135 | ✅ | ✔️ feito |
| 5 | Aluno grava a própria anotação privada | 476-483 | ✅ | ✔️ feito |
| 6 | Admin corrige o progresso de outro (auditoria de pontuação) | 460-465 | ✅ | ✔️ feito |

> **Invariante 1 é o apagão de 2026-07-25.** Já validado: com `ownLocationId()`
> removida das regras, o emulador responde `Function not found error` e recusa a
> gravação. O teste pega.

---

## Tier 2 — Escalada de privilégio

Alguém ganhando poder que não deveria ter. Em um app onde o admin corrige
pontuação e o professor vê dados de menores, isto é o mais grave da lista.

| # | Invariante | Regra | Esperado | Estado |
|---|---|---|---|---|
| 7 | Aluno **não** grava progresso no documento de outro | 446-447 | ❌ | ✔️ feito |
| 8 | Aluno **não** se autopromove a `isAdmin` no create | 124 | ❌ | ✔️ feito |
| 9 | Aluno **não** se autopromove a `isAdmin` no update | 132 | ❌ | ✔️ feito |
| 10 | Aluno **não** se autopromove a `isProfessor` (chave fora do `hasOnly` do dono) | 129 | ❌ | ✔️ feito |
| 11 | Aluno **não** troca a própria `track` (só admin/professor podem) | 72-75 | ❌ | ✔️ feito |
| 12 | Aluno **não** troca o próprio `locationId` depois de definido | 73 | ❌ | ✔️ feito |
| 13 | Aluno **não** altera o próprio `email` | 131 | ❌ | ✔️ feito |
| 14 | Professor **não** se autoatribui a um local (`teacherAssignments`) | 181-183 | ❌ | ✔️ feito |
| 15 | Professor **não** emite convite para local diferente do atribuído | 205-209, 223 | ❌ | ✔️ feito |
| 16 | Aluno comum **não** cadastra `studyLocations` | 156-159 | ❌ | ✔️ feito |
| 17 | Aluno comum **não** edita `conteudoOverrides` | 497 | ❌ | ✔️ feito |
| 18 | Ninguém apaga documento de `progress` — nem admin | 467 | ❌ | ✔️ feito |

> **Invariante 10 é sutil.** O `hasOnly` do update do dono (linha 129) lista
> `isAdmin` mas **não** `isProfessor`. É o que impede a autopromoção — e é
> exatamente o tipo de coisa que um "vou só adicionar o campo na lista" quebra
> sem ninguém perceber. **Validado**: adicionar `isProfessor` de propósito a essa
> lista faz `perfil.test.ts` falhar com `Expected request to fail, but it succeeded.`

---

## Tier 3 — Privacidade

O app é usado por adolescentes. Anotação de estudo é conteúdo pessoal.

| # | Invariante | Regra | Esperado | Estado |
|---|---|---|---|---|
| 19 | Aluno **não** lê `studyNotes` de outro | 475 | ❌ | ✔️ feito |
| 20 | Aluno **não** lê `users` de outro | 119 | ❌ | ✔️ feito |
| 21 | Professor lê `users` **da própria turma**; admin lê tudo | 119 | ✅ | ✔️ feito · **alterado na Fase 3b** |
| 22 | Aluno **não** lista `inviteCodes` (não pode enumerar os códigos) | 215 | ❌ | ✔️ feito |
| 23 | Aluno **não** lê `errorLogs` nem `userReports` | 751, 768 | ❌ | ✔️ feito |
| 24 | Não-membro **não** lê uma `pairs` (as anotações compartilhadas) | 304 | ❌ | ✔️ feito |

> **Invariante 19 não tem exceção de admin** — nem o super admin lê a nota de um
> aluno. Isso é deliberado (Etapa 8) e deve continuar assim.

---

## Tier 4 — Integridade do Modo Ao Vivo

O jogo vale pontuação na frente da turma. Estas são as travas anti-cola, e três
delas já foram bugs corrigidos.

| # | Invariante | Regra | Esperado | Estado |
|---|---|---|---|---|
| 25 | Jogador **não** lê `liveGamesPrivate` (o gabarito) | 608 | ❌ | ✔️ feito |
| 26 | Jogador **não** lista `liveAnswers` (o que os colegas marcaram) | 676 | ❌ | ✔️ feito |
| 27 | Jogador **não** altera o próprio `score` em `livePlayers` | 646 | ❌ | ✔️ feito |
| 28 | Jogador **não** responde pergunta que não é a corrente | 686-687 | ❌ | ✔️ feito |
| 29 | Aluno comum **não** cria sala (`liveGames` exige `canManage`) | 580 | ❌ | ✔️ feito |
| 30 | Host credita pontos aos jogadores da sala dele | 646-648 | ✅ | ✔️ feito |

> **Invariante 26** foi um vazamento real: antes da correção, qualquer
> autenticado listava as respostas da pergunta corrente e via o que os colegas
> tinham marcado **antes de responder**.

---

## Tier 5 — Fase 1: trilha juvenil, turmaId, turmas e convite de professor

Campos e coleções introduzidos pela Fase 1 do plano de expansão. Nada no app
escreve neles ainda — estes testes existem para que a regra esteja provada
**antes** do código que vai usá-la (Princípio 1 do plano).

| # | Invariante | Regra | Esperado | Estado |
|---|---|---|---|---|
| 31 | `juvenil` é trilha válida em `users` | 61 | ✅ | ✔️ feito |
| 32 | Trilha inventada continua recusada em `users` | 61 | ❌ | ✔️ feito |
| 33 | Aluno grava progresso na trilha `juvenil` | 409 | ✅ | ✔️ feito |
| 34 | Aluno define o próprio `turmaId` quando ainda não tem | 129 | ✅ | ✔️ feito |
| 35 | Aluno **não** troca o próprio `turmaId` depois de definido | 74 | ❌ | ✔️ feito |
| 36 | Admin troca o `turmaId` de um aluno | 139 | ✅ | ✔️ feito |
| 37 | Progresso **não** aceita `turmaId` diferente do real do dono | 419 | ❌ | ✔️ feito |
| 38 | Qualquer autenticado lê `turmas` (matrícula e ranking dependem) | 174 | ✅ | ✔️ feito |
| 39 | Aluno comum **não** cria turma | 175 | ❌ | ✔️ feito |
| 40 | Admin cria turma | 175 | ✅ | ✔️ feito |
| 41 | Ninguém apaga turma — nem admin (arquiva-se) | 179 | ❌ | ✔️ feito |
| 42 | Aluno **não** lista `teacherInvites` | 262 | ❌ | ✔️ feito |
| 43 | Aluno lê um `teacherInvite` pelo código exato (resgate) | 261 | ✅ | ✔️ feito |
| 44 | Aluno comum **não** cria convite de professor | 264 | ❌ | ✔️ feito |
| 45 | Admin cria convite de professor | 264 | ✅ | ✔️ feito |
| 46 | Aluno **não** se matricula em turma que não existe | 135-144 | ❌ | ✔️ feito |

> **#35 e #37 são a mesma trava do `locationId`, aplicada à turma.** Sem #35 o
> aluno se mudaria de turma sozinho; sem #37 ele gravaria progresso carimbado
> com a turma de outro e apareceria no ranking dela. As duas seguem o padrão
> que já protege o local — inclusive a exceção do admin, que corrige o doc dos
> outros.

> **#41 trava a decisão do plano na própria regra**, em vez de deixá-la só na
> documentação: turma se arquiva (`active: false`), nunca se exclui, senão o
> progresso que carrega aquele `turmaId` vira histórico órfão.

> **#46 fecha um buraco encontrado revisando o diff da Fase 1**, não pela lista
> original: #37 obriga o progresso a bater com o `turmaId` do perfil, mas nada
> obrigava o *perfil* a apontar para uma turma real. Sem #46, bastava gravar
> um `turmaId` inventado (ou de outra igreja) no próprio perfil para que o
> progresso o carimbasse legitimamente — e o aluno entrasse no ranking de uma
> turma que não é a dele. É a mesma proteção que o `locationId` já tinha.

---

## Organização atual

Um arquivo por área:

| Arquivo | Invariantes |
|---|---|
| `progresso.test.ts` | 1, 2, 6, 7, 18 |
| `perfil.test.ts` | 3, 4, 8, 9, 10, 11, 12, 13, 20, 21 (+ 1 controle positivo do super admin) |
| `gestao.test.ts` | 14, 15, 16, 17, 22, 23 |
| `privacidade.test.ts` | 5, 19, 24 |
| `aovivo.test.ts` | 25, 26, 27, 28, 29, 30 |

Para regra nova a partir da Fase 1 (ex.: `turmas`, `teacherInvites`), o padrão é
adicionar linhas aqui primeiro (o contrato), depois o arquivo de teste — nunca
o contrário.

## Regras de escrita

1. **Semear sempre com `semear*`/`semearDoc`** (helpers.ts), nunca via regras —
   o estado inicial não pode depender daquilo que está sendo testado.
2. **`beforeEach(limpar)`** em todo arquivo: teste não pode herdar dado de outro.
3. **Um invariante por `it()`**, com o número na descrição. Quando o CI ficar
   vermelho, o nome do teste precisa dizer sozinho o que se perdeu.
4. **Testar a recusa pelo motivo certo.** Um `assertFails` passa por qualquer
   erro, inclusive documento mal montado. Monte o documento **válido** e mude
   só a variável do invariante — senão o teste passa por acidente e não protege
   nada.
5. **Não adaptar a regra ao teste.** Se um teste falha, a pergunta é qual dos
   dois está certo — e a resposta quase sempre é a regra. (Duas vezes nesta
   sessão a resposta foi "o teste": um `update` que não reenviava `updatedAt`
   — a própria regra exige `== request.time` quando a chave existe — e um
   `get()` legítimo derrubado por corrida entre arquivos, não pela regra.)
6. **Um projeto de emulador por ARQUIVO de teste**, não um só global. O vitest
   roda arquivos em paralelo por padrão; todos apontando para o mesmo
   `projectId` fazem o `clearFirestore()` de um arquivo apagar o que outro
   acabou de semear, no meio do teste — sintoma: teste que passa sozinho
   (`vitest -t "..."`) mas falha na suíte inteira. `setup(sufixo)` em
   `helpers.ts` já isola por arquivo (`demo-sabatina-<sufixo>`); todo arquivo
   novo precisa de um sufixo próprio, nunca reaproveitado.
