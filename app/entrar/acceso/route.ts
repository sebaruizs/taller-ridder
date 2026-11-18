import { NextResponse } from "next/server";
import { entrarConAcceso } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Puerta de entrada desde Ridder Acceso: GET /entrar/acceso?t=<usuario>.<vence>.<firma> (ver lib/acceso-dominio.ts).
// Si el enlace sirve, abre la sesión y manda al inicio del rol (con ACCESO_SOLO, a la ruta `a` si pasa la regla de
// lib/acceso-destino.ts, y guarda `s`). Si no, a /ingresar?acceso=<motivo>, una página de Taller con el motivo:
// nunca de vuelta a Acceso sola, que armaría un rulo.
// Location relativa: detrás del proxy req.url trae el host interno del contenedor, no el dominio.
export async function GET(req: Request) {
  const ir = (a: string) => new NextResponse(null, { status: 303, headers: { Location: a, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  try {
    const q = new URL(req.url).searchParams;
    const r = await entrarConAcceso(q.get("t"), { a: q.get("a"), s: q.get("s") });
    return ir(r.ok ? r.destino : `/ingresar?acceso=${r.motivo}`);
  } catch (e) {
    console.error("[acceso] falló la entrada:", e instanceof Error ? e.message : e);
    return ir("/ingresar?acceso=invalido");
  }
}
