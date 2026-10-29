import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// "Marcar asistencia": link firmado que vale 2 minutos y abre en Asistencias la sesión de este mismo usuario.
// Firma: HMAC-SHA256(ASISTENCIAS_SECRET, "taller|<usuario>|<vence>"); el secreto es WEBHOOK_SECRET_TALLER allá.
export async function GET() {
  const u = await usuarioActual();
  // Location relativa: detrás del proxy req.url trae el host interno del contenedor, no el dominio.
  if (!u) return new NextResponse(null, { status: 303, headers: { Location: "/ingresar" } });
  const { ASISTENCIAS_URL, ASISTENCIAS_SECRET } = env();
  if (!ASISTENCIAS_URL || !ASISTENCIAS_SECRET) return NextResponse.json({ error: "Asistencias no está configurado" }, { status: 404 });
  const usuario = u.usuario.toLowerCase();
  const vence = Date.now() + 2 * 60_000;
  const firma = createHmac("sha256", ASISTENCIAS_SECRET).update(`taller|${usuario}|${vence}`).digest("hex");
  const t = `${Buffer.from(usuario).toString("base64url")}.${vence}.${firma}`;
  return NextResponse.redirect(`${ASISTENCIAS_URL.replace(/\/+$/, "")}/entrar/taller?t=${t}`, 303);
}
