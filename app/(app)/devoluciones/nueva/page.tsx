import { exigirPagina } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { FormDevolucion } from "./form";

export default async function NuevaDevolucion() {
  const u = await exigirPagina("devoluciones.registrar");
  return (
    <>
      <Topbar titulo="Registrar recepción" volver="/devoluciones" />
      <FormDevolucion autor={u.nombre} />
    </>
  );
}
