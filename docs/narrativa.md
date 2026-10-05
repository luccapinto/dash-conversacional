# Narrativa da Verta S.A. (dataset sintético, Out/2023 a Set/2026)

A Verta S.A. é uma corretora de investimentos fictícia com ~5.000 pessoas em seis diretorias.
Todos os dados são sintéticos e gerados por `scripts/generate-data.ts` com seed fixa. Nenhuma
história é escrita como número pronto: o gerador simula pessoa a pessoa, mês a mês, e cada
história nasce de um **mecanismo** (hazard de saída, regra de seleção, contexto externo). Os
números citados abaixo são os medidos no dataset gerado e são conferidos por
`__tests__/analytics/narrativa.test.ts`.

"Hoje" na demo é **Set/2026**. A janela tem 36 meses (Out/2023 a Set/2026), com dois anos-calendário
completos (2024 e 2025) para comparação YoY. Antes da janela o gerador roda 6 meses de aquecimento
(Abr a Set/2023) que não são exportados, para que vagas abertas, eNPS e tempo de casa já comecem
em regime.

## Mecanismos comuns

- **Saída voluntária:** sorteio de Bernoulli por pessoa e mês. A probabilidade é a base anual da
  diretoria × multiplicadores dos atributos: faixa salarial (piso sai mais), performance, eNPS da
  pessoa no último ciclo com pelo menos 2 meses de defasagem (detrator sai mais), tempo de casa,
  onboarding, movimentação interna recente (protege), horas extras do mês anterior.
- **Saída involuntária:** probabilidade mensal dirigida por performance (abaixo do esperado) e
  pelos cortes anuais de Distribuição & Assessoria.
- **Vagas:** toda saída abre requisição de reposição na mesma posição; o plano de crescimento abre
  vagas novas. A vaga fecha após o time to fill sorteado (candidatos, ofertas recusadas e aceite
  definem o prazo); o fechamento vira admissão externa ou movimentação/promoção interna.
- **eNPS:** ciclos trimestrais (Dez, Mar, Jun, Set). Cada pessoa responde com 78% de chance; a nota
  depende da satisfação de base, do clima da diretoria, de trocas de gestor recentes e de horas extras.

## Histórias

| # | História | Onde | Quando | Indicador que mostra | Deep dive que revela a causa |
|---|---|---|---|---|---|
| L1 | Fuga de talento | Tecnologia | escalada a partir de Abr/2024 | turnover lamentado, turnover voluntário | `drivers(turnover_lamentado, Tecnologia)` |
| L2 | Pico sazonal de janeiro | Distribuição & Assessoria | Jan/2024, Jan/2025, Jan/2026 | turnover (mensal), turnover involuntário | `decompor(turnover_involuntario, performance)` |
| L3 | Escalada de Operações | Operações | a partir de Mai/2025 | turnover, turnover voluntário | `drivers(turnover, Operações)` |
| N1 | eNPS antecipa o turnover | Operações | eNPS cai no ciclo Mar/2025, turnover sobe de Mai/2025 | eNPS (trimestral) | sinal `antecedente` eNPS → turnover |
| N2 | Vagas abertas pressionam horas extras e absenteísmo | Tecnologia | a partir de Mai/2024 | time to fill, horas extras, absenteísmo | `serie` de vagas abertas × horas extras; `impacto(horas_extras)` |
| N3 | Teto de vidro | empresa toda | janela inteira | % mulheres na liderança | `decompor(taxa_promocao, genero)` filtrando sênior |
| N4 | Onboarding fraco e saída no 1º ano | Produtos & Plataforma | onda de contratação Jan a Set/2025 | early attrition | `drivers(early_attrition, Produtos & Plataforma)` |
| N5 | Mobilidade interna protege a retenção | Financeiro & Risco | janela inteira | mobilidade interna, % vagas preenchidas internamente | `drivers(turnover, Financeiro & Risco)` |

L = história legada (já existia no app antigo, adaptada à janela nova). N = história nova que conecta
domínios.

### L1. Fuga de talento em Tecnologia
- **O que acontece:** o mercado de tecnologia aquece a partir de Abr/2024 (contexto externo,
  multiplicador que sobe até Set/2024 e alivia um pouco em 2026). Tecnologia contrata gente forte
  em bandas baixas da faixa salarial; quem tem alta performance, está no piso/Q1 e tem baixa
  satisfação sai muito mais. A maior parte dessas saídas é voluntária, por remuneração.
- **Indicador que mostra:** turnover lamentado (saída voluntária de alta performance) de Tecnologia
  é o maior entre as diretorias; turnover voluntário de Tecnologia fica acima da meta.
- **Deep dive:** `drivers` aponta performance "acima" combinada com faixa "piso"/"q1" como o par
  de maior lift; `decompor(turnover, faixaSalarial)` mostra a taxa do piso várias vezes a do teto.

