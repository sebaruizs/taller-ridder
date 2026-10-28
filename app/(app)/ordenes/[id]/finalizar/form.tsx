"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleOrden } from "@/lib/ordenes";
import { SelectorFotos, useFotos } from "@/components/selector-fotos";

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

// Solo el reporte del mecánico: odómetro, qué hizo y fotos. Repuestos, GPS e historial están en el detalle de la orden.
export function FormFinalizar({ orden, mecanico }: { orden: DetalleOrden; mecanico: string }) {
  const router = useRouter();
  const fotosEstado = useFotos();
  const procesando = fotosEstado.procesando;
  const [odometro, setOdometro] = useState("");
  const [confirmaKm, setConfirmaKm] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentable?: boolean } | null>(null);

  // 0 vale (moto sin odómetro o que no marca); vacío no.
  const digitos = odometro.replace(/\D/g, "");
  const hayKm = digitos !== "";
  const km = Number(digitos);
  const kmMenor = km > 0 && orden.ultimoOdometro > 0 && km < orden.ultimoOdometro;
  const puedeEnviar = hayKm && (!kmMenor || confirmaKm) && procesando === 0 && !enviando;
  // Qué falta para poder finalizar, dicho en el botón deshabilitado.
  const falta = !hayKm ? "Cargá el odómetro" : kmMenor && !confirmaKm ? "Confirmá el odómetro" : procesando ? "Procesando fotos…" : null;

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

  return (
    <main className="wrap finalizar-wrap">
      <section className="finalizar-cabecera">
        <div className="row between" style={{ gap: 10 }}>
          <span className="placa placa-lg">{orden.chapa}</span>
          {orden.dias !== null && <span className={`badge ${orden.dias > 7 ? "badge-danger" : ""}`}>{orden.dias === 1 ? "1 día" : `${orden.dias} días`} en taller</span>}
        </div>
        <strong className="finalizar-tipo">{orden.tipo ?? "Sin tipo"}</strong>
        <span className="small muted">
          {orden.vehiculo}
          {" · "}
          {orden.chofer ? `Chofer: ${orden.chofer}` : "Sin chofer asignado"}
        </span>
        {orden.descripcion && <span className="small">Pedido: {orden.descripcion}</span>}
      </section>

      {yaFinalizada && <div className="alert alert-warn">Esta orden ya no está en proceso.</div>}

      <section className="card stack finalizar-reporte">
        <h2 className="finalizar-titulo">Reporte del trabajo</h2>

        <div className="field">
          <label htmlFor="odo">Odómetro (km)</label>
          <div className="finalizar-odometro">
            <input
              id="odo"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej: 21.326"
              value={hayKm ? fmt(km) : ""}
              onChange={(e) => { setOdometro(e.target.value); setConfirmaKm(false); }}
              aria-describedby="odo-ayuda"
            />
            <span className="small muted">{orden.ultimoOdometro ? `Último: ${fmt(orden.ultimoOdometro)} km` : "Sin odómetro anterior"}</span>
          </div>
          <span id="odo-ayuda" className="small muted">Si la moto no tiene odómetro o no marca, poné 0.</span>
          {kmMenor && (
            <label className="alert alert-warn row" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={confirmaKm} onChange={(e) => setConfirmaKm(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
              <span>Es menor que el último ({fmt(orden.ultimoOdometro)} km). Revisá el número. Si está bien, marcá esta casilla.</span>
            </label>
          )}
        </div>

        <div className="field">
          <label htmlFor="obs">Qué hiciste <span className="muted small">(opcional)</span></label>
          <textarea id="obs" className="input" placeholder="Qué cambiaste, qué repuestos usaste, qué falta…" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} />
        </div>

        <SelectorFotos estado={fotosEstado} />
      </section>

      <p className="small muted" style={{ margin: 0 }}>
        Al finalizar, la orden pasa a «Listo para verificar» para que el jefe revise los repuestos.
        {!orden.tieneChofer && " Como la moto no tiene chofer, queda «Para entregar»."}
      </p>

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
              {enviando ? "Guardando en Odoo…" : yaFinalizada ? "Ya no está en proceso" : falta ?? "Finalizar trabajo"}
            </button>
          )}
          <span className="tiny muted center">Finaliza como {mecanico}</span>
        </div>
      </div>
    </main>
  );
}
