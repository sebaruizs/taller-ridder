import { exigirPagina } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { ListaOrdenes } from "../ordenes/lista";

export default async function ParaVerificar() {
  const u = await exigirPagina("ordenes.aprobar");
  return (
    <>
      <Topbar titulo="Para verificar" nombre={u.nombre} rol={u.rol} />
      <ListaOrdenes tienePartner={Boolean(u.odooPartnerId)} puedeCrear={false} modo="verificar" />
    </>
  );
}
