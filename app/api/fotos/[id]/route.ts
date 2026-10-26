import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, manejar } from "@/lib/api";
import { fotoDeOrden } from "@/lib/reportes";

// Miniaturas en memoria: una foto de Odoo pesa ~500 KB; la miniatura, unos 10 KB.
const MAX_MINIS = 400;
const minis = new Map<number, Buffer>();

async function miniatura(datos: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(datos).rotate().resize(160, 160, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
  } catch (e) {
    console.error("[fotos] sin miniatura, se manda la original:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const GET = manejar(async (req, ctx: RouteContext<"/api/fotos/[id]">) => {
  await exigir(["reportes.ver", "ordenes.aprobar", "ordenes.editar"]);
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const mini = new URL(req.url).searchParams.get("tam") === "mini";
  const cache = { "Cache-Control": "private, max-age=31536000, immutable" };

  const enCache = mini ? minis.get(id) : undefined;
  if (enCache) return new Response(new Uint8Array(enCache), { headers: { "Content-Type": "image/jpeg", ...cache } });

  const foto = await fotoDeOrden(id);
  if (!foto) return errorJson("Foto no encontrada", 404);
  if (mini) {
    const m = await miniatura(foto.datos);
    if (m) {
      if (minis.size >= MAX_MINIS) minis.delete(minis.keys().next().value!);
      minis.set(id, m);
      return new Response(new Uint8Array(m), { headers: { "Content-Type": "image/jpeg", ...cache } });
    }
  }
  return new Response(new Uint8Array(foto.datos), { headers: { "Content-Type": foto.mimetype, ...cache } });
});
