import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { Markdown } from '@/components/ia/Markdown';

/**
 * O painel da IA renderiza a resposta a cada pedaço recebido. Durante o streaming de uma tabela,
 * existem quadros em que o cabeçalho (`| Diretoria | Taxa |`) já chegou mas a separadora
 * (`|---|---|`) ainda não — a aba congelava aí.
 */
function expandir(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expandir);
  if (isValidElement(node) && typeof node.type === 'function') return expandir((node.type as (p: unknown) => unknown)(node.props));
  return node;
}

function texto(node: unknown): string {
  const n = expandir(node);
  if (n == null || n === false) return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(texto).join('');
  if (isValidElement(n)) return texto((n.props as { children?: ReactNode }).children);
  return '';
}

function marcas(node: unknown): string[] {
  const n = expandir(node);
  if (Array.isArray(n)) return n.flatMap(marcas);
  if (!isValidElement(n)) return [];
  const filhos = (n.props as { children?: ReactNode }).children;
  return n.type === 'mark' ? [texto(filhos)] : marcas(filhos);
}

const render = (text: string, marcar?: string[]) => Markdown({ text, marcar });

const TABELA = ['| Diretoria | Turnover |', '|---|---|', '| Tecnologia | 3,1% |', '| Operações | 2,4% |'].join('\n');

describe('Markdown', () => {
  it('renderiza cada quadro parcial de uma tabela em streaming', () => {
    for (let n = 1; n <= TABELA.length; n++) expect(() => texto(render(TABELA.slice(0, n)))).not.toThrow();
  });

  it('mostra o cabeçalho pendente como texto até a separadora chegar', () => {
    expect(texto(render('| Diretoria | Turnover |'))).toContain('Diretoria');
  });

  it('monta a tabela completa com cabeçalho e células', () => {
    const out = texto(render(TABELA));
    expect(out).toContain('Turnover');
    expect(out).toContain('Tecnologia');
    expect(out).toContain('2,4%');
    expect(out).not.toContain('---');
  });

  it('não perde texto solto que contém pipe', () => {
    expect(texto(render('Turnover | meta: 2,0% ao mês'))).toContain('meta');
  });

  it('renderiza títulos markdown sem deixar os # na tela', () => {
    const out = texto(render('## **Tecnologia** lidera\n\nTexto.\n\n#### Fuga de talento\n\nMais texto.'));
    expect(out).toContain('Tecnologia lidera');
    expect(out).toContain('Fuga de talento');
    expect(out).not.toContain('#');
  });

  it('marca os números que a guarda não conferiu, também dentro de negrito e tabela, sem pegar pedaço de outro número', () => {
    const md = 'Piso e q1 somam **55% das saídas**, 4,2× a meta; 155% não.\n\n| a | b |\n|---|---|\n| x | 32,4% |';
    expect(marcas(render(md, ['55%', '4,2×', '32,4%']))).toEqual(['55%', '4,2×', '32,4%']);
    expect(marcas(render(md))).toEqual([]);
  });
});
