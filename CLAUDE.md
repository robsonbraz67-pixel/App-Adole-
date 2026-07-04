# SabatinaQuest — Regras para Claude Code

## DEPLOY — Autorização Obrigatória

**NUNCA** fazer commit com `[deploy]` na mensagem sem antes perguntar explicitamente ao usuário.

Antes de qualquer deploy, perguntar:
> "Posso fazer o deploy agora? Isso vai publicar no Netlify e consumir créditos de build."

Só prosseguir após resposta afirmativa clara ("sim", "pode", "vai", etc.).

## Branches

- Desenvolvimento: branch `claude/system-efficiency-review-gri68i` ou feature branches
- Deploy automático: `main` (só com `[deploy]` na mensagem do commit)

## Como fazer deploy

Quando autorizado pelo usuário:
```
git commit -m "descrição da mudança [deploy]"
git push origin main
```

Sem `[deploy]` na mensagem → Netlify pula o build (sem custo).

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Firebase 12 (Auth + Firestore — DB: `ai-studio-74ab770d-6811-4e4f-a79f-36f8c5b037b4`)
- Netlify (deploy automático do branch `main`)
- PWA para escola sabatina teen

## Segurança

- Nunca commitar `.env` ou credenciais Firebase
- `FIREBASE_TOKEN` / `FIREBASE_SERVICE_ACCOUNT` só via GitHub Secrets
- Só admins escrevem em `conteudoOverrides` (Firestore rules)
