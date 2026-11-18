// ACCESO_SOLO prendido (etapa 2 de Ridder Acceso, CONTRATO.md de Acceso, sección 5), de punta a punta con las rutas
// reales y una base PGlite temporal: sin sesión a Acceso, /entrar/acceso con `a` y `s`, cerrar por `s`, salir,
// login propio solo para admins y 14 días de sesión.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { ACCESO_URL, CLAVE_API, SECRETO, nuevoPedido, pedido, prepararEntorno, redirigeA } from "./acceso-solo-falsos";

vi.mock("next/headers", async () => (await import("./acceso-solo-falsos")).nextHeaders);
vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), ...(await import("./acceso-solo-falsos")).nextNavigation }));

const dir = prepararEntorno({ ACCESO_SOLO: "1" });

const { GET: entrar } = await import("@/app/entrar/acceso/route");
const { POST: cerrarPorS } = await import("@/app/api/acceso/sesiones/[s]/cerrar/route");
const { POST: loginApi } = await import("@/app/api/auth/login/route");
const { POST: logoutApi } = await import("@/app/api/auth/logout/route");
const { default: PaginaIngresar } = await import("@/app/ingresar/page");
const { FormIngresar } = await import("@/app/ingresar/form");
const { COOKIE, exigirPagina, hashPassword } = await import("@/lib/auth");
const { armarEnlace, VIDA_ENLACE_MS } = await import("@/lib/acceso-dominio");
const { getDb, schema } = await import("@/lib/db");
const { eq } = await import("drizzle-orm");

const S = "3f9c" + "a".repeat(28);
let vence = Date.now() + VIDA_ENLACE_MS - 5_000;
// Cada enlace con otro vencimiento: la firma es de un solo uso.
const enlace = (usuario: string) => armarEnlace(SECRETO, usuario, vence--);

async function entrarCon(usuario: string, extra: Record<string, string> = {}) {
  nuevoPedido();
  pedido.cookies.clear();
  const q = new URLSearchParams({ t: enlace(usuario), ...extra });
  const r = await entrar(new Request(`http://t/entrar/acceso?${q}`));
  return { status: r.status, location: r.headers.get("location") };
}

const cerrar = async (s: string, clave = CLAVE_API) => {
  const r = await cerrarPorS(
    new Request(`http://t/api/acceso/sesiones/${s}/cerrar`, { method: "POST", headers: { authorization: `Bearer ${clave}`, "x-ridder-usuario": "admin.acceso" }, body: "{}" }),
    { params: Promise.resolve({ s }) } as never,
  );
  return { status: r.status, body: await r.json() };
};

