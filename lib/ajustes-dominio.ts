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
