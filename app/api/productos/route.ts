import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarProductos } from "@/lib/verificar-servicio";
import { crearProductoComo } from "@/lib/producto-servicio";
import { ProductoDuplicado, esquemaProducto } from "@/lib/crear-producto";

const query = z.object({ q: z.string().trim().min(2, "Escribí al menos 2 letras").max(60) });

export const GET = manejar(async (req) => {
  await exigir("ordenes.editar");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ productos: await buscarProductos(q) });
});

export const POST = manejar(async (req) => {
  const u = await exigir("inventario.crear");
  const datos = esquemaProducto.parse(await req.json());
  try {
    return json(await crearProductoComo({ ...datos, codigo: datos.codigo || null }, u), 201);
  } catch (e) {
    if (e instanceof ProductoDuplicado) return errorJson(e.message, 409, { existentes: e.existentes });
    throw e;
  }
});
