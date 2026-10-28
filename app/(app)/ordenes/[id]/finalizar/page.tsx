import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { detalleOrden } from "@/lib/ordenes";
import { Topbar } from "@/components/topbar";
import { FormFinalizar } from "./form";
import { Historial } from "@/components/historial";
import { puedeU } from "@/lib/permisos";
import { leerRepuestos } from "@/lib/verificar";
import { odoo } from "@/lib/odoo";

export default async function Finalizar(props: PageProps<"/ordenes/[id]/finalizar">) {
  const u = await exigirPagina("ordenes.finalizar");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const orden = await detalleOrden(id);
  if (!orden) notFound();
  // Quien puede cargar repuestos los ve y los carga acá mismo, debajo del odómetro.
  const repuestos = puedeU(u, "ordenes.editar") ? await leerRepuestos(odoo, id).catch(() => []) : null;
  return (
    <>
      <Topbar titulo="Finalizar trabajo" volver="/ordenes" />
      <FormFinalizar
        orden={orden}
        mecanico={u.nombre}
        repuestos={repuestos}
        gps={puedeU(u, "ordenes.ver_todas") ? { puedeBloquear: puedeU(u, "gps.encendido") } : null}
        historial={<Historial ordenId={orden.id} />}
      />
    </>
  );
}
