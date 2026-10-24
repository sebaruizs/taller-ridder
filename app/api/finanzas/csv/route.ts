import { z } from "zod";
import { exigir, registrar } from "@/lib/auth";
import { manejar } from "@/lib/api";
import { reporteFinanzas } from "@/lib/finanzas";
import { MES_RE, csvCierre, periodoDeMes } from "@/lib/finanzas-dominio";

const query = z.object({ mes: z.string().regex(MES_RE, "Mes inválido"), empresa: z.coerce.number().int().positive() });

export const GET = manejar(async (req) => {
  const u = await exigir("finanzas.ver");
  const { mes, empresa } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const periodo = periodoDeMes(mes);
  const r = await reporteFinanzas(periodo);
  const e = r.empresas.find((x) => x.id === empresa);
  if (!e) return new Response("Sin datos para esa empresa en ese mes", { status: 404 });
  await registrar(u.id, "finanzas.descargar_cierre", { detalle: { mes, empresaId: empresa, empresa: e.nombre } });
  const nombre = `cierre-${e.nombre.replace(/[^\w-]+/g, "_")}-${mes}.csv`;
  // BOM para que Excel abra bien los acentos.
  return new Response("﻿" + csvCierre(e, periodo), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"` },
  });
});
