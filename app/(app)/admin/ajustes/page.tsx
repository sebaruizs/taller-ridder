import { exigirPagina } from "@/lib/auth";
import { coloresReporte } from "@/lib/ajustes";
import { Topbar } from "@/components/topbar";
import { FormAjustes } from "./form";

export default async function Ajustes() {
  await exigirPagina("config.editar");
  return (
    <>
      <Topbar titulo="Ajustes" volver="/ordenes" />
      <FormAjustes inicial={await coloresReporte()} />
    </>
  );
}
