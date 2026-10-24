import { exigirPagina } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { Tablero } from "./tablero";

export default async function PaginaTablero() {
  const u = await exigirPagina("ordenes.ver_todas");
  return (
    <>
      <Topbar titulo="Tablero" nombre={u.nombre} rol={u.rol} />
      <Tablero />
    </>
  );
}
