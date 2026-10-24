"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { OrdenLista } from "@/lib/ordenes";

type Respuesta = { total: number; pagina: number; porPagina: number; ordenes: OrdenLista[] };
type Tipo = { id: number; name: string };

const DIAS_ALERTA = 7;

// Sin permiso para abrirla, la tarjeta se muestra pero no es un enlace.
function Tarjeta({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <div className="card stack" style={{ gap: 8 }}>{children}</div>;
  return <Link href={href} className="card stack" style={{ gap: 8 }}>{children}</Link>;
}

type Modo = "proceso" | "verificar";

export type Accesos = { crear: boolean; tablero: boolean; verificar: boolean; finalizar: boolean };

export function ListaOrdenes({ tienePartner, accesos, modo = "proceso" }: { tienePartner: boolean; accesos: Accesos; modo?: Modo }) {
  const router = useRouter();
  const verificar = modo === "verificar";
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [mias, setMias] = useState(false);
  const [tipo, setTipo] = useState<number | null>(null);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [pagina, setPagina] = useState(1);
  const [data, setData] = useState<Respuesta | null>(null);
  const [resultado, setResultado] = useState<{ consulta: string; error: string | null } | null>(null);

  const consulta = useMemo(() => {
    const params = new URLSearchParams({ page: String(pagina) });
    if (verificar) params.set("estado", "cancelled");
    if (qDebounced) params.set("q", qDebounced);
    if (mias) params.set("mias", "1");
    if (tipo) params.set("tipo", String(tipo));
    return params.toString();
  }, [qDebounced, mias, tipo, pagina, verificar]);
  const cargando = resultado?.consulta !== consulta;
  const error = resultado?.consulta === consulta ? resultado.error : null;

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch("/api/tipos-servicio").then((r) => r.json()).then((d) => setTipos(d.tipos ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/ordenes?${consulta}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401) return router.replace("/ingresar");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar");
        setData(d);
        setResultado({ consulta, error: null });
      })
      .catch((e) => e.name !== "AbortError" && setResultado({ consulta, error: e.message || "Sin conexión" }));
    return () => ctrl.abort();
  }, [consulta, router]);

  const filtrar = (cambio: () => void) => {
    cambio();
    setPagina(1);
  };

  const paginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1;

  return (
    <main className="wrap stack" style={{ paddingTop: 0 }}>
      {!verificar && (accesos.crear || accesos.tablero || accesos.verificar) && (
        <div className="stack solo-movil" style={{ gap: 8 }}>
          {accesos.crear && <Link href="/ordenes/nueva" className="btn btn-primary">+ Nueva orden</Link>}
          {(accesos.tablero || accesos.verificar) && (
            <div className="row" style={{ gap: 8 }}>
              {accesos.tablero && <Link href="/tablero" className="btn" style={{ flex: 1 }}>Tablero</Link>}
              {accesos.verificar && <Link href="/verificar" className="btn" style={{ flex: 1 }}>Para verificar</Link>}
            </div>
          )}
        </div>
      )}
      <div className="filtros">
        <input
          className="input"
          type="search"
          inputMode="text"
          autoCapitalize="characters"
          placeholder="Buscar por chapa"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar por chapa"
        />
        <div className="chips" role="group" aria-label="Filtros">
          <button className="chip" aria-pressed={!mias && !tipo} onClick={() => filtrar(() => { setMias(false); setTipo(null); })}>Todas</button>
          {!verificar && <button className="chip" aria-pressed={mias} onClick={() => filtrar(() => setMias((m) => !m))}>Asignadas a mí</button>}
          {tipos.map((t) => (
            <button key={t.id} className="chip" aria-pressed={tipo === t.id} onClick={() => filtrar(() => setTipo((x) => (x === t.id ? null : t.id)))}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {mias && !tienePartner && (
        <div className="alert alert-warn small">Tu usuario no está vinculado a tu contacto en Odoo. Pedile al admin que lo vincule.</div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {cargando && !data && <div className="grid-ordenes">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}

      {data && (
        <div className="small muted" aria-live="polite">
          {data.total === 1 ? "1 moto" : `${data.total} motos`}
          {cargando ? " · actualizando…" : ""}
        </div>
      )}

      {data?.ordenes.length === 0 && !cargando && (
        <div className="card center muted">
          {verificar
            ? qDebounced ? `No hay motos para verificar con "${qDebounced}".` : "No hay motos para verificar."
            : qDebounced ? `No hay motos en proceso con "${qDebounced}".` : "No hay motos en proceso."}
        </div>
      )}

      {!!data?.ordenes.length && <div className="grid-ordenes">{data.ordenes.map((o) => (
        <Tarjeta key={o.id} href={verificar ? `/verificar/${o.id}` : accesos.finalizar ? `/ordenes/${o.id}/finalizar` : null}>
          <div className="row between">
            <span className="placa">{o.chapa}</span>
            {o.dias !== null && (
              <span className={`badge ${o.dias > DIAS_ALERTA ? "badge-danger" : ""}`}>
                {o.dias === 0 ? "Hoy" : o.dias === 1 ? "1 día" : `${o.dias} días`}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600 }}>{o.tipo ?? "Sin tipo"}</div>
          {o.descripcion && <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descripcion}</div>}
          <div className="row between small muted">
            <span>{o.vehiculo.split("/").slice(0, 2).join(" ")}</span>
            <span>{o.mecanico ?? "Sin asignar"}</span>
          </div>
        </Tarjeta>
      ))}</div>}

      {paginas > 1 && (
        <div className="row between">
          <button className="btn" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
          <span className="small muted">Página {pagina} de {paginas}</span>
          <button className="btn" disabled={pagina >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </main>
  );
}
