import Link from "next/link";
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
import { EliminarOrden } from "@/components/eliminar-orden";
import { EtapasOrden } from "@/components/etapas-orden";

const claseEstado = (e: string) => (e === "done" ? "badge-ok" : e === "cancelled" ? "badge-warn" : e === "to_be_paid" ? "badge-danger" : "");

// Detalle de una orden: datos, repuestos utilizados (editables para quien puede) y reporte; el historial a la derecha.
export default async function Orden(props: PageProps<"/ordenes/[id]">) {
  const u = await exigirPagina(["ordenes.ver_todas", "reportes.ver", "ordenes.aprobar", "ordenes.editar"]);
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await props.searchParams;
  const orden = await detalleOrden(id);
  if (!orden) notFound();
  const [reporte, repuestos] = await Promise.all([reporteDeOrden(id, orden.mecanico), leerRepuestos(odoo, id)]);
  const volver = sp.de === "reportes" ? "/reportes" : "/tablero";
  const puedeVerificar = orden.estado === "cancelled" && puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]);

  const editarRepuestos = puedeU(u, "ordenes.editar");
  // Las mismas reglas que el tablero para cambiar de etapa.
  const acciones = {
    iniciar: puedeU(u, "ordenes.mover_estado"),
    finalizar: puedeU(u, "ordenes.finalizar"),
    verificar: puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]),
  };

  return (
    <>
      <Topbar titulo={`Orden #${id}`} volver={volver} />
      <main className="wrap wrap-ancho stack" style={{ gap: 14 }}>
        <div className="finalizar-grid">
          <div className="stack" style={{ gap: 14 }}>
            <section className="card stack" style={{ gap: 8 }}>
              <div className="row between wrap-row" style={{ gap: 10 }}>
                <span className="placa placa-lg">{orden.chapa}</span>
                {acciones.iniciar || acciones.finalizar || acciones.verificar ? (
                  <EtapasOrden ordenId={id} estado={orden.estado} acciones={acciones} />
                ) : (
                  <span className={`badge ${claseEstado(orden.estado)}`}>{ESTADOS[orden.estado as EstadoOrden] ?? orden.estado}</span>
                )}
              </div>
              <div className="small muted">{orden.vehiculo}</div>
              <strong>{orden.tipo ?? "Sin tipo"}</strong>
              {orden.descripcion && <div className="small" style={{ whiteSpace: "pre-line" }}>{orden.descripcion}</div>}
              <dl className="detalle-datos">
                <dt>Mecánico</dt><dd>{orden.mecanico ?? "Sin asignar"}</dd>
                <dt>Chofer</dt><dd>{orden.chofer ?? "Sin chofer"}{orden.cliente && <span className="tiny muted"><br />{orden.cliente}</span>}</dd>
                <dt>Fechas</dt><dd>{fecha(orden.fecha)} → {orden.fechaFin ? fecha(orden.fechaFin) : "en curso"}</dd>
                <dt>Odómetro</dt><dd>{orden.odometroOrden ? `${cantidad(orden.odometroOrden)} km` : "—"}</dd>
              </dl>
              {puedeVerificar && <Link className="btn btn-primary" href={`/verificar/${id}`} style={{ alignSelf: "flex-start" }}>Verificar y aprobar</Link>}
              {orden.estado !== "done" && puedeU(u, "ordenes.eliminar") && <EliminarOrden ordenId={id} chapa={orden.chapa} />}
            </section>
          </div>

          <div className="stack" style={{ gap: 14 }}>
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
        </div>

        {/* Debajo, a todo el ancho: repuestos utilizados (editables para quien puede) e historial, como en Odoo. */}
        {/* GPS solo con la moto en el taller: En proceso o Listo para verificar. */}
        {puedeU(u, "gps.ver") && ["running", "cancelled"].includes(orden.estado) && (
          <PanelGps ordenId={id} chapa={orden.chapa} puedeBloquear={puedeU(u, "gps.encendido")} />
        )}
        <CajaRepuestos ordenId={id} lineasIniciales={repuestos} editable={editarRepuestos} />
        <Historial ordenId={id} />
      </main>
    </>
  );
}
