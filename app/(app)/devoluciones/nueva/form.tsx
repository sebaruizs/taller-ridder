"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VehiculoBuscado } from "@/lib/nueva-orden-servicio";
import { MIN_FOTOS, TIPOS_DEVOLUCION, TIPO_NOMBRE, type TipoDevolucion } from "@/lib/devoluciones-dominio";
import { SelectorFotos, useFotos } from "@/components/selector-fotos";

const AYUDA: Record<TipoDevolucion, string> = {
  devolucion: "El chofer la trajo y la entregó.",
  recupero: "La fuimos a buscar o la trajo la grúa.",
};

// Recepción de una moto que vuelve: tipo, chapa, fotos y cómo llegó. Lo mismo que antes se mandaba al grupo de WhatsApp.
export function FormDevolucion({ autor }: { autor: string }) {
  const router = useRouter();
  const fotos = useFotos();
  const [tipo, setTipo] = useState<TipoDevolucion | null>(null);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: VehiculoBuscado[]; error?: string } | null>(null);
  const [vehiculo, setVehiculo] = useState<VehiculoBuscado | null>(null);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<{ chapa: string; tipo: TipoDevolucion } | null>(null);

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
  const falta = !tipo
    ? "Elegí si es una devolución o un recupero."
    : !vehiculo
      ? "Buscá la moto por la chapa."
      : fotos.procesando > 0
        ? "Esperá a que terminen de procesarse las fotos."
        : fotos.fotos.length < MIN_FOTOS
          ? "Sacá al menos una foto de la moto."
          : observacion.trim().length < 3
            ? "Escribí cómo llegó la moto."
            : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (falta || enviando || !vehiculo || !tipo) return;
    setEnviando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("tipo", tipo);
      fd.set("vehiculoId", String(vehiculo.id));
      fd.set("observacion", observacion.trim());
      fotos.agregarAlForm(fd);
      const r = await fetch("/api/devoluciones", { method: "POST", body: fd });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo guardar la recepción");
      setLista({ chapa: d.devolucion.chapa, tipo: d.devolucion.tipo });
    } catch {
      setError("Se cortó la conexión. Revisá en la lista si se guardó antes de intentar de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (lista) {
    return (
      <main className="wrap">
        <div className="stack form-angosto" style={{ gap: 16, margin: "0 auto", paddingTop: 16 }}>
          <div className="success-mark" aria-hidden>✓</div>
          <h2 className="center" style={{ margin: 0 }}>{TIPO_NOMBRE[lista.tipo]} registrada</h2>
          <div className="center"><span className="placa placa-lg">{lista.chapa}</span></div>
          <p className="center muted" style={{ margin: 0 }}>Quedó guardada con sus fotos y se ve en el perfil del vehículo en Cobranzas.</p>
          <Link className="btn btn-primary btn-lg" href="/devoluciones">Ver devoluciones</Link>
          <button className="btn" onClick={() => window.location.reload()}>Registrar otra</button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ paddingTop: 0 }}>
      <form className="finalizar-grid" onSubmit={guardar}>
        <div>
          <fieldset className="field devolucion-tipos">
            <legend className="label">¿Cómo volvió la moto?</legend>
            {TIPOS_DEVOLUCION.map((t) => (
              <label key={t} className="check" data-elegido={tipo === t || undefined}>
                <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} />
                <span><strong>{TIPO_NOMBRE[t]}</strong><br /><span className="small muted">{AYUDA[t]}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="chapa">Moto (chapa)</label>
            {vehiculo ? (
              <section className="card stack" style={{ gap: 6 }}>
                <div className="row between">
                  <span className="placa placa-lg">{vehiculo.chapa}</span>
                  <button type="button" className="btn btn-ghost small" onClick={() => { setVehiculo(null); setQ(""); setResultados(null); }}>Cambiar</button>
                </div>
                <div className="small muted">{vehiculo.nombre}</div>
                <div className="small">La tenía: {vehiculo.chofer ?? <span className="muted">sin chofer asignado</span>}</div>
                {vehiculo.estado && <div className="small muted">Estado en Odoo: {vehiculo.estado}{vehiculo.activo ? "" : " · archivada"}</div>}
              </section>
            ) : (
              <>
                <input id="chapa" className="input" autoComplete="off" autoCapitalize="characters" placeholder="Ej: 827ABTI" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 20 }} />
                {buscando && <span className="small muted">Buscando en Odoo…</span>}
                {resultados?.error && <span className="small" style={{ color: "var(--danger)" }}>{resultados.error}</span>}
                {resultados?.q === busqueda && !resultados.error && resultados.lista.length === 0 && <span className="small muted">No hay motos con esa chapa.</span>}
                {resultados?.q === busqueda && resultados.lista.length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {resultados.lista.map((v) => (
                      <button key={v.id} type="button" className="card row between" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => { setVehiculo(v); setError(null); }}>
                        <span className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
                          <span className="placa">{v.chapa}</span>
                          <span className="small muted">{v.nombre.split("/").slice(0, 2).join(" ")} · {v.chofer ?? "sin chofer"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <SelectorFotos estado={fotos} titulo="Fotos de la moto" opcional={false} />
          <div className="field">
            <label htmlFor="obs">Cómo llegó</label>
            <textarea id="obs" className="input" placeholder="Ej: sin documentos, sin llave. Escape dañado y pérdida en el retén del amortiguador izquierdo." value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={2000} />
            <span className="small muted">Piezas cambiadas o dañadas, si trae documentos y llave, y cualquier faltante.</span>
          </div>
          <div className="small muted">La recibe: {autor}</div>
          <div className="bottom-bar">
            <div className="stack" style={{ gap: 6 }}>
              {error && <div className="alert alert-danger small" role="alert">{error}</div>}
              <button className="btn btn-primary btn-block btn-lg" disabled={Boolean(falta) || enviando}>{enviando ? "Guardando…" : "Guardar recepción"}</button>
              {falta && <span className="tiny muted center">{falta}</span>}
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
