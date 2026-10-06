'use client';

/** Botão violeta que abre o painel da IA com um pedido (contexto de deep dive + pergunta) */

import type { MouseEvent, ReactNode } from 'react';
import type { PedidoIA } from '@/lib/ia/pedidos';
import { useLojaIA } from './ProvedorIA';

export function IconeIA({ tamanho = 14 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
  );
}

interface Props {
  pedido: PedidoIA;
  /** texto visível; sem texto o botão é só ícone e precisa de rotuloAcessivel */
  children?: ReactNode;
  rotuloAcessivel?: string;
  className?: string;
}

export function BotaoIA({ pedido, children, rotuloAcessivel, className = '' }: Props) {
  const loja = useLojaIA();
  const abrir = (e: MouseEvent<HTMLButtonElement>) => {
    // dentro de linhas clicáveis: abre a IA, não navega
    e.stopPropagation();
    void loja.abrir(pedido, e.currentTarget);
  };
  return (
    <button
      type="button"
      className={`btn-ia ${children ? '' : 'so-icone'} ${className}`}
      aria-label={rotuloAcessivel}
      title={children ? undefined : 'O que influenciou o resultado'}
      onClick={abrir}
      onKeyDown={e => e.stopPropagation()}
    >
      <IconeIA />
      {children}
    </button>
  );
}
