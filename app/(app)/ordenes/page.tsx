import { exigirPagina } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { ListaOrdenes } from "./lista";

export default async function Ordenes() {
  const u = await exigirPagina("ordenes.ver_en_proceso");
  return (
    <>
      <Topbar titulo="Motos en proceso" nombre={u.nombre} rol={u.rol} />
      <ListaOrdenes tienePartner={Boolean(u.odooPartnerId)} />
    </>
  );
}
