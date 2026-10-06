/**
 * Filtros do painel na URL (link compartilhável): ?mes=2026-09&diretoria=tecnologia&senioridade=pleno&lente=ceo.
 * Valores padrão (Set/26, empresa toda, todas as senioridades, lente do recorte) ficam fora da URL;
 * valor inválido cai no padrão.
 */

import { DIRETORIAS, MES_FIM, MESES, SENIORIDADES, rotuloMes, type Diretoria, type Mes, type Senioridade } from '@/lib/analytics/dominio';
import type { Filtros } from '@/lib/analytics/fatos';
import { LENTES, type Lente } from '@/lib/analytics/signals';

export interface FiltrosPainel {
  mes: Mes;
  diretoria: Diretoria | null;
  senioridade: Senioridade | null;
  /** público escolhido no resumo; null = padrão do recorte (ver lenteDe) */
  lente: Lente | null;
}

export type ParametrosBusca = Record<string, string | string[] | undefined>;

export const FILTROS_PADRAO: FiltrosPainel = { mes: MES_FIM, diretoria: null, senioridade: null, lente: null };

/** "Distribuição & Assessoria" → "distribuicao-assessoria" */
export function slug(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DIRETORIA_DO_SLUG: Record<string, Diretoria> = Object.fromEntries(DIRETORIAS.map(d => [slug(d), d]));
const SENIORIDADE_DO_SLUG: Record<string, Senioridade> = Object.fromEntries(SENIORIDADES.map(s => [slug(s), s]));

export function lerFiltros(params: ParametrosBusca | URLSearchParams): FiltrosPainel {
  const ler = (k: string): string | undefined => {
    const v = params instanceof URLSearchParams ? params.get(k) ?? undefined : params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const mes = ler('mes');
  const lente = ler('lente');
  return {
    mes: mes && MESES.includes(mes) ? mes : MES_FIM,
    diretoria: DIRETORIA_DO_SLUG[ler('diretoria') ?? ''] ?? null,
    senioridade: SENIORIDADE_DO_SLUG[ler('senioridade') ?? ''] ?? null,
    lente: lente && (LENTES as readonly string[]).includes(lente) ? (lente as Lente) : null,
  };
}

/** Query string com os filtros fora do padrão ("" quando todos são padrão) */
export function consulta(f: FiltrosPainel): string {
  const p = new URLSearchParams();
  if (f.mes !== MES_FIM) p.set('mes', f.mes);
  if (f.diretoria) p.set('diretoria', slug(f.diretoria));
  if (f.senioridade) p.set('senioridade', slug(f.senioridade));
  if (f.lente) p.set('lente', f.lente);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Público do recorte: o escolhido, ou CEO na empresa toda e gestor numa diretoria */
export function lenteDe(f: FiltrosPainel): Lente {
  return f.lente ?? (f.diretoria ? 'gestor' : 'ceo');
}

/** Filtros no formato do motor e do contexto da IA */
export function filtrosDoMotor(f: FiltrosPainel): Filtros {
  return { ...(f.diretoria ? { diretoria: f.diretoria } : {}), ...(f.senioridade ? { senioridade: f.senioridade } : {}) };
}

/** "Set/26 · Empresa toda" ou "Set/26 · Tecnologia · pleno" */
export function rotuloFiltros(f: FiltrosPainel): string {
  return [rotuloMes(f.mes), f.diretoria ?? 'Empresa toda', ...(f.senioridade ? [f.senioridade] : [])].join(' · ');
}
