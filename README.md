# Dashboard Conversacional · People Analytics com IA

Um ensaio do data viz na era da IA: o painel mostra o que importa, a IA escolhe o destaque e investiga o porquê, e o código calcula cada número.

![Painel gerencial da Verta S.A.](docs/img/gerencial.webp)

## O que tem aqui

São três áreas, todas com os filtros na URL (mês, diretoria, senioridade):

- **Gerencial** (`/`): os 25 indicadores do painel, mês e acumulado do ano contra a meta, variação contra o mês anterior e contra o ano anterior, e a tendência de 12 meses. Cada linha tem um ✦ que abre o deep dive daquele indicador.
- **Resumo executivo** (`/resumo`): a leitura da IA sobre os sinais que o motor detectou. Traz manchete, metas consolidadas, o resultado de cada meta com o motivo e os gráficos de destaque, em três lentes (CEO, CHRO, gestor).
- **Indicador** (`/indicadores/[id]`): a ficha de cada indicador (pergunta, fórmula, meta), mês e acumulado, evolução de 24 meses, quebra por diretoria ou senioridade, os sinais detectados e um título escrito pela IA.

O **deep dive com IA** abre numa gaveta à direita (no celular, numa folha de baixo para cima). O agente consulta o motor com ferramentas, narra cada consulta enquanto ela roda, escreve a análise em streaming e monta os gráficos a partir dos resultados. A barra de cima também aceita pergunta livre.

| Resumo executivo | Indicador | Deep dive |
|---|---|---|
| ![Resumo executivo](docs/img/resumo.webp) | ![Indicador](docs/img/indicador.webp) | ![Deep dive com IA](docs/img/deep-dive.webp) |

## A IA decide a apresentação, o código decide os números

Essa é a regra do projeto inteiro.

- Todo número sai do motor determinístico (`lib/analytics/engine.ts`) sobre o catálogo de indicadores. O modelo nunca calcula: ele chama ferramentas (`valor`, `serie`, `decompor`, `cruzar`, `comparar`, `drivers`, `impacto`, `sinais`) e recebe resultados prontos, com o status contra a meta já calculado.
- Os gráficos da resposta são montados pelo servidor a partir dos resultados das ferramentas. O modelo só escolhe qual resultado mostrar e em que formato.
- A **guarda de números** (`lib/agente/guarda.ts`) confere cada número do texto contra os resultados da conversa. O selo no fim da resposta diz quantos bateram, e o que não bateu aparece marcado no texto.
- **Como calculei** lista cada consulta ao motor com os argumentos, a fórmula, o período efetivo e o n.
- Na camada adaptativa (resumo executivo e títulos dos indicadores) a guarda é bloqueante: layout com número que não está nos sinais é descartado e a tela usa o layout determinístico; título descartado não entra, e a página fica só com a frase determinística.

## A Verta S.A. e as histórias dos dados

A Verta S.A. é uma corretora de investimentos fictícia com cerca de 5 mil pessoas em 6 diretorias. Os dados são sintéticos e cobrem 36 meses (Out/2023 a Set/2026; "hoje" é Set/2026). O gerador simula pessoa a pessoa, mês a mês, com seed fixa, e as histórias nascem de mecanismos (fuga de talento em Tecnologia, pico de janeiro em Distribuição & Assessoria, eNPS que antecipa o turnover em Operações, teto de vidro, onboarding fraco em Produtos & Plataforma e mais). Cada história, com o indicador que a mostra e o deep dive que revela a causa, está em [`docs/narrativa.md`](docs/narrativa.md).

## Stack

- Next.js 16 (App Router, Turbopack) com React 19 e TypeScript; telas como server components.
- CSS próprio sobre Tailwind CSS v4, fontes via `next/font`, gráficos em SVG próprio (sem biblioteca de gráficos).
- IA: DeepSeek (API compatível com OpenAI) como principal e OpenRouter como reserva, chamados com `fetch` e SSE escritos à mão.
- Dados: JSON gerado por script e versionado; sem banco.
- Testes com Vitest, sem rede (o modelo é simulado com um `fetch` falso).

