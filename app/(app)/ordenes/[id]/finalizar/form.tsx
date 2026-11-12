"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
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

// Borrador del odómetro y la observación: si lo interrumpen y la app se recarga, no se pierde lo escrito.
// Las fotos no se guardan (pesan demasiado): hay que volver a sacarlas.
const claveBorrador = (ordenId: number) => `finalizar-borrador:${ordenId}`;

function leerBorrador(ordenId: number): { odometro: string; observacion: string } | null {
  try {
    const b = JSON.parse(localStorage.getItem(claveBorrador(ordenId)) ?? "null");
    return b && typeof b.odometro === "string" && typeof b.observacion === "string" ? b : null;
  } catch {
    return null;
  }
}

function guardarBorrador(ordenId: number, odometro: string, observacion: string) {
  try {
    if (odometro || observacion) localStorage.setItem(claveBorrador(ordenId), JSON.stringify({ odometro, observacion }));
    else localStorage.removeItem(claveBorrador(ordenId));
  } catch {}
}

type Props = {
  orden: DetalleOrden;
  mecanico: string;
  repuestos: LineaRepuesto[] | null;
  gps: { puedeBloquear: boolean } | null;
  historial: React.ReactNode;
};

const sinCambios = () => () => {};

// El borrador está en el navegador: el formulario se arma de nuevo al montar, ya con lo guardado.
export function FormFinalizar(props: Props) {
  const montado = useSyncExternalStore(sinCambios, () => true, () => false);
  return <Formulario key={montado ? "navegador" : "servidor"} {...props} borrador={montado ? leerBorrador(props.orden.id) : null} />;
}

function Formulario({ orden, mecanico, repuestos, gps, historial, borrador }: Props & { borrador: { odometro: string; observacion: string } | null }) {
  const router = useRouter();
  const fotosEstado = useFotos();
  const procesando = fotosEstado.procesando;
  const [odometro, setOdometro] = useState(borrador?.odometro ?? "");
  const [confirmaKm, setConfirmaKm] = useState(false);
  const [observacion, setObservacion] = useState(borrador?.observacion ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentable?: boolean } | null>(null);

  // Cada cambio actualiza el borrador.
  const guardar = (o: string, obs: string) => guardarBorrador(orden.id, o, obs);

  // 0 vale (moto sin odómetro o que no marca); vacío no.
  const digitos = odometro.replace(/\D/g, "");
  const hayKm = digitos !== "";
  const km = Number(digitos);
  const kmMenor = km > 0 && orden.ultimoOdometro > 0 && km < orden.ultimoOdometro;
  const puedeEnviar = hayKm && (!kmMenor || confirmaKm) && procesando === 0 && !enviando;

  const yaFinalizada = orden.estado !== "running";
  // Por qué no se puede finalizar todavía: va pegado al botón, que si no queda apagado sin explicación.
  const falta = yaFinalizada
    ? "Esta orden ya no está en proceso."
    : !hayKm
      ? "Falta el odómetro (si la moto no tiene, poné 0)."
      : kmMenor && !confirmaKm
        ? "Marcá la casilla del odómetro para confirmar el número."
        : procesando
          ? "Esperá a que terminen de procesarse las fotos."
          : null;

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
      guardarBorrador(orden.id, "", "");
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
      {yaFinalizada && <div className="alert alert-warn">Esta orden ya no está en proceso.</div>}
      {/* En la PC: datos | fotos y, debajo, odómetro | observación, cada par a la misma altura. */}
      <div className="finalizar-grilla">
        <section className="card stack finalizar-info" style={{ gap: 8 }}>
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

        <div className="finalizar-fotos">
          <SelectorFotos estado={fotosEstado} />
        </div>

        <div className="field finalizar-odo">
          <label htmlFor="odo">Odómetro (km)</label>
          <input
            id="odo"
            className="input"
            inputMode="numeric"
            autoComplete="off"
            placeholder={orden.ultimoOdometro ? `Último: ${fmt(orden.ultimoOdometro)}` : "Ej: 15230"}
            value={hayKm ? fmt(km) : ""}
            onChange={(e) => { setOdometro(e.target.value); setConfirmaKm(false); guardar(e.target.value, observacion); }}
            style={{ fontFamily: "var(--font-mono)", fontSize: 22 }}
          />
          <span className="small muted">
            {orden.ultimoOdometro ? `Último registrado: ${fmt(orden.ultimoOdometro)} km.` : "No hay odómetro registrado para esta moto."} Si la moto no tiene odómetro o no marca, poné 0.
          </span>
          {kmMenor && (
            <label className="alert alert-warn row" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={confirmaKm} onChange={(e) => setConfirmaKm(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
              <span>Es menor que el último ({fmt(orden.ultimoOdometro)} km). Revisá el número. Si está bien, marcá esta casilla.</span>
            </label>
          )}
        </div>

        <div className="field finalizar-obs">
          <label htmlFor="obs">Observación <span className="muted small">(opcional)</span></label>
          <textarea id="obs" className="input" placeholder="Qué hiciste, qué repuestos cambiaste, qué falta…" value={observacion} onChange={(e) => { setObservacion(e.target.value); guardar(odometro, e.target.value); }} maxLength={4000} />
        </div>
      </div>

      {gps && <PanelGps ordenId={orden.id} chapa={orden.chapa} puedeBloquear={gps.puedeBloquear} />}
      {repuestos && <CajaRepuestos ordenId={orden.id} lineasIniciales={repuestos} editable />}

      {/* Finalizar va al final, después de revisar GPS y repuestos. */}
      <div className="small muted">
        Al finalizar, la orden pasa a «Listo para verificar» para que el jefe cargue los repuestos.
        {!orden.tieneChofer && " Como la moto no tiene chofer, queda «Para entregar»."}
      </div>

      <div className="bottom-bar">
        <div className="stack" style={{ gap: 6 }}>
          {/* El error va junto al botón: en el celular el botón está fijo abajo y el resto queda fuera de la vista. */}
          {error && (
            <div className="alert alert-danger small" role="alert">
              {error.msg}
              {error.reintentable && " Podés reintentar: lo que ya se guardó no se repite."}
            </div>
          )}
          {error?.reintentable ? (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : "Reintentar"}
            </button>
          ) : (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar || yaFinalizada} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : procesando ? "Procesando fotos…" : "Finalizar trabajo"}
            </button>
          )}
          <span className="tiny muted center" aria-live="polite">{!enviando && falta && !error?.reintentable ? falta : `Finaliza como ${mecanico}`}</span>
        </div>
      </div>

      {historial}
    </main>
  );
}
