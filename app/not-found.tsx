import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <main className="pagina">
      <div className="cab">
        <div>
          <h1>Página não encontrada</h1>
          <p>O indicador ou a página pedida não existe no painel.</p>
        </div>
      </div>
      <div className="vazio">
        <Link className="chip" href="/">
          Ir para o painel gerencial
        </Link>
      </div>
    </main>
  );
}
