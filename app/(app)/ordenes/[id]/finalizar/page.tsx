import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { detalleOrden } from "@/lib/ordenes";
import { Topbar } from "@/components/topbar";
import { FormFinalizar } from "./form";
import { Historial } from "@/components/historial";

export default async function Finalizar(props: PageProps<"/ordenes/[id]/finalizar">) {
  const u = await exigirPagina("ordenes.finalizar");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const orden = await detalleOrden(id);
  if (!orden) notFound();
  return (
    <>
      <Topbar titulo="Finalizar trabajo" volver="/ordenes" />
      <FormFinalizar orden={orden} mecanico={u.nombre} historial={<Historial ordenId={orden.id} />} />
    </>
  );
}
