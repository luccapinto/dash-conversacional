<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Convenções do repo

- Onde fica o quê: `lib/analytics` (catálogo, motor, sinais), `lib/agente` (tools, prompt, guarda, rota do agente), `lib/layout` (layout spec, pré-geração, fallback determinístico), `lib/painel` (modelos de vista das telas), `lib/ia` + `components/ia` (gaveta da IA via SSE), `lib/dados` (JSON gerados). Arquitetura em `docs/architecture.md`, histórias dos dados em `docs/narrativa.md`.
- Regra dos números: todo número vem do motor (`lib/analytics/engine.ts`); a IA escolhe o que mostrar e nunca calcula. Número em texto da IA precisa estar num resultado de tool: a guarda marca no agente e barra nos layouts e títulos.
- `lib/analytics/servidor.ts` é `server-only`; o navegador só pode alcançar `lib/dados/cliente/cubo.json` (`__tests__/analytics/orcamento.test.ts` confere).
- Os JSON de `lib/dados/` saem de `scripts/generate-*.ts`; não edite à mão.
- Verificação, uma de cada vez: `npx tsc --noEmit` · `npm run lint` · `npx vitest run --maxWorkers=1` · `npm run build` · `npm run orcamento`. Os testes não usam rede.
- Código, comentários, docs e commits (convencionais) em PT-BR.
