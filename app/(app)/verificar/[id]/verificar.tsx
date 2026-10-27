"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleOrden } from "@/lib/ordenes";
import type { LineaRepuesto } from "@/lib/taller";
import type { ProductoOdoo } from "@/lib/verificar-servicio";

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
// Costo en guaraníes: el punto es separador de miles. Cantidad: acepta 1,5 o 1.5.
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const cant = (s: string) => Number(s.replace(",", "."));

type Aprobada = { chapa: string; lineas: LineaRepuesto[]; avisos: string[] };

export function VerificarOrden({ orden, lineasIniciales, puedeRepuestos, puedeAprobar, historial }: { orden: DetalleOrden; lineasIniciales: LineaRepuesto[]; puedeRepuestos: boolean; puedeAprobar: boolean; historial: React.ReactNode }) {
  const router = useRouter();
  const [lineas, setLineas] = useState(lineasIniciales);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: ProductoOdoo[] } | null>(null);
  const [producto, setProducto] = useState<ProductoOdoo | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [costo, setCosto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinRepuestos, setSinRepuestos] = useState(false);
  const [aprobada, setAprobada] = useState<Aprobada | null>(null);

  const editable = orden.estado === "cancelled";
  const total = lineas.reduce((s, l) => s + l.total, 0);
  const busqueda = q.trim();

  useEffect(() => {
    if (producto || busqueda.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/productos?q=${encodeURIComponent(busqueda)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setResultados({ q: busqueda, lista: d.productos ?? [] }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [busqueda, producto]);

  async function llamar(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(url, init);
      if (r.status === 401) {
        router.replace("/ingresar");
        return null;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "No se pudo guardar");
        return null;
      }
      return d;
    } catch {
      setError("Sin conexión. Probá de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  function elegir(p: ProductoOdoo) {
    setProducto(p);
    setCosto(String(Math.round(p.costo)));
    setCantidad("1");
  }

  function limpiar() {
    setProducto(null);
    setQ("");
    setResultados(null);
    setCosto("");
    setCantidad("1");
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto || ocupado) return;
    const d = await llamar(`/api/ordenes/${orden.id}/repuestos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productoId: producto.id, cantidad: cant(cantidad), costoUnitario: num(costo || "0") }),
    });
    if (d) {
      setLineas(d.lineas as LineaRepuesto[]);
      setSinRepuestos(false);
      limpiar();
    }
  }

  async function quitar(l: LineaRepuesto) {
    if (ocupado || !confirm(`¿Quitar ${l.producto}?`)) return;
    const d = await llamar(`/api/ordenes/${orden.id}/repuestos/${l.id}`, { method: "DELETE" });
    if (d) setLineas(d.lineas as LineaRepuesto[]);
  }

  async function aprobar() {
    const d = await llamar(`/api/ordenes/${orden.id}/aprobar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmaSinRepuestos: sinRepuestos }),
    });
    if (d) setAprobada(d as unknown as Aprobada);
  }

  if (aprobada) {
    return (
      <main className="wrap">
        <div className="stack form-angosto" style={{ gap: 16, margin: "0 auto", paddingTop: 16 }}>
          <div className="success-mark" aria-hidden>✓</div>
          <h2 className="center" style={{ margin: 0 }}>Orden verificada</h2>
          <div className="center"><span className="placa placa-lg">{aprobada.chapa}</span></div>
          <p className="center muted" style={{ margin: 0 }}>
            Quedó «Finalizada» con {aprobada.lineas.length === 1 ? "1 repuesto" : `${aprobada.lineas.length} repuestos`} ({gs(aprobada.lineas.reduce((s, l) => s + l.total, 0))}).
          </p>
          {aprobada.avisos.map((a) => <div key={a} className="alert alert-warn small">{a}</div>)}
          <Link className="btn btn-primary btn-lg" href="/verificar">Volver a Para verificar</Link>
        </div>
      </main>
    );
  }

  const listoParaAprobar = puedeAprobar && editable && !ocupado && (lineas.length > 0 || sinRepuestos);

  return (
    <main className="wrap">
      <div className="finalizar-grid">
        <div>
          <section className="card stack" style={{ gap: 8 }}>
            <div className="row between wrap-row">
              <span className="placa placa-lg">{orden.chapa}</span>
              {orden.dias !== null && <span className="badge">{orden.dias} días en taller</span>}
            </div>
            <div className="small muted">{orden.vehiculo}</div>
            <div style={{ fontWeight: 600 }}>{orden.tipo ?? "Sin tipo"}</div>
            <div className="small">{orden.descripcion ?? <span className="muted">Sin descripción</span>}</div>
            <div className="small muted">Mecánico: {orden.mecanico ?? "sin asignar"}</div>
            <div className="small muted">Chofer: {orden.chofer ?? "sin chofer asignado"}</div>
            {orden.cliente && <div className="small muted">{orden.cliente}</div>}
            {orden.odometroOrden > 0 && <div className="small muted">Odómetro al finalizar: {new Intl.NumberFormat("es-PY").format(orden.odometroOrden)} km</div>}
          </section>
          {!editable && <div className="alert alert-warn">Esta orden ya no está en «Listo para verificar».</div>}

          <section className="card stack" style={{ gap: 10 }}>
            <div className="row between">
              <strong>Repuestos utilizados</strong>
              <strong>{gs(total)}</strong>
            </div>
            {lineas.length === 0 && <span className="small muted">Todavía no hay repuestos cargados.</span>}
            {lineas.map((l) => (
              <div key={l.id} className="row between" style={{ alignItems: "flex-start", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{l.producto}</span>
                  <span className="small muted">{l.cantidad} × {gs(l.costoUnitario)} = {gs(l.total)}</span>
                </div>
                {editable && puedeRepuestos && (
                  <button type="button" className="btn btn-ghost small" disabled={ocupado} onClick={() => quitar(l)} aria-label={`Quitar ${l.producto}`}>Quitar</button>
                )}
              </div>
            ))}
          </section>
          {historial}
        </div>

        <div>
          {editable && puedeRepuestos && (
            <form className="card stack" style={{ gap: 12 }} onSubmit={agregar}>
              <strong>Agregar repuesto</strong>
              {producto ? (
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{producto.nombre}</span>
                    <span className="small muted">Costo en Odoo: {gs(producto.costo)}{producto.unidad ? ` por ${producto.unidad}` : ""}</span>
                  </div>
                  <button type="button" className="btn btn-ghost small" onClick={limpiar}>Cambiar</button>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="prod">Repuesto</label>
                  <input id="prod" className="input" placeholder="Buscar por nombre o código" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
                  {resultados?.q === busqueda && resultados.lista.length === 0 && <span className="small muted">No hay repuestos con ese nombre.</span>}
                  {resultados?.q === busqueda && resultados.lista.length > 0 && (
                    <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Repuestos encontrados">
                      {resultados.lista.map((p) => (
                        <button key={p.id} type="button" role="option" aria-selected={false} className="card row between" style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px" }} onClick={() => elegir(p)}>
                          <span>{p.nombre}</span>
                          <span className="small muted" style={{ whiteSpace: "nowrap" }}>{gs(p.costo)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="cant">Cantidad</label>
                  <input id="cant" className="input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label htmlFor="costo">Costo unitario (Gs.)</label>
                  <input id="costo" className="input" inputMode="numeric" value={costo} onChange={(e) => setCosto(e.target.value)} />
                </div>
              </div>
              <button className="btn" disabled={!producto || ocupado || !(cant(cantidad) > 0)}>{ocupado ? "Guardando en Odoo…" : "Agregar repuesto"}</button>
            </form>
          )}

          {editable && puedeAprobar && lineas.length === 0 && (
            <label className="check">
              <input type="checkbox" checked={sinRepuestos} onChange={(e) => setSinRepuestos(e.target.checked)} />
              <span><strong>No se usaron repuestos</strong><br /><span className="small muted">Marcalo solo si el trabajo no llevó ningún repuesto.</span></span>
            </label>
          )}

          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          {editable && puedeAprobar && (
            <div className="bottom-bar">
              <div className="stack" style={{ gap: 6 }}>
                <button className="btn btn-primary btn-block btn-lg" disabled={!listoParaAprobar} onClick={aprobar}>
                  {ocupado ? "Guardando en Odoo…" : "Aprobar · pasa a Finalizado"}
                </button>
                <span className="tiny muted center">Total repuestos: {gs(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
