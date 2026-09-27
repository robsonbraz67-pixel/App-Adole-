# Manual de apresentação de encerramento

Guia de como CONDUZIR o encerramento de temporada — a música, o silêncio, a
participação da turma. É o complemento de `docs/relatorio-temporada.md` (que
descreve os DADOS): aquele documento diz o que apresentar, este diz como
apresentar de um jeito que prende adolescente.

Vale para qualquer temporada — não tem nome de aluno nem número de nenhuma
turma específica. Quando for montar o encerramento de verdade, siga o roteiro
que o relatório de dados sugerir e aplique estas técnicas em cima dele.

## Princípio geral: participação bate plateia

O roteiro de dados entrega o conteúdo. O que transforma isso em experiência é
fazer a turma **viver** cada slide, não só ler. Três mecanismos se repetem o
evento inteiro — valem para qualquer encerramento:

1. **Pergunte antes de revelar.** Sempre que um slide tiver um número ou um
   nome, pergunte à turma antes de mostrar: "quantos dias vocês acham que a
   turma estudou?", "quem vocês acham que é o 3º lugar?". Deixe 2–3 palpites
   em voz alta antes de avançar. Vale até para rankings pequenos (professores,
   melhor semana) — o mecanismo de suspense funciona em qualquer escala.
2. **Silêncio antes do "boom".** Nos slides de revelação do pódio, corte todo
   o som por 1 segundo antes do clique que mostra o nome. É o corte, não o
   barulho depois, que faz a plateia prender a respiração. No 1º lugar, esse
   silêncio pode durar 2 segundos — é o clímax da noite.
3. **Corpo em pé, não só nome na tela.** Toda vez que alguém for citado (quem
   completou a temporada, destaques, sorteio), chame a pessoa para ficar em
   pé. Um grupo de pé no fim de um slide de "clube da temporada" forma uma
   fileira visível — a plateia já sabe fisicamente quem disputa o pódio antes
   da revelação.

## Deixas de música e som, por tipo de slide

| Momento | Deixa de áudio |
|---|---|
| Abertura (capa) | Som ambiente que sobe de volume nos 3s antes do título aparecer |
| Números da temporada | "Swoosh" ou efeito de contador subindo no clique do número |
| Mistério do pódio (cada posição) | Trilha de suspense baixa, subindo de volume nas últimas pistas |
| Revelação do 2º e 3º lugar | Corte para silêncio total (1s) → som de impacto no clique → aplausos |
| Revelação do 1º lugar | Silêncio de 2s → maior efeito sonoro/luminoso da noite |
| Sorteio ao vivo | Música de tensão crescente (tipo roleta) até o nome parar na tela |
| Virada para a próxima temporada | Troca de trilha: de um clima mais intenso para um mais claro e leve |

## Onde tirar a turma da cadeira

- **Números da temporada:** peça o palpite antes de revelar o total de dias
  estudados.
- **Dia/semana mais estudada:** conte como história, não como dado — ligue o
  número a algo que a turma viveu (um nome de lição, um evento da igreja).
- **Destaques individuais (maratonista, mais pontual etc.):** chame a pessoa
  para ficar em pé no momento em que o número dela aparece.
- **Clube da temporada:** chame todo o grupo para ficar em pé, um a um,
  conforme os nomes são lidos.
- **Resumo de todos os alunos:** não leia a lista corrida. Projete um aluno
  por vez com a frase da conquista dele, aplausos rápidos, próximo — evita o
  efeito "leitura de burocracia" de uma tabela cheia.
- **Sorteio ao vivo:** convide alguém da plateia que **não** está concorrendo
  para apertar o botão de sortear no telão.
- **Fechamento:** não deixe a tela em branco depois do último slide. Peça
  para todo mundo abrir o app ali mesmo, celular na mão, e começar a primeira
  lição da nova temporada juntos — o ritual coletivo fixa mais do que
  qualquer frase de efeito.

## Checklist do dia

- [ ] Testar o som da capa e o corte de silêncio antes das revelações do pódio
- [ ] Separar quem vai apertar o botão do sorteio ao vivo (alguém de fora do
      grupo que concorre)
- [ ] Ter o Sorteador aberto em modo telão, pronto antes do slide do sorteio
- [ ] Combinar com quem cuida do som/luz os pontos de maior impacto: revelação
      do 1º lugar, sorteio ao vivo e virada para a próxima temporada
- [ ] Ter celulares com o app já instalado à mão para o ritual coletivo do
      fechamento

## Apresentando pelo app

A aba **📊 Temporada** do painel do professor abre a apresentação pronta, em
tela cheia (**🎬 Apresentar encerramento no telão**). As técnicas acima já vêm
embutidas nos slides:

| Tecla (ou passador de slides) | O que faz |
|---|---|
| → · Espaço · PageDown | Próximo passo: revela o próximo número, pista ou nome; no fim do slide, vai para o próximo |
| ← · PageUp | Volta um passo |
| N | Mostra/esconde as notas do apresentador (o que dizer em cada slide) |
| B ou . | Tela preta (de novo para voltar) |
| S | No slide do sorteio, abre o sorteador (Esc volta para os slides) |

- **Capa** começa em tela preta; o primeiro clique faz o título surgir.
- **Números, dia mais estudado, pódios:** mostram "?" até o clique — dá tempo
  de pedir os palpites. Os pódios revelam do 3º para o 1º.
- **Clube da temporada:** um nome por clique, para chamar cada um a ficar em pé.
- **Mistério do pódio:** uma pista por clique, com a trilha de suspense.
- **Revelação:** o clique corta todo o som e segura o silêncio (1 s no 3º e no
  2º lugar, 2 s no 1º) antes de o nome aparecer, com som de impacto e confete.
- **A turma inteira:** um aluno por clique, com a frase de conquista dele.
- O **✕** no canto fecha a apresentação (o Esc não fecha, para um toque sem
  querer não derrubar a noite). Reabrir volta ao mesmo slide.

### Sons

Cada deixa de áudio procura um arquivo gravado em `public/sons/encerramento/`.
Sem o arquivo, o app usa um som sintetizado próprio (contador, impacto,
campeão, virada) ou fica em silêncio (fogo, suspense, aplausos) — e o som da
igreja cobre essas deixas. Use só áudio de licença livre (Mixkit, Pixabay,
Freesound CC0), em MP3:

| Arquivo | Quando toca |
|---|---|
| `abertura.mp3` | Clique que tira a capa do preto (fogo crepitando / batida grave subindo) |
| `swoosh.mp3` | Cada número, data ou nome de pódio revelado |
| `suspense.mp3` | Em loop durante os mistérios do pódio; corta no clique da revelação |
| `impacto.mp3` | Revelação do 3º e do 2º lugar |
| `campeao.mp3` | Revelação do 1º lugar |
| `aplausos.mp3` | Logo depois de cada revelação |
| `virada.mp3` | Slide da próxima temporada (troca de clima) |

## Como usar isto com o relatório de dados

1. Baixe o relatório da sua turma (painel do professor → aba 📊 Temporada →
   Baixar relatório).
2. Monte o roteiro de conteúdo seguindo `docs/relatorio-temporada.md` (o
   prompt pronto ali já monta a sequência de slides).
3. Aplique as técnicas deste manual em cima do roteiro pronto — cada seção
   acima diz que tipo de slide recebe qual tratamento.
