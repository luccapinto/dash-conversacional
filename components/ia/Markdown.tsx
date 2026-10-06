/**
 * Markdown leve, sem dependência, para as respostas do agente: **negrito**, `código`, títulos,
 * listas, tabelas GFM e parágrafos. Renderiza a cada pedaço do streaming (tabela pela metade não
 * quebra). O primeiro parágrafo é a conclusão (o agente começa por ela) e sai em destaque.
 * `marcar`: números que a guarda não conseguiu conferir; aparecem marcados no texto.
 */

import { Fragment, type ReactNode } from 'react';

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function comMarcas(texto: string, marcar: readonly string[], chave: string): ReactNode[] {
  if (!marcar.length) return [texto];
  const re = new RegExp(`(?<![\\d,.])(${marcar.map(escapar).join('|')})(?![\\d])`, 'g');
  const out: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    out.push(
      <mark key={`${chave}-m${m.index}`} className="nv" title="Número não conferido contra os resultados das funções">
        {m[0]}
      </mark>,
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

function inline(texto: string, chave: string, marcar: readonly string[]): ReactNode[] {
  const nos: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) nos.push(<Fragment key={`${chave}-t${i}`}>{comMarcas(texto.slice(ultimo, m.index), marcar, `${chave}-t${i}`)}</Fragment>);
    if (m[2] !== undefined) nos.push(<strong key={`${chave}-b${i}`}>{comMarcas(m[2], marcar, `${chave}-b${i}`)}</strong>);
    else nos.push(<code key={`${chave}-c${i}`}>{m[3]}</code>);
    ultimo = m.index + m[0].length;
    i++;
  }
  if (ultimo < texto.length) nos.push(<Fragment key={`${chave}-fim`}>{comMarcas(texto.slice(ultimo), marcar, `${chave}-fim`)}</Fragment>);
  return nos;
}

const celulas = (linha: string) => linha.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim());
const ehSeparadora = (linha: string) => /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(linha) && linha.includes('-');
const ehItem = (linha: string) => /^\s*[-*]\s+/.test(linha);
const ehNumerado = (linha: string) => /^\s*\d+\.\s+/.test(linha);

export function Markdown({ text, marcar = [] }: { text: string; marcar?: readonly string[] }) {
  const linhas = text.split('\n');
  const blocos: ReactNode[] = [];
  let i = 0;
  let k = 0;
  let primeiro = true;

  while (i < linhas.length) {
    const linha = linhas[i];
    if (!linha.trim()) {
      i++;
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      blocos.push(<h4 key={k++}>{inline(titulo[2].replace(/:$/, ''), `h${k}`, marcar)}</h4>);
      primeiro = false;
      i++;
      continue;
    }

    if (linha.includes('|') && i + 1 < linhas.length && ehSeparadora(linhas[i + 1])) {
      const cab = celulas(linha);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].includes('|')) corpo.push(celulas(linhas[i++]));
      const base = `tb${k}`;
      blocos.push(
        <div key={k++} className="tab-md">
          <table>
            <thead>
              <tr>{cab.map((c, j) => <th key={j}>{inline(c, `${base}-h${j}`, marcar)}</th>)}</tr>
            </thead>
            <tbody>
              {corpo.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `${base}-${ri}-${ci}`, marcar)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      primeiro = false;
      continue;
    }

    if (ehItem(linha) || ehNumerado(linha)) {
      const numerada = ehNumerado(linha);
      const teste = numerada ? ehNumerado : ehItem;
      const itens: string[] = [];
      while (i < linhas.length && teste(linhas[i])) itens.push(linhas[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/, ''));
      const base = `l${k}`;
      const lis = itens.map((it, j) => <li key={j}>{inline(it, `${base}-${j}`, marcar)}</li>);
      blocos.push(numerada ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
      primeiro = false;
      continue;
    }

    // Parágrafo. A primeira linha é sempre consumida: no streaming, o cabeçalho de uma tabela
    // chega antes da separadora e nenhum outro bloco o aceita.
    const para = [linha];
    i++;
    while (i < linhas.length && linhas[i].trim() && !linhas[i].includes('|') && !ehItem(linhas[i]) && !ehNumerado(linhas[i]) && !/^#{1,6}\s/.test(linhas[i])) para.push(linhas[i++]);
    blocos.push(
      <p key={k++} className={primeiro ? 'lead' : undefined}>
        {inline(para.join(' '), `p${k}`, marcar)}
      </p>,
    );
    primeiro = false;
  }

  return <div className="resp">{blocos}</div>;
}
