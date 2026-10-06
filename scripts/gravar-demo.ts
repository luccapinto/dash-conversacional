#!/usr/bin/env npx tsx
/**
 * gravar-demo.ts — grava as respostas do modo demonstração, sem rede e sem chave de IA.
 *
 *   npm run gravar-demo                      grava todas e o índice
 *   npm run gravar-demo -- --so=id1,id2      regrava só essas (o índice sai inteiro)
 *   npm run gravar-demo -- --resultados[=…]  só lê: grava em .git/project-upgrade/fase6/resultados.md
 *                                            o que cada consulta do roteiro devolve ao modelo
 *
 * Para cada pergunta do roteiro (lib/demo/roteiro.ts) roda o `executarAgente` de verdade com o
 * provedor roteirizado (lib/demo/gravar.ts). A gravação falha se alguma ferramenta der erro, se o
 * número de blocos não bater ou se a guarda não conferir 100% dos números do texto. Saída:
 * public/demo/<id>.json (uma por resposta, baixada no clique) e lib/dados/cliente/demo.json (o
 * índice leve que entra no bundle). Mesmo roteiro, mesmos bytes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { motorCliente } from '../lib/analytics/cliente';
import type { Eventos, Pessoa } from '../lib/analytics/dominio';
import { criarMotor } from '../lib/analytics/engine';
import { construirFatos } from '../lib/analytics/fatos';
import { gravar, itemDoIndice, resultadosDoRoteiro } from '../lib/demo/gravar';
import { ROTEIRO, validarRoteiro } from '../lib/demo/roteiro';
import type { IndiceDemo } from '../lib/demo/tipos';

const RAIZ = process.cwd();
const PASTA_GRAVACOES = path.join(RAIZ, 'public/demo');
const INDICE = path.join(RAIZ, 'lib/dados/cliente/demo.json');
const RESULTADOS = path.join(RAIZ, '.git/project-upgrade/fase6/resultados.md');

const lista = (arg: string | undefined) => arg?.split('=')[1]?.split(',').filter(Boolean);
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;

/** Campos de serviço que não entram na leitura dos resultados */
const FORA_DA_LEITURA: Record<string, true> = { id: true, indicador: true, unidadeDiferenca: true, unidadeVariacao: true, unidadeDistancia: true, pesoPct: true, metodologia: true, metodo: true, filtros: true, minimo: true };

/** O resultado como o modelo recebe, em linhas curtas para leitura (mesmos números, sem campos de serviço) */
function compacto(x: unknown): string {
  if (!x || typeof x !== 'object') return String(x);
  const item = (o: unknown): string =>
    o && typeof o === 'object'
      ? Object.entries(o)
        .filter(([k, v]) => !FORA_DA_LEITURA[k] && v !== undefined && !(k === 'n' && !Number.isInteger(v)))
        .map(([k, v]) => (v && typeof v === 'object' ? `${k}={${item(v)}}` : `${k}=${v}`))
        .join(' ')
      : String(o);
  const ehPonto = (i: unknown): i is { rotulo: unknown; valor: unknown } => Boolean(i) && typeof i === 'object' && 'rotulo' in i! && 'valor' in i;
  const lista = (k: string, v: unknown[]) =>
    v.every(ehPonto) ? `${k}: ${v.map(i => `${i.rotulo}=${i.valor}`).join(' ')}` : `${k}:\n${v.map(i => `  - ${item(i)}`).join('\n')}`;
  return Object.entries(x)
    .filter(([k]) => !FORA_DA_LEITURA[k])
    .map(([k, v]) => (Array.isArray(v) ? lista(k, v) : `${k}: ${v && typeof v === 'object' ? item(v) : v}`))
    .join('\n');
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(path.join(RAIZ, 'lib/dados/servidor/roster.json'), 'utf8')) as Pessoa[];
  const eventos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'lib/dados/servidor/eventos.json'), 'utf8')) as Eventos;
  const ambiente = { motor: criarMotor(construirFatos(roster, eventos.requisicoes), 'roster'), motorSinais: motorCliente, log: () => {} };

  const argResultados = process.argv.find(a => a.startsWith('--resultados'));
  if (argResultados) {
    const so = lista(argResultados);
    const md: string[] = [];
    for (const e of ROTEIRO.filter(x => !so || so.includes(x.id))) {
      md.push(`## ${e.id} · ${e.pergunta}`, '');
      for (const r of await resultadosDoRoteiro(e, ambiente)) md.push(`### ${r.id} · ${r.rotulo}`, compacto(r.paraModelo), '');
    }
    fs.mkdirSync(path.dirname(RESULTADOS), { recursive: true });
    fs.writeFileSync(RESULTADOS, md.join('\n'));
    console.log(`Resultados: ${RESULTADOS}`);
    return;
  }

  const so = lista(process.argv.find(a => a.startsWith('--so=')));
  // com --so, só os erros das gravações pedidas (o roteiro pode estar sendo escrito)
  const erros = validarRoteiro(ROTEIRO).filter(e => !so || so.some(id => e.startsWith(`${id}:`)));
  if (erros.length) throw new Error(`Roteiro inválido:\n- ${erros.join('\n- ')}`);
  fs.mkdirSync(PASTA_GRAVACOES, { recursive: true });
  const problemas: string[] = [];
  let gravadas = 0;
  let numeros = 0;
  let conferidos = 0;
  for (const e of ROTEIRO.filter(x => !so || so.includes(x.id))) {
    const r = await gravar(e, ambiente);
    if (r.problemas.length) {
      problemas.push(...r.problemas.map(p => `${e.id}: ${p}`));
      continue;
    }
    numeros += r.metricas.verificacao!.total;
    conferidos += r.metricas.verificacao!.verificados;
    fs.writeFileSync(path.join(PASTA_GRAVACOES, `${e.id}.json`), `${JSON.stringify(r.gravacao)}\n`);
    gravadas++;
  }

  // gravação que saiu do roteiro não fica para trás
  const ids = new Set(ROTEIRO.map(e => e.id));
  for (const arquivo of fs.readdirSync(PASTA_GRAVACOES)) if (arquivo.endsWith('.json') && !ids.has(arquivo.slice(0, -5))) fs.rmSync(path.join(PASTA_GRAVACOES, arquivo));

  const indice: IndiceDemo = { itens: ROTEIRO.map(itemDoIndice) };
  fs.writeFileSync(INDICE, `${JSON.stringify(indice, null, 1)}\n`);

  const tamanhos = ROTEIRO.filter(e => fs.existsSync(path.join(PASTA_GRAVACOES, `${e.id}.json`))).map(e => ({ id: e.id, bytes: fs.statSync(path.join(PASTA_GRAVACOES, `${e.id}.json`)).size }));
  const maior = tamanhos.reduce((a, b) => (b.bytes > a.bytes ? b : a), { id: '-', bytes: 0 });
  console.log(`${gravadas} gravadas agora · ${tamanhos.length}/${ROTEIRO.length} no disco · números conferidos ${conferidos}/${numeros}`);
  console.log(`índice ${kb(fs.statSync(INDICE).size)} · maior gravação ${maior.id} ${kb(maior.bytes)} · total ${kb(tamanhos.reduce((s, t) => s + t.bytes, 0))}`);
  if (problemas.length) {
    console.error(`\n${problemas.length} problema(s):\n- ${problemas.join('\n- ')}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
