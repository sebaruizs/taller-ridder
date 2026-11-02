import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { coloresSchema, lugaresSchema } from "@/lib/ajustes-dominio";
import { coloresReporte, guardarColoresReporte, guardarLugaresMapa, lugaresMapa } from "@/lib/ajustes";

// Ajustes generales del taller: los colores del último reporte del GPS y los lugares del mapa. Solo el admin.
export const GET = manejar(async () => {
  await exigir("config.editar");
  const [colores, lugares] = await Promise.all([coloresReporte(), lugaresMapa()]);
  return json({ colores, lugares });
});

// Se guarda lo que venga: { colores }, { lugares } o los dos.
export const PUT = manejar(async (req) => {
  const u = await exigir("config.editar");
  const body = (await req.json().catch(() => ({}))) as { colores?: unknown; lugares?: unknown };
  const colores = body.colores !== undefined || body.lugares === undefined ? coloresSchema.parse(body.colores) : undefined;
  const lugares = body.lugares !== undefined ? lugaresSchema.parse(body.lugares) : undefined;
  if (colores) await guardarColoresReporte(colores, u);
  if (lugares) await guardarLugaresMapa(lugares, u);
  return json({ colores, lugares });
});
