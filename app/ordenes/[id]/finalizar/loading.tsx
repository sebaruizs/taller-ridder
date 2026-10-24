export default function Cargando() {
  return (
    <main className="wrap stack" style={{ paddingTop: 64 }} aria-busy="true">
      <span className="sr-only">Cargando orden…</span>
      <div className="skeleton" style={{ height: 150 }} />
      <div className="skeleton" style={{ height: 56 }} />
      <div className="skeleton" style={{ height: 110 }} />
    </main>
  );
}
