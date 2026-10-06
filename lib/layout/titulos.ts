/**
 * Títulos narrativos por indicador (destaque da página do indicador), pré-gerados pela IA para o
 * recorte padrão (Set/26, empresa toda e cada diretoria) por scripts/generate-destaques.ts.
 *
 * Uma chamada por recorte, em JSON mode, com todos os indicadores visíveis: para cada um a IA vê a
 * frase determinística da página e os sinais do indicador (os mesmos que a página mostra). Guarda
 * bloqueante por título: número que não está na frase nem nos sinais daquele indicador descarta o
 * título, e a página fica só com a frase determinística. Falha da IA = recorte sem títulos.
 */

import { MES_FIM, type Diretoria } from '@/lib/analytics/dominio';
import type { MotorCliente, Status } from '@/lib/analytics/engine';
import { validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { coletarValores, verificarNumeros } from '@/lib/agente/guarda';
import { chamarLLM, type MensagemLLM, type NomeProvedor, type Provedor, type Uso } from '@/lib/agente/llm';
import { chaveDestaques } from '@/lib/painel/destaques';
import { lenteDe, type FiltrosPainel } from '@/lib/painel/filtros';
import type { Tom } from '@/lib/painel/formato';
import { montarIndicador } from '@/lib/painel/indicador';
import { IDS_PAINEL, INDICADORES_PAINEL } from '@/lib/painel/indicadores';
import type { Leitura } from '@/lib/painel/leitura';
import { periodoSinais } from '@/lib/painel/periodos';
import { sinaisVisiveis } from '@/lib/painel/sinais';
import { semPontoFinal } from './spec';

const MAX_TOKENS = 2500;
export const MAX_CARACTERES_TITULO = 80;

export interface EntradaTitulo {
  indicador: string;
  nome: string;
  /** frase determinística da página (sem os ** de negrito) */
  frase: string;
  /** status e direção do acumulado, explícitos (o modelo errava o sentido lendo só a frase) */
  fatos: string;
  /** evidências dos sinais do indicador mostrados na página */
  sinais: string[];
}

export interface TituloDescartado {
  indicador: string;
  titulo: string;
  motivo: string;
}

export interface ResultadoTitulos {
  chave: string;
  titulos: Record<string, string>;
  descartados: TituloDescartado[];
  /** por que o recorte ficou sem títulos (null = a IA respondeu) */
  motivo: string | null;
  uso: Uso | null;
  provedor: NomeProvedor | null;
  latenciaMs: number;
}

export interface OpcoesTitulos {
  motor: MotorCliente;
  provedores: readonly Provedor[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (linha: string) => void;
}

const filtrosDoRecorte = (diretoria: Diretoria | null): FiltrosPainel => ({ mes: MES_FIM, diretoria, senioridade: null, lente: null });

const STATUS: Record<Status, string> = { dentro: 'na meta', atencao: 'em atenção (perto da meta)', fora: 'fora da meta', sem_meta: 'sem meta', sem_dados: 'sem dado' };
const JUIZO: Record<Tom, string> = { bom: 'melhora', ruim: 'piora', neutro: 'sem juízo' };

function fatosDoAcumulado(l: Leitura): string {
  const y = l.ytd;
  const status = `acumulado ${STATUS[y.medida?.status ?? 'sem_dados']}`;
  if (y.aa.base === null || !l.janelas.ytdAA) return status;
  const d = y.aa.delta;
  const sentido = d.texto.startsWith('+') ? 'subiu' : d.texto.startsWith('−') ? 'caiu' : 'estável';
  return `${status}; contra ${l.janelas.ytdAA.rotulo}: ${sentido} (${d.texto}, ${JUIZO[d.tom]})`;
}

/** O que a página do indicador mostra no recorte padrão: a frase e os sinais (a guarda aceita só estes números) */
export function entradaTitulos(motor: MotorCliente, diretoria: Diretoria | null): EntradaTitulo[] {
  const f = filtrosDoRecorte(diretoria);
  const sinais = sinaisVisiveis(motor, periodoSinais(f.mes), diretoria, lenteDe(f));
  return INDICADORES_PAINEL.map(ind => {
    const p = montarIndicador(motor, ind, f, sinais);
    return {
      indicador: ind.id,
      nome: ind.nome,
      frase: p.destaque.replace(/\*\*/g, ''),
      fatos: fatosDoAcumulado(p.leitura),
      sinais: p.sinais.map(s => `${s.tipo} (${s.onde}): ${s.evidencia}`),
    };
  });
}

interface RespostaTitulosIA {
  titulos: Array<{ indicador: string; titulo: string }>;
}

const ESQUEMA_RESPOSTA: JsonSchema = {
  type: 'object',
  properties: {
    titulos: {
      type: 'array',
      maxItems: IDS_PAINEL.length,
      items: {
        type: 'object',
        properties: { indicador: { type: 'string', enum: IDS_PAINEL }, titulo: { type: 'string', minLength: 3 } },
        required: ['indicador', 'titulo'],
        additionalProperties: false,
      },
    },
  },
  required: ['titulos'],
  additionalProperties: false,
};

const EXEMPLO: RespostaTitulosIA = {
  titulos: [
    { indicador: 'turnover_voluntario', titulo: 'Leitura curta do indicador para quem abre a página' },
    { indicador: 'enps', titulo: 'Outra leitura curta, sem repetir a frase' },
  ],
};

const SISTEMA = `Você escreve o título narrativo da página de cada indicador do painel de People Analytics da Verta S.A. (dados sintéticos). A IA escreve; os números são do código.

Responda só com um objeto JSON, no formato do exemplo.

Regras:
- Um título por indicador recebido, usando o id dado.
- O título vem antes da frase determinística da página: diga o que importa (onde se concentra, o que chama atenção nos sinais), sem repetir a frase.
- Direção (sobe, cai, melhora, piora) e relação com a meta só como estão em "fatos". "Em atenção" é perto da meta.
- Diretoria só se estiver na frase ou nos sinais daquele indicador.
- No máximo ${MAX_CARACTERES_TITULO} caracteres, sem ponto final, PT-BR, tom executivo e factual, sem adjetivos alarmistas, sem emojis.
- Prefira título sem número. Se usar, só números que aparecem na frase ou nos sinais daquele indicador, escritos como estão lá. Datas como Set/26 podem.
- Fale só do indicador e do recorte dados.

Exemplo de JSON:
${JSON.stringify(EXEMPLO, null, 1)}`;

function mensagemUsuario(diretoria: Diretoria | null, entrada: readonly EntradaTitulo[]): string {
  const linhas = entrada.map(e => `${e.indicador} · ${e.nome}\n  frase: ${e.frase}\n  fatos: ${e.fatos}\n  sinais: ${e.sinais.length ? e.sinais.join(' | ') : 'nenhum'}`);
  return `Recorte: ${diretoria ?? 'Empresa toda'}, acumulado do ano até Set/26.\n\nIndicadores:\n${linhas.join('\n')}`;
}

/** Guarda bloqueante de um título: tamanho e números (só os da frase e dos sinais do indicador) */
export function conferirTitulo(titulo: string, e: EntradaTitulo): string | null {
  if (titulo.length > MAX_CARACTERES_TITULO) return `mais de ${MAX_CARACTERES_TITULO} caracteres`;
  const v = verificarNumeros(titulo, coletarValores([e.frase, ...e.sinais]));
  return v.naoVerificados.length ? `número fora da entrada: ${v.naoVerificados.map(n => n.texto).join(', ')}` : null;
}

type Rodada = { ok: true; texto: string; titulos: RespostaTitulosIA['titulos']; uso: Uso; provedor: NomeProvedor } | { ok: false; motivo: string; uso: Uso | null; provedor: NomeProvedor | null };

async function rodada(mensagens: MensagemLLM[], opcoes: OpcoesTitulos): Promise<Rodada> {
  let resposta;
  try {
    resposta = await chamarLLM({ mensagens, json: true, maxTokens: MAX_TOKENS, temperatura: 0.3 }, { provedores: opcoes.provedores, fetch: opcoes.fetch, timeoutMs: opcoes.timeoutMs, log: opcoes.log });
  } catch {
    return { ok: false, motivo: 'IA indisponível', uso: null, provedor: null };
  }
  const { uso, provedor, texto } = resposta;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'resposta não é JSON', uso, provedor };
  }
  const erros = validarEsquema(ESQUEMA_RESPOSTA, bruto);
  if (erros.length) return { ok: false, motivo: `resposta fora do schema: ${erros.slice(0, 3).join('; ')}`, uso, provedor };
  return { ok: true, texto, titulos: (bruto as RespostaTitulosIA).titulos, uso, provedor };
}

