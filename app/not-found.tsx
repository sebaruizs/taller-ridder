import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="wrap stack" style={{ paddingTop: 48 }}>
      <h1 style={{ margin: 0 }}>No encontramos esto</h1>
      <p className="muted" style={{ margin: 0 }}>Puede que la orden ya no exista o que no tengas acceso.</p>
      <Link className="btn btn-primary" href="/ordenes">Ir a la lista</Link>
    </main>
  );
}
