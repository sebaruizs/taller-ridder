import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { puedeAlguna } from "@/lib/permisos";
import { detalleOrden } from "@/lib/ordenes";
import { leerRepuestos } from "@/lib/verificar";
import { reporteDeOrden } from "@/lib/reportes";
import { odoo } from "@/lib/odoo";
import { ESTADOS, type EstadoOrden } from "@/lib/taller";
import { fechaHora } from "@/lib/historial-formato";
import { cantidad, fecha, gs } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { Historial } from "@/components/historial";

const claseEstado = (e: string) => (e === "done" ? "badge-ok" : e === "cancelled" ? "badge-warn" : "");

// Detalle de una orden, solo lectura: sirve para las finalizadas y para revisar cualquier trabajo.
export default async function Orden(props: PageProps<"/ordenes/[id]">) {
  const u = await exigirPagina(["ordenes.ver_todas", "reportes.ver", "ordenes.aprobar", "ordenes.editar"]);
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await props.searchParams;
  const orden = await detalleOrden(id);
  if (!orden) notFound();
  const [reporte, repuestos] = await Promise.all([reporteDeOrden(id, orden.mecanico), leerRepuestos(odoo, id)]);
  const totalRepuestos = repuestos.reduce((s, l) => s + l.total, 0);
  const volver = sp.de === "reportes" ? "/reportes" : "/tablero";
  const puedeVerificar = orden.estado === "cancelled" && puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]);

  return (
    <>
      <Topbar titulo={`Orden #${id}`} volver={volver} />
      <main className="wrap stack inventario-wrap" style={{ gap: 14 }}>
        <section className="card stack" style={{ gap: 8 }}>
          <div className="row between wrap-row" style={{ gap: 10 }}>
            <span className="placa placa-lg">{orden.chapa}</span>
            <span className={`badge ${claseEstado(orden.estado)}`}>{ESTADOS[orden.estado as EstadoOrden] ?? orden.estado}</span>
          </div>
          <div className="small muted">{orden.vehiculo}</div>
          <strong>{orden.tipo ?? "Sin tipo"}</strong>
          {orden.descripcion && <div className="small" style={{ whiteSpace: "pre-line" }}>{orden.descripcion}</div>}
          {puedeVerificar && <Link className="btn btn-primary" href={`/verificar/${id}`} style={{ alignSelf: "flex-start" }}>Verificar y cargar repuestos</Link>}
        </section>

        <section className="kpis">
          <div className="card kpi"><span className="small muted">Mecánico</span><strong style={{ fontSize: 16 }}>{orden.mecanico ?? "Sin asignar"}</strong></div>
          <div className="card kpi"><span className="small muted">Chofer</span><strong style={{ fontSize: 16 }}>{orden.chofer ?? "Sin chofer"}</strong></div>
          <div className="card kpi"><span className="small muted">Odómetro</span><strong>{orden.odometroOrden ? `${cantidad(orden.odometroOrden)} km` : "—"}</strong></div>
          <div className="card kpi">
            <span className="small muted">Fechas</span>
            <strong style={{ fontSize: 16 }}>{fecha(orden.fecha)} → {orden.fechaFin ? fecha(orden.fechaFin) : "en curso"}</strong>
          </div>
        </section>

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

        <section className="card stack" style={{ gap: 10 }}>
          <strong>Repuestos</strong>
          {repuestos.length === 0 ? (
            <span className="small muted">Sin repuestos cargados.</span>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Costo unit.</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {repuestos.map((l) => (
                    <tr key={l.id}><td>{l.producto}</td><td className="num">{cantidad(l.cantidad)}</td><td className="num">{gs(l.costoUnitario)}</td><td className="num">{gs(l.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {repuestos.length > 0 && <div className="small" style={{ textAlign: "right" }}>Total <strong>{gs(totalRepuestos)}</strong></div>}
        </section>

        <Historial ordenId={id} />
      </main>
    </>
  );
}
