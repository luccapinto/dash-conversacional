# Narrativa da Verta S.A. (dataset sintético, Out/2023 a Set/2026)

A Verta S.A. é uma corretora de investimentos fictícia com ~5.000 pessoas em seis diretorias.
Todos os dados são sintéticos e gerados por `scripts/generate-data.ts` com seed fixa. Nenhuma
história é escrita como número pronto: o gerador simula pessoa a pessoa, mês a mês, e cada
história nasce de um **mecanismo** (hazard de saída, regra de seleção, contexto externo). Os
botões de cada mecanismo ficam em `scripts/sim/calibracao.ts`, marcados com o id da história.

Os números abaixo foram **medidos** no dataset gerado (não são os parâmetros do gerador).
`__tests__/analytics/narrativa.test.ts` confere cada história em três camadas: o indicador que a
mostra, o deep dive que revela a causa e o sinal que o detector emite. O teste usa limiares com
folga: falha se a história sumir ou mudar de forma, não se um número mudar uma casa decimal.

"Hoje" na demo é **Set/2026**; "últimos 12 meses" = Out/2025 a Set/2026. A janela tem 36 meses
(Out/2023 a Set/2026), com dois anos-calendário completos (2024 e 2025) para comparação YoY. Antes
da janela o gerador roda 6 meses de aquecimento (Abr a Set/2023) que não são exportados, para que
vagas abertas, eNPS e tempo de casa já comecem em regime.

## Mecanismos comuns

- **Saída voluntária:** sorteio de Bernoulli por pessoa e mês. A probabilidade é a base anual da
  diretoria × multiplicadores dos atributos: faixa salarial (piso sai mais), performance, nota de
  eNPS, trocas de gestor, tempo de casa, onboarding, movimentação interna recente (protege) e horas
  extras do mês anterior.
- **Tempo de procura (3 meses):** a insatisfação não tira ninguém no mesmo mês. A nota de eNPS só
  pesa na saída 3 meses depois do ciclo em que foi dada, e uma troca de gestor só pesa do 3º ao 14º
  mês depois de acontecer.
- **Saída involuntária:** probabilidade mensal dirigida por performance (abaixo do esperado) e pelo
  corte anual de janeiro em Distribuição & Assessoria.
- **Vagas:** toda saída abre requisição de reposição na mesma posição; o plano de crescimento abre
  vagas novas. A vaga fecha após o time to fill sorteado (candidatos, ofertas recusadas e aceite
  definem o prazo); o fechamento vira admissão externa ou movimentação/promoção interna.
- **Horas extras e ausências:** as horas extras de cada pessoa sobem com a taxa de vagas abertas
  da diretoria no mês anterior; as ausências sobem com as horas extras do mês anterior. Cada
  diretoria tem também um choque mensal de demanda (fechamentos, prazos) e um de saúde (gripe),
  para que a relação apareça com ruído, como num dado real.
- **eNPS:** ciclos trimestrais (Dez, Mar, Jun, Set). Cada pessoa responde com 78% de chance; a nota
  depende da satisfação de base, do clima da diretoria, de trocas de gestor recentes e de horas extras.

## Histórias

| # | História | Onde | Quando | Indicador que mostra | Deep dive que revela a causa |
|---|---|---|---|---|---|
| L1 | Fuga de talento | Tecnologia | mercado aquece a partir de Abr/2024 | turnover lamentado, turnover voluntário | `drivers(turnover_lamentado, Tecnologia)`; `decompor(turnover, faixaSalarial)` |
| L2 | Pico sazonal de janeiro | Distribuição & Assessoria | Jan/2024, Jan/2025, Jan/2026 | turnover mensal, turnover involuntário | `decompor(turnover_involuntario, performance)` em janeiro |
| L3 | Escalada de Operações | Operações | reorganização em Jan/2025 e Jul/2025 | turnover, turnover voluntário | `drivers(turnover_voluntario, Operações)` |
| N1 | eNPS antecipa o turnover | Operações | eNPS cai no ciclo de Mar/2025; turnover sobe em Jun/2025 | eNPS (trimestral) | sinal `indicador_antecedente` eNPS → turnover voluntário |
| N2 | Vagas abertas pressionam horas extras e absenteísmo | Tecnologia | vagas acumulam de Abr a Dez/2024 | time to fill, horas extras, absenteísmo | sinais `indicador_antecedente` vagas → horas extras → absenteísmo; `impacto(horas_extras_pc)` |
| N3 | Teto de vidro | empresa toda | janela inteira | % mulheres na liderança | `decompor(taxa_promocao, genero)` filtrando sênior |
| N4 | Onboarding fraco e saída no 1º ano | Produtos & Plataforma | onda de contratação de Jan a Set/2025 | early attrition | `drivers(early_attrition, Produtos & Plataforma)` |
| N5 | Mobilidade interna protege a retenção | Financeiro & Risco | janela inteira | mobilidade interna, % vagas preenchidas internamente | `drivers(turnover_voluntario, Financeiro & Risco)` |

