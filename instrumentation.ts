export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Variables prohibidas (por ejemplo, el Odoo simulado en producción): el servidor no arranca.
  const { errorDeEntorno } = await import("./lib/env");
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
