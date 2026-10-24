"use client";

export default function ErrorPagina({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap stack" style={{ paddingTop: 48 }}>
      <h1 style={{ margin: 0 }}>Algo falló</h1>
      <p className="muted" style={{ margin: 0 }}>Puede ser la conexión o que Odoo no esté respondiendo. Probá de nuevo en un momento.</p>
      <button className="btn btn-primary" onClick={reset}>Reintentar</button>
    </main>
  );
}
