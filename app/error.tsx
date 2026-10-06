'use client';

/** Erro ao montar uma tela: mensagem curta e tentar de novo (sem detalhe interno) */

import Link from 'next/link';

export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="pagina">
      <div className="cab">
        <div>
          <h1>Não foi possível montar esta tela</h1>
          <p>Algo falhou ao calcular os números deste recorte.</p>
        </div>
      </div>
      <div className="vazio">
        <button type="button" className="chip" onClick={reset}>
          Tentar de novo
        </button>{' '}
        <Link className="chip" href="/">
          Voltar ao painel gerencial
        </Link>
      </div>
    </main>
  );
}
