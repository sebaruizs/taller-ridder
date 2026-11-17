// API móvil (Ridder App) de punta a punta: los route handlers reales, una base PGlite temporal con las migraciones y
// un Odoo simulado en memoria.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-movil-"));
const TOKEN = "token-de-prueba-largo-1234";
Object.assign(process.env, {
  DATABASE_URL: `pglite://${dir}`,
  SESSION_SECRET: "x".repeat(40),
  ODOO_URL: "http://odoo.invalid",
  ODOO_DB: "prueba",
  ODOO_USER: "api",
  ODOO_API_KEY: "clave",
  MOVIL_PRUEBA_TOKEN: TOKEN,
  TELEGRAM_CHAT_TALLER: "-1",
  TELEGRAM_CHAT_ERRORES: "-2",
});

// ---------- Odoo simulado ----------
type Fila = Record<string, unknown> & { id: number };
const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const tablas: Record<string, Map<number, Fila>> = {};
const tabla = (m: string) => (tablas[m] ??= new Map());
const llamadas: string[] = [];
const notas: { id: number; body: string; adjuntos: number[] }[] = [];
let fallar: ((metodo: string) => boolean) | null = null;
let proximoId = 9000;

function valorDe(fila: Fila, campo: string): unknown {
  const v = fila[campo];
  if (campo === "active" && v === undefined) return true;
  return Array.isArray(v) ? v[0] : (v ?? false);
}
function cumple(fila: Fila, dominio: unknown[]): boolean {
  let i = 0;
  const termino = (): boolean => {
    const t = dominio[i++];
    if (t === "|") return [termino(), termino()].some(Boolean);
    if (t === "&") return [termino(), termino()].every(Boolean);
    const [campo, op, valor] = t as [string, string, unknown];
    const v = valorDe(fila, campo);
    if (op === "=") return v === valor;
    if (op === "!=") return v !== valor;
    if (op === "in") return (valor as unknown[]).includes(v);
    throw new Error(`operador no simulado: ${op}`);
  };
  let ok = true;
  while (i < dominio.length) ok = termino() && ok;
  return ok;
}
const revisar = (metodo: string) => {
  llamadas.push(metodo);
  if (fallar?.(metodo)) throw new Error(`Odoo simulado: falla en ${metodo}`);
};
const odooFalso = {
  async searchRead(model: string, dominio: unknown[], _f: string[], opts: { limit: number; order?: string }) {
    revisar(`searchRead ${model}`);
    const filas = [...tabla(model).values()].filter((f) => cumple(f, dominio));
    if (opts.order?.startsWith("date_start desc")) filas.sort((a, b) => String(b.date_start).localeCompare(String(a.date_start)));
    return filas.slice(0, opts.limit).map((f) => ({ ...f }));
  },
  async read(model: string, ids: number[]) {
    revisar(`read ${model}`);
    return ids.map((id) => tabla(model).get(id)).filter(Boolean).map((f) => ({ ...f }));
  },
  async write(model: string, ids: number[], vals: Record<string, unknown>) {
    revisar(`write ${model}`);
    for (const id of ids) {
      const f = tabla(model).get(id)!;
      // Como Odoo: un many2one se escribe con el id y se lee como [id, nombre].
      for (const [k, v] of Object.entries(vals)) f[k] = k.endsWith("_id") && typeof v === "number" ? [v, `Contacto ${v}`] : v;
    }
    return true;
  },
  async create(model: string, vals: Record<string, unknown>) {
    revisar(`create ${model}`);
    const id = proximoId++;
    tabla(model).set(id, { id, ...vals });
    return id;
  },
  async messagePost(_model: string, id: number, kwargs: { body: string; attachment_ids?: number[] }) {
    revisar("messagePost");
    notas.push({ id, body: kwargs.body, adjuntos: kwargs.attachment_ids ?? [] });
    return 1;
  },
};
vi.mock("@/lib/odoo", async (original) => ({ ...(await original<typeof import("@/lib/odoo")>()), odoo: odooFalso }));
const telegram = vi.fn(async () => {});
vi.mock("@/lib/telegram", () => ({ enviarTelegram: telegram, diagnosticoTelegram: async () => ({}) }));

