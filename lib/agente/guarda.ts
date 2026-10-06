/**
 * Guarda de números: extrai os números de um texto em PT-BR e confere cada um contra os valores
 * que o código produziu (resultados de tools, sinais, catálogo). Não corrige nada: mede. O agente
 * manda os não rastreáveis no evento final (a UI sinaliza); o gerador de layout usa a mesma
 * conferência de forma bloqueante.
 *
 * Formatos lidos: 36,7% · 1.234 · R$ 1,05 mi · R$ 576 mil · R$ 12,6 milhões · +9,1 p.p. · 2,4× ·
 * −43 · 36.7 (ponto decimal, se o modelo escapar do padrão BR).
 * Fora da conta: anos, meses (Jan/26, 2025-10, 01/2026), trimestres (4T24, Q1), ordinais (1º),
 * marcadores de lista, ids (r3) e contagens triviais (inteiro de 0 a 12 sem unidade nem sinal).
 *
 * Tolerância: meia unidade da última casa escrita, na escala escrita ("R$ 1,1 mi" aceita de
 * R$ 1,05 mi a R$ 1,15 mi). O sinal não conta ("queda de 43 pontos" confere com −43).
 */

import type { NumeroNaoVerificado, Verificacao } from './contrato';

export interface NumeroNoTexto {
  texto: string;
  valor: number;
  /** meia unidade da última casa escrita, na escala escrita */
  tolerancia: number;
}

const MESES_PT = '(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\\.?';
/** Trechos que não são medidas: trocados por espaços antes da leitura (mantêm as posições) */
const IGNORAR = [
  new RegExp(`\\b${MESES_PT}\\s?(?:\\/|de\\s|\\s)\\s?\\d{2,4}\\b`, 'giu'), // Jan/26, janeiro de 2026, set 2026
  /\b\d{4}-\d{2}\b/g, // 2025-10
  /\b\d{1,2}\/\d{2,4}\b/g, // 01/2026
  /\b[1-4]\s?T\s?\d{2,4}\b/g, // 4T24
  /\b[TQH][1-4]\b/g, // T1, Q1, H2
  /^\s*(?:#+\s*)?\d+[.)]\s/gm, // marcadores de lista e títulos numerados
];

const UNIDADE = String.raw`%|p\.\s?p\.|pp\b|×|x(?![\p{L}\d])|milh(?:ão|ões)|bilh(?:ão|ões)|mil\b|mi\b|bi\b|k\b`;
const NUMERO = new RegExp(
  String.raw`(?<![\p{L}\d_/.,])(R\$\s?)?([+\-−–]\s?)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?:\s?(${UNIDADE}))?`,
  'giu',
);

const ESCALA: Record<string, number> = { mil: 1e3, k: 1e3, mi: 1e6, milhão: 1e6, milhões: 1e6, bi: 1e9, bilhão: 1e9, bilhões: 1e9 };

function lerNucleo(nucleo: string): { valor: number; casas: number; milhar: boolean } {
  if (nucleo.includes(',')) {
    const [int, dec] = nucleo.replace(/\./g, '').split(',');
    return { valor: Number(`${int}.${dec}`), casas: dec.length, milhar: nucleo.includes('.') };
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(nucleo)) return { valor: Number(nucleo.replace(/\./g, '')), casas: 0, milhar: true };
  const dec = nucleo.split('.')[1];
  return { valor: Number(nucleo), casas: dec?.length ?? 0, milhar: false };
}

/**
 * Números do texto. `incluirTriviais` mantém as contagens pequenas (usado ao colher valores de
 * textos que o próprio código escreveu, como a evidência de um sinal).
 */
export function extrairNumeros(texto: string, { incluirTriviais = false } = {}): NumeroNoTexto[] {
  const limpo = IGNORAR.reduce((t, re) => t.replace(re, m => ' '.repeat(m.length)), texto);
  const out: NumeroNoTexto[] = [];
  for (const m of limpo.matchAll(NUMERO)) {
    const [inteiro, rs, sinal, nucleo, unidadeBruta] = m;
    const fim = m.index + inteiro.length;
    // colado numa letra ou em outro número (4T24, 3º, B2B): não é medida
    if (!unidadeBruta && /^[\p{L}\d]/u.test(limpo.slice(fim, fim + 1))) continue;
    const unidade = unidadeBruta?.toLowerCase();
    const { valor, casas, milhar } = lerNucleo(nucleo);
    const escala = (unidade && ESCALA[unidade]) || 1;
    const comUnidade = Boolean(rs || unidade);
    if (!sinal && !comUnidade && casas === 0 && !milhar) {
      if (valor >= 1990 && valor <= 2100) continue; // ano
      if (!incluirTriviais && valor <= 12) continue; // contagem trivial
    }
    const negativo = sinal !== undefined && /[-−–]/.test(sinal);
    out.push({
      texto: inteiro.trim(),
      valor: (negativo ? -valor : valor) * escala,
      tolerancia: 0.5 * 10 ** -casas * escala * (1 + 1e-9) + 1e-9,
    });
  }
  return out;
}

/** Valores absolutos de tudo que o código produziu: números e números escritos dentro de textos */
export function coletarValores(fontes: readonly unknown[]): number[] {
  const valores = new Set<number>();
  const visitar = (x: unknown): void => {
    if (typeof x === 'number') {
      if (Number.isFinite(x)) valores.add(Math.abs(x));
    } else if (typeof x === 'string') {
      for (const n of extrairNumeros(x, { incluirTriviais: true })) valores.add(Math.abs(n.valor));
    } else if (Array.isArray(x)) {
      x.forEach(visitar);
    } else if (x && typeof x === 'object') {
      Object.values(x).forEach(visitar);
    }
  };
  fontes.forEach(visitar);
  return [...valores];
}

export function verificarNumeros(texto: string, valores: readonly number[]): Verificacao {
  const numeros = extrairNumeros(texto);
  const naoVerificados: NumeroNaoVerificado[] = [];
  for (const n of numeros) {
    const alvo = Math.abs(n.valor);
    if (!valores.some(v => Math.abs(v - alvo) <= n.tolerancia)) naoVerificados.push({ texto: n.texto, valor: n.valor });
  }
  return { total: numeros.length, verificados: numeros.length - naoVerificados.length, naoVerificados };
}
