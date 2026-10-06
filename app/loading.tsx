/** Esqueleto enquanto a tela é montada no servidor (troca de filtro ou de aba): a barra não some */

export default function Carregando() {
  return (
    <>
      <div className="barra" aria-hidden="true">
        <div className="l1">
          <div className="marca">
            <b>Verta S.A.</b>
            <span>People Analytics</span>
          </div>
        </div>
        <div className="abas">
          <div className="esq" style={{ height: 20, width: 320, margin: '8px 0 12px' }} />
        </div>
      </div>
      <main className="pagina" aria-busy="true" aria-label="Carregando">
        <div className="esq" style={{ height: 40, width: 280, maxWidth: '100%', marginBottom: 12 }} />
        <div className="esq" style={{ height: 16, width: 420, maxWidth: '100%', marginBottom: 24 }} />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="esq" style={{ height: 46, marginBottom: 6 }} />
        ))}
      </main>
    </>
  );
}
