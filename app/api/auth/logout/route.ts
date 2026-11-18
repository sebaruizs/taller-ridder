import { destinoAlSalir, logout } from "@/lib/auth";
import { json, manejar } from "@/lib/api";

export const POST = manejar(async () => {
  await logout();
  // ir: adónde lleva el navegador. Con ACCESO_SOLO, a ACCESO_URL/salir (cierra también Acceso y los otros módulos).
  return json({ ok: true, ir: destinoAlSalir() });
});
