import "server-only";
import { env } from "./env";
import { chapasConMoneda, leerCsv } from "./monedas-dominio";

// Google Sheets de monedas, publicado como CSV (MONEDAS_SHEET_CSV_URL). Se lee cada 10 minutos;
// si Google no responde se usa lo último leído, y si nunca se pudo leer, nada.
let cache: { hasta: number; chapas: Set<string> } | undefined;

export async function chapasConMonedaSheets(): Promise<Set<string>> {
  const url = env().MONEDAS_SHEET_CSV_URL;
  if (!url) return new Set();
  if (cache && cache.hasta > Date.now()) return cache.chapas;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "follow" });
    if (!r.ok) throw new Error(`Google respondió ${r.status}`);
    const chapas = chapasConMoneda(leerCsv(await r.text()));
    cache = { hasta: Date.now() + 10 * 60_000, chapas };
    return chapas;
  } catch (e) {
    console.error("[monedas] Sheets", e instanceof Error ? e.message : e);
    if (cache) cache.hasta = Date.now() + 60_000;
    return cache?.chapas ?? new Set();
  }
}
