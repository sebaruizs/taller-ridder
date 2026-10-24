import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { detalleOrden } from "@/lib/ordenes";
import { leerRepuestos } from "@/lib/verificar";
import { odoo } from "@/lib/odoo";
import { Topbar } from "@/components/topbar";
import { VerificarOrden } from "./verificar";

export default async function Verificar(props: PageProps<"/verificar/[id]">) {
  await exigirPagina("ordenes.aprobar");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [orden, lineas] = await Promise.all([detalleOrden(id), leerRepuestos(odoo, id)]);
  if (!orden) notFound();
  return (
    <>
      <Topbar titulo="Verificar trabajo" volver="/verificar" />
      <VerificarOrden orden={orden} lineasIniciales={lineas} />
    </>
  );
}