const CARLOS = 1685;
const ANGEL = 2006;
function sembrarOdoo() {
  const v = tabla("fleet.vehicle");
  v.set(10, { id: 10, display_name: "Kenton/GTR 150/827ABTI", license_plate: "827ABTI", driver_id: [500, "Juan Chofer"], state_id: [3, "Alquilado"], odometer: 18000 });
  v.set(11, { id: 11, display_name: "Leopard/150/702HJKL", license_plate: "702HJKL", driver_id: false, state_id: [1, "Para entregar"], odometer: 9000 });
  const orden = (id: number, state: string, vendor: [number, string] | false, vehiculo = 10) => ({
    id,
    vehicle_id: vehiculo === 10 ? [10, "Kenton/GTR 150/827ABTI"] : [11, "Leopard/150/702HJKL"],
    service_type_id: [1, "Service general"],
    description: "Cambio de aceite y frenos",
    state,
    vendor_id: vendor,
    purchaser_id: false,
    date: HOY,
    service_end_date: false,
    odometer: 0,
    amount: 0,
    total_products_cost: 0,
  });
  const o = tabla("fleet.vehicle.log.services");
  o.set(100, orden(100, "running", false));
  o.set(101, orden(101, "running", [ANGEL, "Angel Ramos"]));
  o.set(102, orden(102, "new", false));
  o.set(103, orden(103, "running", [CARLOS, "Carlos Ramirez"], 11));
  // Cliente «Para recuperar» con su suscripción cerrada: la moto ya no tiene chofer en Odoo.
  v.set(12, { id: 12, display_name: "Kenton/GTR150 LTD/819ABTK", license_plate: "819ABTK", driver_id: false, state_id: [7, "Fiscalia / Comisaria"], odometer: 5100 });
  tabla("request.status").set(11, { id: 11, name: "Para recuperar" });
  tabla("request.status").set(8, { id: 8, name: "Recuperado" });
  tabla("res.partner").set(600, { id: 600, name: "Ernesto Soler", request_status_id: [11, "Para recuperar"] });
  tabla("res.partner").set(601, { id: 601, name: "Otro", request_status_id: [8, "Recuperado"] });
  tabla("sale.order").set(1, { id: 1, partner_id: [600, "Ernesto Soler"], vehicle_id: [12, "Kenton/GTR150 LTD/819ABTK"], subscription_state: "6_churn" });
  tabla("sale.order").set(2, { id: 2, partner_id: [601, "Otro"], vehicle_id: [11, "Leopard/150/702HJKL"], subscription_state: "6_churn" });
  tabla("fleet.vehicle.assignation.log").set(1, { id: 1, vehicle_id: [10, "x"], driver_id: [500, "Juan Chofer"], date_start: "2026-01-10" });
}

// ---------- helpers ----------
const { GET: getTareas } = await import("@/app/api/movil/taller/tareas/route");
const { GET: getVehiculos } = await import("@/app/api/movil/devolucion/vehiculos/route");
const { POST: postRegistro } = await import("@/app/api/movil/registros/route");
const { getDb, schema } = await import("@/lib/db");

