"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrdenLista } from "@/lib/ordenes";
import { MOVIMIENTOS } from "@/lib/taller";
import { ContenidoTarjetaOrden, useGps } from "@/components/tarjeta-orden";

const COLUMNAS = [
  { estado: "new", titulo: "Nuevo" },
  { estado: "to_be_paid", titulo: "Bloqueado" },
  { estado: "running", titulo: "En proceso" },
  { estado: "cancelled", titulo: "Listo para verificar" },
  { estado: "done", titulo: "Finalizado" },
] as const;

type Estado = (typeof COLUMNAS)[number]["estado"];
type Columna = { ordenes: OrdenLista[]; total: number; pagina: number; porPagina: number; cargando: boolean; error: string | null };

// Movimientos posibles: los directos (lib/taller, también volver atrás) y los dos que abren un formulario
// (el reporte del mecánico y la verificación con repuestos).
const TEXTO_DESTINO: Partial<Record<Estado, string>> = {
  new: "Soltá para volver a Nuevo",
  to_be_paid: "Soltá para bloquear",
  running: "Soltá para pasar a En proceso",
};
const DESTINOS = Object.fromEntries(
  COLUMNAS.map(({ estado: de }) => [
    de,
    [
      ...(MOVIMIENTOS[de] ?? []).map((a) => ({ a: a as Estado, texto: TEXTO_DESTINO[a as Estado] ?? `Soltá para pasar a ${a}` })),
      ...(de === "running" ? [{ a: "cancelled" as Estado, texto: "Soltá para cargar el reporte del trabajo" }] : []),
      ...(de === "cancelled" ? [{ a: "done" as Estado, texto: "Soltá para verificar y cargar repuestos" }] : []),
    ],
  ]),
) as Record<Estado, { a: Estado; texto: string }[]>;
const TITULO = Object.fromEntries(COLUMNAS.map((c) => [c.estado, c.titulo])) as Record<Estado, string>;

const VACIA: Columna = { ordenes: [], total: 0, pagina: 0, porPagina: 30, cargando: true, error: null };

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
  // Estado de los GPS: solo de las motos en «En proceso» y «Listo para verificar».
  const gps = useGps([...cols.running.ordenes, ...cols.cancelled.ordenes].map((o) => o.chapa));
  const conGps = (e: Estado) => e === "running" || e === "cancelled";

  const permitido = (de: Estado, a: Estado) =>
    de === "running" && a === "cancelled" ? acciones.finalizar : de === "cancelled" && a === "done" ? acciones.verificar : acciones.iniciar;
  const destinosDe = (de: Estado) => (DESTINOS[de] ?? []).filter((d) => permitido(de, d.a));
  const puedeMover = (de: Estado) => destinosDe(de).length > 0;

  // Al soltar la tarjeta en otra columna.
  function llevar(de: Estado, a: Estado, o: OrdenLista) {
    if (!permitido(de, a)) return;
    if (a === "cancelled") router.push(`/ordenes/${o.id}/finalizar`);
    else if (a === "done") router.push(`/verificar/${o.id}`);
    else void mover(o, de, a);
  }

  // Las etapas se cambian solo arrastrando. Tocar la tarjeta abre su pantalla de trabajo: En proceso, el reporte;
  // Listo para verificar, la verificación (si tiene ese permiso); lo demás, el detalle de la orden.
  const destinoDe = (estado: Estado, o: OrdenLista) =>
    estado === "running" && acciones.finalizar
      ? `/ordenes/${o.id}/finalizar`
      : estado === "cancelled" && acciones.verificar
        ? `/verificar/${o.id}`
        : `/ordenes/${o.id}`;

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
                return (
                  <article
                    key={o.id}
                    className="card stack tablero-card"
                    style={{ gap: 6 }}
                    draggable={movible}
                    data-movible={movible || undefined}
                    data-arrastrando={arrastre?.orden.id === o.id || undefined}
                    // Toda la tarjeta abre lo mismo, también la placa (un enlace, para teclado y lector de pantalla).
                    onClick={() => moviendo === null && router.push(destinoDe(c.estado, o))}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(o.id));
                      setArrastre({ orden: o, desde: c.estado });
                    }}
                    onDragEnd={() => {
                      setArrastre(null);
                      setEncima(null);
                    }}
                  >
                    <ContenidoTarjetaOrden o={o} href={destinoDe(c.estado, o)} finalizada={c.estado === "done"} gps={conGps(c.estado) ? gps : null} />
                    {moviendo === o.id && <div className="small muted">Moviendo…</div>}
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
