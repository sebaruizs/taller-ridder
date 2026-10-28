"use client";
import { useState } from "react";
import { NOMBRE_TIPO, type AccionEncendido, type EquipoGps } from "@/lib/gps-dominio";

// Estado de los GPS de una moto dentro de la tarjeta del tablero y, para quien puede, cortar o restablecer el encendido.

const hace = (iso: string | null) => {
  if (!iso) return "sin datos";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

export function GpsTarjeta({
  ordenId,
  chapa,
  equipos,
  puedeCortar,
  alAvisar,
  alCambiar,
}: {
  ordenId: number;
  chapa: string;
  equipos: EquipoGps[] | undefined;
  puedeCortar: boolean;
  alAvisar: (a: { ok: boolean; msg: string }) => void;
  alCambiar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  if (!equipos) return null;
  if (!equipos.length) return <div className="gps-sin tiny muted">Sin GPS en Traccar</div>;

  async function mandar(accion: AccionEncendido, confirmaEnMovimiento = false): Promise<void> {
    setEnviando(true);
    try {
      const r = await fetch("/api/gps/encendido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapa, accion, ordenId, confirmaEnMovimiento }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.requiereConfirmar) {
        if (confirm(`${d.error}\n\n¿Cortar igual?`)) return mandar(accion, true);
        return;
      }
      if (!r.ok) return alAvisar({ ok: false, msg: d.error ?? "No se pudo mandar el comando al GPS" });
      alAvisar({ ok: !d.enCola, msg: `${chapa}: ${d.mensaje}` });
      alCambiar();
    } catch {
      alAvisar({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  function tocar(e: React.MouseEvent, accion: AccionEncendido) {
    e.stopPropagation();
    const texto = accion === "cortar" ? `¿Cortar el encendido de ${chapa}? La moto no va a poder arrancar.` : `¿Restablecer el encendido de ${chapa}?`;
    if (confirm(texto)) void mandar(accion);
  }

  return (
    <div className="gps-lista" onClick={(e) => e.stopPropagation()}>
      {equipos.map((g) => (
        <div key={g.id} className="gps-equipo" title={g.nombre}>
          <span className="gps-punto" data-en-linea={g.enLinea || undefined} aria-hidden />
          <span className="gps-tipo">{NOMBRE_TIPO[g.tipo]}</span>
          <span className="tiny muted">
            {g.enLinea ? "En línea" : `Sin señal · ${hace(g.ultimaConexion)}`}
            {g.encendido !== null && ` · ${g.encendido ? "Encendida" : "Apagada"}`}
            {g.kmh ? ` · ${g.kmh} km/h` : ""}
            {g.tipo !== "monedas" && ` · ${g.bloqueado === null ? "Corte ¿?" : g.bloqueado ? "Corte activo" : "Sin corte"}`}
          </span>
          {g.corta && puedeCortar && (
            <span className="gps-acciones">
              {g.bloqueado !== true && (
                <button type="button" className="gps-boton gps-cortar" disabled={enviando} onClick={(e) => tocar(e, "cortar")}>
                  Cortar encendido
                </button>
              )}
              {g.bloqueado !== false && (
                <button type="button" className="gps-boton" disabled={enviando} onClick={(e) => tocar(e, "restablecer")}>
                  Restablecer
                </button>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
