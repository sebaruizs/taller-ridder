import { NextResponse } from "next/server";
import { entrarConAcceso } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Puerta de entrada desde Ridder Acceso: GET /entrar/acceso?t=<usuario>.<vence>.<firma> (ver lib/acceso-dominio.ts).
// Si el enlace sirve, abre la sesión y manda al inicio del rol; si no, al login con el motivo a la vista.
// Location relativa: detrás del proxy req.url trae el host interno del contenedor, no el dominio.
export async function GET(req: Request) {
  const ir = (a: string) => new NextResponse(null, { status: 303, headers: { Location: a, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  try {
    const r = await entrarConAcceso(new URL(req.url).searchParams.get("t"));
    return ir(r.ok ? r.destino : `/ingresar?acceso=${r.motivo}`);
  } catch (e) {
    console.error("[acceso] falló la entrada:", e instanceof Error ? e.message : e);
    return ir("/ingresar?acceso=invalido");
  }
}
