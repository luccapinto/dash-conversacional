# ADR — Arquitetura de Dados e Estado

**Status:** Aceito | **Ref:** LUC-159 | **Data:** 2026-06-04

## Contexto

Dashboard executivo de turnover com IA conversacional, sem banco de dados nem backend dedicado. Stack: Next.js 16 no Vercel.

## Decisões

### 1. Dados do dashboard — JSON estático

- O dataset sintético é gerado offline por um script (`scripts/generate-data.ts`) com seed fixa.
- Os arquivos JSON resultantes ficam em `lib/data/` e são empacotados no bundle estático.
- Os dados são lidos em Server Components (zero custo de fetch em runtime para o usuário).

```
scripts/generate-data.ts  →  lib/data/headcount.json
                          →  lib/data/desligamentos.json
                          →  lib/data/aggregated.json
```

### 2. Insights proativos — JSON estático indexado por filtro

- Gerados offline por `scripts/generate-insights.ts` que chama o OpenRouter **uma única vez** para todas as combinações de filtro.
- Armazenados em `lib/data/insights.json` indexados pela chave `"${periodo}:${diretoria}"`.
- O front exibe loading simulado (~4s) ao trocar filtro para preservar a sensação de "IA pensando".
- Custo de IA: pago uma vez no setup, zero custo por usuário.

```
Combinações: 6 períodos × 7 visões (Geral + 6 diretorias) = 42 combinações
```

### 3. Chat — única superfície dinâmica (serverless function)

- `app/api/chat/route.ts` é o único endpoint de backend.
- Recebe: `{ pergunta, historico, contextoFiltro }`.
- Fluxo: modelo → escolhe tool → servidor executa função real sobre dados → resultado volta ao modelo → resposta em PT + especificação de gráfico.
- A API key do OpenRouter vive exclusivamente em variável de ambiente server-side (`OPENROUTER_API_KEY`). Nunca no client bundle.
- Tratamento de erro robusto com fallback amigável.

### 4. Estado do cliente — filtros como fonte de verdade

- Estado global mínimo: `{ periodo: Periodo, diretoria: Diretoria }`.
- Governado por React Context simples (`FilterContext`), sem bibliotecas externas de estado.
- O mesmo estado alimenta:
  - Quais dados as funções de cálculo retornam (gráficos)
  - Qual insight pré-gerado exibir
  - O contexto que a serverless function de chat recebe

```
FilterContext
    ├── Dashboard (gráficos via funções de M3)
    ├── InsightBanner (lookup no JSON de insights)
    └── Chat (contextoFiltro no body do POST)
```

### 5. Sem banco de dados (nesta fase)

- Zero Supabase, zero banco relacional. Máxima simplicidade para publicação.
- Logging de perguntas é issue opcional (LUC-171) — decisão do Lucca.

## Contratos de dados

Ver `lib/types/index.ts` para os tipos TypeScript completos de:
- `RegistroDesligamento` — registro individual de evento
- `HeadcountMensal` — headcount agregado por mês × diretoria
- `InsightPreGerado` — insight indexado por `periodo:diretoria`
- `MensagemChat` / `EspecificacaoGrafico` — chat conversacional
- `ContextoFiltro` — estado do filtro ativo
