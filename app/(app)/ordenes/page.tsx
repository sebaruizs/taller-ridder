import { exigirPagina } from "@/lib/auth";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { ListaOrdenes } from "./lista";

export default async function Ordenes() {
  const u = await exigirPagina("ordenes.ver_en_proceso");
  return (
    <>
      <Topbar titulo="Motos en proceso" nombre={u.nombre} rol={u.rol} accion={puedeU(u, "ordenes.crear") ? { href: "/ordenes/nueva", texto: "Nueva orden" } : undefined} />
      <ListaOrdenes
        tienePartner={Boolean(u.odooPartnerId)}
        accesos={{
          crear: puedeU(u, "ordenes.crear"),
          tablero: puedeU(u, "ordenes.ver_todas"),
          verificar: puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"]),
          finalizar: puedeU(u, "ordenes.finalizar"),
          inventario: puedeU(u, "inventario.ver"),
          compras: puedeU(u, "compras.ver"),
          gps: puedeU(u, "ordenes.ver_todas"),
        }}
      />
    </>
  );
}
