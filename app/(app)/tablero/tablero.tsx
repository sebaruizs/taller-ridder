"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrdenLista } from "@/lib/ordenes";

const COLUMNAS = [
  { estado: "new", titulo: "Nuevo" },
  { estado: "running", titulo: "En proceso" },
  { estado: "cancelled", titulo: "Listo para verificar" },
  { estado: "done", titulo: "Finalizado" },
] as const;

type Estado = (typeof COLUMNAS)[number]["estado"];
type Columna = { ordenes: OrdenLista[]; total: number; pagina: number; porPagina: number; cargando: boolean; error: string | null };

const VACIA: Columna = { ordenes: [], total: 0, pagina: 0, porPagina: 30, cargando: true, error: null };
const fecha = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

export function Tablero({ acciones }: { acciones: { crear: boolean; iniciar: boolean; finalizar: boolean; verificar: boolean } }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [activa, setActiva] = useState<Estado>("running");
  const [cols, setCols] = useState<Record<Estado, Columna>>({ new: VACIA, running: VACIA, cancelled: VACIA, done: VACIA });
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cargar = useCallback(
    async (estado: Estado, pagina: number, signal?: AbortSignal) => {
      setCols((c) => ({ ...c, [estado]: { ...c[estado], cargando: true, error: null } }));
      const params = new URLSearchParams({ estado, page: String(pagina) });
      if (qDebounced) params.set("q", qDebounced);
      try {
        const r = await fetch(`/api/ordenes?${params}`, { signal });
        if (r.status === 401) return router.replace("/ingresar");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar");
        setCols((c) => ({
          ...c,
          [estado]: {
            ordenes: pagina === 1 ? d.ordenes : [...c[estado].ordenes, ...d.ordenes],
            total: d.total,
            pagina,
            porPagina: d.porPagina,
            cargando: false,
            error: null,
          },
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setCols((c) => ({ ...c, [estado]: { ...c[estado], cargando: false, error: (e as Error).message || "Sin conexión" } }));
      }
    },
    [qDebounced, router],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    COLUMNAS.forEach((c) => cargar(c.estado, 1, ctrl.signal));
    return () => ctrl.abort();
  }, [cargar]);

  async function iniciar(o: OrdenLista) {
    setMoviendo(o.id);
    setAviso(null);
    try {
      const r = await fetch(`/api/ordenes/${o.id}/iniciar`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAviso({ ok: false, msg: d.error ?? "No se pudo mover la orden" });
      } else {
        setAviso({ ok: !d.aviso, msg: d.aviso ?? `${o.chapa} pasó a En proceso.` });
      }
      await Promise.all([cargar("new", 1), cargar("running", 1)]);
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setMoviendo(null);
    }
  }

  function accion(estado: Estado, o: OrdenLista) {
    if (estado === "new" && acciones.iniciar) {
      return (
        <button className="btn btn-primary btn-block" disabled={moviendo !== null} onClick={() => iniciar(o)}>
          {moviendo === o.id ? "Moviendo…" : "Pasar a En proceso"}
        </button>
      );
    }
    if (estado === "running" && acciones.finalizar) return <Link className="btn btn-block" href={`/ordenes/${o.id}/finalizar`}>Finalizar</Link>;
    if (estado === "cancelled" && acciones.verificar) return <Link className="btn btn-primary btn-block" href={`/verificar/${o.id}`}>Verificar</Link>;
    return null;
  }

  return (
    <main className="wrap stack tablero-wrap">
      {acciones.crear && <Link href="/ordenes/nueva" className="btn btn-primary solo-movil">+ Nueva orden</Link>}
      <input className="input tablero-buscar" type="search" autoCapitalize="characters" placeholder="Buscar por chapa" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar por chapa" />
      {aviso && <div className={`alert ${aviso.ok ? "alert-ok" : "alert-danger"}`} role="status">{aviso.msg}</div>}

      <div className="tablero-tabs" role="tablist" aria-label="Columnas">
        {COLUMNAS.map((c) => (
          <button key={c.estado} role="tab" aria-selected={activa === c.estado} className="chip" onClick={() => setActiva(c.estado)}>
            {c.titulo} <span className="tablero-n">{cols[c.estado].total}</span>
          </button>
        ))}
      </div>

      <div className="tablero">
        {COLUMNAS.map((c) => {
          const col = cols[c.estado];
          const hayMas = col.ordenes.length < col.total;
          return (
            <section key={c.estado} className="tablero-col" data-activa={activa === c.estado} aria-label={c.titulo}>
              <header className="row between tablero-col-head">
                <strong>{c.titulo}</strong>
                <span className="badge">{col.total}</span>
              </header>
              {col.error && <div className="alert alert-danger small">{col.error}</div>}
              {col.cargando && col.pagina === 0 && <div className="skeleton" />}
              {!col.cargando && col.ordenes.length === 0 && !col.error && <div className="small muted center" style={{ padding: 12 }}>Sin órdenes</div>}
              {col.ordenes.map((o) => (
                <article key={o.id} className="card stack" style={{ gap: 6 }}>
                  <div className="row between">
                    <span className="placa">{o.chapa}</span>
                    {c.estado === "done" ? (
                      <span className="badge" title={o.fechaFin ? "Fecha de fin" : "Sin fecha de fin: fecha de inicio"}>{fecha(o.fechaFin ?? o.fecha)}</span>
                    ) : (
                      o.dias !== null && <span className={`badge ${o.dias > 7 ? "badge-danger" : ""}`}>{o.dias === 0 ? "Hoy" : o.dias === 1 ? "1 día" : `${o.dias} días`}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.tipo ?? "Sin tipo"}</div>
                  <div className="small muted">{o.mecanico ?? "Sin asignar"}</div>
                  {accion(c.estado, o)}
                </article>
              ))}
              {hayMas && (
                <button className="btn" disabled={col.cargando} onClick={() => cargar(c.estado, col.pagina + 1)}>
                  {col.cargando ? "Cargando…" : `Ver más (${col.total - col.ordenes.length})`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
