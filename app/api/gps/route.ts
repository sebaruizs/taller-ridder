import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { estadoGps, gpsHabilitado } from "@/lib/gps";
import { monedasSheets } from "@/lib/monedas";
import { coloresReporte } from "@/lib/ajustes";

const query = z.object({ chapas: z.string().trim().max(2000).default("") });

// Estado de los GPS de varias motos (las tarjetas del tablero): { equipos: { CHAPA: [...] } }.
export const GET = manejar(async (req) => {
  await exigir("ordenes.ver_todas");
  if (!gpsHabilitado()) return json({ habilitado: false, equipos: {} });
  const { chapas } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const lista = [...new Set(chapas.split(",").map((c) => c.trim()).filter(Boolean))].slice(0, 100);
  if (!lista.length) return json({ habilitado: true, equipos: {}, monedasGoogle: {}, colores: await coloresReporte() });
  const [equipos, monedas, colores] = await Promise.all([estadoGps(lista), monedasSheets(), coloresReporte()]);
  // Lo que dice el Sheets de las chapas pedidas ({ CHAPA: "Moneda Google" | "Sin moneda" | "IOS"… }),
  // para mostrarlo si la moneda no reporta en Traccar.
  const monedasGoogle = Object.fromEntries(
    lista.map((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((c) => monedas.has(c)).map((c) => [c, monedas.get(c)!]),
  );
  return json({ habilitado: true, equipos, monedasGoogle, colores });
});
