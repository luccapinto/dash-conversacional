/**
 * Motor do SERVIDOR: roda sobre o roster individual (lib/dados/servidor), nunca no navegador.
 * `import 'server-only'` faz o build do Next falhar se algum Client Component importar este
 * módulo, direta ou indiretamente.
 *
 * Funções: as mesmas do client (valor, serie, decompor, cruzar, comparar, impacto) em todas as
 * dimensões do catálogo (gênero, raça, faixa etária, eNPS, onboarding...) + `drivers` (lift
 * por atributo e por par de atributos, sobre o roster). É o motor das tools do agente (fase 2).
 *
 * A tabela de fatos é montada uma vez por processo, na primeira consulta.
 */

import 'server-only';

import rosterJson from '@/lib/dados/servidor/roster.json';
import eventosJson from '@/lib/dados/servidor/eventos.json';
import { criarMotor, type Motor } from './engine';
import { construirFatos } from './fatos';
import type { Eventos, Pessoa } from './dominio';

const roster = rosterJson as unknown as Pessoa[];
const eventos = eventosJson as unknown as Eventos;

let motor: Motor | null = null;

export function motorServidor(): Motor {
  motor ??= criarMotor(construirFatos(roster, eventos.requisicoes), 'roster');
  return motor;
}
