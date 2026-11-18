import { NextResponse, type NextRequest } from "next/server";
import { RUTA_HEADER, rutaPedida } from "@/lib/acceso-destino";

// Los layouts no reciben la ruta pedida: se pasa en una cabecera para que, sin sesión, Taller mande a Ridder Acceso
// con la ruta de vuelta (lib/auth.ts, sinSesion). Siempre se pisa, así nadie la puede mandar desde afuera.
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(RUTA_HEADER, rutaPedida(req.nextUrl.pathname, req.nextUrl.search));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|brand/|favicon|apple-icon|manifest|.*\\.(?:png|svg|ico|jpg|webp|txt|json)$).*)"],
};
