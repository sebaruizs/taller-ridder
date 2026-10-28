"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NOMBRE_TIPO, type AccionEncendido, type EquipoGps } from "@/lib/gps-dominio";

// GPS de una moto (Traccar): resumen en la tarjeta del tablero y panel completo en la orden,
// donde quien puede bloquea o desbloquea el encendido.

const hace = (iso: string | null) => {
  if (!iso) return "sin datos";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};
const fechaHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—";
const bloqueo = (g: EquipoGps) => (g.bloqueado === null ? "¿?" : g.bloqueado ? "Bloqueado" : "Desbloqueado");

// Resumen en la tarjeta del tablero: sin botones.
export function GpsTarjeta({ equipos }: { equipos: EquipoGps[] | undefined }) {
  if (!equipos) return null;
  if (!equipos.length) return <div className="gps-sin tiny muted">Sin GPS en Traccar</div>;
  return (
    <div className="gps-lista">
      {equipos.map((g) => (
        <div key={g.id} className="gps-equipo" title={g.nombre}>
          <span className="gps-punto" data-en-linea={g.enLinea || undefined} aria-hidden />
          <span className="gps-tipo">{NOMBRE_TIPO[g.tipo]}</span>
          <span className="tiny muted">
            {g.enLinea ? "En línea" : `Sin señal · ${hace(g.ultimaConexion)}`}
            {g.encendido !== null && ` · ${g.encendido ? "Encendida" : "Apagada"}`}
            {g.kmh ? ` · ${g.kmh} km/h` : ""}
            {g.tipo !== "monedas" && ` · ${bloqueo(g)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// Panel completo en la orden: todos los datos de cada equipo y Bloquear / Desbloquear en el de la chapa exacta.
export function PanelGps({ ordenId, chapa, puedeBloquear }: { ordenId: number; chapa: string; puedeBloquear: boolean }) {
  const router = useRouter();
  const [equipos, setEquipos] = useState<EquipoGps[] | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "apagado" | "error">("cargando");
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const clave = chapa.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Cada vuelta vuelve a leer Traccar (al abrir, con «Actualizar» y después de bloquear o desbloquear).
  const [vuelta, setVuelta] = useState(0);
  const leer = () => setVuelta((n) => n + 1);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/gps?chapas=${encodeURIComponent(chapa)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401) return router.replace("/ingresar");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!d.habilitado) return setEstado("apagado");
        setEquipos(d.equipos[clave] ?? []);
        setEstado("listo");
      })
      .catch((e) => e.name !== "AbortError" && setEstado("error"));
    return () => ctrl.abort();
  }, [chapa, clave, router, vuelta]);

  async function mandar(accion: AccionEncendido, confirmaEnMovimiento = false): Promise<void> {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/gps/encendido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapa, accion, ordenId, confirmaEnMovimiento }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.requiereConfirmar) {
        if (confirm(`${d.error}\n\n¿Bloquear igual?`)) return mandar(accion, true);
        return;
      }
      if (!r.ok) return setAviso({ ok: false, msg: d.error ?? "No se pudo mandar el comando al GPS" });
      setAviso({ ok: !d.enCola, msg: d.mensaje });
      // El GPS informa el cambio en unos minutos: se vuelve a leer.
      setTimeout(leer, 20_000);
      setTimeout(leer, 120_000);
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  function tocar(accion: AccionEncendido) {
    const texto = accion === "bloquear" ? `¿Bloquear el encendido de ${chapa}? La moto no va a poder arrancar.` : `¿Desbloquear el encendido de ${chapa}?`;
    if (confirm(texto)) void mandar(accion);
  }

  return (
    <section className="card stack lineas-caja" style={{ gap: 0 }}>
      <div className="row between lineas-titulo">
        <strong>GPS</strong>
        {estado === "listo" && (
          <button type="button" className="lineas-agregar" onClick={leer}>
            Actualizar
          </button>
        )}
      </div>
      {estado === "cargando" && <span className="small muted">Leyendo Traccar…</span>}
      {estado === "apagado" && <span className="small muted">El GPS no está configurado en el taller.</span>}
      {estado === "error" && <span className="small muted">No se pudo leer Traccar. Probá de nuevo en un rato.</span>}
      {estado === "listo" && equipos?.length === 0 && <span className="small muted">Esta moto no tiene GPS en Traccar.</span>}
      {estado === "listo" && equipos && equipos.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla lineas-tabla gps-tabla">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Conexión</th>
                <th>Último dato</th>
                <th>Encendido</th>
                <th>Bloqueo</th>
                <th className="num">Velocidad</th>
                <th className="num">Batería</th>
                <th>IMEI · Modelo</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {equipos.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.nombre}</strong>
                    <div className="tiny muted">{NOMBRE_TIPO[g.tipo]}{g.protocolo ? ` · ${g.protocolo}` : ""}</div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="gps-punto" data-en-linea={g.enLinea || undefined} aria-hidden /> {g.enLinea ? "En línea" : "Sin señal"}
                    <div className="tiny muted">{fechaHora(g.ultimaConexion)}</div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {fechaHora(g.ultimoDato)}
                    {g.ubicacion && (
                      <div className="tiny">
                        <a href={`https://www.google.com/maps?q=${g.ubicacion.lat},${g.ubicacion.lon}`} target="_blank" rel="noreferrer">Ver en el mapa</a>
                      </div>
                    )}
                  </td>
                  <td>{g.encendido === null ? "—" : g.encendido ? "Encendida" : "Apagada"}</td>
                  <td>{g.tipo === "monedas" ? "—" : <span className={g.bloqueado ? "rojo" : ""}>{bloqueo(g)}</span>}</td>
                  <td className="num">{g.kmh === null ? "—" : `${g.kmh} km/h`}</td>
                  <td className="num">{g.bateria === null ? "—" : `${g.bateria}%`}</td>
                  <td className="small">
                    {g.imei ?? "—"}
                    {g.modelo && <div className="tiny muted">{g.modelo}</div>}
                    {g.telefono && <div className="tiny muted">{g.telefono}</div>}
                  </td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {g.corta && puedeBloquear && (
                      <span className="gps-acciones">
                        {g.bloqueado !== true && (
                          <button type="button" className="gps-boton gps-cortar" disabled={enviando} onClick={() => tocar("bloquear")}>
                            Bloquear
                          </button>
                        )}
                        {g.bloqueado !== false && (
                          <button type="button" className="gps-boton" disabled={enviando} onClick={() => tocar("desbloquear")}>
                            Desbloquear
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aviso && <div className={`alert small ${aviso.ok ? "alert-ok" : "alert-warn"}`} role="status" style={{ marginTop: 10 }}>{aviso.msg}</div>}
      {estado === "listo" && puedeBloquear && equipos && equipos.length > 0 && !equipos.some((g) => g.corta) && (
        <span className="tiny muted" style={{ marginTop: 8 }}>Ningún equipo se llama exactamente {chapa}: no se puede bloquear desde acá.</span>
      )}
    </section>
  );
}
