import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { coloresSchema } from "@/lib/ajustes-dominio";
import { coloresReporte, guardarColoresReporte } from "@/lib/ajustes";

// Ajustes generales del taller. Hoy: los colores del último reporte del GPS. Solo el admin.
export const GET = manejar(async () => {
  await exigir("config.editar");
  return json({ colores: await coloresReporte() });
});

export const PUT = manejar(async (req) => {
  const u = await exigir("config.editar");
  const body = (await req.json().catch(() => ({}))) as { colores?: unknown };
  const colores = coloresSchema.parse(body.colores);
  await guardarColoresReporte(colores, u);
  return json({ colores });
});
