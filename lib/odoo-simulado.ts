// Odoo simulado para probar en desarrollo (MOVIL_ODOO_SIMULADO=true; prohibido con NODE_ENV=production, ver env.ts).
// Las lecturas van al Odoo real; las escrituras NO salen: quedan en memoria y se superponen a lo que se lee, así un
// flujo (empezar → avance → cierre) se ve completo. Todo lo simulado sale en el log con "[odoo simulado]".
// Se pierde al reiniciar el servidor.
import type { Domain, Many2one } from "./odoo";

type Fila = Record<string, unknown> & { id: number };

export type ClienteOdoo = {
  searchRead<T>(model: string, domain: Domain, fields: string[], opts: { limit: number; offset?: number; order?: string; context?: Record<string, unknown> }): Promise<T[]>;
  readGroup<T>(model: string, domain: Domain, fields: string[], groupby: string[]): Promise<T[]>;
  searchCount(model: string, domain: Domain): Promise<number>;
  read<T>(model: string, ids: number[], fields: string[]): Promise<T[]>;
  write(model: string, ids: number[], vals: Record<string, unknown>): Promise<boolean>;
  create(model: string, vals: Record<string, unknown>): Promise<number>;
  boton<T = unknown>(model: string, method: string, ids: number[]): Promise<T>;
  unlink(model: string, ids: number[]): Promise<boolean>;
  messagePost(model: string, id: number, kwargs: Record<string, unknown>): Promise<number>;
};

// Campos many2one a contactos: al simularlos se busca el nombre real para que se lean como en Odoo.
const A_CONTACTO = new Set(["vendor_id", "purchaser_id", "driver_id", "partner_id", "author_id"]);

function valor(fila: Fila, campo: string): unknown {
  const v = fila[campo];
  return Array.isArray(v) ? v[0] : (v ?? false);
}

/**
 * Evalúa un dominio de Odoo sobre una fila (solo para las filas que la simulación cambió). Lo que no sabe evaluar
 * (campos con punto, operadores raros) cuenta como cumplido: ya lo filtró el Odoo real con el valor anterior.
 */
export function cumpleDominio(fila: Fila, dominio: Domain): boolean {
  let i = 0;
  const termino = (): boolean => {
    const t = dominio[i++];
    if (t === "|") return [termino(), termino()].some(Boolean);
    if (t === "&") return [termino(), termino()].every(Boolean);
    if (t === "!") return !termino();
    if (!Array.isArray(t)) return true;
    const [campo, op, esperado] = t;
    if (campo.includes(".") || !(campo in fila)) return true;
    const v = valor(fila, campo);
    switch (op) {
      case "=":
        return v === esperado;
      case "!=":
        return v !== esperado;
      case "in":
        return (esperado as unknown[]).includes(v);
      case "not in":
        return !(esperado as unknown[]).includes(v);
      case ">=":
        return String(v) >= String(esperado);
      case "<=":
        return String(v) <= String(esperado);
      default:
        return true;
    }
  };
  let ok = true;
  while (i < dominio.length) ok = termino() && ok;
  return ok;
}

const camposDe = (dominio: Domain) => dominio.filter((t): t is [string, string, unknown] => Array.isArray(t)).map((t) => t[0]).filter((c) => !c.includes("."));

/** Para el log: sin los binarios en base64. */
function resumir(v: unknown): string {
  const s = JSON.stringify(v, (k, x) => (k === "datas" && typeof x === "string" ? `<${Math.round((x.length * 3) / 4 / 1024)} KB>` : x));
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

export function crearOdooSimulado(real: ClienteOdoo, log: (msg: string) => void = (m) => console.info(m)): ClienteOdoo {
  const cambios = new Map<string, Map<number, Record<string, unknown>>>();
  const borradas = new Map<string, Set<number>>();
  let proximoId = 900_000_000;
  const aviso = (msg: string) => log(`[odoo simulado] ${msg}`);
  const cambiosDe = (model: string) => cambios.get(model) ?? new Map<number, Record<string, unknown>>();
  const borrada = (model: string, id: number) => borradas.get(model)?.has(id) ?? false;

  function aplicar<T>(model: string, filas: T[]): T[] {
    const c = cambiosDe(model);
    return filas.filter((f) => !borrada(model, (f as Fila).id)).map((f) => ({ ...f, ...(c.get((f as Fila).id) ?? {}) }));
  }

  async function nombreDe(campo: string, id: number): Promise<Many2one> {
    if (A_CONTACTO.has(campo)) {
      const [p] = await real.read<{ id: number; name: string }>("res.partner", [id], ["name"]).catch(() => []);
      if (p) return [id, p.name];
    }
    return [id, `#${id}`];
  }

  return {
    readGroup: (...a) => real.readGroup(...a),
    searchCount: (...a) => real.searchCount(...a),

    async read<T>(model: string, ids: number[], fields: string[]) {
      return aplicar(model, await real.read<T>(model, ids, fields));
    },

    async searchRead<T>(model: string, domain: Domain, fields: string[], opts: Parameters<ClienteOdoo["searchRead"]>[3]) {
      const reales = await real.searchRead<T>(model, domain, fields, opts);
      const c = cambiosDe(model);
      if (!c.size && !borradas.get(model)?.size) return reales;
      // Las filas cambiadas se vuelven a evaluar con sus valores simulados, estén o no en lo que trajo Odoo.
      const traidas = new Set(reales.map((f) => (f as Fila).id));
      const faltan = [...c.keys()].filter((id) => !traidas.has(id));
      const campos = [...new Set([...fields, ...camposDe(domain), "id"])];
      const extra = faltan.length ? await real.read<T>(model, faltan, campos).catch(() => [] as T[]) : [];
      return aplicar(model, [...reales, ...extra]).filter((f) => !c.has((f as Fila).id) || cumpleDominio(f as Fila, domain)).slice(0, opts.limit);
    },

    async write(model: string, ids: number[], vals: Record<string, unknown>) {
      const c = cambios.get(model) ?? new Map<number, Record<string, unknown>>();
      cambios.set(model, c);
      const leidos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(vals)) leidos[k] = k.endsWith("_id") && typeof v === "number" ? await nombreDe(k, v) : v;
      for (const id of ids) c.set(id, { ...(c.get(id) ?? {}), ...leidos });
      aviso(`${model}.write ${resumir(ids)} ${resumir(vals)}`);
      return true;
    },

    async create(model: string, vals: Record<string, unknown>) {
      const id = proximoId++;
      aviso(`${model}.create → ${id} ${resumir(vals)}`);
      return id;
    },

    async boton<T = unknown>(model: string, method: string, ids: number[]) {
      aviso(`${model}.${method} ${resumir(ids)}`);
      return true as T;
    },

    async unlink(model: string, ids: number[]) {
      const b = borradas.get(model) ?? new Set<number>();
      borradas.set(model, b);
      for (const id of ids) b.add(id);
      aviso(`${model}.unlink ${resumir(ids)}`);
      return true;
    },

    async messagePost(model: string, id: number, kwargs: Record<string, unknown>) {
      aviso(`${model}.message_post ${id} ${resumir(kwargs)}`);
      return proximoId++;
    },
  };
}
