import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { buscarProductosCompra } from "@/lib/compras";

const query = z.object({ q: z.string().trim().min(2, "Escribí al menos 2 letras").max(60) });

export const GET = manejar(async (req) => {
  await exigir("compras.crear");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ productos: await buscarProductosCompra(q) });
});
