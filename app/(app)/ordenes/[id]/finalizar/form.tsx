"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleOrden } from "@/lib/ordenes";
import { SelectorFotos, useFotos } from "@/components/selector-fotos";
import { CajaRepuestos } from "@/components/repuestos-orden";
import { PanelGps } from "@/components/gps-tarjeta";
import type { LineaRepuesto } from "@/lib/taller";

const fmt = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

function claveGuardada(ordenId: number): string {
  const k = `finalizar:${ordenId}`;
  try {
    const v = localStorage.getItem(k);
    if (v) return v;
    const nueva = crypto.randomUUID();
    localStorage.setItem(k, nueva);
    return nueva;
  } catch {
    return crypto.randomUUID();
  }
}

function olvidarClave(ordenId: number) {
  try {
    localStorage.removeItem(`finalizar:${ordenId}`);
  } catch {}
}

export function FormFinalizar({
  orden,
  mecanico,
  repuestos,
  gps,
  historial,
}: {
  orden: DetalleOrden;
  mecanico: string;
  repuestos: LineaRepuesto[] | null;
  gps: { puedeBloquear: boolean } | null;
  historial: React.ReactNode;
}) {
  const router = useRouter();
  const fotosEstado = useFotos();
  const procesando = fotosEstado.procesando;
  const [odometro, setOdometro] = useState("");
  const [confirmaKm, setConfirmaKm] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentable?: boolean } | null>(null);

  const km = Number(odometro.replace(/\D/g, ""));
  const kmMenor = km > 0 && orden.ultimoOdometro > 0 && km < orden.ultimoOdometro;
  const puedeEnviar = km > 0 && (!kmMenor || confirmaKm) && procesando === 0 && !enviando;

  const yaFinalizada = orden.estado !== "running";

  // Reintentar = mismo envío con la misma clave; el servidor sigue desde el paso que falló.
  async function enviar() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    const clave = claveGuardada(orden.id);
    try {
      const fd = new FormData();
      fd.set("clave", clave);
      fd.set("odometro", String(km));
      fd.set("observacion", observacion.trim());
      fotosEstado.agregarAlForm(fd);
      const r = await fetch(`/api/ordenes/${orden.id}/finalizar`, { method: "POST", body: fd });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        // Sin JSON = cortó el servidor o el proxy, no la app: se reintenta con la misma clave
        // para seguir desde el paso que quedó (sin volver a subir las fotos).
        if (!d) {
          setError({ msg: `El servidor no respondió bien (error ${r.status}). Tocá Reintentar: sigue desde donde quedó.`, reintentable: true });
          return;
        }
        if (!d.reintentable) olvidarClave(orden.id);
        setError({ msg: d.error ?? "No se pudo finalizar", reintentable: d.reintentable });
        return;
      }
      olvidarClave(orden.id);
      router.replace(`/ordenes/${orden.id}/listo?clave=${clave}`);
    } catch {
      setError({ msg: "Se cortó la conexión.", reintentable: true });
    } finally {
      setEnviando(false);
    }
  }

  const chofer = useMemo(() => orden.chofer ?? "sin chofer asignado", [orden.chofer]);

  return (
    <main className="wrap wrap-ancho stack" style={{ paddingTop: 0, gap: 16 }}>
      <div className="finalizar-grid">
      <div>
      <section className="card stack" style={{ gap: 8 }}>
        <div className="row between wrap-row">
          <span className="placa placa-lg">{orden.chapa}</span>
          {orden.dias !== null && <span className={`badge ${orden.dias > 7 ? "badge-danger" : ""}`}>{orden.dias} días en taller</span>}
        </div>
        <div className="small muted">{orden.vehiculo}</div>
        <div style={{ fontWeight: 600 }}>{orden.tipo ?? "Sin tipo"}</div>
        <div className="small">{orden.descripcion ?? <span className="muted">Sin descripción</span>}</div>
        <div className="small muted">Chofer: {chofer}</div>
        {orden.cliente && <div className="small muted">{orden.cliente}</div>}
      </section>

      {yaFinalizada && <div className="alert alert-warn">Esta orden ya no está en proceso.</div>}

      <div className="field">
        <label htmlFor="odo">Odómetro (km)</label>
        <input
          id="odo"
          className="input"
          inputMode="numeric"
          autoComplete="off"
          placeholder={orden.ultimoOdometro ? `Último: ${fmt(orden.ultimoOdometro)}` : "Ej: 15230"}
          value={odometro ? fmt(km) : ""}
          onChange={(e) => { setOdometro(e.target.value); setConfirmaKm(false); }}
          style={{ fontFamily: "var(--font-mono)", fontSize: 22 }}
        />
        <span className="small muted">
          {orden.ultimoOdometro ? `Último registrado: ${fmt(orden.ultimoOdometro)} km` : "No hay odómetro registrado para esta moto."}
        </span>
        {kmMenor && (
          <label className="alert alert-warn row" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirmaKm} onChange={(e) => setConfirmaKm(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
            <span>Es menor que el último ({fmt(orden.ultimoOdometro)} km). Revisá el número. Si está bien, marcá esta casilla.</span>
          </label>
        )}
      </div>
      </div>

      <div>
      <SelectorFotos estado={fotosEstado} />

      <div className="field">
        <label htmlFor="obs">Observación <span className="muted small">(opcional)</span></label>
        <textarea id="obs" className="input" placeholder="Qué hiciste, qué repuestos cambiaste, qué falta…" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} />
      </div>

      <div className="small muted">
        Al finalizar, la orden pasa a «Listo para verificar» para que el jefe cargue los repuestos.
        {!orden.tieneChofer && " Como la moto no tiene chofer, queda «Para entregar»."}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error.msg}
          {error.reintentable && <><br />Podés reintentar: lo que ya se guardó no se repite.</>}
        </div>
      )}

      <div className="bottom-bar">
        <div className="stack" style={{ gap: 6 }}>
          {error?.reintentable ? (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : "Reintentar"}
            </button>
          ) : (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar || yaFinalizada} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : procesando ? "Procesando fotos…" : "Finalizar trabajo"}
            </button>
          )}
          <span className="tiny muted center">Finaliza como {mecanico}</span>
        </div>
      </div>
      </div>
      </div>
      {/* Debajo, a todo el ancho: repuestos (para quien puede cargarlos) e historial, como en Odoo. */}
      {gps && <PanelGps ordenId={orden.id} chapa={orden.chapa} puedeBloquear={gps.puedeBloquear} />}
      {repuestos && <CajaRepuestos ordenId={orden.id} lineasIniciales={repuestos} editable />}
      {historial}
    </main>
  );
}
