"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VehiculoBuscado } from "@/lib/nueva-orden-servicio";
import { SelectorFotos, useFotos } from "@/components/selector-fotos";

type Opcion = { id: number; nombre: string };

export function FormSolicitud({ autor, puedeFinalizar }: { autor: string; puedeFinalizar: boolean }) {
  const router = useRouter();
  const fotos = useFotos();
  const [clave] = useState(() => crypto.randomUUID());
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: VehiculoBuscado[]; error?: string } | null>(null);
  const [vehiculo, setVehiculo] = useState<VehiculoBuscado | null>(null);
  const [tipos, setTipos] = useState<Opcion[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [odometro, setOdometro] = useState("");
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tipos-servicio").then((r) => r.json()).then((d) => setTipos((d.tipos ?? []).map((t: { id: number; name: string }) => ({ id: t.id, nombre: t.name })))).catch(() => {});
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

  const km = Number(odometro.replace(/\D/g, ""));
  const enProceso = vehiculo?.ordenesEnProceso.filter((o) => o.estado === "running") ?? [];
  const puedeEnviar = vehiculo && tipoId && km > 0 && observacion.trim().length >= 3 && fotos.procesando === 0 && !enviando;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEnviar || !vehiculo) return;
    setEnviando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("clave", clave);
      fd.set("vehiculoId", String(vehiculo.id));
      fd.set("tipoId", tipoId);
      fd.set("odometro", String(km));
      fd.set("observacion", observacion.trim());
      fotos.agregarAlForm(fd);
      const r = await fetch("/api/solicitudes", { method: "POST", body: fd });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => null);
      if (!r.ok) return setError(d?.error ?? `No se pudo enviar (error ${r.status}). Probá de nuevo: no se duplica.`);
      router.replace(`/solicitudes?enviada=${d.id}`);
    } catch {
      setError("Se cortó la conexión. Tocá Enviar de nuevo: no se duplica.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="wrap" style={{ paddingTop: 0 }}>
      <form className="finalizar-grid" onSubmit={enviar}>
        <div>
          <div className="alert small" style={{ background: "var(--surface-2)" }}>
            Usalo cuando hiciste un trabajo que no aparece en tu lista. El jefe de taller lo revisa y, al aprobarlo, queda cargado en Odoo a tu nombre.
          </div>
          <div className="field">
            <label htmlFor="chapa">Moto (chapa)</label>
            {vehiculo ? (
              <section className="card stack" style={{ gap: 6 }}>
                <div className="row between">
                  <span className="placa placa-lg">{vehiculo.chapa}</span>
                  <button type="button" className="btn btn-ghost small" onClick={() => { setVehiculo(null); setQ(""); setResultados(null); }}>Cambiar</button>
                </div>
                <div className="small muted">{vehiculo.nombre}</div>
                <div className="small">Chofer: {vehiculo.chofer ?? <span className="muted">sin chofer asignado</span>}</div>
              </section>
            ) : (
              <>
                <input id="chapa" className="input" autoComplete="off" autoCapitalize="characters" placeholder="Ej: 472ABSN" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 20 }} />
                {!vehiculo && busqueda.length >= 2 && resultados?.q !== busqueda && <span className="small muted">Buscando en Odoo…</span>}
                {resultados?.error && <span className="small" style={{ color: "var(--danger)" }}>{resultados.error}</span>}
                {resultados?.q === busqueda && !resultados.error && resultados.lista.length === 0 && <span className="small muted">No hay motos con esa chapa.</span>}
                {resultados?.q === busqueda && resultados.lista.length > 0 && (
                  <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Motos encontradas">
                    {resultados.lista.map((v) => (
                      <button key={v.id} type="button" role="option" aria-selected={false} className="card row between" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setVehiculo(v)}>
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

          {enProceso.length > 0 && (
            <div className="alert alert-warn stack small" style={{ gap: 8 }} role="status">
              <strong>Esta moto ya tiene un trabajo en proceso.</strong>
              <span>Si es el tuyo, reportalo desde ahí; si es otro trabajo, seguí con la solicitud.</span>
              {puedeFinalizar && enProceso.map((o) => (
                <Link key={o.id} className="btn" href={`/ordenes/${o.id}/finalizar`}>Reportar en la orden #{o.id}{o.tipo ? ` · ${o.tipo}` : ""}</Link>
              ))}
            </div>
          )}

          <div className="field">
            <label htmlFor="tipo">Tipo de trabajo</label>
            <select id="tipo" className="input" value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
              <option value="">{tipos.length ? "Elegí el tipo" : "Cargando…"}</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="km">Odómetro (km)</label>
            <input id="km" className="input" inputMode="numeric" value={odometro ? new Intl.NumberFormat("es-PY").format(km) : ""} onChange={(e) => setOdometro(e.target.value)} placeholder="Ej: 15.110" required />
          </div>
        </div>

        <div>
          <SelectorFotos estado={fotos} />
          <div className="field">
            <label htmlFor="obs">Qué trabajo hiciste</label>
            <textarea id="obs" className="input" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} placeholder="Ej: cambio de aceite, regulación de frenos…" required />
          </div>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <div className="bottom-bar">
            <div className="stack" style={{ gap: 6 }}>
              <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar}>
                {enviando ? "Enviando…" : fotos.procesando ? "Procesando fotos…" : "Enviar para aprobar"}
              </button>
              <span className="tiny muted center">Queda a nombre de {autor}</span>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
