import "server-only";
import { env } from "./env";

export type Many2one = [number, string] | false;
export type Domain = Array<string | [string, string, unknown]>;

export class OdooError extends Error {
  constructor(
    message: string,
    readonly detalle?: unknown,
  ) {
    super(message);
    this.name = "OdooError";
  }
}

export class OdooSoloLecturaError extends OdooError {
  constructor(model: string, method: string) {
    super(`Escritura bloqueada (ODOO_READONLY=true): ${model}.${method}`);
    this.name = "OdooSoloLecturaError";
  }
}

const METODOS_LECTURA = new Set([
  "search_read",
  "search_count",
  "read",
  "fields_get",
  "name_search",
  "read_group",
  "search",
]);

let rpcId = 0;
let uidPromise: Promise<number> | undefined;

async function rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
  const { ODOO_URL, ODOO_TIMEOUT_MS } = env();
  const res = await fetch(`${ODOO_URL.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: ++rpcId }),
    signal: AbortSignal.timeout(ODOO_TIMEOUT_MS),
    cache: "no-store",
  }).catch((e: unknown) => {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "Odoo no respondió a tiempo" : "No se pudo conectar con Odoo";
    throw new OdooError(msg, e instanceof Error ? e.message : e);
  });
  if (!res.ok) throw new OdooError(`Odoo respondió HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };
  if (json.error) {
    throw new OdooError(json.error.data?.message || json.error.message || "Error de Odoo", json.error.data?.name);
  }
  return json.result as T;
}

function uid(): Promise<number> {
  if (!uidPromise) {
    const { ODOO_DB, ODOO_USER, ODOO_API_KEY } = env();
    uidPromise = rpc<number | false>("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}])
      .then((u) => {
        if (!u) throw new OdooError("Odoo rechazó las credenciales (ODOO_USER / ODOO_API_KEY)");
        return u;
      })
      .catch((e) => {
        uidPromise = undefined;
        throw e;
      });
  }
  return uidPromise;
}

export async function executeKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const { ODOO_DB, ODOO_API_KEY, ODOO_READONLY } = env();
  if (ODOO_READONLY && !METODOS_LECTURA.has(method)) throw new OdooSoloLecturaError(model, method);
  return rpc<T>("object", "execute_kw", [ODOO_DB, await uid(), ODOO_API_KEY, model, method, args, kwargs]);
}

export const odoo = {
  searchRead<T>(model: string, domain: Domain, fields: string[], opts: { limit: number; offset?: number; order?: string; context?: Record<string, unknown> }) {
    return executeKw<T[]>(model, "search_read", [domain], { fields, ...opts });
  },
  readGroup<T>(model: string, domain: Domain, fields: string[], groupby: string[]) {
    return executeKw<T[]>(model, "read_group", [domain, fields, groupby], { lazy: true });
  },
  searchCount(model: string, domain: Domain) {
    return executeKw<number>(model, "search_count", [domain]);
  },
  read<T>(model: string, ids: number[], fields: string[]) {
    return executeKw<T[]>(model, "read", [ids, fields]);
  },
  write(model: string, ids: number[], vals: Record<string, unknown>) {
    return executeKw<boolean>(model, "write", [ids, vals]);
  },
  create(model: string, vals: Record<string, unknown>) {
    return executeKw<number>(model, "create", [vals]);
  },
  // Métodos de botón de Odoo (button_confirm, button_validate…). Cuentan como escritura.
  boton<T = unknown>(model: string, method: string, ids: number[]) {
    return executeKw<T>(model, method, [ids]);
  },
  unlink(model: string, ids: number[]) {
    return executeKw<boolean>(model, "unlink", [ids]);
  },
  messagePost(model: string, id: number, kwargs: Record<string, unknown>) {
    return executeKw<number>(model, "message_post", [[id]], kwargs);
  },
};

export type OdooClient = typeof odoo;

export function m2oId(v: Many2one): number | null {
  return v ? v[0] : null;
}

export function m2oNombre(v: Many2one): string | null {
  return v ? v[1] : null;
}
