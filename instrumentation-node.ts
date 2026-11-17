// Arranque en Node.js. instrumentation.ts lo importa solo en ese runtime: process.exit no existe en Edge.
import { errorDeEntorno } from "./lib/env";

export async function arrancar() {
  // Variables prohibidas (por ejemplo, el Odoo simulado en producción): el servidor no arranca.
  const prohibido = errorDeEntorno(process.env);
  if (prohibido) {
    console.error(`[entorno] ${prohibido}`);
    process.exit(1);
  }
  const { seedAdmin } = await import("./lib/seed");
  try {
    console.log("[seed]", await seedAdmin());
  } catch (e) {
    console.error("[seed] falló:", e);
  }
}
