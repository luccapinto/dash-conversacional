import { describe, it, expect } from 'vitest';
import { Markdown } from '@/components/dashboard/Markdown';

/**
 * O chat renderiza a resposta a cada token recebido. Durante o streaming de uma
 * tabela, existem quadros em que o cabeçalho (`| Diretoria | Taxa |`) já chegou
 * mas a linha separadora (`|---|---|`) ainda não — a aba congelava aí.
 */
function renderToText(text: string): string {
  const flatten = (node: unknown): string => {
    if (node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flatten).join('');
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === 'function') {
      return flatten((el.type as (p: unknown) => unknown)(el.props ?? {}));
    }
    return el.props ? flatten(el.props.children) : '';
  };
  return flatten(Markdown({ text }));
}

const TABELA = [
  '| Diretoria | Turnover |',
  '|---|---|',
  '| Tecnologia | 3,1% |',
  '| Operações | 2,4% |',
].join('\n');

describe('Markdown', () => {
  it('renderiza cada quadro parcial de uma tabela em streaming', () => {
    // Cada prefixo é um quadro real que o React tenta renderizar.
    for (let n = 1; n <= TABELA.length; n++) {
      expect(() => renderToText(TABELA.slice(0, n))).not.toThrow();
    }
  });

  it('mostra o cabeçalho pendente como texto até a separadora chegar', () => {
    expect(renderToText('| Diretoria | Turnover |')).toContain('Diretoria');
  });

  it('monta a tabela completa com cabeçalho e células', () => {
    const out = renderToText(TABELA);
    expect(out).toContain('Turnover');
    expect(out).toContain('Tecnologia');
    expect(out).toContain('2,4%');
    expect(out).not.toContain('---');
  });

  it('não perde texto solto que contém pipe', () => {
    expect(renderToText('Turnover | meta: 2,0% ao mês')).toContain('meta');
  });

  it('renderiza título markdown sem deixar os # na tela', () => {
    const out = renderToText('## **Tecnologia** lidera\n\nTexto.');
    expect(out).toContain('Tecnologia lidera');
    expect(out).not.toContain('#');
  });
});
