"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SIN_MONEDA } from "@/lib/monedas-dominio";
import { NOMBRE_TIPO, muestraMonedaGoogle, type AccionEncendido, type EquipoGps } from "@/lib/gps-dominio";
import { COLORES_POR_DEFECTO, colorReporte, type ColoresReporte } from "@/lib/ajustes-dominio";

// GPS de una moto (Traccar): resumen en la tarjeta del tablero y panel completo en la orden,
// donde quien puede bloquea o desbloquea el encendido.

const plural = (n: number, una: string, varias: string) => `hace ${n} ${n === 1 ? una : varias}`;
const hace = (iso: string | null) => {
  if (!iso) return "sin datos";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return plural(min, "minuto", "minutos");
  if (min < 48 * 60) return plural(Math.round(min / 60), "hora", "horas");
  const dias = Math.round(min / 1440);
  if (dias < 60) return plural(dias, "día", "días");
  const meses = Math.round(dias / 30);
  if (meses < 24) return plural(meses, "mes", "meses");
  return plural(Math.round(dias / 365), "año", "años");
};
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—";
const bloqueo = (g: EquipoGps) => (g.bloqueado === null ? "¿?" : g.bloqueado ? "Bloqueado" : "Desbloqueado");

// Resumen en la tarjeta del tablero: sin botones.
export function GpsTarjeta({
  equipos,
  monedaGoogle,
  colores = COLORES_POR_DEFECTO,
}: {
  equipos: EquipoGps[] | undefined;
  /** Lo que dice el Sheets de monedas: «Moneda Google», «Sin moneda» o el nombre de la moneda. */
  monedaGoogle?: string;
  colores?: ColoresReporte;
}) {
  if (!equipos) return null;
  // La moneda del Sheets reemplaza a la de Traccar cuando esa no reporta.
  const google = muestraMonedaGoogle(equipos, monedaGoogle);
  const lista = google ? equipos.filter((e) => e.tipo !== "monedas") : equipos;
  if (!lista.length && !google) return <div className="gps-sin tiny muted">Sin GPS en Traccar</div>;
  return (
    <div className="gps-lista">
      {google && (
        <div className="gps-equipo" title="Según el Sheets de monedas">
          <span className="gps-punto" data-google aria-hidden />
          <span className="gps-tipo">{monedaGoogle}</span>
        </div>
      )}
      {lista.map((g) => {
        // Color según hace cuánto reportó (en el anterior, si es de ahí el último reporte).
        const reporte = !g.enLinea && g.anterior ? g.anterior.ultimaConexion : (g.ultimoDato ?? g.ultimaConexion);
        const color = colorReporte(reporte, colores) ?? undefined;
        return (
        <div key={g.id} className="gps-equipo" title={g.nombre}>
          <span className="gps-punto" data-color={color} aria-hidden />
          <span className="gps-tipo">{NOMBRE_TIPO[g.tipo]}</span>
          <span className="tiny muted">
            <span data-color={color} style={{ fontWeight: 600 }}>
              {g.enLinea ? `En línea · ${hace(reporte)}` : g.anterior ? `Traccar anterior · ${hace(reporte)}` : `Sin señal · ${hace(reporte)}`}
            </span>
            {g.encendido !== null && ` · ${g.encendido ? "Encendida" : "Apagada"}`}
            {g.kmh ? ` · ${g.kmh} km/h` : ""}
            {g.tipo !== "monedas" && ` · ${bloqueo(g)}`}
          </span>
        </div>
        );
      })}
    </div>
  );
}

