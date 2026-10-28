"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrdenLista } from "@/lib/ordenes";

const COLUMNAS = [
  { estado: "new", titulo: "Nuevo" },
  { estado: "to_be_paid", titulo: "Bloqueado" },
  { estado: "running", titulo: "En proceso" },
  { estado: "cancelled", titulo: "Listo para verificar" },
  { estado: "done", titulo: "Finalizado" },
] as const;

type Estado = (typeof COLUMNAS)[number]["estado"];
type Columna = { ordenes: OrdenLista[]; total: number; pagina: number; porPagina: number; cargando: boolean; error: string | null };

// Movimientos posibles. Nuevo → En proceso y En proceso ↔ Bloqueado son directos; los otros dos
// abren el formulario que hace el cambio (el reporte del mecánico y la verificación con repuestos).
const DESTINOS: Partial<Record<Estado, { a: Estado; texto: string }[]>> = {
  new: [{ a: "running", texto: "Soltá para pasar a En proceso" }],
  running: [
    { a: "cancelled", texto: "Soltá para cargar el reporte del trabajo" },
    { a: "to_be_paid", texto: "Soltá para bloquear" },
  ],
  to_be_paid: [{ a: "running", texto: "Soltá para volver a En proceso" }],
  cancelled: [{ a: "done", texto: "Soltá para verificar y cargar repuestos" }],
};
const TITULO = Object.fromEntries(COLUMNAS.map((c) => [c.estado, c.titulo])) as Record<Estado, string>;

const VACIA: Columna = { ordenes: [], total: 0, pagina: 0, porPagina: 30, cargando: true, error: null };
const fecha = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

