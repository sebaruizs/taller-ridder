import { exigirPagina } from "@/lib/auth";
import { coloresReporte, lugaresMapa } from "@/lib/ajustes";
import { Topbar } from "@/components/topbar";
import { FormAjustes } from "./form";
import { FormLugares } from "./lugares";

export default async function Ajustes() {
  await exigirPagina("config.editar");
  return (
    <>
      <Topbar titulo="Ajustes" volver="/ordenes" />
      <FormAjustes inicial={await coloresReporte()}>
        <FormLugares inicial={await lugaresMapa()} />
      </FormAjustes>
    </>
  );
}
