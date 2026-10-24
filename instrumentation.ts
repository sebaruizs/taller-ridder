export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { seedAdmin } = await import("./lib/seed");
  try {
    console.log("[seed]", await seedAdmin());
  } catch (e) {
    console.error("[seed] falló:", e);
  }
}
