export const MAX_FOTOS = 12;
const MAX_BYTES_FOTO = 4 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type FotoSubida = { nombre: string; mimetype: string; datos: Buffer };

export async function leerFotos(form: FormData, prefijo: string): Promise<{ fotos: FotoSubida[] } | { error: string }> {
  const archivos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_FOTOS) return { error: `Máximo ${MAX_FOTOS} fotos` };
  const fotos: FotoSubida[] = [];
  for (const [i, f] of archivos.entries()) {
    if (!MIMES.has(f.type)) return { error: "Solo se aceptan fotos JPG, PNG o WEBP" };
    if (f.size > MAX_BYTES_FOTO) return { error: "Una de las fotos es demasiado grande" };
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    fotos.push({ nombre: `${prefijo}-foto-${i + 1}.${ext}`, mimetype: f.type, datos: Buffer.from(await f.arrayBuffer()) });
  }
  return { fotos };
}
