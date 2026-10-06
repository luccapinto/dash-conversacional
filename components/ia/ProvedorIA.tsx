'use client';

/**
 * Provedor do painel da IA: uma loja por aba do navegador (vive no layout raiz, então as conversas
 * sobrevivem à navegação entre telas) e a gaveta/folha montada uma vez. O modo (ao vivo ou
 * demonstração) chega do servidor como prop: o navegador não lê variável de ambiente.
 */

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ModoIA } from '@/lib/agente/contrato';
import { LojaIA, type EstadoIA } from '@/lib/ia/loja';
import type { SugestaoIA } from '@/lib/ia/pedidos';
import { PainelIA } from './PainelIA';

const Contexto = createContext<LojaIA | null>(null);

export function useLojaIA(): LojaIA {
  const loja = useContext(Contexto);
  if (!loja) throw new Error('useLojaIA fora do ProvedorIA');
  return loja;
}

export function useEstadoIA(): EstadoIA {
  const loja = useLojaIA();
  return useSyncExternalStore(loja.assinar, loja.foto, loja.foto);
}

export function ProvedorIA({ modo, children }: { modo: ModoIA; children: ReactNode }) {
  const [loja] = useState(() => new LojaIA({ modo }));
  return (
    <Contexto.Provider value={loja}>
      {children}
      <PainelIA />
    </Contexto.Provider>
  );
}

/** Sugestões do botão "Perguntar" para a tela atual (deep dives do layout do recorte) */
export function SugestoesIA({ sugestoes }: { sugestoes: readonly SugestaoIA[] }) {
  const loja = useLojaIA();
  useEffect(() => {
    loja.definirSugestoes(sugestoes);
  }, [loja, sugestoes]);
  return null;
}
