import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { detalleOrden } from "@/lib/ordenes";
import { leerRepuestos } from "@/lib/verificar";
import { odoo } from "@/lib/odoo";
import { Topbar } from "@/components/topbar";
import { puedeU } from "@/lib/permisos";
import { VerificarOrden } from "./verificar";
import { Historial } from "@/components/historial";

export default async function Verificar(props: PageProps<"/verificar/[id]">) {
  const u = await exigirPagina(["ordenes.aprobar", "ordenes.editar"]);
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [orden, lineas] = await Promise.all([detalleOrden(id), leerRepuestos(odoo, id)]);
  if (!orden) notFound();
  return (
    <>
      <Topbar titulo={orden.estado === "cancelled" ? "Verificar trabajo" : "Repuestos"} volver={orden.estado === "cancelled" ? "/verificar" : `/ordenes/${id}`} />
      <VerificarOrden
        orden={orden}
        lineasIniciales={lineas}
        puedeRepuestos={puedeU(u, "ordenes.editar")}
        puedeAprobar={puedeU(u, "ordenes.aprobar")}
        gps={puedeU(u, "ordenes.ver_todas") && ["running", "cancelled"].includes(orden.estado) ? { puedeBloquear: puedeU(u, "gps.encendido") } : null}
        historial={<Historial ordenId={id} />}
      />
    </>
  );
}
