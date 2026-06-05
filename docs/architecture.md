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
scripts/generate-data.ts  →  lib/data/headcount.json    (headcount agregado mês × diretoria)
                          →  lib/data/desligamentos.json (eventos individuais de saída)
                          →  lib/data/populacao.json     (composição da força ATIVA por dimensão)
```

> **Por que `populacao.json`?** Sem a composição de quem *fica*, só conseguimos
> medir a *composição* de quem saiu ("60% eram júnior"), nunca a *taxa* por
> segmento ("júniors saem 2× mais") nem o *lift* (sobre-representação). A
> população base destrava `getSegmentRates` e `getDrivers` — a diferença entre
> uma análise descritiva e uma diagnóstica.

### 2. Insights proativos — JSON estático indexado por filtro

- Gerados offline por `scripts/generate-insights.ts` que chama o OpenRouter **uma única vez** para todas as combinações de filtro.
- Armazenados em `lib/data/insights.json` indexados pela chave `"${periodo}:${diretoria}"`.
- O front exibe loading simulado (~4s) ao trocar filtro para preservar a sensação de "IA pensando".
- Custo de IA: pago uma vez no setup, zero custo por usuário.

```
Combinações: 6 períodos × 7 visões (Geral + 6 diretorias) = 42 combinações
```

### 3. Chat — única superfície dinâmica (serverless function)

- `app/api/chat/route.ts` é o único endpoint de backend (`runtime = 'nodejs'`, `maxDuration = 60`).
- Recebe: `{ messages, periodo, diretoria }`.
- Fluxo em duas fases:
  1. **Fase de ferramentas** (não-streamada): loop agêntico onde o modelo escolhe tools, o servidor executa as funções determinísticas e emite eventos de progresso (`t: 's'`) descrevendo cada consulta.
  2. **Fase de resposta** (streaming real): o modelo sintetiza a resposta final em Markdown, com tokens transmitidos via SSE (`t: 'c'`) à medida que chegam; um gráfico (`t: 'g'`) é anexado ao fim.
- Modelo: um modelo de raciocínio (default `anthropic/claude-3.5-sonnet`) — function calling confiável e análise multivariada. Configurável via `OPENROUTER_MODEL`.
- A API key vive exclusivamente em variável de ambiente server-side (`OPENROUTER_API_KEY`). Nunca no client bundle.
- Rate limiting in-memory por IP e erros internos ocultados do cliente (logados no servidor).

### 3b. Camada analítica — função determinística como fonte única de números

Toda resposta numérica vem de `lib/calculations`. Além das funções descritivas
(turnover, tendência, ranking, YTD), há uma camada **diagnóstica** que cruza os
dados com a população base:

- `getSegmentRates` / `getDrivers` — taxa real e *lift* por segmento (não composição).
- `crossBreakdown` — interseção de duas dimensões (ex: sênior × piso da faixa).
- `compareGroups` — dois recortes lado a lado.
- `getCohortByTenure` — early attrition por tempo de casa.
- `quantifyCost` / `getRegrettedAttrition` — impacto financeiro e perda de talento.
- Guardrail de amostra (`MIN_AMOSTRA`) sinaliza fatias estatisticamente frágeis.

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
