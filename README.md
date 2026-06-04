# Dashboard Conversacional — People Analytics com IA

> "Dashboards precisam transicionar de repositórios de gráficos que o usuário interpreta para sistemas analíticos que entregam respostas."

Demo pública de dashboard executivo de turnover potencializado por IA (insights proativos + chat conversacional com function calling real). Projeto de posicionamento profissional — não um SaaS.

## O que é

Um dashboard que responde as **4 perguntas executivas** sobre turnover:

1. **Como estamos?** → taxa atual vs. meta/benchmark
2. **Qual a tendência?** → MoM e YoY
3. **Para onde vamos?** → projeção se a tendência continuar
4. **Onde está o problema?** → qual diretoria/faixa concentra o turnover

E que vai além: um chat em linguagem natural onde o usuário pergunta e a IA responde com dados reais, rastreáveis e sem alucinação — usando function calling sobre funções de cálculo determinísticas.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Estilo:** Tailwind CSS v4 com design tokens executivos customizados
- **Gráficos:** Recharts
- **IA:** OpenRouter (Gemini Flash) via serverless function — function calling
- **Deploy:** Vercel (deploy automático a cada push)
- **Dados:** JSON estático gerado por script offline (sem banco de dados)

## Rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Preencha OPENROUTER_API_KEY no .env.local

# 3. Rodar em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `OPENROUTER_API_KEY` | Sim (chat) | Chave do OpenRouter — server-side only |
| `OPENROUTER_MODEL` | Não | Modelo padrão: `google/gemini-flash-1.5` |
| `NEXT_PUBLIC_APP_URL` | Não | URL pública do app (HTTP-Referer) |

**Segurança:** a API key nunca aparece no código nem é enviada ao client bundle. Vive exclusivamente em variável de ambiente server-side.

## Regenerar o dataset

```bash
# Gerar dados sintéticos (seed fixa — reprodutível)
npx tsx scripts/generate-data.ts

# Regenerar insights pré-gerados (requer OPENROUTER_API_KEY no ambiente)
npx tsx scripts/generate-insights.ts
```

O script de dados é determinístico: rodar com a mesma seed produz exatamente os mesmos JSONs.

## Arquitetura

Ver [`docs/architecture.md`](docs/architecture.md) para o ADR completo com o fluxo de dados ponta a ponta.

## Estrutura de pastas

```
app/
  api/chat/       # Serverless function — proxy OpenRouter com function calling
  page.tsx        # Dashboard principal
lib/
  types/          # Contratos TypeScript de todos os dados
  calculations/   # Funções de cálculo determinísticas (fonte dos gráficos + tools da IA)
  data/           # JSONs estáticos gerados pelos scripts
  context/        # FilterContext — estado global de filtros
components/
  ui/             # Primitivos: Card, BigStat, Badge
  charts/         # Gráficos com Recharts
  dashboard/      # Composição do dashboard
  chat/           # UI do chat conversacional
scripts/
  generate-data.ts     # Gera o dataset sintético
  generate-insights.ts # Gera os insights pré-gerados via OpenRouter
docs/
  architecture.md # ADR de arquitetura de dados e estado
```

## Milestones

| Milestone | Status |
|---|---|
| M1 — Fundação Técnica & Deploy Pipeline | Done |
| M2 — Dataset Sintético & Narrativa de Negócio | Em andamento |
| M3 — Camada Semântica & Funções de Cálculo | Pendente |
| M4 — Dashboard Executivo (Camada Visual) | Pendente |
| M5 — IA Proativa (Insights Pré-gerados) | Pendente |
| M6 — Chat Conversacional (Function Calling Real) | Pendente |
| M7 — Publicação, Domínio & Polimento Final | Pendente |
