import { exigirPagina } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { FormNuevaOrden } from "./form";

export default async function NuevaOrden() {
  const u = await exigirPagina("ordenes.crear");
  return (
    <>
      <Topbar titulo="Nueva orden" volver="/ordenes" />
      <FormNuevaOrden autor={u.nombre} />
    </>
  );
}
