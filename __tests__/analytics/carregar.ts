/**
 * Leitura dos dados gerados para os testes. Lê do disco (não importa o JSON) para que o
 * teste valide exatamente os arquivos commitados.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Eventos, Pessoa } from '@/lib/analytics/dominio';
import type { TabelaFatos } from '@/lib/analytics/fatos';

const RAIZ = path.resolve(__dirname, '..', '..');

export function lerJson<T>(relativo: string): T {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, relativo), 'utf8')) as T;
}

export function lerTexto(relativo: string): string {
  return fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
}

export const roster = (): Pessoa[] => lerJson<Pessoa[]>('lib/dados/servidor/roster.json');
export const eventos = (): Eventos => lerJson<Eventos>('lib/dados/servidor/eventos.json');
export const cubo = (): TabelaFatos => lerJson<TabelaFatos>('lib/dados/cliente/cubo.json');
