---
inclusion: always
---

# Git Workflow

- Work on `main` unless the developer asks for a branch. Commit small, coherent changes with clear messages (`type: summary`, for example `feat:`, `docs:`, `chore:`, `spike:`).
- Commit and push at meaningful checkpoints: a task or spike finished, and always before the developer's review.
- Stage files by name. Do not use `git add -A` or `git add .`.
- Never force-push, rewrite published history, or use `git reset --hard`.
- Never commit secrets: private keys, passphrases, tokens, `.env` files, or Kiro Crew credentials. Check `git status` and the staged diff before each commit. Keep a `.gitignore` entry for key and env files.
- Source snapshots are committed deliberately and only when the license and size are acceptable. Report large or unclear files instead of committing them.
- Do not change git config.
