import { json, manejar } from "@/lib/api";
import { usuarioSchema } from "@/lib/credenciales";
import { autorizarAcceso, cerrarSesionesDesdeAcceso } from "@/lib/acceso-api";

// Ridder Acceso cerró un teléfono o cambió la contraseña de la persona: cierra todas sus sesiones en Taller.
// 200 { ok, sesiones } (también con 0) · 404 si el usuario no existe · 401/429/503 como el resto de la API de Acceso.
export const POST = manejar(async (req, ctx: RouteContext<"/api/acceso/usuarios/[usuario]/cerrar-sesiones">) => {
  const origen = autorizarAcceso(req);
  return json(await cerrarSesionesDesdeAcceso(usuarioSchema.parse((await ctx.params).usuario), origen));
});
