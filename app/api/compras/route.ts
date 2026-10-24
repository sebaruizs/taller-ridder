import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { crearCompraComo } from "@/lib/compra-servicio";

const body = z.object({
  clave: z.string().uuid("Clave de envío inválida"),
  proveedorId: z.number({ error: "Elegí el proveedor" }).int().positive("Elegí el proveedor"),
  referencia: z.string().trim().max(60).nullable().default(null),
  recibir: z.boolean().default(true),
  lineas: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        nombre: z.string().trim().min(1).max(200),
        cantidad: z.number().positive("La cantidad tiene que ser mayor a 0").max(100_000),
        precio: z.number().min(0, "El precio no puede ser negativo").max(1_000_000_000),
      }),
    )
    .min(1, "Agregá al menos un producto")
    .max(60),
});

export const POST = manejar(async (req) => {
  const u = await exigir("compras.crear");
  const d = body.parse(await req.json());
  return json(await crearCompraComo({ ...d, referencia: d.referencia || null }, u), 201);
});