/**
 * Uma chamada com todos os indicadores; os títulos que a guarda descartar ganham uma segunda
 * chance na mesma conversa, com o motivo. O que falhar de novo fica sem título.
 */
export async function gerarTitulos(diretoria: Diretoria | null, opcoes: OpcoesTitulos): Promise<ResultadoTitulos> {
  const inicio = Date.now();
  const chave = chaveDestaques(periodoSinais(MES_FIM), diretoria);
  if (opcoes.provedores.length === 0) return { chave, titulos: {}, descartados: [], motivo: 'sem provedor de IA', uso: null, provedor: null, latenciaMs: 0 };

  const entrada = entradaTitulos(opcoes.motor, diretoria);
  const porId: Record<string, EntradaTitulo> = Object.fromEntries(entrada.map(e => [e.indicador, e]));
  const titulos: Record<string, string> = {};
  const descartados: TituloDescartado[] = [];
  const conferir = (lista: RespostaTitulosIA['titulos']): TituloDescartado[] => {
    const fora: TituloDescartado[] = [];
    for (const { indicador, titulo: bruta } of lista) {
      const titulo = semPontoFinal(bruta);
      const motivo = indicador in titulos ? 'repetido' : conferirTitulo(titulo, porId[indicador]);
      if (motivo) fora.push({ indicador, titulo, motivo });
      else titulos[indicador] = titulo;
    }
    descartados.push(...fora);
    return fora;
  };

  const mensagens: MensagemLLM[] = [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: mensagemUsuario(diretoria, entrada) },
  ];
  const primeira = await rodada(mensagens, opcoes);
  if (!primeira.ok) return { chave, titulos, descartados, motivo: primeira.motivo, uso: primeira.uso, provedor: primeira.provedor, latenciaMs: Date.now() - inicio };
  const fora = conferir(primeira.titulos).filter(d => d.motivo !== 'repetido');
  const uso = { ...primeira.uso };
  if (fora.length) {
    const pedido = `Estes títulos foram recusados. Reescreva só eles, corrigindo o motivo:\n${fora.map(d => `${d.indicador}: "${d.titulo}" (${d.motivo})`).join('\n')}`;
    const segunda = await rodada([...mensagens, { role: 'assistant', content: primeira.texto }, { role: 'user', content: pedido }], opcoes);
    if (segunda.uso) for (const k of ['entrada', 'saida', 'cacheEntrada', 'raciocinio'] as const) uso[k] += segunda.uso[k];
    if (segunda.ok) conferir(segunda.titulos.filter(t => !(t.indicador in titulos)));
  }
  return { chave, titulos, descartados, motivo: null, uso, provedor: primeira.provedor, latenciaMs: Date.now() - inicio };
}
