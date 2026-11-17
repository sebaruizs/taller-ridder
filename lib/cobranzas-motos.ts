import "server-only";
import { z } from "zod";
import { env } from "./env";

// Motos que tienen que volver a Ridder, según Cobranzas:
//   GET <COBRANZAS_URL>/api/integraciones/taller/motos-a-devolver, "Authorization: Bearer <TALLER_LECTURA_SECRET>".
// Hoy solo informa recuperos (clientes «Para recuperar»). Cobranzas cachea Odoo unos minutos: se consulta a lo sumo
// cada 5 minutos. Si no está configurado o no responde, null: quien llama lee Odoo directo (lib/movil.ts).

const respuestaSchema = z.object({
  generado: z.string().optional(),
  motivos: z.array(z.string()),
  motos: z.array(
    z.object({
      vehiculoId: z.number().int().positive(),
      chapa: z.string().optional(),
      motivo: z.string(),
      desde: z.string().nullable().optional(),
      cliente: z.string().optional().default(""),
    }),
  ),
});

export type MotoADevolver = { cliente: string; desde: string | null };

const VIDA_MS = 5 * 60_000;
let cache: { hasta: number; motos: Map<number, MotoADevolver> } | undefined;

/** Pura: de la respuesta de Cobranzas, las motos a recuperar (id de fleet.vehicle → cliente y desde). */
export function recuperosDe(cuerpo: unknown): Map<number, MotoADevolver> {
  const r = respuestaSchema.parse(cuerpo);
  if (!r.motivos.includes("recupero")) throw new Error("Cobranzas no informa recuperos");
  return new Map(r.motos.filter((m) => m.motivo === "recupero").map((m) => [m.vehiculoId, { cliente: m.cliente, desde: m.desde ?? null }]));
}

export async function recuperosDeCobranzas(ahora = Date.now()): Promise<Map<number, MotoADevolver> | null> {
  const { COBRANZAS_URL, TALLER_LECTURA_SECRET } = env();
  if (!COBRANZAS_URL || TALLER_LECTURA_SECRET.length < 32) return null;
  if (cache && cache.hasta > ahora) return cache.motos;
  try {
    const res = await fetch(`${COBRANZAS_URL.replace(/\/$/, "")}/api/integraciones/taller/motos-a-devolver`, {
      headers: { Authorization: `Bearer ${TALLER_LECTURA_SECRET}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Cobranzas respondió ${res.status}`);
    const motos = recuperosDe(await res.json());
    cache = { hasta: ahora + VIDA_MS, motos };
    return motos;
  } catch (e) {
    console.error("[cobranzas] motos a devolver:", e instanceof Error ? e.message : e);
    // Lo último leído sirve un rato más; si nunca se pudo leer, Odoo directo.
    if (cache) {
      cache.hasta = ahora + 60_000;
      return cache.motos;
    }
    return null;
  }
}

/** Solo para tests. */
export function olvidarCache() {
  cache = undefined;
}
