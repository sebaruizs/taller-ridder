"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrdenLista } from "@/lib/ordenes";
import type { EquipoGps } from "@/lib/gps-dominio";
import type { ColoresReporte } from "@/lib/ajustes-dominio";
import { GpsTarjeta } from "@/components/gps-tarjeta";

// La tarjeta de una orden, igual en el tablero y en «Motos en proceso»: chapa, días en el taller,
// tipo, mecánico, repuestos y, si se pide, el resumen de los GPS.

const fecha = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");
const clave = (chapa: string) => chapa.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type DatosGps = { equipos: Record<string, EquipoGps[]>; monedasGoogle: Record<string, string>; colores?: ColoresReporte };

// Estado de los GPS de varias chapas. null mientras no hay datos o si el GPS no está configurado.
export function useGps(chapas: string[], activo = true): DatosGps | null {
  const lista = [...new Set(chapas.filter((c) => c !== "—"))].sort().join(",");
  const [datos, setDatos] = useState<DatosGps | null>(null);
  useEffect(() => {
    if (!activo || !lista) return;
    const ctrl = new AbortController();
    fetch(`/api/gps?chapas=${encodeURIComponent(lista)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDatos(d.habilitado ? { equipos: d.equipos ?? {}, monedasGoogle: d.monedasGoogle ?? {}, colores: d.colores } : null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [lista, activo]);
  return datos;
}

export function ContenidoTarjetaOrden({ o, href, finalizada = false, gps }: { o: OrdenLista; href: string | null; finalizada?: boolean; gps?: DatosGps | null }) {
  return (
    <>
      <div className="row between">
        {href ? (
          <Link href={href} className="placa placa-link" draggable={false} onClick={(e) => e.stopPropagation()} aria-label={`Abrir ${o.chapa}`}>
            {o.chapa}
          </Link>
        ) : (
          <span className="placa">{o.chapa}</span>
        )}
        {finalizada ? (
          <span className="badge" title={o.fechaFin ? "Fecha de fin" : "Sin fecha de fin: fecha de inicio"}>{fecha(o.fechaFin ?? o.fecha)}</span>
        ) : (
          o.dias !== null && <span className={`badge ${o.dias > 7 ? "badge-danger" : ""}`}>{o.dias === 0 ? "Hoy" : o.dias === 1 ? "1 día" : `${o.dias} días`}</span>
        )}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.tipo ?? "Sin tipo"}</div>
      <div className="row between" style={{ gap: 8 }}>
        <span className="small muted">{o.mecanico ?? "Sin asignar"}</span>
        {o.totalRepuestos > 0 && <span className="tiny muted" style={{ whiteSpace: "nowrap" }}>Repuestos · {new Intl.NumberFormat("es-PY").format(Math.round(o.totalRepuestos))}</span>}
      </div>
      {gps && <GpsTarjeta equipos={gps.equipos[clave(o.chapa)] ?? []} monedaGoogle={gps.monedasGoogle[clave(o.chapa)]} colores={gps.colores} />}
    </>
  );
}