### L2. Pico sazonal de janeiro em Distribuição & Assessoria
- **O que acontece:** todo janeiro, após o fechamento das metas comerciais, a diretoria corta ~5%
  do quadro, concentrado em baixa performance (involuntário), e parte dos assessores pede demissão
  depois de receber o bônus de dezembro (voluntário).
- **Indicador que mostra:** turnover mensal de Distribuição em janeiro várias vezes a média dos
  outros meses, nos três janeiros da janela; turnover involuntário concentrado em janeiro.
- **Deep dive:** sinal `sazonalidade` (o pico se repete no mesmo mês todo ano, então não é quebra
  de tendência); `decompor(turnover_involuntario, performance)` mostra a taxa de "abaixo" muito
  acima das demais.

### L3. Escalada de Operações
- **O que acontece:** em Jan/2025 Operações passa por uma reorganização que troca o gestor de ~35%
  das pessoas (nova onda em Jul/2025). O clima da diretoria cai, a nota de eNPS cai e, com 2 meses
  de defasagem (tempo de procurar emprego), o turnover voluntário sobe.
- **Indicador que mostra:** turnover de Operações de 2025-2026 bem acima do de 2024.
- **Deep dive:** `drivers(turnover, Operações)` aponta eNPS "detrator" e "2+" trocas de gestor em
  12 meses como fatores de risco.

### N1. eNPS antecipa o turnover em Operações
- **O que acontece:** é o mesmo mecanismo de L3 visto pelo outro lado. O eNPS de Operações despenca
  no ciclo de Mar/2025, antes de o turnover subir.
- **Indicador que mostra:** eNPS de Operações (trimestral).
- **Deep dive:** o detector calcula a correlação defasada entre o eNPS do ciclo e o turnover dos
  trimestres seguintes; em Operações a correlação com defasagem é negativa e mais forte do que a
  correlação no mesmo trimestre (sinal `antecedente`).

### N2. Vagas abertas de Tecnologia pressionam horas extras e absenteísmo
- **O que acontece:** com mais saídas e menor aceite de oferta (salário abaixo do mercado), o time
  to fill de Tecnologia sobe e as vagas abertas se acumulam. Quem fica cobre o buraco: as horas
  extras de cada pessoa dependem da taxa de vagas abertas do mês anterior, e o absenteísmo segue as
  horas extras do mês anterior (desgaste).
- **Indicador que mostra:** time to fill de Tecnologia fora da meta; horas extras per capita e
  absenteísmo de Tecnologia acima das demais diretorias.
- **Deep dive:** sinal `antecedente` vagas abertas → horas extras em Tecnologia;
  `impacto(horas_extras, Tecnologia)` estima o custo.

### N3. Teto de vidro
- **O que acontece:** a base é quase paritária, mas a promoção interna para gerência favorece
  homens (peso de seleção menor para mulheres) e a contratação externa de líderes traz ~30% de
  mulheres. As mulheres também entram em posições mais baixas da faixa salarial.
- **Indicador que mostra:** % de mulheres na liderança fora da meta interna de 40%, com a base
  perto de 50%; gap salarial ajustado (compa-ratio) negativo.
- **Deep dive:** `decompor(taxa_promocao, genero)` com filtro de senioridade "sênior" mostra a
  taxa de promoção das mulheres abaixo da dos homens.

### N4. Onboarding fraco e saída no 1º ano em Produtos & Plataforma
- **O que acontece:** Produtos & Plataforma acelera a contratação entre Jan e Set/2025 para uma
  plataforma nova, e a maior parte dos contratados entra sem trilha de onboarding (poucas horas de
  treinamento nos 3 primeiros meses). Sem onboarding, quem tem menos de 12 meses de casa sai bem
  mais.
- **Indicador que mostra:** early attrition de Produtos & Plataforma acima das demais diretorias a
  partir de 2025.
- **Deep dive:** `drivers(early_attrition, Produtos & Plataforma)` aponta onboarding "incompleto".

### N5. Mobilidade interna protege a retenção em Financeiro & Risco
- **O que acontece:** Financeiro & Risco tem um programa de rotação entre especialidades e
  preenche boa parte das vagas com gente de dentro. Quem se movimentou nos últimos 12 meses tem
  metade do risco de saída.
- **Indicador que mostra:** mobilidade interna e % de vagas preenchidas internamente de Financeiro &
  Risco bem acima das demais (destaque favorável); turnover da diretoria entre os mais baixos.
- **Deep dive:** `drivers(turnover, Financeiro & Risco)` aponta "movimentou-se nos últimos 12
  meses" como fator protetivo.

## Contexto que o detector também encontra (não são histórias plantadas)
- **Cota PcD:** a Verta tem menos de 5% de PcD (cota legal para empresas com mais de 1.000
  pessoas, Lei 8.213/91, art. 93).
- **Pessoas negras na liderança:** a liderança tem proporção de pessoas pretas e pardas bem menor
  do que a base, herdada da composição inicial e da contratação externa de líderes.
