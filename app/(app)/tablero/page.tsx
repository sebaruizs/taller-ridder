import { exigirPagina } from "@/lib/auth";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { Tablero } from "./tablero";

export default async function PaginaTablero() {
  const u = await exigirPagina("ordenes.ver_todas");
  return (
    <>
      <Topbar titulo="Tablero" nombre={u.nombre} rol={u.rol} />
      <Tablero
        acciones={{
          iniciar: puedeU(u, "ordenes.mover_estado"),
          finalizar: puedeU(u, "ordenes.finalizar"),
          verificar: puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]),
        }}
      />
    </>
  );
}
