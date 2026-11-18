// Piezas compartidas por los tests de ACCESO_SOLO (prendido y apagado): entorno con una base PGlite temporal propia,
// cookies y cabeceras de Next simuladas y redirect() que se puede atrapar. No es un test (vitest solo corre *.test.ts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SECRETO = "clave-del-enlace-de-acceso-de-32-caracteres-o-mas";
export const CLAVE_API = "clave-de-la-api-de-usuarios-de-acceso-0123456789";
export const ACCESO_URL = "https://app.ridder.test";

export function prepararEntorno(extra: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-acceso-solo-"));
  Object.assign(process.env, {
    DATABASE_URL: `pglite://${dir}`,
    SESSION_SECRET: "x".repeat(40),
    COOKIE_SECURE: "false",
    ODOO_URL: "http://odoo.invalid",
    ODOO_DB: "prueba",
    ODOO_USER: "api",
    ODOO_API_KEY: "clave",
    ACCESO_SECRET: SECRETO,
    ACCESO_URL,
    ACCESO_API_SECRET: CLAVE_API,
    ...extra,
  });
  return dir;
}

// Lo que ve lib/auth.ts de next/headers: un frasco de cookies y las cabeceras del pedido.
export const pedido = { cookies: new Map<string, { value: string; expires?: Date }>(), headers: new Headers() };
let ip = 0;
// Cada pedido con otra IP: los enlaces rechazados suman fallos por IP y no queremos que el bloqueo se cruce entre casos.
export function nuevoPedido(cabeceras: Record<string, string> = {}): void {
  pedido.headers = new Headers({ "x-forwarded-for": `10.0.0.${++ip}`, "user-agent": "vitest", ...cabeceras });
}

export const nextHeaders = {
  headers: async () => pedido.headers,
  cookies: async () => ({
    get: (n: string) => (pedido.cookies.has(n) ? { name: n, value: pedido.cookies.get(n)!.value } : undefined),
    set: (n: string, value: string, o: { expires?: Date } = {}) => void pedido.cookies.set(n, { value, expires: o.expires }),
    delete: (n: string) => void pedido.cookies.delete(n),
  }),
};

export class Redirigido extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
export const nextNavigation = {
  redirect: (url: string) => {
    throw new Redirigido(url);
  },
};

export async function redirigeA(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
  } catch (e) {
    if (e instanceof Redirigido) return e.url;
    throw e;
  }
  throw new Error("no redirigió");
}
