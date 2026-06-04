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
