'use client';

/**
 * Renderer Markdown leve e sem dependências para as respostas do chat.
 * Suporta o subconjunto que o analista usa: **negrito**, `código`,
 * listas (- / 1.), tabelas GFM e parágrafos. Mantém o bundle enxuto e
 * dá controle total sobre o estilo executivo.
 */

import { Fragment, type ReactNode } from 'react';

// ── Inline: **negrito** e `código` ─────────────────────────────────────────────

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokeniza em **bold** e `code`, preservando o resto como texto.
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="rounded px-1 py-0.5 text-[0.92em]" style={{ backgroundColor: 'var(--color-surface-raised)', fontFamily: 'ui-monospace, monospace' }}>{m[3]}</code>
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyBase}-tend`}>{text.slice(last)}</Fragment>);
  return nodes;
}

// ── Tabela GFM ─────────────────────────────────────────────────────────────────

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

function Table({ rows, keyBase }: { rows: string[]; keyBase: string }) {
  const header = splitRow(rows[0]);
  const body = rows.slice(2).map(splitRow); // pula a linha separadora (---)
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[0.95em]">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} className="px-2 py-1 text-left font-semibold" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {renderInline(h, `${keyBase}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {renderInline(c, `${keyBase}-r${ri}c${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bloco a bloco ──────────────────────────────────────────────────────────────

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Linha em branco
    if (!line.trim()) { i++; continue; }

    // Tabela: linha com | seguida de separadora
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].includes('|')) { rows.push(lines[i]); i++; }
      blocks.push(<Table key={key++} rows={rows} keyBase={`tb${key}`} />);
      continue;
    }

    // Lista não-ordenada
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(
        <ul key={key++} className="my-1.5 flex flex-col gap-1 pl-4" style={{ listStyle: 'disc' }}>
          {items.map((it, idx) => <li key={idx}>{renderInline(it, `ul${key}-${idx}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Lista ordenada
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push(
        <ol key={key++} className="my-1.5 flex flex-col gap-1 pl-5" style={{ listStyle: 'decimal' }}>
          {items.map((it, idx) => <li key={idx}>{renderInline(it, `ol${key}-${idx}`)}</li>)}
        </ol>
      );
      continue;
    }

    // Parágrafo (agrupa linhas consecutivas). A primeira linha é sempre
    // consumida: enquanto a resposta ainda está streamando, o cabeçalho de uma
    // tabela chega antes da linha separadora e nenhum outro bloco o aceita —
    // sem este consumo incondicional o `while` externo nunca avança.
    const para: string[] = [lines[i]];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].includes('|') && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(para.join(' '), `p${key}`)}</p>);
  }

  return <div className="flex flex-col">{blocks}</div>;
}
