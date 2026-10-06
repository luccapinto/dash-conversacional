/**
 * Layout determinístico (sem IA): ordem por score dos sinais e títulos-modelo. É o fallback de
 * qualquer falha da IA e a base quando não há chave: o painel nunca fica vazio nem quebrado.
 * Os únicos números dos textos vêm dos pontos dos sinais (formatados pelo detector).
 */

import { CATALOGO, INDICADORES, type IdIndicador } from '@/lib/analytics/catalog';
import { formatar, PESO_LENTE, type Sinal } from '@/lib/analytics/signals';
import { descreverRecorte } from '@/lib/agente/rotulos';
import {
  ancorasDoSinal,
  chaveLayout,
  contextoDoSinal,
  graficoDoSinal,
  valorDaAncora,
  type AnotacaoLayout,
  type CardLayout,
  type DeepDiveSugerido,
  type GraficoLayout,
  type LayoutSpec,
  type RecorteLayout,
} from './spec';

const N_CARDS = 10;
const N_GRAFICOS = 3;
const N_ANOTACOES = 4;
const N_DEEP_DIVES = 4;
const N_ALTO = 3;

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const nome = (id: IdIndicador) => CATALOGO[id].nome;
/** "Turnover total" → "turnover total"; siglas ("eNPS") ficam como estão */
const meio = (id: IdIndicador) => {
  const n = nome(id);
  return /^\p{Lu}\p{Ll}/u.test(n) ? n[0].toLowerCase() + n.slice(1) : n;
};
const efeitoDe = (s: Sinal) => s.indicadores[s.indicadores.length - 1];
const onde = (s: Sinal) => (s.diretoria ? ` em ${s.diretoria}` : ' na empresa');
const mesDoPico = (s: Sinal) => MESES_EXTENSO[Number(s.periodo.inicio.slice(5, 7)) - 1];

// Frases sem concordância verbal com o nome do indicador ("Horas extras…", "Mulheres na liderança…")

/** Título-modelo de um sinal (sem números) */
export function tituloDoSinal(s: Sinal): string {
  const ind = nome(efeitoDe(s));
  switch (s.tipo) {
    case 'fora_da_meta':
      return `${ind}${onde(s)}: fora da meta`;
    case 'outlier_entre_diretorias':
      return `${ind}: ${s.diretoria} ${s.direcao === 'favoravel' ? 'à frente das' : 'atrás das'} demais diretorias`;
    case 'quebra_de_tendencia':
      return `${ind}${onde(s)}: novo patamar desde ${s.pontos.find(p => p.periodo.inicio === s.periodo.inicio)?.rotulo ?? 'o período recente'}`;
    case 'piora_acelerada':
      return `${ind}${onde(s)}: piora a cada trimestre`;
    case 'sazonalidade':
      return `${ind}${onde(s)}: pico todo ${mesDoPico(s)}`;
    case 'indicador_antecedente':
      return `${ind}${onde(s)}: ${meio(s.indicadores[0])} como sinal antecedente`;
  }
}

function perguntaDoSinal(s: Sinal): string {
  const ind = meio(efeitoDe(s));
  switch (s.tipo) {
    case 'fora_da_meta':
      return `O que explica ${ind}${onde(s)} fora da meta?`;
    case 'outlier_entre_diretorias':
      return `O que explica ${ind} em ${s.diretoria} frente às demais diretorias?`;
    case 'quebra_de_tendencia':
      return `O que mudou em ${ind}${onde(s)}?`;
    case 'piora_acelerada':
      return `O que explica a piora de ${ind}${onde(s)}?`;
    case 'sazonalidade':
      return `O que causa o pico de ${ind}${onde(s)} em ${mesDoPico(s)}?`;
    case 'indicador_antecedente':
      return `Como ${meio(s.indicadores[0])} se relaciona com ${ind}${onde(s)}?`;
  }
}