const login = async (usuario: string, password: string) => {
  nuevoPedido();
  pedido.cookies.clear();
  const r = await loginApi(new Request("http://t/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario, password }) }), undefined as never);
  return { status: r.status, body: await r.json() };
};

beforeAll(async () => {
  const db = await getDb();
  const password = await hashPassword("clave-correcta");
  await db.insert(schema.usuarios).values([
    { usuario: "maria.lopez", nombre: "María López", rol: "mecanico", passwordHash: password, odooPartnerId: 1 },
    { usuario: "jefe.taller", nombre: "Jefe", rol: "jefe", passwordHash: password },
    { usuario: "admin.uno", nombre: "Admin", rol: "admin", passwordHash: password },
    { usuario: "inactivo", nombre: "Inactivo", rol: "jefe", passwordHash: password, activo: false },
  ]);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const sesionesDe = async (usuario: string) => {
  const db = await getDb();
  return db
    .select({ accesoSesion: schema.sesiones.accesoSesion, expira: schema.sesiones.expira })
    .from(schema.sesiones)
    .innerJoin(schema.usuarios, eq(schema.sesiones.usuarioId, schema.usuarios.id))
    .where(eq(schema.usuarios.usuario, usuario));
};

describe("sin sesión, a Ridder Acceso", () => {
  it("una página pide ir a Acceso con la ruta actual codificada (la pone proxy.ts)", async () => {
    nuevoPedido({ "x-taller-ruta": "/ordenes/5?tab=fotos" });
    pedido.cookies.clear();
    expect(await redirigeA(() => exigirPagina("ver_ordenes" as never))).toBe(`${ACCESO_URL}/ir/taller?a=%2Fordenes%2F5%3Ftab%3Dfotos`);
  });

  it("el layout de la app y la raíz también", async () => {
    const { default: Layout } = await import("@/app/(app)/layout");
    const { default: Raiz } = await import("@/app/page");
    nuevoPedido({ "x-taller-ruta": "/tablero" });
    pedido.cookies.clear();
    expect(await redirigeA(() => Layout({ children: null }))).toBe(`${ACCESO_URL}/ir/taller?a=%2Ftablero`);
    nuevoPedido({ "x-taller-ruta": "/" });
    expect(await redirigeA(() => Raiz())).toBe(`${ACCESO_URL}/ir/taller`);
  });

  it("una ruta de vuelta que no pasa la regla se descarta", async () => {
    nuevoPedido({ "x-taller-ruta": "//otro.com/x" });
    pedido.cookies.clear();
    expect(await redirigeA(() => exigirPagina("ver_ordenes" as never))).toBe(`${ACCESO_URL}/ir/taller`);
  });
});

describe("/entrar/acceso con a y s", () => {
  it("vuelve a la ruta `a` y guarda `s` en la sesión, que dura 14 días aunque sea admin", async () => {
    const antes = Date.now();
    expect(await entrarCon("admin.uno", { a: "/ordenes/5?tab=fotos", s: S })).toEqual({ status: 303, location: "/ordenes/5?tab=fotos" });
    expect(pedido.cookies.has(COOKIE)).toBe(true);
    const [sesion] = await sesionesDe("admin.uno");
    expect(sesion.accesoSesion).toBe(S);
    const dias = (sesion.expira.getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(13.99);
    expect(dias).toBeLessThan(14.01);
  });

  it("el mecánico también 14 días (sin el interruptor serían 30)", async () => {
    await entrarCon("maria.lopez", { s: S });
    const [sesion] = await sesionesDe("maria.lopez");
    expect(Math.round((sesion.expira.getTime() - Date.now()) / 86_400_000)).toBe(14);
  });

  it("`a` que no pasa la regla de Acceso: al inicio del rol", async () => {
    for (const a of ["//otro.com", "https://otro.com", "/%2F%2Fotro.com", "/ingresar", "/ordenes/ñ"]) {
      expect((await entrarCon("jefe.taller", { a })).location, a).toBe("/ordenes");
    }
    expect((await entrarCon("jefe.taller")).location).toBe("/ordenes");
  });

  it("`s` que no son 32 hexadecimales no se guarda, pero se entra igual", async () => {
    const db = await getDb();
    await db.delete(schema.sesiones);
    expect((await entrarCon("jefe.taller", { s: "no-es-un-id" })).status).toBe(303);
    expect((await sesionesDe("jefe.taller")).map((x) => x.accesoSesion)).toEqual([null]);
  });

  it("si el enlace falla, a la página propia de Taller con el motivo, nunca a Acceso", async () => {
    expect(await entrarCon("inactivo", { a: "/tablero", s: S })).toEqual({ status: 303, location: "/ingresar?acceso=sin_usuario" });
    nuevoPedido();
    const r = await entrar(new Request(`http://t/entrar/acceso?t=basura&a=%2Ftablero`));
    expect(r.headers.get("location")).toBe("/ingresar?acceso=invalido");
  });
});

describe("POST /api/acceso/sesiones/<s>/cerrar", () => {
  it("cierra solo las sesiones de esa sesión de Acceso y dice cuántas", async () => {
    const db = await getDb();
    await db.delete(schema.sesiones);
    const otra = "b".repeat(32);
    await entrarCon("admin.uno", { s: S });
    await entrarCon("maria.lopez", { s: S });
    await entrarCon("jefe.taller", { s: otra });
    expect(await cerrar(S)).toEqual({ status: 200, body: { ok: true, sesiones: 2 } });
    expect((await db.select().from(schema.sesiones)).map((x) => x.accesoSesion)).toEqual([otra]);
    const log = await db.select().from(schema.logAcciones).where(eq(schema.logAcciones.accion, "sesion.cerrar_acceso"));
    expect(log[0]?.detalle).toMatchObject({ sesionAcceso: S, sesiones: 2, origen: "acceso", por: "admin.acceso" });
  });

  it("sin sesiones con ese s: 200 con 0 (nunca 404)", async () => {
    expect(await cerrar("c".repeat(32))).toEqual({ status: 200, body: { ok: true, sesiones: 0 } });
  });

  it("s mal formado: 400; clave incorrecta: 401", async () => {
    expect((await cerrar("ZZ")).status).toBe(400);
    expect((await cerrar(S, "otra-clave-cualquiera-de-treinta-y-dos-chars")).status).toBe(401);
  });
});

describe("salir", () => {
  it("borra la sesión local y manda a ACCESO_URL/salir", async () => {
    await entrarCon("jefe.taller", { s: S });
    const token = pedido.cookies.get(COOKIE)?.value;
    expect(token).toBeTruthy();
    const r = await logoutApi(new Request("http://t/api/auth/logout", { method: "POST" }), undefined as never);
    expect(await r.json()).toEqual({ ok: true, ir: `${ACCESO_URL}/salir` });
    expect(pedido.cookies.has(COOKIE)).toBe(false);
    const db = await getDb();
    expect((await db.select().from(schema.sesiones)).filter((x) => x.accesoSesion === S)).toHaveLength(0);
  });
});

describe("/ingresar: solo admins", () => {
  it("un admin entra con su contraseña (entrada de emergencia), con la duración de siempre", async () => {
    const r = await login("admin.uno", "clave-correcta");
    expect(r.status).toBe(200);
    expect(pedido.cookies.has(COOKIE)).toBe(true);
  });

  it("los demás, con la contraseña correcta, reciben «Ingresá por Ridder» con el enlace y sin sesión", async () => {
    for (const u of ["maria.lopez", "jefe.taller"]) {
      expect(await login(u, "clave-correcta")).toEqual({ status: 403, body: { error: "Ingresá por Ridder", acceso: `${ACCESO_URL}/` } });
      expect(pedido.cookies.has(COOKIE)).toBe(false);
    }
  });

  it("con la contraseña incorrecta no se cuenta el rol", async () => {
    expect(await login("maria.lopez", "otra")).toEqual({ status: 401, body: { error: "Usuario o contraseña incorrectos" } });
  });

  it("la página muestra el formulario de emergencia con la URL de Acceso", async () => {
    const el = (await PaginaIngresar({ searchParams: Promise.resolve({}) } as never)) as { type: unknown; props: { acceso?: string } };
    expect(el.type).toBe(FormIngresar);
    expect(el.props.acceso).toBe(ACCESO_URL);
  });

  it("con ?acceso=<motivo> muestra el aviso y la vuelta a Ridder en lugar del formulario", async () => {
    const el = (await PaginaIngresar({ searchParams: Promise.resolve({ acceso: "vencido" }) } as never)) as { type: unknown };
    expect(el.type).toBe("main");
    const texto = JSON.stringify(el, (k, v) => (k === "_owner" || k === "_store" ? undefined : v));
    expect(texto).toContain("venció");
    expect(texto).toContain(`"href":"${ACCESO_URL}/"`);
    expect(texto).not.toContain("password");
  });
});
