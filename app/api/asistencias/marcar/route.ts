import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { accesoSolo, adondeSinSesion, usuarioActual } from "@/lib/auth";
import { env } from "@/lib/env";
import { CODIGO_SOLO_LECTURA, MENSAJE_SOLO_LECTURA, esSoloLectura } from "@/lib/solo-lectura";

export const dynamic = "force-dynamic";

// "Marcar asistencia" con ACCESO_SOLO: a ACCESO_URL/ir/asistencias?a=%2F%23%2Fmarcar.
// Apagado: link firmado que vale 2 minutos y abre en Asistencias la sesión de este mismo usuario.
// Firma: HMAC-SHA256(ASISTENCIAS_SECRET, "taller|<usuario>|<vence>"); el secreto es WEBHOOK_SECRET_TALLER allá.
export async function GET() {
  const u = await usuarioActual();
  // Location relativa: detrás del proxy req.url trae el host interno del contenedor, no el dominio.
  if (!u) return new NextResponse(null, { status: 303, headers: { Location: await adondeSinSesion() } });
  // La cuenta de solo lectura no marca asistencia: este enlace le abriría una sesión en Asistencias.
  if (esSoloLectura(u.rol)) return NextResponse.json({ error: MENSAJE_SOLO_LECTURA, codigo: CODIGO_SOLO_LECTURA }, { status: 403 });
  // Con ACCESO_SOLO pasa por Ridder Acceso: Acceso firma, abre Asistencias en Marcar y esa sesión queda atada a la de
  // Acceso (Salir la cierra). Apagado, el enlace directo de siempre.
  const acceso = accesoSolo();
  if (acceso) return NextResponse.redirect(`${acceso}/ir/asistencias?a=${encodeURIComponent("/#/marcar")}`, 303);
  const { ASISTENCIAS_URL, ASISTENCIAS_SECRET } = env();
  if (!ASISTENCIAS_URL || !ASISTENCIAS_SECRET) return NextResponse.json({ error: "Asistencias no está configurado" }, { status: 404 });
  const usuario = u.usuario.toLowerCase();
  const vence = Date.now() + 2 * 60_000;
  const firma = createHmac("sha256", ASISTENCIAS_SECRET).update(`taller|${usuario}|${vence}`).digest("hex");
  const t = `${Buffer.from(usuario).toString("base64url")}.${vence}.${firma}`;
  return NextResponse.redirect(`${ASISTENCIAS_URL.replace(/\/+$/, "")}/entrar/taller?t=${t}`, 303);
}
