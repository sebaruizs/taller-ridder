import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { tiposServicio } from "@/lib/ordenes";

export const GET = manejar(async () => {
  await exigir(["ordenes.ver_en_proceso", "ordenes.ver_todas", "ordenes.crear", "ordenes.aprobar", "ordenes.editar", "solicitudes.crear"]);
  return json({ tipos: await tiposServicio() });
});
