import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { NoAutorizado, usuarioDePedido } from "./auth";
import { OdooError } from "./odoo";
import { ErrorUsuario, UsuarioAjeno, UsuarioNoEncontrado } from "./usuarios";
import { WebhookApagado, WebhookInvalido, WebhookNoAutorizado } from "./webhook-cobranzas";
import { NoVerificable } from "./verificar";
import { ProductoInvalido } from "./crear-producto";
import { CompraInvalida } from "./crear-compra";
import { ErrorGps } from "./gps";
import { DevolucionInvalida, DevolucionNoEncontrada } from "./devoluciones";
import { SoloLectura, conContexto, esPeticionDeLectura, rechazarEscritura } from "./solo-lectura";
import { AccesoApagado, AccesoConflicto, AccesoDemasiados, AccesoNoAutorizado } from "./acceso-api";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(error: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, status);
}

export function manejar<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return (req: Request, ctx: C) => conContexto(req, async () => {
    try {
      // Cuenta de solo lectura (rol revisor): ninguna escritura llega a la ruta. Esto es un atajo: la barrera está en
      // usuarioActual y personaDeDispositivo, que revisan al mismo usuario que después usa la ruta.
      if (!esPeticionDeLectura(req.method)) {
        // Un usuario que no se puede resolver (llamada de Cobranzas a nombre de alguien que no está en Taller) no es
        // un revisor: lo decide la ruta, como siempre. Un error de la base sí corta acá.
        const u = await usuarioDePedido(req).catch((e) => {
          if (e instanceof NoAutorizado) return null;
          throw e;
        });
        if (u) rechazarEscritura(u.rol, req);
      }
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof SoloLectura) return errorJson(e.message, e.status, { codigo: e.codigo });
      if (e instanceof NoAutorizado) return errorJson(e.message, e.status);
      if (e instanceof ZodError) return errorJson(e.issues[0]?.message ?? "Datos inválidos", 400);
      if (e instanceof ErrorUsuario) return errorJson(e.message, 400);
      if (e instanceof WebhookApagado || e instanceof UsuarioNoEncontrado) return errorJson(e.message, 404);
      if (e instanceof WebhookNoAutorizado) return errorJson(e.message, 401);
      if (e instanceof WebhookInvalido) return errorJson(e.message, 400);
      if (e instanceof UsuarioAjeno) return errorJson(e.message, 409);
      if (e instanceof NoVerificable) return errorJson(e.message, 409);
      if (e instanceof ProductoInvalido) return errorJson(e.message, 400);
      if (e instanceof CompraInvalida) return errorJson(e.message, 400);
      if (e instanceof DevolucionInvalida) return errorJson(e.message, 400);
      if (e instanceof DevolucionNoEncontrada) return errorJson(e.message, 404);
      if (e instanceof AccesoApagado) return errorJson(e.message, 503);
      if (e instanceof AccesoNoAutorizado) return errorJson(e.message, 401);
      if (e instanceof AccesoDemasiados) return errorJson(e.message, 429);
      if (e instanceof AccesoConflicto) return errorJson(e.message, 409);
      if (e instanceof ErrorGps) return errorJson(e.message, e.status, e.extra);
      if (e instanceof OdooError) {
        console.error("[odoo]", e.message, e.detalle);
        return errorJson(`Odoo: ${e.message}`, 502);
      }
      console.error(e);
      return errorJson("Error inesperado", 500);
    }
  });
}
