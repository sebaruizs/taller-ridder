import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { listarEnProceso } from "@/lib/ordenes";

const query = z.object({
  q: z.string().trim().max(20).optional(),
  tipo: z.coerce.number().int().positive().optional(),
  mias: z.enum(["1", "0"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const GET = manejar(async (req) => {
  const u = await exigir("ordenes.ver_en_proceso");
  const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const data = await listarEnProceso({
    chapa: p.q || undefined,
    tipoId: p.tipo,
    partnerId: p.mias === "1" ? u.odooPartnerId : undefined,
    pagina: p.page,
  });
  return json({ ...data, sinPartner: p.mias === "1" && !u.odooPartnerId });
});
