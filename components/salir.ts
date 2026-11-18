"use client";
import type { useRouter } from "next/navigation";

// Botón Salir (barra de arriba, menú lateral y pestañas): borra la sesión de Taller y va adonde dice el servidor.
// Con ACCESO_SOLO es ACCESO_URL/salir, que cierra también Ridder Acceso (sale del sitio: navegación completa);
// apagado, /ingresar como siempre.
export async function salir(router: ReturnType<typeof useRouter>): Promise<void> {
  const d: { ir?: unknown } | null = await fetch("/api/auth/logout", { method: "POST" })
    .then((r) => r.json())
    .catch(() => null);
  const ir = typeof d?.ir === "string" ? d.ir : "/ingresar";
  if (/^https?:\/\//.test(ir)) {
    window.location.assign(ir);
    return;
  }
  router.replace(ir);
  router.refresh();
}