export function Tablero({ acciones }: { acciones: { crear: boolean; iniciar: boolean; finalizar: boolean; verificar: boolean } }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [activa, setActiva] = useState<Estado>("running");
  const [cols, setCols] = useState<Record<Estado, Columna>>({ new: VACIA, to_be_paid: VACIA, running: VACIA, cancelled: VACIA, done: VACIA });
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const [arrastre, setArrastre] = useState<{ orden: OrdenLista; desde: Estado } | null>(null);
  const [encima, setEncima] = useState<Estado | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);

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

  // Cambio directo de estado. Se ve en la columna nueva al instante; si falla, cargar() la devuelve a su lugar.
  async function mover(o: OrdenLista, de: Estado, a: Estado) {
    setConfirmar(null);
    setMoviendo(o.id);
    setAviso(null);
    setCols((c) => ({
      ...c,
      [de]: { ...c[de], ordenes: c[de].ordenes.filter((x) => x.id !== o.id), total: c[de].total - 1 },
      [a]: { ...c[a], ordenes: [o, ...c[a].ordenes], total: c[a].total + 1 },
    }));
    try {
      const r = await fetch(`/api/ordenes/${o.id}/mover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de, a }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setAviso({ ok: false, msg: d.error ?? "No se pudo mover la orden" });
      else setAviso({ ok: !d.aviso, msg: d.aviso ?? `${o.chapa} pasó a ${TITULO[a]}.` });
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      await Promise.all([cargar(de, 1), cargar(a, 1)]);
      setMoviendo(null);
    }
  }

  // Reportar y verificar necesitan su permiso; los cambios directos, el de mover en el tablero.
  const permitido = (de: Estado, a: Estado) =>
    de === "running" && a === "cancelled" ? acciones.finalizar : de === "cancelled" ? acciones.verificar : acciones.iniciar;
  const destinosDe = (de: Estado) => (DESTINOS[de] ?? []).filter((d) => permitido(de, d.a));
  const puedeMover = (de: Estado) => destinosDe(de).length > 0;

  // Lo mismo al soltar en otra columna o al usar los botones de la tarjeta.
  function llevar(de: Estado, a: Estado, o: OrdenLista) {
    if (!permitido(de, a)) return;
    if (a === "cancelled") router.push(`/ordenes/${o.id}/finalizar`);
    else if (a === "done") router.push(`/verificar/${o.id}`);
    else void mover(o, de, a);
  }

  // Al tocar la tarjeta: Nuevo pide confirmar; En proceso abre el reporte y Listo para verificar la verificación
  // (si tiene ese permiso); lo demás abre el detalle de la orden.
  function alTocar(estado: Estado): "confirmar" | "running" | "cancelled" | "detalle" {
    if (estado === "new" && permitido("new", "running")) return "confirmar";
    if (estado === "running" && acciones.finalizar) return "running";
    if (estado === "cancelled" && acciones.verificar) return "cancelled";
    return "detalle";
  }

  function tocar(estado: Estado, o: OrdenLista) {
    const t = alTocar(estado);
    if (t === "confirmar") setConfirmar((id) => (id === o.id ? null : o.id));
    else if (t === "running") llevar("running", "cancelled", o);
    else if (t === "cancelled") llevar("cancelled", "done", o);
    else router.push(`/ordenes/${o.id}`);
  }

  const destinoArrastre = (hacia: Estado) => (arrastre ? destinosDe(arrastre.desde).find((d) => d.a === hacia) : undefined);
  const aceptaSoltar = (hacia: Estado) => destinoArrastre(hacia) !== undefined;

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
            <section
              key={c.estado}
              className="tablero-col"
              data-activa={activa === c.estado}
              data-destino={aceptaSoltar(c.estado) || undefined}
              data-encima={(encima === c.estado && aceptaSoltar(c.estado)) || undefined}
              data-apagada={(arrastre !== null && arrastre.desde !== c.estado && !aceptaSoltar(c.estado)) || undefined}
              aria-label={c.titulo}
              onDragOver={(e) => {
                if (!aceptaSoltar(c.estado)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (encima !== c.estado) setEncima(c.estado);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const a = arrastre;
                setArrastre(null);
                setEncima(null);
                if (a && aceptaSoltar(c.estado)) llevar(a.desde, c.estado, a.orden);
              }}
            >
              <header className="row between tablero-col-head">
                <strong>{c.titulo}</strong>
                <span className="badge">{col.total}</span>
              </header>
              {aceptaSoltar(c.estado) && <div className="tablero-soltar">{destinoArrastre(c.estado)?.texto}</div>}
              {col.error && <div className="alert alert-danger small">{col.error}</div>}
              {col.cargando && col.pagina === 0 && <div className="skeleton" />}
              {!col.cargando && col.ordenes.length === 0 && !col.error && <div className="small muted center" style={{ padding: 12 }}>Sin órdenes</div>}
              {col.ordenes.map((o) => {
                const movible = puedeMover(c.estado) && moviendo === null;
                const toque = alTocar(c.estado);
                const abre = toque === "detalle";
                // Bloquear / desbloquear con un botón: en el celular no se puede arrastrar.
                const cambio = c.estado === "running" ? "to_be_paid" : c.estado === "to_be_paid" ? "running" : null;
                return (
                  <article
                    key={o.id}
                    className="card stack tablero-card"
                    style={{ gap: 6 }}
                    draggable={movible}
                    data-movible={movible || undefined}
                    data-arrastrando={arrastre?.orden.id === o.id || undefined}
                    data-abre={abre || undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`${o.chapa}: ${toque === "confirmar" ? "pasar a En proceso" : toque === "running" ? "cargar el reporte del trabajo" : toque === "cancelled" ? "verificar y cargar repuestos" : "ver detalle"}`}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(o.id));
                      setArrastre({ orden: o, desde: c.estado });
                      setConfirmar(null);
                    }}
                    onDragEnd={() => {
                      setArrastre(null);
                      setEncima(null);
                    }}
                    onClick={() => moviendo === null && tocar(c.estado, o)}
                    onKeyDown={(e) => {
                      if (moviendo === null && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        tocar(c.estado, o);
                      }
                    }}
                  >
                    <div className="row between">
                      <span className="placa">{o.chapa}</span>
                      {c.estado === "done" ? (
                        <span className="badge" title={o.fechaFin ? "Fecha de fin" : "Sin fecha de fin: fecha de inicio"}>{fecha(o.fechaFin ?? o.fecha)}</span>
                      ) : (
                        o.dias !== null && <span className={`badge ${o.dias > 7 ? "badge-danger" : ""}`}>{o.dias === 0 ? "Hoy" : o.dias === 1 ? "1 día" : `${o.dias} días`}</span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.tipo ?? "Sin tipo"}</div>
                    <div className="row between" style={{ gap: 8 }}>
                      <span className="small muted">{o.mecanico ?? "Sin asignar"}</span>
                      {o.totalRepuestos > 0 && <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>Repuestos · {new Intl.NumberFormat("es-PY").format(Math.round(o.totalRepuestos))}</span>}
                    </div>
                    {cambio && permitido(c.estado, cambio) && (
                      <button
                        type="button"
                        className="btn btn-ghost small tablero-bloquear"
                        disabled={moviendo !== null}
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cambio === "to_be_paid" && !confirm(`¿Bloquear ${o.chapa}?`)) return;
                          llevar(c.estado, cambio, o);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {cambio === "to_be_paid" ? "Bloquear" : "Volver a En proceso"}
                      </button>
                    )}
                    {moviendo === o.id && <div className="small muted">Moviendo…</div>}
                    {confirmar === o.id && (
                      <div className="row" style={{ gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => llevar("new", "running", o)}>Pasar a En proceso</button>
                        <button type="button" className="btn" onClick={() => setConfirmar(null)}>Cancelar</button>
                      </div>
                    )}
                  </article>
                );
              })}
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
