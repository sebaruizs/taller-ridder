import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Llamadas servidor a servidor desde Cobranzas: "Authorization: Bearer <WEBHOOK_USUARIOS_SECRET>"
// y "X-Ridder-Usuario" con el login de quien hizo la acción (URL-encoded) o "automatico".
export class WebhookApagado extends Error {}
export class WebhookNoAutorizado extends Error {}
export class WebhookInvalido extends Error {}

const resumen = (v: string) => createHash("sha256").update(v).digest();

export function autorizarCobranzas(req: Request): { origen: "cobranzas"; por: string } {
  const secreto = env().WEBHOOK_USUARIOS_SECRET;
  if (!secreto) throw new WebhookApagado("No encontrado");
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(resumen(recibido), resumen(secreto))) throw new WebhookNoAutorizado("No autorizado");
  return { origen: "cobranzas", por: quienHizo(req.headers.get("x-ridder-usuario")) };
}

export function quienHizo(crudo: string | null): string {
  let por: string;
  try {
    por = decodeURIComponent(crudo ?? "").trim();
  } catch {
    throw new WebhookInvalido("X-Ridder-Usuario mal codificado");
  }
  if (!por || por.length > 80) throw new WebhookInvalido("Falta X-Ridder-Usuario (login de quien hizo la acción, o «automatico»)");
  return por;
}
