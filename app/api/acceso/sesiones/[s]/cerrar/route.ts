import { errorJson, json, manejar } from "@/lib/api";
import { idSesionAcceso } from "@/lib/acceso-destino";
import { autorizarAcceso, cerrarSesionesDeAcceso } from "@/lib/acceso-api";

// Ridder Acceso cerró una sesión (la persona tocó Salir): cierra las sesiones de Taller abiertas desde ella.
// 200 { ok, sesiones } (también con 0) · 400 si <s> no son 32 hexadecimales · 401/429/503 como el resto de la API de
// Acceso. Nunca 404: Acceso toma un 404 como "este módulo todavía no tiene la ruta".
export const POST = manejar(async (req, ctx: RouteContext<"/api/acceso/sesiones/[s]/cerrar">) => {
  const origen = autorizarAcceso(req);
  const s = idSesionAcceso((await ctx.params).s);
  if (!s) return errorJson("La sesión de Acceso tiene que ser 32 hexadecimales en minúscula", 400);
  return json(await cerrarSesionesDeAcceso(s, origen));
});
