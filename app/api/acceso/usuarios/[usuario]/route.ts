import { json, manejar } from "@/lib/api";
import { usuarioSchema } from "@/lib/credenciales";
import { autorizarAcceso, estadoParaAcceso, guardarDesdeAcceso } from "@/lib/acceso-api";
import { usuarioAccesoSchema } from "@/lib/acceso-api-dominio";

type Ctx = RouteContext<"/api/acceso/usuarios/[usuario]">;

// Ridder Acceso («Personas y permisos») consulta el estado de una cuenta.
export const GET = manejar(async (req, ctx: Ctx) => {
  autorizarAcceso(req);
  return json(await estadoParaAcceso(usuarioSchema.parse((await ctx.params).usuario)));
});

// Crea el usuario o actualiza nombre, rol, activo y contacto de Odoo. Idempotente; nunca borra.
export const PUT = manejar(async (req, ctx: Ctx) => {
  const origen = autorizarAcceso(req);
  const usuario = usuarioSchema.parse((await ctx.params).usuario);
  const r = await guardarDesdeAcceso(usuario, usuarioAccesoSchema.parse(await req.json().catch(() => ({}))), origen);
  return json(r, r.creado ? 201 : 200);
});