const auth = (usuario: string, token = TOKEN) => ({ authorization: `Bearer ${usuario}.${token}` });
const ctx = {} as never;
async function tareas(usuario = "carlos.ramirez") {
  const r = await getTareas(new Request("http://t/api/movil/taller/tareas", { headers: auth(usuario) }), ctx);
  return { status: r.status, body: await r.json() };
}
async function enviar(usuario: string, cuerpo: unknown, headers: Record<string, string> = auth(usuario)) {
  const r = await postRegistro(
    new Request("http://t/api/movil/registros", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
    ctx,
  );
  return { status: r.status, body: await r.json() };
}
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]).toString("base64")}`;
const foto = (toma: string) => ({ id: randomUUID(), toma, datos: JPEG });
const registro = (tipo: string, datos: Record<string, unknown>, fotos: unknown[] = []) => ({ id: randomUUID(), tipo, creado: new Date().toISOString(), datos, fotos });

beforeAll(async () => {
  sembrarOdoo();
  const db = await getDb();
  await db.insert(schema.usuarios).values([
    { usuario: "carlos.ramirez", nombre: "Carlos Ramirez", rol: "mecanico", passwordHash: "x", odooPartnerId: CARLOS },
    { usuario: "angel.ramos", nombre: "Angel Ramos", rol: "mecanico", passwordHash: "x", odooPartnerId: ANGEL },
    { usuario: "jefe.prueba", nombre: "Jefe de Taller", rol: "jefe", passwordHash: "x" },
    { usuario: "dado.de.baja", nombre: "Baja", rol: "mecanico", passwordHash: "x", odooPartnerId: 77, activo: false },
  ]);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("autenticación (personaDeDispositivo)", () => {
  it("sin credencial, token equivocado o usuario inactivo: 401", async () => {
    expect((await getTareas(new Request("http://t/x"), ctx)).status).toBe(401);
    expect((await getTareas(new Request("http://t/x", { headers: auth("carlos.ramirez", "otro-token-cualquiera-xx") }), ctx)).status).toBe(401);
    expect((await getTareas(new Request("http://t/x", { headers: auth("dado.de.baja") }), ctx)).status).toBe(401);
    expect((await getTareas(new Request("http://t/x", { headers: auth("no.existe") }), ctx)).status).toBe(401);
    expect((await enviar("carlos.ramirez", registro("taller.inicio", { tareaId: "100" }), {})).status).toBe(401);
  });

  it("en producción rechaza todo, aun con el token de prueba", async () => {
    const antes = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect((await tareas()).status).toBe(401);
    } finally {
      vi.stubEnv("NODE_ENV", antes ?? "test");
    }
  });
});

describe("tareas del mecánico: inicio → avance → cierre", () => {
  const inicio = registro("taller.inicio", { tareaId: "100" });

  it("baja sus órdenes en proceso y las sin mecánico, no las de otro ni las nuevas", async () => {
    const r = await tareas();
    expect(r.status).toBe(200);
    expect(r.body.map((t: { id: string }) => t.id)).toEqual(["100", "103"]);
    expect(r.body[0]).toEqual({
      id: "100",
      ordenId: "100",
      chapa: "827ABTI",
      modelo: "Kenton GTR 150",
      titulo: "Service general",
      indicaciones: "Cambio de aceite y frenos",
      estado: "pendiente",
      asignada: false,
    });
  });

  it("el jefe sin contacto de Odoo no tiene tareas; el permiso se controla", async () => {
    expect((await tareas("jefe.prueba")).body).toEqual([]);
  });

  it("inicio: queda en curso desde la hora del teléfono y la orden a su nombre", async () => {
    const r = await enviar("carlos.ramirez", inicio);
    expect(r).toEqual({ status: 200, body: { resultado: "aceptado" } });
    expect(tabla("fleet.vehicle.log.services").get(100)!.vendor_id).toEqual([CARLOS, `Contacto ${CARLOS}`]);
    expect(notas.at(-1)!.body).toContain("Trabajo empezado por Carlos Ramirez");
    const t = (await tareas()).body.find((x: { id: string }) => x.id === "100");
    expect(t).toMatchObject({ estado: "en_curso", inicio: new Date(inicio.creado).toISOString(), asignada: true });
    // Ya es de Carlos: Angel no la ve.
    expect((await tareas("angel.ramos")).body.map((x: { id: string }) => x.id)).toEqual(["101"]);
  });

  it("un inicio repetido se acepta sin aplicarlo de nuevo", async () => {
    const antes = llamadas.length;
    const notasAntes = notas.length;
    expect(await enviar("carlos.ramirez", inicio)).toEqual({ status: 200, body: { resultado: "aceptado" } });
    expect(notas.length).toBe(notasAntes);
    expect(llamadas.slice(antes).filter((m) => !m.startsWith("read") && !m.startsWith("searchRead"))).toEqual([]);
  });

  it("el mismo id mandado por otra persona se rechaza", async () => {
    expect((await enviar("angel.ramos", inicio)).body).toEqual({ resultado: "rechazado", motivo: "Este registro ya lo envió otra persona" });
  });

  it("avance con fotos: adjuntos en la orden y una nota con ellos", async () => {
    const r = await enviar("carlos.ramirez", registro("taller.avance", { tareaId: "100", nota: "Falta el repuesto de freno" }, [foto("avance"), foto("avance")]));
    expect(r.status).toBe(200);
    const n = notas.at(-1)!;
    expect(n.body).toContain("Avance de Carlos Ramirez");
    expect(n.body).toContain("Falta el repuesto de freno");
    expect(n.adjuntos).toHaveLength(2);
    expect(n.adjuntos.every((id) => tabla("ir.attachment").get(id)?.res_id === 100)).toBe(true);
  });

  it("avance sin nota ni fotos: rechazado, y el rechazo se repite igual", async () => {
    const vacio = registro("taller.avance", { tareaId: "100" });
    const esperado = { status: 422, body: { resultado: "rechazado", motivo: "El avance no tiene nota ni fotos" } };
    expect(await enviar("carlos.ramirez", vacio)).toEqual(esperado);
    expect(await enviar("carlos.ramirez", vacio)).toEqual(esperado);
  });

  it("cierre sin foto o sin nota: rechazado", async () => {
    expect((await enviar("carlos.ramirez", registro("taller.cierre", { tareaId: "100", nota: "Listo" }))).body.motivo).toBe(
      "Para cerrar la tarea hace falta al menos una foto",
    );
    expect((await enviar("carlos.ramirez", registro("taller.cierre", { tareaId: "100" }, [foto("cierre")]))).body.motivo).toBe(
      "Para cerrar la tarea hace falta una nota de lo que se hizo",
    );
  });

  const cierre = registro("taller.cierre", { tareaId: "100", nota: "Cambié aceite y pastillas", odometro: 18100 }, [foto("cierre")]);

  it("cierre: la orden pasa a Listo para verificar (finalización de siempre) y la tarea queda lista", async () => {
    expect(await enviar("carlos.ramirez", cierre)).toEqual({ status: 200, body: { resultado: "aceptado" } });
    const o = tabla("fleet.vehicle.log.services").get(100)!;
    expect(o.state).toBe("cancelled");
    expect(o.odometer).toBe(18100);
    expect(notas.some((n) => n.id === 100 && n.body.includes("Trabajo finalizado por Carlos Ramirez"))).toBe(true);
    expect(telegram).toHaveBeenCalledTimes(1);
    const db = await getDb();
    const fins = await db.select().from(schema.finalizaciones);
    expect(fins.map((f) => [f.clave, f.ordenId, f.observacion])).toEqual([[cierre.id, 100, "Cambié aceite y pastillas"]]);
    expect((await tareas()).body.find((x: { id: string }) => x.id === "100")).toMatchObject({ estado: "lista", inicio: new Date(inicio.creado).toISOString() });
  });

  it("un cierre repetido no finaliza dos veces", async () => {
    const notasAntes = notas.length;
    expect(await enviar("carlos.ramirez", cierre)).toEqual({ status: 200, body: { resultado: "aceptado" } });
    expect(notas.length).toBe(notasAntes);
    expect(telegram).toHaveBeenCalledTimes(1);
  });

  it("después del cierre la tarea no admite más avances ni otro cierre", async () => {
    expect((await enviar("carlos.ramirez", registro("taller.avance", { tareaId: "100", nota: "Otra cosa" }))).body.motivo).toBe(
      "La tarea ya se cerró: no admite más cambios",
    );
    expect((await enviar("carlos.ramirez", registro("taller.cierre", { tareaId: "100", nota: "De nuevo" }, [foto("cierre")]))).body.motivo).toBe(
      "La tarea ya se había cerrado",
    );
  });
});

describe("rechazos de tareas", () => {
  it("reasignada a otro mecánico, orden nueva, orden borrada, tarea inexistente", async () => {
    const motivo = async (datos: Record<string, unknown>) => (await enviar("carlos.ramirez", registro("taller.inicio", datos))).body.motivo;
    expect(await motivo({ tareaId: "101" })).toBe("La tarea fue reasignada a Angel Ramos");
    expect(await motivo({ tareaId: "102" })).toBe("La orden todavía no está En proceso: la pasa el jefe de taller desde el tablero");
    expect(await motivo({ tareaId: "999" })).toBe("La orden ya no existe en Taller (se eliminó)");
    expect(await motivo({ tareaId: "t1" })).toBe("La tarea no existe en Taller");
  });

  it("el jefe sin contacto de Odoo no puede tomar tareas", async () => {
    expect((await enviar("jefe.prueba", registro("taller.inicio", { tareaId: "103" }))).body.motivo).toMatch(/no está vinculado a un contacto de Odoo/);
  });

  it("tipo desconocido, registro mal formado o foto que no es JPEG: 422, nunca un error para reintentar", async () => {
    expect((await enviar("carlos.ramirez", registro("cobranzas.gestion", { x: 1 }))).body.motivo).toBe("Taller no recibe registros de tipo «cobranzas.gestion»");
    expect((await enviar("carlos.ramirez", { tipo: "taller.inicio", datos: {} })).status).toBe(422);
    const png = { id: "p", toma: "avance", datos: `data:image/png;base64,${Buffer.from("x").toString("base64")}` };
    expect((await enviar("carlos.ramirez", registro("taller.avance", { tareaId: "103", nota: "x" }, [png]))).body.motivo).toBe("Las fotos tienen que ser JPEG");
  });
});

describe("Odoo caído a mitad de un avance", () => {
  it("responde 503 y el reintento sigue sin duplicar fotos", async () => {
    const av = registro("taller.avance", { tareaId: "103", nota: "Cambié la cadena" }, [foto("avance")]);
    fallar = (m) => m === "messagePost";
    const r1 = await enviar("carlos.ramirez", av);
    expect(r1.status).toBe(503);
    const adjuntos = [...tabla("ir.attachment").values()].filter((a) => a.res_id === 103);
    expect(adjuntos).toHaveLength(1);
    fallar = null;
    expect((await enviar("carlos.ramirez", av)).status).toBe(200);
    expect([...tabla("ir.attachment").values()].filter((a) => a.res_id === 103)).toHaveLength(1);
    expect(notas.at(-1)).toMatchObject({ id: 103, adjuntos: [adjuntos[0].id] });
  });
});

describe("devolución de vehículos", () => {
  const datos = (extra: Record<string, unknown> = {}) => ({
    vehiculo: { id: "10", chapa: "827 ABTI", modelo: "Kenton GTR 150" },
    kilometraje: 18500,
    entregoLlave: true,
    danos: ["Rayones", "Golpes"],
    observaciones: "Llegó sin el espejo izquierdo",
    ...extra,
  });
  const cinco = () => ["frente", "izquierda", "derecha", "atras", "tablero"].map(foto);

  it("baja las motos con chofer (sin motivo) y las de clientes «Para recuperar» (recupero); el mecánico no puede", async () => {
    const r = await getVehiculos(new Request("http://t/x", { headers: auth("jefe.prueba") }), ctx);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([
      { id: "10", chapa: "827ABTI", modelo: "Kenton GTR 150", cliente: "Juan Chofer", motivo: null, kmAnterior: 18000 },
      { id: "12", chapa: "819ABTK", modelo: "Kenton GTR150 LTD", cliente: "Ernesto Soler", motivo: "recupero", kmAnterior: 5100 },
    ]);
    expect((await getVehiculos(new Request("http://t/x", { headers: auth("carlos.ramirez") }), ctx)).status).toBe(403);
  });

  it("rechaza sin permiso, km menor al último, chapa que no coincide y sin fotos", async () => {
    expect((await enviar("carlos.ramirez", registro("devolucion.recepcion", datos(), cinco()))).body.motivo).toBe(
      "No tenés permiso para registrar devoluciones en Taller",
    );
    expect((await enviar("jefe.prueba", registro("devolucion.recepcion", datos({ kilometraje: 17000 }), cinco()))).body.motivo).toBe(
      "El kilometraje (17.000 km) es menor que el último registrado (18.000 km)",
    );
    expect((await enviar("jefe.prueba", registro("devolucion.recepcion", datos({ vehiculo: { id: "10", chapa: "999XXX" } }), cinco()))).body.motivo).toBe(
      "La moto elegida tiene la chapa 827ABTI en Odoo, no 999XXX",
    );
    expect((await enviar("jefe.prueba", registro("devolucion.recepcion", datos({ vehiculo: { id: "55", chapa: "1A" } }), cinco()))).body.motivo).toBe(
      "La chapa 1A no existe en Taller",
    );
    expect((await enviar("jefe.prueba", registro("devolucion.recepcion", datos()))).body.motivo).toBe("Falta al menos una foto de la moto");
  });

  const recepcion = registro("devolucion.recepcion", datos({ motivo: "recupero" }), cinco());

  it("registra la recepción con sus fotos en Devoluciones", async () => {
    expect(await enviar("jefe.prueba", recepcion)).toEqual({ status: 200, body: { resultado: "aceptado" } });
    const db = await getDb();
    const [d] = await db.select().from(schema.devoluciones);
    expect(d).toMatchObject({ tipo: "recupero", vehiculoId: 10, chapa: "827ABTI", vehiculo: "Kenton GTR 150", chofer: "Juan Chofer", usuarioNombre: "Jefe de Taller" });
    expect(d.observacion).toBe("Recupero · Km: 18.500 · Entregó la llave · Daños: Rayones, Golpes\nLlegó sin el espejo izquierdo\n(Cargado desde Ridder App)");
    expect(await db.select({ id: schema.devolucionFotos.id }).from(schema.devolucionFotos)).toHaveLength(5);
  });

  it("repetida: aceptada sin duplicar; otra recepción de la misma moto: ya figura devuelta", async () => {
    expect(await enviar("jefe.prueba", recepcion)).toEqual({ status: 200, body: { resultado: "aceptado" } });
    const db = await getDb();
    expect(await db.select({ id: schema.devoluciones.id }).from(schema.devoluciones)).toHaveLength(1);
    const otra = await enviar("jefe.prueba", registro("devolucion.recepcion", datos(), cinco()));
    expect(otra.body.motivo).toMatch(/^La moto 827ABTI ya figura devuelta el \d{2}\/\d{2}\/\d{4} \(la recibió Jefe de Taller\)$/);
  });
});
