# SabatinaQuest — Regras para Claude Code

## Migração Netlify → Firebase Hosting: concluída (2026-09-26)

O Firebase Hosting (`*.web.app`) é o único host de produção. O Netlify foi
desligado: a configuração saiu do repositório (`netlify.toml`,
`netlify/functions/`) depois de um último deploy que mostrou, a quem ainda
tinha o link antigo salvo, um aviso de mudança de endereço com redirecionamento
automático (`src/App.tsx`, `src/version.ts` — o mecanismo continua no código,
inofensivo, caso um corte parecido seja necessário de novo).

## DEPLOY — Autorização Obrigatória

`.github/workflows/hosting.yml` publica em `*.web.app` a cada push em `main`
que passar no CI, sem gate por mensagem de commit (deploy no plano Spark não
tem custo). Por isso, **perguntar antes de dar push/merge em `main`** — publica
sozinho assim que chega lá, não existe `[deploy]` para segurar o build.

## Branches

- Desenvolvimento: branch `claude/system-efficiency-review-gri68i` ou feature branches
- Deploy automático: `main` → Firebase Hosting, a cada push que passar no CI

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Firebase 12 (Auth + Firestore — DB: `ai-studio-74ab770d-6811-4e4f-a79f-36f8c5b037b4`; projeto `gen-lang-client-0268878137`)
- Firebase Hosting (deploy automático do branch `main`) — ver `.github/workflows/hosting.yml`
- PWA para escola sabatina teen

## Segurança

- Nunca commitar `.env` ou credenciais Firebase
- `FIREBASE_TOKEN` (legado, sendo descontinuado) / `FIREBASE_SERVICE_ACCOUNT` só via GitHub Secrets —
  `FIREBASE_SERVICE_ACCOUNT` é o segredo único usado para publicar regras, Hosting e os backfills
  (`.github/workflows/firestore-rules.yml`, `hosting.yml`, `backfill-*.yml`)
- Só admins escrevem em `conteudoOverrides` (Firestore rules)
