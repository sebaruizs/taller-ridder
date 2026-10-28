import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { cambiarEncendido } from "@/lib/gps";

const body = z.object({
  chapa: z.string().trim().min(2).max(20),
  accion: z.enum(["cortar", "restablecer"]),
  ordenId: z.number().int().positive().optional(),
  confirmaEnMovimiento: z.boolean().default(false),
});

// Cortar o restablecer el encendido por GPS. Va al equipo con la chapa sola; queda en el log y en la orden.
export const POST = manejar(async (req) => {
  const u = await exigir("gps.encendido");
  return json(await cambiarEncendido(body.parse(await req.json().catch(() => ({}))), u));
});
