import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, manejar } from "@/lib/api";
import { fotoDeDevolucion } from "@/lib/devoluciones";

// Miniaturas en memoria, igual que las fotos de las órdenes.
const MAX_MINIS = 400;
const minis = new Map<number, Buffer>();

export const GET = manejar(async (req, ctx: RouteContext<"/api/devoluciones/fotos/[id]">) => {
  await exigir("devoluciones.ver");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const mini = new URL(req.url).searchParams.get("tam") === "mini";
  const cache = { "Cache-Control": "private, max-age=31536000, immutable" };
  const enCache = mini ? minis.get(id) : undefined;
  if (enCache) return new Response(new Uint8Array(enCache), { headers: { "Content-Type": "image/jpeg", ...cache } });

  const foto = await fotoDeDevolucion(id);
  if (!foto) return errorJson("Foto no encontrada", 404);
  if (mini) {
    try {
      const sharp = (await import("sharp")).default;
      const m = await sharp(foto.datos).rotate().resize(320, 320, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
      if (minis.size >= MAX_MINIS) minis.delete(minis.keys().next().value!);
      minis.set(id, m);
      return new Response(new Uint8Array(m), { headers: { "Content-Type": "image/jpeg", ...cache } });
    } catch (e) {
      console.error("[devoluciones] sin miniatura, se manda la original:", e instanceof Error ? e.message : e);
    }
  }
  return new Response(new Uint8Array(foto.datos), { headers: { "Content-Type": foto.mimetype, ...cache } });
});
