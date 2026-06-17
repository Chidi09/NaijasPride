# NaijasPride Project Context

## Shell & Environment

- **Operating System**: Windows (win32).
- **Shell**: PowerShell.
- **Command Syntax**:
  - DO NOT use `&&`. Use `;` or `if ($?) { ... }` for conditional execution.
  - Use `Remove-Item -Path "..." -Recurse -Force` instead of `rm -rf`.
  - Use `Copy-Item`, `Move-Item`, `New-Item` for file operations.
  - Use `Test-Path` to check for file existence.
- **Git**: Use PowerShell-safe quoting for commit messages.

## Project Structure

- Monorepo using Turborepo.
- `apps/api`: Fastify backend.
- `apps/web`: Angular 17 frontend.
- `packages/shared-*`: Shared logic and types.
