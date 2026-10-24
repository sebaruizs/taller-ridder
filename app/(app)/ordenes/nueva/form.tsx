"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VehiculoBuscado } from "@/lib/nueva-orden-servicio";
import type { OrdenExistente } from "@/lib/crear-orden";
import { SelectorFotos, useFotos } from "@/components/selector-fotos";

type Opcion = { id: number; nombre: string };
type Creada = { ordenId: number; chapa: string; avisos: string[] };

function AvisoEnProceso({ ordenes }: { ordenes: OrdenExistente[] }) {
  return (
    <div className="alert alert-warn stack" style={{ gap: 8 }} role="alert">
      <strong>Esta moto ya tiene {ordenes.length === 1 ? "una orden" : `${ordenes.length} órdenes`} en proceso.</strong>
      <span className="small">Para no duplicar, abrí la existente en vez de crear otra.</span>
      {ordenes.map((o) => (
        <Link key={o.id} className="btn" href={`/ordenes/${o.id}/finalizar`}>
          Abrir orden #{o.id}{o.tipo ? ` · ${o.tipo}` : ""}{o.fecha ? ` · ${o.fecha.split("-").reverse().join("/")}` : ""}
        </Link>
      ))}
    </div>
  );
}

export function FormNuevaOrden({ autor }: { autor: string }) {
  const router = useRouter();
  const fotos = useFotos();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: VehiculoBuscado[]; error?: string } | null>(null);
  const [vehiculo, setVehiculo] = useState<VehiculoBuscado | null>(null);
  const [tipos, setTipos] = useState<Opcion[]>([]);
  const [mecanicos, setMecanicos] = useState<Opcion[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mecanicoId, setMecanicoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicadas, setDuplicadas] = useState<OrdenExistente[] | null>(null);
  const [creada, setCreada] = useState<Creada | null>(null);

  useEffect(() => {
    fetch("/api/tipos-servicio").then((r) => r.json()).then((d) => setTipos((d.tipos ?? []).map((t: { id: number; name: string }) => ({ id: t.id, nombre: t.name })))).catch(() => {});
    fetch("/api/mecanicos").then((r) => r.json()).then((d) => setMecanicos(d.mecanicos ?? [])).catch(() => {});
  }, []);

  const busqueda = q.replace(/\s+/g, "").toUpperCase();
  useEffect(() => {
    if (vehiculo || busqueda.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/vehiculos?chapa=${encodeURIComponent(busqueda)}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (r.status === 401) return router.replace("/ingresar");
          const d = await r.json();
          setResultados(r.ok ? { q: busqueda, lista: d.vehiculos } : { q: busqueda, lista: [], error: d.error });
        })
        .catch((e) => e.name !== "AbortError" && setResultados({ q: busqueda, lista: [], error: "Sin conexión" }));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [busqueda, vehiculo, router]);

  const buscando = !vehiculo && busqueda.length >= 2 && resultados?.q !== busqueda;
  const enProceso = duplicadas ?? (vehiculo?.ordenesEnProceso.length ? vehiculo.ordenesEnProceso : null);
  const puedeCrear = vehiculo && !enProceso && tipoId && descripcion.trim().length >= 3 && fotos.procesando === 0 && !enviando;

  function elegir(v: VehiculoBuscado) {
    setVehiculo(v);
    setDuplicadas(null);
    setError(null);
  }

  function cambiarMoto() {
    setVehiculo(null);
    setDuplicadas(null);
    setQ("");
    setResultados(null);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeCrear || !vehiculo) return;
    setEnviando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("vehiculoId", String(vehiculo.id));
      fd.set("tipoId", tipoId);
      fd.set("descripcion", descripcion.trim());
      if (mecanicoId) fd.set("mecanicoPartnerId", mecanicoId);
      fotos.agregarAlForm(fd);
      const r = await fetch("/api/ordenes", { method: "POST", body: fd });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.existentes) return setDuplicadas(d.existentes);
      if (!r.ok) return setError(d.error ?? "No se pudo crear la orden");
      setCreada(d);
    } catch {
      setError("Se cortó la conexión. Revisá en la lista si la orden se creó antes de intentar de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (creada) {
    return (
      <main className="wrap">
        <div className="stack form-angosto" style={{ gap: 16, margin: "0 auto", paddingTop: 16 }}>
          <div className="success-mark" aria-hidden>✓</div>
          <h2 className="center" style={{ margin: 0 }}>Orden #{creada.ordenId} creada</h2>
          <div className="center"><span className="placa placa-lg">{creada.chapa}</span></div>
          <p className="center muted" style={{ margin: 0 }}>Quedó en proceso en Odoo, con una nota de quién la cargó.</p>
          {creada.avisos.map((a) => <div key={a} className="alert alert-warn small">{a}</div>)}
          <Link className="btn btn-primary btn-lg" href="/ordenes">Ver motos en proceso</Link>
          <button className="btn" onClick={() => window.location.reload()}>Cargar otra orden</button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ paddingTop: 0 }}>
      <form className="finalizar-grid" onSubmit={crear}>
        <div>
          <div className="field">
            <label htmlFor="chapa">Moto (chapa)</label>
            {vehiculo ? (
              <section className="card stack" style={{ gap: 6 }}>
                <div className="row between">
                  <span className="placa placa-lg">{vehiculo.chapa}</span>
                  <button type="button" className="btn btn-ghost small" onClick={cambiarMoto}>Cambiar</button>
                </div>
                <div className="small muted">{vehiculo.nombre}</div>
                <div className="small">Chofer: {vehiculo.chofer ?? <span className="muted">sin chofer asignado</span>}</div>
                {vehiculo.estado && <div className="small muted">Estado en Odoo: {vehiculo.estado}{vehiculo.activo ? "" : " · archivada"}</div>}
              </section>
            ) : (
              <>
                <input
                  id="chapa"
                  className="input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Ej: 472ABSN"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}
                />
                {buscando && <span className="small muted">Buscando en Odoo…</span>}
                {resultados?.error && <span className="small" style={{ color: "var(--danger)" }}>{resultados.error}</span>}
                {resultados?.q === busqueda && !resultados.error && resultados.lista.length === 0 && (
                  <span className="small muted">No hay motos con esa chapa.</span>
                )}
                {resultados?.q === busqueda && resultados.lista.length > 0 && (
                  <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Motos encontradas">
                    {resultados.lista.map((v) => (
                      <button key={v.id} type="button" role="option" aria-selected={false} className="card row between" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => elegir(v)}>
                        <span className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
                          <span className="placa">{v.chapa}</span>
                          <span className="small muted">{v.nombre.split("/").slice(0, 2).join(" ")} · {v.chofer ?? "sin chofer"}</span>
                        </span>
                        {v.ordenesEnProceso.length > 0 && <span className="badge badge-danger">En taller</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {enProceso && <AvisoEnProceso ordenes={enProceso} />}

          <div className="field">
            <label htmlFor="tipo">Tipo de servicio</label>
            <select id="tipo" className="input" value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
              <option value="">{tipos.length ? "Elegí el tipo" : "Cargando…"}</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="mecanico">Mecánico <span className="muted small">(opcional)</span></label>
            <select id="mecanico" className="input" value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)}>
              <option value="">Sin asignar</option>
              {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="field">
            <label htmlFor="desc">Qué pide el chofer</label>
            <textarea id="desc" className="input" placeholder="Ej: hace ruido el motor al acelerar, revisar frenos…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} required />
          </div>

          <SelectorFotos estado={fotos} titulo="Fotos de recepción" />

          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          <div className="bottom-bar">
            <div className="stack" style={{ gap: 6 }}>
              <button className="btn btn-primary btn-block btn-lg" disabled={!puedeCrear}>
                {enviando ? "Creando en Odoo…" : fotos.procesando ? "Procesando fotos…" : "Crear orden"}
              </button>
              <span className="tiny muted center">Queda registrada como cargada por {autor}</span>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
