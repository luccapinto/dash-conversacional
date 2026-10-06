/** Esqueleto enquanto a tela é montada no servidor (troca de filtro ou de aba) */

export default function Carregando() {
  return (
    <main className="pagina" aria-busy="true" aria-label="Carregando">
      <div className="esq" style={{ height: 40, width: 280, marginBottom: 12 }} />
      <div className="esq" style={{ height: 16, width: 420, marginBottom: 24 }} />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="esq" style={{ height: 46, marginBottom: 6 }} />
      ))}
    </main>
  );
}
