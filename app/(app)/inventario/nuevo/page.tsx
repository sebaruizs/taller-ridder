import { exigirPagina } from "@/lib/auth";
import { categoriasOdoo, proveedoresOdoo } from "@/lib/inventario";
import { Topbar } from "@/components/topbar";
import { FormProducto } from "./form";

export default async function NuevoProducto() {
  await exigirPagina("inventario.crear");
  const [categorias, proveedores] = await Promise.all([categoriasOdoo(), proveedoresOdoo()]);
  return (
    <>
      <Topbar titulo="Nuevo producto" volver="/inventario" />
      <FormProducto categorias={categorias} proveedores={proveedores} />
    </>
  );
}
