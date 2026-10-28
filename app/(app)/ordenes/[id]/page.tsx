import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { detalleOrden } from "@/lib/ordenes";
import { leerRepuestos } from "@/lib/verificar";
import { reporteDeOrden } from "@/lib/reportes";
import { odoo } from "@/lib/odoo";
import { ESTADOS, type EstadoOrden } from "@/lib/taller";
import { fechaHora } from "@/lib/historial-formato";
import { cantidad, fecha } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { Historial } from "@/components/historial";
import { CajaRepuestos } from "@/components/repuestos-orden";
import { PanelGps } from "@/components/gps-tarjeta";
import { AccionesOrden } from "@/components/acciones-orden";

const claseEstado = (e: string) => (e === "done" ? "badge-ok" : e === "cancelled" ? "badge-warn" : e === "to_be_paid" ? "badge-danger" : "");

// Detalle de la orden, estilo Odoo: cabecera con acciones, GPS y reporte lado a lado, repuestos e historial.
export default async function Orden(props: PageProps<"/ordenes/[id]">) {
  const u = await exigirPagina(["ordenes.ver_todas", "reportes.ver", "ordenes.aprobar", "ordenes.editar"]);
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await props.searchParams;
  const orden = await detalleOrden(id);
  if (!orden) notFound();
  const [reporte, repuestos] = await Promise.all([reporteDeOrden(id, orden.mecanico), leerRepuestos(odoo, id)]);
  const volver = sp.de === "reportes" ? "/reportes" : "/tablero";
  const editarRepuestos = puedeU(u, "ordenes.editar");
  // GPS solo con la moto en el taller: En proceso o Listo para verificar.
  const verGps = puedeU(u, "ordenes.ver_todas") && ["running", "cancelled"].includes(orden.estado);

  return (
    <>
      <Topbar titulo={`Orden #${id}`} volver={volver} />
      <main className="wrap wrap-ancho stack orden-detalle" style={{ gap: 14 }}>
        {/* Cabecera como en Odoo: quién y qué a la izquierda, las acciones a la derecha. */}
        <header className="card orden-cabecera">
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <div className="row wrap-row" style={{ gap: 10 }}>
              <span className="placa placa-lg">{orden.chapa}</span>
              <span className={`badge ${claseEstado(orden.estado)}`}>{ESTADOS[orden.estado as EstadoOrden] ?? orden.estado}</span>
              {orden.dias !== null && orden.estado !== "done" && (
                <span className={`badge ${orden.dias > 7 ? "badge-danger" : ""}`}>{orden.dias === 1 ? "1 día" : `${orden.dias} días`} en taller</span>
              )}
            </div>
            <strong className="finalizar-tipo">{orden.tipo ?? "Sin tipo"}</strong>
            <span className="small muted">{orden.vehiculo}</span>
            {orden.descripcion && <span className="small">Pedido: {orden.descripcion}</span>}
            <dl className="orden-datos">
              <div><dt>Mecánico</dt><dd>{orden.mecanico ?? "Sin asignar"}</dd></div>
              <div><dt>Chofer</dt><dd>{orden.chofer ?? "Sin chofer"}{orden.cliente && <span className="tiny muted"><br />{orden.cliente}</span>}</dd></div>
              <div><dt>Fechas</dt><dd>{fecha(orden.fecha)} → {orden.fechaFin ? fecha(orden.fechaFin) : "en curso"}</dd></div>
              <div><dt>Odómetro</dt><dd>{orden.odometroOrden ? `${cantidad(orden.odometroOrden)} km` : "Sin dato"}</dd></div>
            </dl>
          </div>
          <AccionesOrden
            ordenId={id}
            estado={orden.estado}
            puede={{ mover: puedeU(u, "ordenes.mover_estado"), finalizar: puedeU(u, "ordenes.finalizar"), verificar: puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]) }}
          />
        </header>

        <div className={verGps ? "orden-par" : undefined}>
          {verGps && <PanelGps ordenId={id} chapa={orden.chapa} puedeBloquear={puedeU(u, "gps.encendido")} />}
          <section className="card stack" style={{ gap: 10 }}>
            <div className="row between">
              <strong>Reporte del mecánico</strong>
              {reporte.fecha && <span className="small muted">{fechaHora(reporte.fecha)}</span>}
            </div>
            {reporte.observacion === null ? (
              <span className="small muted">Todavía no hay reporte del mecánico.</span>
            ) : (
              <div style={{ whiteSpace: "pre-line" }}>{reporte.observacion || <span className="muted">Sin observación</span>}</div>
            )}
            {reporte.fotos.length > 0 && (
              <div className="detalle-fotos">
                {reporte.fotos.map((f, i) => (
                  <a key={f} href={`/api/fotos/${f}`} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/fotos/${f}?tam=mini`} alt="" loading="lazy" width={120} height={120} />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <CajaRepuestos ordenId={id} lineasIniciales={repuestos} editable={editarRepuestos} />
        <Historial ordenId={id} />
      </main>
    </>
  );
}