L = história legada (já existia no app antigo, adaptada à janela nova). N = história nova que conecta
domínios.

### L1. Fuga de talento em Tecnologia
- **Mecanismo:** o mercado de tecnologia aquece a partir de Abr/2024 (multiplicador externo que
  sobe até Set/2024 e alivia em 2026). Tecnologia passa a contratar em bandas baixas da faixa
  salarial; quem tem alta performance, já tem 1 ano de casa e está no piso/Q1 é assediado pelo
  mercado. A maior parte dessas saídas é voluntária, por remuneração.
- **Indicador (medido):** turnover lamentado de Tecnologia nos últimos 12 meses 36,7% a.a., contra
  mediana de 17,4% nas demais diretorias (meta 15%). Turnover voluntário de Tecnologia foi de 20,7%
  em 2024 para 29,8% em 2025. Das 151 saídas lamentadas dos últimos 12 meses, 110 foram por
  remuneração e 41 por carreira.
- **Deep dive (medido):** `drivers(turnover_lamentado, Tecnologia)` aponta eNPS detrator (lift
  1,79), faixa piso (1,71) e Q1 (1,69) como fatores de risco. Por faixa, o turnover de Tecnologia
  vai de 57,6% no piso a 13,8% no teto (4,2×).
- **Detector:** `fora_da_meta` e `outlier_entre_diretorias` de turnover lamentado, entre os 3
  primeiros sinais de Tecnologia.

### L2. Pico sazonal de janeiro em Distribuição & Assessoria
- **Mecanismo:** todo janeiro, após o fechamento das metas comerciais, a diretoria corta 5% do
  quadro de contribuidores individuais, concentrado em baixa performance (involuntário), e parte
  dos assessores pede demissão depois de receber o bônus de dezembro (voluntário).
- **Indicador (medido):** turnover mensal anualizado de 90,2% (Jan/24), 86,3% (Jan/25) e 95,8%
  (Jan/26), contra mediana de 19,4% nos outros meses. As saídas involuntárias são 69%, 65% e 58%
  das saídas de cada janeiro.
- **Deep dive (medido):** em Jan/2026, `decompor(turnover_involuntario, performance)` dá 380,5% a.a.
  para "abaixo do esperado", 57,8% para "dentro" e 10,9% para "acima".
- **Detector:** sinal `sazonalidade` ("em Jan/26, 4,5× a mediana dos 12 meses anteriores"), o 1º
  de D&A. Como o pico se repete no mesmo mês em 3 anos, ele não é lido como quebra de tendência
  nem como piora acelerada.

### L3. Escalada de Operações
- **Mecanismo:** Operações reorganiza a estrutura em Jan/2025 (40% dos contribuidores individuais
  trocam de gestor) e de novo em Jul/2025 (25%). O clima da diretoria cai, as notas de eNPS caem e,
  depois do tempo de procura, o turnover voluntário sobe.
- **Indicador (medido):** turnover de Operações de 15,9% a.a. em 2024 para 23,2% nos últimos 12
  meses.
- **Deep dive (medido):** de Mai/2025 a Set/2026, o turnover voluntário de Operações é 24,9% entre
  detratores e 5,8% entre promotores; 23,9% para quem teve 2+ trocas de gestor em 12 meses e 14,8%
  para quem não teve nenhuma. `drivers(turnover_voluntario, Operações)` traz eNPS "detrator" e
  trocas de gestor "2+" entre os fatores de risco.

### N1. eNPS antecipa o turnover em Operações
- **Mecanismo:** o mesmo de L3, visto pelo outro lado: o eNPS mede o clima antes de as pessoas
  conseguirem sair.
- **Indicador (medido):** eNPS de Operações entre +15 e +20 nos ciclos de Dez/23 a Dez/24; entre
  −36 e −47 em todos os ciclos desde Mar/25.
- **Detector:** sinal `indicador_antecedente` por mudança de patamar: "eNPS em Operações: mudança
  de patamar em Mar/25 (média de +18 para −43); Turnover voluntário: mudança em Jun/25 (de 10,8% a.a.
  para 17,6% a.a.), 3 meses depois." Os sinais de eNPS lideram a visão de Operações.

### N2. Vagas abertas de Tecnologia pressionam horas extras e absenteísmo
- **Mecanismo:** com mais saídas (L1) e menor aceite de oferta (salário abaixo do mercado), o time
  to fill de Tecnologia sobe e as vagas abertas se acumulam. Quem fica cobre o buraco com horas
  extras, e as horas extras viram ausência no mês seguinte (desgaste).