// Panel en la orden: por equipo, la chapa y su último reporte; Bloquear / Desbloquear en el de la chapa exacta.
export function PanelGps({ ordenId, chapa, puedeBloquear }: { ordenId: number; chapa: string; puedeBloquear: boolean }) {
  const router = useRouter();
  const [equipos, setEquipos] = useState<EquipoGps[] | null>(null);
  const [enSheets, setEnSheets] = useState<string | null>(null);
  const [colores, setColores] = useState<ColoresReporte>(COLORES_POR_DEFECTO);
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
        setEnSheets(d.monedasGoogle?.[clave] ?? null);
        if (d.colores) setColores(d.colores);
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
      {estado === "listo" && equipos && (
        <div className="gps-tarjetas">
          {/* Siempre las tres: Chapa, TC y Moneda; si falta un equipo, «No encontrado». Los demás, al final. */}
          {(["gps", "tc", "monedas"] as const).map((tipo) => {
            const g = equipos.find((e) => e.tipo === tipo);
            const esperado = tipo === "gps" ? clave : tipo === "tc" ? `${clave}-TC` : `${clave} - Monedas`;
            // La moneda no reporta en Traccar pero la moto figura en el Sheets: se muestra lo que dice ahí.
            if (tipo === "monedas" && muestraMonedaGoogle(equipos, enSheets))
              return (
                <div key={tipo} className="gps-tarjeta" data-google>
                  <span className="gps-tarjeta-tipo">
                    <span className="gps-punto" data-google aria-hidden /> {ETIQUETA[tipo]}
                  </span>
                  <strong>{enSheets}</strong>
                  <span className="tiny muted">
                    {enSheets === SIN_MONEDA ? "El Sheets de monedas dice que no tiene." : "Según el Sheets de monedas; no reporta en Traccar."}
                  </span>
                </div>
              );
            return g ? (
              <TarjetaEquipo key={tipo} g={g} colores={colores} puedeBloquear={puedeBloquear} enviando={enviando} alTocar={tocar} />
            ) : (
              <div key={tipo} className="gps-tarjeta" data-falta>
                <span className="gps-tarjeta-tipo">{ETIQUETA[tipo]}</span>
                <strong>{esperado}</strong>
                <span className="tiny muted" style={{ fontWeight: 600 }}>No encontrado</span>
              </div>
            );
          })}
          {equipos
            .filter((e) => e.tipo === "otro")
            .map((g) => (
              <TarjetaEquipo key={g.id} g={g} colores={colores} puedeBloquear={false} enviando={enviando} alTocar={tocar} />
            ))}
        </div>
      )}
      {aviso && <div className={`alert small ${aviso.ok ? "alert-ok" : "alert-warn"}`} role="status" style={{ marginTop: 10 }}>{aviso.msg}</div>}
      {estado === "listo" && puedeBloquear && equipos && !equipos.some((g) => g.corta) && (
        <span className="tiny muted" style={{ marginTop: 8 }}>Ningún equipo se llama exactamente {chapa}: no se puede bloquear desde acá.</span>
      )}
    </section>
  );
}

const ETIQUETA: Record<EquipoGps["tipo"], string> = { gps: "Chapa", tc: "TC", monedas: "Moneda", otro: "Otro" };

function TarjetaEquipo({
  g,
  colores,
  puedeBloquear,
  enviando,
  alTocar,
}: {
  g: EquipoGps;
  colores: ColoresReporte;
  puedeBloquear: boolean;
  enviando: boolean;
  alTocar: (accion: AccionEncendido) => void;
}) {
  // El último reporte del equipo: la última posición, o la última conexión si no hay posición.
  // Fuera de línea en el nuevo pero reportando en el Traccar anterior: se muestra ese reporte, marcado.
  const anterior = !g.enLinea ? g.anterior : null;
  const reporte = anterior ? anterior.ultimaConexion : (g.ultimoDato ?? g.ultimaConexion);
  // Verde / amarillo / rojo según hace cuánto reportó (umbrales de Ajustes).
  const color = colorReporte(reporte, colores) ?? undefined;
  return (
    <div className="gps-tarjeta" data-principal={g.corta || undefined} title={g.nombre}>
      <span className="gps-tarjeta-tipo">
        <span className="gps-punto" data-color={color} aria-hidden /> {ETIQUETA[g.tipo]}
        {anterior && <span className="badge badge-warn gps-anterior">Traccar anterior</span>}
      </span>
      <strong>{g.nombre}</strong>
      {reporte ? (
        <>
          <span className="small">
            Último reporte: <span className="gps-hora">{fechaHora(reporte)}</span>
          </span>
          {/* Hace cuánto reportó, con el color de los umbrales de Ajustes. */}
          <span className="small" data-color={color} style={{ fontWeight: 600 }}>
            {!g.enLinea && !anterior && "Fuera de línea · "}
            {conMayuscula(hace(reporte))}
          </span>
        </>
      ) : (
        <span className="small muted">Sin reportes</span>
      )}
      {g.corta && puedeBloquear && (
        <span className="gps-acciones">
          <button type="button" className="gps-boton gps-cortar" disabled={enviando} onClick={() => alTocar("bloquear")}>
            Bloquear
          </button>
          <button type="button" className="gps-boton" disabled={enviando} onClick={() => alTocar("desbloquear")}>
            Desbloquear
          </button>
        </span>
      )}
    </div>
  );
}
