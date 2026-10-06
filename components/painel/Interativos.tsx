'use client';

/** Peças interativas pequenas das telas (o resto é renderizado no servidor) */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/** Linha clicável que leva à página do indicador: focável, Enter abre; o botão de IA dentro não navega */
export function LinhaLink({ href, rotulo, className, children }: { href: string; rotulo: string; className: string; children: ReactNode }) {
  const router = useRouter();
  const abrir = () => router.push(href);
  const tecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) abrir();
  };
  return (
    <div className={className} role="link" tabIndex={0} aria-label={rotulo} onClick={abrir} onKeyDown={tecla}>
      {children}
    </div>
  );
}

/** Tabela do gerencial com o seletor "Mês | Acumulado" do celular (sem rolagem horizontal) */
export function BlocoGerencial({ rotuloMes, rotuloYtd, children }: { rotuloMes: string; rotuloYtd: string; children: ReactNode }) {
  const [bloco, setBloco] = useState<'mes' | 'ytd'>('mes');
  return (
    <>
      <div className="seg" role="group" aria-label="Bloco exibido">
        <button type="button" aria-pressed={bloco === 'mes'} onClick={() => setBloco('mes')}>
          {rotuloMes}
        </button>
        <button type="button" aria-pressed={bloco === 'ytd'} onClick={() => setBloco('ytd')}>
          {rotuloYtd}
        </button>
      </div>
      <div className={`tabela bloco-${bloco}`}>{children}</div>
    </>
  );
}

/** Faixa de chips rolável com o atual centralizado (celular) */
export function ChipsCentralizados({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const faixa = ref.current;
    const atual = faixa?.querySelector<HTMLElement>('[aria-current="true"]');
    if (faixa && atual) faixa.scrollLeft = atual.offsetLeft - faixa.offsetWidth / 2 + atual.offsetWidth / 2;
  }, []);
  return (
    <nav ref={ref} className="chips-ind" aria-label="Indicadores">
      {children}
    </nav>
  );
}
