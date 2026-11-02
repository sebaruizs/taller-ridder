import { z } from "zod";

// Colores del último reporte del GPS: verde si es reciente, amarillo desde X horas, rojo desde Y horas.
// Los define el admin en Ajustes; sin configurar, 5 horas y 1 día.
export type ColoresReporte = { amarilloDesdeHoras: number; rojoDesdeHoras: number };
export const COLORES_POR_DEFECTO: ColoresReporte = { amarilloDesdeHoras: 5, rojoDesdeHoras: 24 };
export const CLAVE_COLORES = "gps.colores_reporte";

export const coloresSchema = z
  .object({
    amarilloDesdeHoras: z.number({ error: "Ingresá las horas para amarillo" }).positive("Tiene que ser mayor a 0").max(24 * 90),
    rojoDesdeHoras: z.number({ error: "Ingresá las horas para rojo" }).positive("Tiene que ser mayor a 0").max(24 * 90),
  })
  .refine((c) => c.rojoDesdeHoras > c.amarilloDesdeHoras, { message: "Rojo tiene que empezar después que amarillo", path: ["rojoDesdeHoras"] });

export type ColorReporte = "verde" | "amarillo" | "rojo";

export function colorReporte(iso: string | null, c: ColoresReporte, ahora = Date.now()): ColorReporte | null {
  if (!iso) return null;
  const horas = (ahora - Date.parse(iso)) / 3_600_000;
  return horas >= c.rojoDesdeHoras ? "rojo" : horas >= c.amarilloDesdeHoras ? "amarillo" : "verde";
}

// Lo guardado puede venir viejo o roto: si no valida, se usan los valores por defecto.
export function leerColores(valor: unknown): ColoresReporte {
  const r = coloresSchema.safeParse(valor);
  return r.success ? r.data : COLORES_POR_DEFECTO;
}

// Lugares fijos que se marcan en el mapa del GPS (la oficina, el taller…). Los carga el admin en Ajustes.
export type LugarMapa = { nombre: string; lat: number; lon: number };
export const CLAVE_LUGARES = "gps.lugares_mapa";

export const lugarSchema = z.object({
  nombre: z.string({ error: "Poné un nombre" }).trim().min(1, "Poné un nombre").max(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export const lugaresSchema = z.array(lugarSchema).max(20, "Hasta 20 lugares");

export function leerLugares(valor: unknown): LugarMapa[] {
  const r = lugaresSchema.safeParse(valor);
  return r.success ? r.data : [];
}

// Las coordenadas como las copia Google Maps («-25.2637, -57.5759») o un enlace de Google Maps (…/@-25.26,-57.57,17z
// o ?q=-25.26,-57.57). null si no se entiende o está fuera de rango.
export function leerCoordenadas(texto: string): { lat: number; lon: number } | null {
  const t = texto.trim();
  const m = t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ?? t.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
