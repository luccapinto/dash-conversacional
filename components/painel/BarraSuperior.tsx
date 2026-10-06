'use client';

/**
 * Barra superior fixa: marca, filtros (Mês, Diretoria, Senioridade) na URL, botão "Perguntar"
 * (IA sem contexto, com sugestões da tela) e alternador de tema; abas Gerencial · Resumo
 * executivo (ponto violeta = IA) · Indicadores. No celular os filtros viram um botão com painel.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DIRETORIAS, MESES, SENIORIDADES, rotuloMes } from '@/lib/analytics/dominio';
import { PEDIDO_LIVRE } from '@/lib/ia/pedidos';
import { consulta, rotuloFiltros, slug, type FiltrosPainel } from '@/lib/painel/filtros';
import { IconeIA } from '@/components/ia/BotaoIA';
import { useLojaIA } from '@/components/ia/ProvedorIA';

export type Aba = 'gerencial' | 'resumo' | 'indicador';

const MESES_DESC = [...MESES].reverse();
const CAMINHO: Record<Aba, (id: string) => string> = { gerencial: () => '/', resumo: () => '/resumo', indicador: id => `/indicadores/${id}` };

function assinarTema(aviso: () => void) {
  const mo = new MutationObserver(aviso);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  return () => mo.disconnect();
}

const Seta = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function BarraSuperior({ filtros: f, aba, indicador = 'turnover' }: { filtros: FiltrosPainel; aba: Aba; indicador?: string }) {
  const router = useRouter();
  const loja = useLojaIA();
  const barra = useRef<HTMLDivElement>(null);
  const [filtrosMob, setFiltrosMob] = useState(false);
  const tema = useSyncExternalStore(assinarTema, () => document.documentElement.dataset.tema ?? 'claro', () => 'claro');
  const senioridadeNaoSeAplica = aba === 'resumo';

  // altura da barra para os elementos presos logo abaixo dela (seletor e cabeçalho do gerencial no celular)
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--bh', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ir = (novo: Partial<FiltrosPainel>) => router.push(`${CAMINHO[aba](indicador)}${consulta({ ...f, ...novo })}`, { scroll: false });
  const trocarTema = () => {
    const novo = tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem('tema', novo);
    } catch {
      // armazenamento bloqueado: o tema vale só nesta página
    }
  };
  const q = consulta(f);

  const selects = (
    <>
      <label className="sel">
        <small>Mês</small>
        <select value={f.mes} onChange={e => ir({ mes: e.target.value })} aria-label="Mês">
          {MESES_DESC.map(m => (
            <option key={m} value={m}>{rotuloMes(m)}</option>
          ))}
        </select>
        <Seta />
      </label>
      <label className="sel">
        <small>Diretoria</small>
        <select value={f.diretoria ? slug(f.diretoria) : ''} onChange={e => ir({ diretoria: DIRETORIAS.find(d => slug(d) === e.target.value) ?? null })} aria-label="Diretoria">
          <option value="">Empresa toda</option>
          {DIRETORIAS.map(d => (
            <option key={d} value={slug(d)}>{d}</option>
          ))}
        </select>
        <Seta />
      </label>
      <label className="sel" title={senioridadeNaoSeAplica ? 'O resumo executivo é por diretoria: sinais e leitura da IA não se abrem por senioridade' : undefined}>
        <small>Senioridade</small>
        <select
          value={f.senioridade && !senioridadeNaoSeAplica ? slug(f.senioridade) : ''}
          disabled={senioridadeNaoSeAplica}
          onChange={e => ir({ senioridade: SENIORIDADES.find(s => slug(s) === e.target.value) ?? null })}
          aria-label="Senioridade"
        >
          <option value="">Todas</option>
          {SENIORIDADES.map(s => (
            <option key={s} value={slug(s)}>{s}</option>
          ))}
        </select>
        <Seta />
      </label>
    </>
  );

  return (
    <div className="barra" ref={barra}>
      <a className="pular" href="#conteudo">Pular para o conteúdo</a>
      <div className="l1">
        <div className="marca">
          <b>Verta S.A.</b>
          <span>People Analytics</span>
        </div>
        <button type="button" className="sel so-mob filtro-mob" aria-expanded={filtrosMob} aria-controls="filtros-mob" onClick={() => setFiltrosMob(v => !v)}>
          <span>{rotuloFiltros({ ...f, senioridade: senioridadeNaoSeAplica ? null : f.senioridade })}</span>
          <Seta />
        </button>
        <div className="filtros">{selects}</div>
        <div className="dir">
          <button type="button" className="btn-ia" onClick={e => void loja.abrir(PEDIDO_LIVRE, e.currentTarget)} aria-label="Perguntar à IA">
            <IconeIA />
            <span className="rotulo">Perguntar</span>
          </button>
          <button type="button" className="icone-btn" onClick={trocarTema} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
            {tema === 'escuro' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            )}
          </button>
        </div>
        {filtrosMob && (
          <div className="filtros-mob so-mob" id="filtros-mob" role="group" aria-label="Filtros" onKeyDown={e => e.key === 'Escape' && setFiltrosMob(false)}>
            {selects}
            <button type="button" className="chip" style={{ alignSelf: 'flex-end' }} onClick={() => setFiltrosMob(false)}>
              Pronto
            </button>
          </div>
        )}
      </div>
      <nav className="abas" aria-label="Seções">
        <Link href={`/${q}`} aria-current={aba === 'gerencial' ? 'page' : undefined}>
          Gerencial
        </Link>
        <Link href={`/resumo${q}`} aria-current={aba === 'resumo' ? 'page' : undefined}>
          <span className="ia-dot" aria-hidden="true" />
          Resumo executivo
          <span className="sr-only"> (leitura da IA)</span>
        </Link>
        <Link href={`/indicadores/${indicador}${q}`} aria-current={aba === 'indicador' ? 'page' : undefined}>
          Indicadores
        </Link>
      </nav>
    </div>
  );
}