function anotacaoDoSinal(s: Sinal): AnotacaoLayout | null {
  const ancoras = ancorasDoSinal(s);
  // sazonalidade: o pico mais recente; demais: o ponto que o sinal descreve
  const ancora = s.tipo === 'sazonalidade' ? ancoras[ancoras.length - 1] : ancoras[0];
  if (!ancora) return null;
  const valor = valorDaAncora(s, ancora);
  const fmt = valor === null ? null : formatar(valor, CATALOGO[ancora.indicador].unidade);
  let texto: string;
  switch (s.tipo) {
    case 'fora_da_meta':
      texto = fmt ? `${fmt}, fora da meta` : 'Fora da meta';
      break;
    case 'outlier_entre_diretorias':
      texto = `${s.diretoria}${fmt ? `: ${fmt}` : ''}, ${s.direcao === 'favoravel' ? 'à frente das' : 'atrás das'} demais`;
      break;
    case 'sazonalidade':
      texto = `${ancora.rotulo}: pico sazonal${fmt ? ` de ${fmt}` : ''}`;
      break;
    case 'quebra_de_tendencia':
      texto = `${ancora.rotulo}: início do novo patamar${fmt ? ` (${fmt})` : ''}`;
      break;
    case 'piora_acelerada':
      texto = `${ancora.rotulo}${fmt ? `: ${fmt}` : ''}, piora acelerada`;
      break;
    case 'indicador_antecedente':
      texto = `${nome(s.indicadores[0])}: sinal antecedente`;
      break;
  }
  return { ancora, texto, sinal: s.id };
}

export function layoutDeterministico(recorte: RecorteLayout, sinais: readonly Sinal[]): LayoutSpec {
  const topo = new Set(sinais.slice(0, N_ALTO).map(s => s.id));

  const cards: CardLayout[] = [];
  const temCard = (id: IdIndicador) => cards.some(c => c.indicador === id);
  for (const s of sinais) {
    for (const id of [...s.indicadores].reverse()) {
      if (cards.length >= N_CARDS || temCard(id)) continue;
      cards.push({ indicador: id, destaque: topo.has(s.id) ? 'alto' : 'medio', titulo: id === efeitoDe(s) ? tituloDoSinal(s) : null, sinal: s.id });
    }
  }
  // completa com os domínios que mais pesam para o público, na ordem do catálogo
  const peso = PESO_LENTE[recorte.lente];
  const restantes = INDICADORES.map((ind, i) => ({ ind, i })).sort((a, b) => peso[b.ind.dominio] - peso[a.ind.dominio] || a.i - b.i);
  for (const { ind } of restantes) {
    if (cards.length >= N_CARDS) break;
    if (!temCard(ind.id)) cards.push({ indicador: ind.id, destaque: 'normal', titulo: null, sinal: null });
  }

  const graficos: GraficoLayout[] = [];
  for (const s of sinais) {
    if (graficos.length >= N_GRAFICOS) break;
    const g = graficoDoSinal(s, recorte);
    if (graficos.some(x => x.tipo === g.tipo && x.diretoria === g.diretoria && x.indicadores.join() === g.indicadores.join())) continue;
    graficos.push({ ...g, titulo: tituloDoSinal(s) });
  }

  const anotacoes = sinais.slice(0, N_ANOTACOES).flatMap(s => anotacaoDoSinal(s) ?? []);

  const deepDives: DeepDiveSugerido[] = [];
  for (const s of sinais) {
    if (deepDives.length >= N_DEEP_DIVES) break;
    if (deepDives.some(d => d.contexto.indicador === efeitoDe(s) && d.contexto.filtros?.diretoria === (s.diretoria ?? undefined))) continue;
    const a = anotacaoDoSinal(s)?.ancora;
    deepDives.push({ pergunta: perguntaDoSinal(s), contexto: contextoDoSinal(s, recorte, a), sinal: s.id });
  }
  const filtros = recorte.diretoria ? { diretoria: recorte.diretoria } : undefined;
  for (const c of cards) {
    if (deepDives.length >= 3) break;
    if (deepDives.some(d => d.contexto.indicador === c.indicador)) continue;
    deepDives.push({
      pergunta: `Como está ${nome(c.indicador).toLowerCase()}${recorte.diretoria ? ` em ${recorte.diretoria}` : ' na empresa'}?`,
      contexto: { indicador: c.indicador, periodo: recorte.periodo, ...(filtros ? { filtros } : {}), lente: recorte.lente },
      sinal: null,
    });
  }

  return {
    chave: chaveLayout(recorte),
    recorte,
    origem: 'deterministico',
    manchete: sinais.length ? tituloDoSinal(sinais[0]) : `${descreverRecorte(recorte.periodo, filtros)}: nenhum desvio relevante detectado`,
    cards,
    graficos,
    anotacoes,
    deepDives,
  };
}
