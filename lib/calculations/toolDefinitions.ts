/**
 * JSON Schema das funções de cálculo expostas ao modelo via OpenRouter.
 *
 * Regras do system prompt (reforçadas aqui nas descriptions):
 * 1. Toda pergunta sobre crescimento/tendência → chamar getTrend PRIMEIRO.
 * 2. Toda pergunta sobre "por quê" → encadear getTrend + breakdownByDimension.
 * 3. tipoDesligamento disponível em TODAS as funções para análise focada.
 *
 * Ref: LUC-164, LUC-169
 */

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'getTurnoverRate',
      description:
        'Retorna a taxa de turnover de um período com status vs. meta. ' +
        'Use para responder "como estamos?" ou "qual é o turnover de X?". ' +
        'ATENÇÃO: para perguntas sobre crescimento, tendência ou comparação, ' +
        'use getTrend — esta função retorna apenas o valor pontual do período.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'],
            description: 'Período de análise. 3m=Out-Dez 2024, 6m=Jul-Dez 2024, 12m=Ano 2024, q1-q4=trimestres de 2024.',
          },
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria específica ou "Geral" para toda a empresa. Default: "Geral".',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description: 'Filtrar por tipo de saída. Omitir para analisar todos os desligamentos. Use "voluntário" para demissões a pedido, "involuntário" para demissões pela empresa.',
          },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTrend',
      description:
        'Retorna a tendência completa de turnover: taxa atual vs. período anterior (MoM) ' +
        'e vs. mesmo período do ano anterior (YoY). Inclui série mensal completa e detecta ' +
        'quando a escalada começou. ' +
        'OBRIGATÓRIO para qualquer pergunta com as palavras: cresceu, aumentou, piorou, ' +
        'está alto, tendência, por que, desde quando, escalada, evolução. ' +
        'Nunca afirme que algo "cresceu" sem chamar esta função primeiro.',
      parameters: {
        type: 'object',
        properties: {
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria ou "Geral". Default: "Geral".',
          },
          periodoReferencia: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'],
            description: 'Período a usar como janela "atual" para a comparação. Default: "12m".',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description: 'Analisar tendência apenas de saídas voluntárias ou involuntárias. Omitir para ambas.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getProjection',
      description:
        'Projeta a taxa de turnover para os próximos 3 meses (Jan–Mar 2025) com base ' +
        'na média móvel dos últimos 3 meses. Use para responder "para onde vamos?" ' +
        'ou "se continuar assim, qual será o turnover?".',
      parameters: {
        type: 'object',
        properties: {
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria ou "Geral". Default: "Geral".',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description: 'Projetar apenas saídas voluntárias ou involuntárias. Omitir para o total.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rankDiretoriasByTurnover',
      description:
        'Retorna o ranking das diretorias por taxa de turnover, do maior para o menor. ' +
        'Use para responder "onde está o problema?" ou "qual diretoria tem mais turnover?". ' +
        'Inclui variação vs. período anterior para cada diretoria.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'],
            description: 'Período de análise.',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description: 'Ranquear apenas por saídas voluntárias ou involuntárias. Omitir para o total.',
          },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'breakdownByDimension',
      description:
        'Analisa a distribuição de desligamentos por uma dimensão categórica dentro de uma diretoria. ' +
        'Use para responder "por que?" ou "onde está concentrado?". ' +
        'Para responder "por que o turnover de Tecnologia cresceu?", encadeie com getTrend: ' +
        'primeiro confirme o crescimento com getTrend, depois use esta função com dimensoes ' +
        'como posicionamentoFaixa, nivelPerformance e tempoDesdeAumentoMeses para diagnosticar a causa.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'],
            description: 'Período de análise.',
          },
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria a analisar. Use "Geral" para a empresa toda.',
          },
          dimensao: {
            type: 'string',
            enum: [
              'posicionamentoFaixa',
              'nivelPerformance',
              'senioridade',
              'clusterLideranca',
              'tipoDesligamento',
              'motivoDesligamento',
              'modalidadeTrabalho',
              'tendenciaPerformance',
              'nivelSatisfacao',
              'especialidade',
              'cargo',
            ],
            description:
              'Dimensão de corte. ' +
              'posicionamentoFaixa: onde na faixa salarial (piso/q1/mediana/q3/teto). ' +
              'nivelPerformance: quem está saindo por performance. ' +
              'tipoDesligamento: distribuição voluntário vs. involuntário. ' +
              'motivoDesligamento: razão declarada da saída. ' +
              'especialidade: qual time dentro da diretoria. ' +
              'tendenciaPerformance: se a performance estava melhorando/caindo antes de sair.',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description:
              'Pré-filtrar por tipo de saída ANTES do breakdown. ' +
              'Ex: tipoDesligamento="voluntário" + dimensao="posicionamentoFaixa" = ' +
              '"dos que pediram demissão, qual a distribuição salarial?"',
          },
        },
        required: ['periodo', 'dimensao'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getYTD',
      description:
        'Retorna o turnover ACUMULADO YTD (Year-to-Date): total de desligamentos / headcount médio mensal, ' +
        'desde Janeiro do ano até o último mês do período selecionado. ' +
        'A meta YTD CRESCE com o tempo: meta_mensal × n_meses (ex: 2%/mês × 6 meses = 12% em junho; 2%/mês × 12 = 24% no ano). ' +
        'DIFERENÇA CRÍTICA: getTurnoverRate retorna ~2-3% (taxa mensal). getYTD retorna ~24-36% (acumulado anual). ' +
        'OBRIGATÓRIO quando a pergunta contiver: "YTD", "acumulado", "no ano", "desde janeiro", "ano até agora", "acumulado do ano". ' +
        'NUNCA use getTurnoverRate para responder perguntas sobre YTD.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4',
              '2023',
              '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06',
              '2024-07','2024-08','2024-09','2024-10','2024-11','2024-12',
              '2023-01','2023-02','2023-03','2023-04','2023-05','2023-06',
              '2023-07','2023-08','2023-09','2023-10','2023-11','2023-12'],
            description: 'Período que define o ano e o último mês do YTD. "12m" = Jan–Dez 2024. "2024-06" = Jan–Jun 2024 (YTD até junho).',
          },
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria ou "Geral". Default: "Geral".',
          },
          tipoDesligamento: {
            type: 'string',
            enum: ['voluntário', 'involuntário'],
            description: 'Filtrar por tipo de saída. Omitir para analisar todos.',
          },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getSegmentRates',
      description:
        'Retorna a taxa REAL de turnover por valor de uma dimensão, com o LIFT vs. a população ativa. ' +
        'Diferença vs. breakdownByDimension: esta usa a composição de quem FICOU como denominador, ' +
        'então responde "júniors saem 2× mais" (taxa real), não só "60% das saídas eram júnior" (composição). ' +
        'lift = composição_saídas ÷ composição_população (1.0 = neutro, 2.0 = sai o dobro do esperado). ' +
        'Use sempre que a pergunta for sobre QUAL PERFIL sai mais/proporcionalmente. ' +
        'Dimensões com taxa/lift: senioridade, posicionamentoFaixa, nivelPerformance, clusterLideranca, nivelSatisfacao, modalidadeTrabalho, especialidade.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
          dimensao: {
            type: 'string',
            enum: ['posicionamentoFaixa', 'nivelPerformance', 'senioridade', 'clusterLideranca', 'nivelSatisfacao', 'modalidadeTrabalho', 'especialidade'],
            description: 'Dimensão com população base, para taxa real + lift.',
          },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Pré-filtrar por tipo de saída.' },
        },
        required: ['periodo', 'dimensao'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getDrivers',
      description:
        'A MELHOR ferramenta para "por que o turnover está alto?" ou "o que está puxando as saídas?". ' +
        'Varre TODAS as dimensões e ranqueia os segmentos por lift, separando FATORES DE RISCO ' +
        '(perfis que saem muito acima do esperado) de FATORES PROTETIVOS (que retêm bem). ' +
        'Entrega um diagnóstico multivariado de uma vez, em vez de uma fatia por vez. ' +
        'Prefira esta a chamar breakdownByDimension várias vezes.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Pré-filtrar por tipo de saída.' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'crossBreakdown',
      description:
        'Cruza DUAS dimensões para achar o segmento de interseção mais crítico. ' +
        'Ex: senioridade × posicionamentoFaixa = "sênior no piso da faixa". ' +
        'Use quando a pergunta combina dois cortes ou para localizar o bolso de risco específico.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
          dimensao1: { type: 'string', enum: ['posicionamentoFaixa', 'nivelPerformance', 'senioridade', 'clusterLideranca', 'tipoDesligamento', 'motivoDesligamento', 'modalidadeTrabalho', 'tendenciaPerformance', 'nivelSatisfacao', 'especialidade', 'cargo'], description: 'Primeira dimensão.' },
          dimensao2: { type: 'string', enum: ['posicionamentoFaixa', 'nivelPerformance', 'senioridade', 'clusterLideranca', 'tipoDesligamento', 'motivoDesligamento', 'modalidadeTrabalho', 'tendenciaPerformance', 'nivelSatisfacao', 'especialidade', 'cargo'], description: 'Segunda dimensão.' },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Pré-filtrar por tipo de saída.' },
        },
        required: ['periodo', 'dimensao1', 'dimensao2'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compareGroups',
      description:
        'Compara DOIS recortes lado a lado: duas diretorias no mesmo período, ou a mesma diretoria em dois períodos. ' +
        'Responde "como X se compara com Y?" ou "Tecnologia vs Operações". ' +
        'Retorna taxa, % voluntário e % alta performance de cada lado.',
      parameters: {
        type: 'object',
        properties: {
          periodoA: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período do grupo A.' },
          diretoriaA: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria do grupo A.' },
          periodoB: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período do grupo B.' },
          diretoriaB: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria do grupo B.' },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Filtro de tipo aplicado aos dois lados.' },
        },
        required: ['periodoA', 'diretoriaA', 'periodoB', 'diretoriaB'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCohortByTenure',
      description:
        'Distribui as saídas por tempo de casa (0–12, 13–24, 25–48, 49+ meses) e revela EARLY ATTRITION ' +
        '(saída precoce). Responde "estamos perdendo gente nova?" ou "em quanto tempo as pessoas saem?". ' +
        'Cada faixa traz % voluntário e salário médio.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Pré-filtrar por tipo de saída.' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'quantifyCost',
      description:
        'Quantifica o CUSTO financeiro do turnover (folha mensal perdida + custo de reposição estimado em ~6 meses de salário). ' +
        'Use sempre que a pergunta envolver "quanto custa", "impacto financeiro", "R$". ' +
        'Inclui o custo só das saídas regretidas (voluntárias de alta performance).',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
          tipoDesligamento: { type: 'string', enum: ['voluntário', 'involuntário'], description: 'Pré-filtrar por tipo de saída.' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getRegrettedAttrition',
      description:
        'Mede a REGRETTED ATTRITION: saídas VOLUNTÁRIAS de quem tinha performance "acima" — a perda cara, ' +
        'talento bom que pediu para sair. Use para "estamos perdendo os melhores?" ou "qual a perda de talento?". ' +
        'Traz %, custo, salário médio, NPS interno e o motivo dominante.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'], description: 'Período de análise.' },
          diretoria: { type: 'string', enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'], description: 'Diretoria ou "Geral".' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getHeadcount',
      description:
        'Retorna o headcount (número de funcionários) de um período com evolução mensal. ' +
        'Use quando a pergunta for sobre o tamanho do time ou crescimento de headcount.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'],
            description: 'Período de análise.',
          },
          diretoria: {
            type: 'string',
            enum: ['Geral', 'Tecnologia', 'Distribuição & Assessoria', 'Operações', 'Financeiro & Risco', 'Gente', 'Produtos & Plataforma'],
            description: 'Diretoria ou "Geral". Default: "Geral".',
          },
        },
        required: ['periodo'],
      },
    },
  },
] as const;
