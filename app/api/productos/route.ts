import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarProductos } from "@/lib/verificar-servicio";
import { crearProductoComo } from "@/lib/producto-servicio";
import { ProductoDuplicado } from "@/lib/crear-producto";

const query = z.object({ q: z.string().trim().min(2, "Escribí al menos 2 letras").max(60) });

export const GET = manejar(async (req) => {
  await exigir("ordenes.editar");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ productos: await buscarProductos(q) });
});

const nuevo = z.object({
  nombre: z.string().trim().min(3, "Escribí el nombre del producto").max(120),
  categoriaId: z.number({ error: "Elegí la categoría" }).int().positive("Elegí la categoría"),
  codigo: z.string().trim().max(40).nullable().default(null),
  costo: z.number({ error: "Ingresá el costo" }).min(0, "El costo no puede ser negativo").max(1_000_000_000),
  precio: z.number({ error: "Ingresá el precio de venta" }).min(0, "El precio no puede ser negativo").max(1_000_000_000),
  proveedorId: z.number().int().positive().nullable().default(null),
});

export const POST = manejar(async (req) => {
  const u = await exigir("inventario.crear");
  const datos = nuevo.parse(await req.json());
  try {
    return json(await crearProductoComo({ ...datos, codigo: datos.codigo || null }, u), 201);
  } catch (e) {
    if (e instanceof ProductoDuplicado) return errorJson(e.message, 409, { existentes: e.existentes });
    throw e;
  }
});
