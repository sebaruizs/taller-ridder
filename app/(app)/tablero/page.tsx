import { exigirPagina } from "@/lib/auth";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { Tablero } from "./tablero";

export default async function PaginaTablero() {
  const u = await exigirPagina("ordenes.ver_todas");
  return (
    <>
      <Topbar titulo="Tablero" nombre={u.nombre} rol={u.rol} accion={puedeU(u, "ordenes.crear") ? { href: "/ordenes/nueva", texto: "Nueva orden" } : undefined} />
      <Tablero
        acciones={{
          crear: puedeU(u, "ordenes.crear"),
          iniciar: puedeU(u, "ordenes.mover_estado"),
          finalizar: puedeU(u, "ordenes.finalizar"),
          verificar: puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]),
          encendido: puedeU(u, "gps.encendido"),
        }}
      />
    </>
  );
}
