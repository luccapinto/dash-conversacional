/**
 * Motor do CLIENT: roda sobre o cubo compacto (mês × diretoria × senioridade, todas as medidas).
 *
 * Funções: valor, serie, decompor, cruzar, comparar, impacto — recortes por diretoria e
 * senioridade. `drivers` não existe aqui: precisa dos atributos individuais do roster, que
 * nunca vão para o navegador (ver lib/analytics/servidor.ts).
 *
 * Este é o único módulo de dados que o client importa (orçamento < 150 KB gzip, testado).
 */

import cuboJson from '@/lib/dados/cliente/cubo.json';
import { criarMotor, type MotorCliente } from './engine';
import type { TabelaFatos } from './fatos';

const cubo = cuboJson as unknown as TabelaFatos;
const motor = criarMotor([cubo], 'cubo');

export const motorCliente: MotorCliente = {
  origem: motor.origem,
  dimensoes: motor.dimensoes,
  valor: motor.valor,
  serie: motor.serie,
  decompor: motor.decompor,
  cruzar: motor.cruzar,
  comparar: motor.comparar,
  impacto: motor.impacto,
};
