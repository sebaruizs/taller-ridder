import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { FormSolicitud } from "./form";

export default async function NuevaSolicitud() {
  const u = await exigirPagina("solicitudes.crear");
  return (
    <>
      <Topbar titulo="Solicitar trabajo" volver="/solicitudes" />
      <FormSolicitud autor={u.nombre} puedeFinalizar={puedeU(u, "ordenes.finalizar")} />
    </>
  );
}