Arquitetura completa em [`docs/architecture.md`](docs/architecture.md).

## Como rodar

```bash
npm ci
cp .env.example .env.local   # preencha DEEPSEEK_API_KEY
npm run dev                  # http://localhost:3000
```

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DEEPSEEK_API_KEY` | Sim, para a IA | Provedor principal do agente, dos layouts e dos títulos |
| `DEEPSEEK_MODEL` | Não | Padrão `deepseek-flash` |
| `OPENROUTER_API_KEY` | Não | Reserva: usada só se a DeepSeek falhar (rede, 4xx/5xx, 429, timeout) |
| `OPENROUTER_MODEL` | Não | Padrão `deepseek/deepseek-v4.1-flash` |
| `NEXT_PUBLIC_APP_URL` | Não | URL pública, enviada ao OpenRouter como `HTTP-Referer` |

Sem chave nenhuma, as telas usam os layouts e títulos pré-gerados (e o layout determinístico fora deles) e o deep dive responde 503. As chaves vivem só no servidor.

## Scripts

| Comando | O que faz |
|---|---|
| `npx tsx scripts/generate-data.ts` | Regera o dataset (roster, eventos e cubo). Mesma seed, mesmos bytes |
| `node --env-file=.env.local --import tsx scripts/generate-layouts.ts` | Pré-gera os 21 layouts do resumo executivo (empresa e 6 diretorias × 3 lentes). `--sem-ia` grava os determinísticos; `--limite=N` testa N sem gravar |
| `node --env-file=.env.local --import tsx scripts/generate-destaques.ts` | Pré-gera os títulos da IA por indicador (empresa e cada diretoria) |
| `node --env-file=.env.local --import tsx scripts/avaliar-agente.ts` | Avaliação real do agente com 20 perguntas: ferramentas chamadas, números conferidos, latência e custo. Gasta a chave, fica fora do CI |
| `npm run orcamento` | JS da primeira carga (gzip) por rota depois do `npm run build`; falha acima de 400 KB |
| `npm test` · `npm run lint` · `npx next typegen && npx tsc --noEmit` | Testes, lint e tipos (o `typegen` gera os tipos das rotas, que não são versionados) |

## Números medidos

JS da primeira carga por rota (gzip, `npm run orcamento` em 2026-10-06):

| Rota | JS |
|---|---|
| `/` e `/indicadores/[id]` | 201,0 KB |
| `/resumo` | 203,1 KB |
| `/indicadores` e `/_not-found` | 195,9 KB |

Agente na avaliação de 20 perguntas (`scripts/avaliar-agente.ts`, DeepSeek, 2026-10-05):

- Primeiro texto na tela: mediana 1,2 s, p90 2,6 s.
- Resposta completa: mediana 8,4 s, p90 11,2 s, máximo 11,4 s.
- Ferramenta esperada chamada em 20 de 20; guarda de números com 582 de 585 conferidos (99,4%).
- Custo da rodada inteira: menos de US$ 0,05.

Testes: 233 em 29 arquivos, cerca de 1 minuto com `--maxWorkers=1`, sem rede. O CI (`.github/workflows/ci.yml`) roda tipos, lint, testes, build e orçamento em todo push e pull request.

## Deploy (Vercel)

O `vercel.json` usa o preset do Next.js com `npm run build`. Na Vercel, crie em Settings → Environment Variables:

- `DEEPSEEK_API_KEY` (obrigatória para a IA);
- `DEEPSEEK_MODEL` (opcional);
- `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` (reserva, opcionais);
- `NEXT_PUBLIC_APP_URL` (opcional, URL de produção).

As duas rotas de API rodam em Node.js. `/api/agente` tem `maxDuration = 120` (um deep dive típico leva de 8 a 13 s; acima de 120 s a plataforma corta o stream) e `/api/layout` tem `maxDuration = 60`. Com o Fluid Compute, padrão da Vercel, todo plano aceita esses valores: o Hobby vai até 300 s ([limites de duração](https://vercel.com/docs/functions/configuring-functions/duration#duration-limits)).
