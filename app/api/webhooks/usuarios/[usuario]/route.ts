import { json, manejar } from "@/lib/api";
import { usuarioSchema } from "@/lib/credenciales";
import { cambiarDesdeCobranzas, cambioCobranzasSchema, estadoUsuario } from "@/lib/usuarios";
import { autorizarCobranzas } from "@/lib/webhook-cobranzas";

type Ctx = RouteContext<"/api/webhooks/usuarios/[usuario]">;

// Estado de una cuenta: Cobranzas lo muestra y lo usa para no pisar cuentas del taller.
export const GET = manejar(async (req, ctx: Ctx) => {
  autorizarCobranzas(req);
  return json(await estadoUsuario(usuarioSchema.parse((await ctx.params).usuario)));
});

// Cambiar contraseña y/o activar/desactivar. Solo cuentas creadas desde Cobranzas.
export const PATCH = manejar(async (req, ctx: Ctx) => {
  const origen = autorizarCobranzas(req);
  const usuario = usuarioSchema.parse((await ctx.params).usuario);
  return json(await cambiarDesdeCobranzas(usuario, cambioCobranzasSchema.parse(await req.json().catch(() => ({}))), origen));
});
