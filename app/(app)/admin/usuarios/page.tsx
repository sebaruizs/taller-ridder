import { exigirPagina } from "@/lib/auth";
import { listarUsuarios } from "@/lib/usuarios";
import { Topbar } from "@/components/topbar";
import { AdminUsuarios } from "./admin-usuarios";

export default async function Usuarios() {
  const u = await exigirPagina("usuarios.gestionar");
  return (
    <>
      <Topbar titulo="Usuarios" volver="/ordenes" />
      <AdminUsuarios inicial={await listarUsuarios()} yo={u.id} />
    </>
  );
}
