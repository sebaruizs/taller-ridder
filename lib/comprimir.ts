export const LADO_MAX = 1600;
export const CALIDAD = 0.8;

export function medidasEscaladas(w: number, h: number, max = LADO_MAX): { w: number; h: number } {
  const lado = Math.max(w, h);
  if (lado <= max) return { w, h };
  const f = max / lado;
  return { w: Math.round(w * f), h: Math.round(h * f) };
}

export async function comprimirFoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = medidasEscaladas(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto"))), "image/jpeg", CALIDAD),
  );
}
