import { exigirPagina } from "@/lib/auth";
import { categoriasOdoo, proveedoresOdoo } from "@/lib/inventario";
import { puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { FormCompra } from "./form";

export default async function NuevaCompra() {
  const u = await exigirPagina("compras.crear");
  // «Crear producto nuevo» solo para quien también puede crear productos.
  const [proveedores, categorias] = await Promise.all([proveedoresOdoo(), puedeU(u, "inventario.crear") ? categoriasOdoo() : null]);
  return (
    <>
      <Topbar titulo="Nueva compra" volver="/compras" />
      <FormCompra proveedores={proveedores} categorias={categorias} autor={u.nombre} />
    </>
  );
}
