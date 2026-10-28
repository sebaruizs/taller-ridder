import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { listarOrdenes } from "@/lib/ordenes";
import { COLUMNAS_TABLERO, ESTADOS } from "@/lib/taller";

const query = z.object({ q: z.string().trim().max(20).optional() });

// Las columnas del tablero con su primera página, como la pantalla. Para seguir: /api/ordenes?estado=...&page=2
export const GET = manejar(async (req) => {
  await exigir("ordenes.ver_todas");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const columnas = await Promise.all(
    COLUMNAS_TABLERO.map(async (estado) => ({ estado, titulo: ESTADOS[estado], ...(await listarOrdenes({ estado, chapa: q || undefined, pagina: 1 })) })),
  );
  return json({ columnas });
});
