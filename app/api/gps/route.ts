import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { estadoGps, gpsHabilitado } from "@/lib/gps";

const query = z.object({ chapas: z.string().trim().max(2000).default("") });

// Estado de los GPS de varias motos (las tarjetas del tablero): { equipos: { CHAPA: [...] } }.
export const GET = manejar(async (req) => {
  await exigir("ordenes.ver_todas");
  if (!gpsHabilitado()) return json({ habilitado: false, equipos: {} });
  const { chapas } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const lista = [...new Set(chapas.split(",").map((c) => c.trim()).filter(Boolean))].slice(0, 100);
  return json({ habilitado: true, equipos: lista.length ? await estadoGps(lista) : {} });
});
