import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { leerFotos } from "@/lib/fotos-form";
import { devolucionesDeVehiculo, listarDevoluciones, registrarDevolucion } from "@/lib/devoluciones";
import { TIPOS_DEVOLUCION, nuevaDevolucionSchema } from "@/lib/devoluciones-dominio";

const query = z.object({
  q: z.string().trim().max(20).optional(),
  tipo: z.enum(TIPOS_DEVOLUCION).optional(),
  vehiculoId: z.coerce.number().int().positive().optional(),
  chapa: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

// La lista; con vehiculoId o chapa, las de esa moto (lo que pide Cobranzas para el perfil del vehículo).
export const GET = manejar(async (req) => {
  await exigir("devoluciones.ver");
  const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (p.vehiculoId || p.chapa) return json({ devoluciones: await devolucionesDeVehiculo({ vehiculoId: p.vehiculoId, chapa: p.chapa }) });
  return json(await listarDevoluciones({ q: p.q || undefined, tipo: p.tipo, pagina: p.page }));
});

export const POST = manejar(async (req) => {
  const u = await exigir("devoluciones.registrar");
  const form = await req.formData().catch(() => null);
  if (!form) return errorJson("Formulario inválido", 400);
  const datos = nuevaDevolucionSchema.parse({ tipo: form.get("tipo") ?? undefined, vehiculoId: form.get("vehiculoId") ?? undefined, observacion: form.get("observacion") ?? "" });
  const fotos = await leerFotos(form, "devolucion");
  if ("error" in fotos) return errorJson(fotos.error, 400);
  return json({ devolucion: await registrarDevolucion({ ...datos, fotos: fotos.fotos }, u) }, 201);
});