- **Indicador (medido):** vagas abertas de Tecnologia de 53 (Mar/24) para 146 (Set/25). Nos últimos
  12 meses: time to fill 87,5 dias (empresa 57,1), aceite de oferta 67,8% (empresa 78,6%), horas
  extras 9,6 h/pessoa/mês (maior diretoria; empresa 7,3) e absenteísmo 4,0% (maior diretoria;
  meta 3%).
- **Impacto (medido):** o custo mensal das horas extras de Tecnologia foi de R$ 576 mil no 1º
  semestre de 2024 para R$ 1,05 milhão nos últimos 12 meses (R$ 12,6 milhões no período).
- **Detector:** dois sinais `indicador_antecedente` em Tecnologia. Vagas → horas extras, por
  mudança de patamar: vagas abertas de 62 para 133 em Set/24, horas extras de 5,5 para 9,9 h em
  Out/24, 1 mês depois. Horas extras → absenteísmo, por variações mensais: r = 0,76 com 1 mês de
  defasagem e −0,49 sem defasagem.

### N3. Teto de vidro
- **Mecanismo:** a base é quase paritária, mas a seleção interna para gerência dá peso menor às
  mulheres (0,4 do peso de um homem) e a contratação externa de gerentes traz 27% de mulheres. As
  mulheres também entram em posições mais baixas da faixa salarial.
- **Indicador (medido):** 44,9% de mulheres na base e 28,4% na liderança (meta interna de 40%);
  gap salarial ajustado de −2,1%.
- **Deep dive (medido):** na janela, a taxa de promoção de sênior para gerência é 2,5% a.a. para
  mulheres e 5,3% para homens; em pleno, 8,6% para ambos. A diferença está na passagem para a
  liderança.
- **Detector:** `fora_da_meta` de mulheres na liderança na visão da empresa. É a história de menor
  score na lente CHRO, porque a distância à meta (12 p.p.) é menor que os desvios das outras.

### N4. Onboarding fraco e saída no 1º ano em Produtos & Plataforma
- **Mecanismo:** Produtos & Plataforma acelera a contratação entre Jan e Set/2025 para uma
  plataforma nova, e 80% dos contratados desde Jan/2025 entram sem trilha de onboarding (poucas
  horas de treinamento nos 3 primeiros meses). Sem onboarding, quem tem menos de 12 meses de casa
  sai bem mais.
- **Indicador (medido):** early attrition de Produtos & Plataforma de 17,6% a.a. em 2024 para
  53,9% nos últimos 12 meses; a 2ª maior diretoria tem 34,3%.
- **Deep dive (medido):** early attrition de 65,0% sem onboarding e 16,1% com onboarding completo;
  `drivers(early_attrition, Produtos & Plataforma)` traz onboarding "completo" como fator protetivo.
- **Detector:** sinais de early attrition lideram a visão de Produtos; `outlier_entre_diretorias`
  desfavorável.

### N5. Mobilidade interna protege a retenção em Financeiro & Risco
- **Mecanismo:** Financeiro & Risco tem um programa de rotação entre especialidades e preenche boa
  parte das vagas com gente de dentro. Quem se movimentou nos últimos 12 meses sai menos por
  vontade própria.
- **Indicador (medido):** nos últimos 12 meses, mobilidade interna de 13,2% a.a. (empresa 4,0%) e
  37,6% das vagas preenchidas internamente (empresa 13,4%); turnover de 13,1% a.a. (empresa 24,9%).
- **Deep dive (medido):** na janela, o turnover voluntário de F&R é 4,9% a.a. para quem se
  movimentou nos últimos 12 meses e 9,7% para quem não se movimentou;
  `drivers(turnover_voluntario, Financeiro & Risco)` traz "movimentou-se" como fator protetivo.
- **Detector:** mobilidade interna e preenchimento interno são os 2 primeiros sinais de F&R, ambos
  `outlier_entre_diretorias` favoráveis.

## Contexto que o detector também encontra (não são histórias plantadas)
- **Cota PcD:** 2,5% de pessoas com deficiência, abaixo da cota legal de 5% para empresas com mais
  de 1.000 pessoas (Lei 8.213/91, art. 93).
- **Pessoas negras na liderança:** 36,1% de pessoas pretas e pardas na base e 24,0% na liderança,
  herança da composição inicial e da contratação externa de líderes.
- **Efeitos de segunda ordem das histórias:** a onda de contratação de Produtos (N4) abre vagas de
  crescimento e as horas extras da diretoria mudam de patamar em Fev/2025 (4,5 para 8,9 h/pessoa/mês);
  o corte de janeiro de D&A (L2) também aparece como sazonalidade no early attrition da diretoria.
  São consequências dos mesmos mecanismos, não histórias separadas.
