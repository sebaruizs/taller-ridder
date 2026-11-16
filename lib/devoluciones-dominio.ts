import { z } from "zod";

export const TIPOS_DEVOLUCION = ["devolucion", "recupero"] as const;
export type TipoDevolucion = (typeof TIPOS_DEVOLUCION)[number];

// Reglas de Devoluciones / Recuperos que no tocan la base ni Odoo (se usan también en el navegador).
export const TIPO_NOMBRE: Record<TipoDevolucion, string> = { devolucion: "Devolución", recupero: "Recupero" };
export const MIN_FOTOS = 1;
export const MAX_FOTOS_DEVOLUCION = 12;

export const nuevaDevolucionSchema = z.object({
  tipo: z.enum(TIPOS_DEVOLUCION, { error: "Elegí si es una devolución o un recupero" }),
  vehiculoId: z.coerce.number({ error: "Elegí la moto" }).int().positive("Elegí la moto"),
  observacion: z.string().trim().min(3, "Escribí cómo llegó la moto").max(2000),
});

export type Devolucion = {
  id: number;
  tipo: TipoDevolucion;
  vehiculoId: number;
  chapa: string;
  vehiculo: string;
  chofer: string | null;
  observacion: string;
  fecha: string;
  por: string;
  creado: string;
  fotos: number[];
};

// "Kenton/GTR 150/827ABTI" → "Kenton GTR 150": el nombre del vehículo en Odoo es marca/modelo/chapa.
export function modeloDe(nombre: string, chapa: string): string {
  return nombre
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x && x !== chapa)
    .join(" ");
}

// Agrupa por día, del más nuevo al más viejo, respetando el orden en que vienen.
export function porDia<T extends { fecha: string }>(lista: T[]): { fecha: string; items: T[] }[] {
  const dias: { fecha: string; items: T[] }[] = [];
  for (const d of lista) {
    const ultimo = dias[dias.length - 1];
    if (ultimo?.fecha === d.fecha) ultimo.items.push(d);
    else dias.push({ fecha: d.fecha, items: [d] });
  }
  return dias;
}
