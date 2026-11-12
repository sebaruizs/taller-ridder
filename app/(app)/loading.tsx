// Mientras Odoo responde: se muestra al instante al tocar una tarjeta, un filtro o una pestaña,
// así se ve que la app tomó el toque.
export default function Cargando() {
  return (
    <main className="wrap stack" style={{ paddingTop: 64 }} aria-busy="true">
      <span className="sr-only" role="status">Cargando…</span>
      <div className="skeleton" style={{ height: 56 }} />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </main>
  );
}
