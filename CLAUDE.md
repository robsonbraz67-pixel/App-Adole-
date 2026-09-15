# SabatinaQuest — Regras para Claude Code

## Migração em andamento: Netlify → Firebase Hosting

Os dois publicam a partir de `main`, **em paralelo**, até o corte estar
concluído (ver o plano de migração). O Netlify continua sendo o link que os
alunos usam; o Firebase Hosting (`*.web.app`) só recebe tráfego real depois
de validado. **Nunca desligar o Netlify sem autorização explícita** — é
passo separado, feito só depois do período de ponte combinado com o usuário.

## DEPLOY — Autorização Obrigatória

### Netlify (site público hoje)

**NUNCA** fazer commit com `[deploy]` na mensagem sem antes perguntar explicitamente ao usuário.

Antes de qualquer deploy, perguntar:
> "Posso fazer o deploy agora? Isso vai publicar no Netlify e consumir créditos de build."

Só prosseguir após resposta afirmativa clara ("sim", "pode", "vai", etc.).

Sem `[deploy]` na mensagem → Netlify pula o build (sem custo).

### Firebase Hosting (em validação — ainda não é o link divulgado)

`.github/workflows/hosting.yml` publica em `*.web.app` a cada push em `main`
que passar no CI, sem gate por mensagem de commit (deploy no plano Spark não
tem custo). Por isso, o momento de pedir autorização passa a ser o
**push/merge em `main` em si**: perguntar antes de dar push em `main`, mesmo
sem `[deploy]` na mensagem — publica sozinho assim que chega lá.

Quando o corte estiver concluído e o Netlify desligado, esta seção volta a
descrever um único fluxo, sem o gate por commit.

## Branches

- Desenvolvimento: branch `claude/system-efficiency-review-gri68i` ou feature branches
- Deploy automático: `main` (Netlify só com `[deploy]` na mensagem; Firebase Hosting a cada push)

## Como fazer deploy no Netlify

Quando autorizado pelo usuário:
```
git commit -m "descrição da mudança [deploy]"
git push origin main
```

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Firebase 12 (Auth + Firestore — DB: `ai-studio-74ab770d-6811-4e4f-a79f-36f8c5b037b4`; projeto `gen-lang-client-0268878137`)
- Netlify (deploy automático do branch `main`) migrando para Firebase Hosting — ver `.github/workflows/hosting.yml`
- PWA para escola sabatina teen

## Segurança

- Nunca commitar `.env` ou credenciais Firebase
- `FIREBASE_TOKEN` (legado, sendo descontinuado) / `FIREBASE_SERVICE_ACCOUNT` só via GitHub Secrets —
  `FIREBASE_SERVICE_ACCOUNT` é o segredo único usado para publicar regras, Hosting e os backfills
  (`.github/workflows/firestore-rules.yml`, `hosting.yml`, `backfill-*.yml`)
- Só admins escrevem em `conteudoOverrides` (Firestore rules)
