import { exigirPagina } from "@/lib/auth";
import { proveedoresOdoo } from "@/lib/inventario";
import { Topbar } from "@/components/topbar";
import { FormCompra } from "./form";

export default async function NuevaCompra() {
  const u = await exigirPagina("compras.crear");
  return (
    <>
      <Topbar titulo="Nueva compra" volver="/compras" />
      <FormCompra proveedores={await proveedoresOdoo()} autor={u.nombre} />
    </>
  );
}
