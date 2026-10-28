import "server-only";
import { env } from "./env";
import { leerCsv, monedasPorChapa } from "./monedas-dominio";

// Google Sheets de monedas, publicado como CSV (MONEDAS_SHEET_CSV_URL). Se lee cada 10 minutos;
// si Google no responde se usa lo último leído, y si nunca se pudo leer, nada.
let cache: { hasta: number; monedas: Map<string, string> } | undefined;

// Chapa → lo que dice la hoja («Moneda Google», «Sin moneda» o el nombre de la moneda).
export async function monedasSheets(): Promise<Map<string, string>> {
  const url = env().MONEDAS_SHEET_CSV_URL;
  if (!url) return new Map();
  if (cache && cache.hasta > Date.now()) return cache.monedas;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "follow" });
    if (!r.ok) throw new Error(`Google respondió ${r.status}`);
    const monedas = monedasPorChapa(leerCsv(await r.text()));
    cache = { hasta: Date.now() + 10 * 60_000, monedas };
    return monedas;
  } catch (e) {
    console.error("[monedas] Sheets", e instanceof Error ? e.message : e);
    if (cache) cache.hasta = Date.now() + 60_000;
    return cache?.monedas ?? new Map();
  }
}
