// ACCESO_SOLO apagado (lo de siempre): aunque Acceso ya mande `a` y `s`, Taller se comporta como antes de la etapa 2.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { SECRETO, nuevoPedido, pedido, prepararEntorno, redirigeA } from "./acceso-solo-falsos";

vi.mock("next/headers", async () => (await import("./acceso-solo-falsos")).nextHeaders);
vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), ...(await import("./acceso-solo-falsos")).nextNavigation }));

const dir = prepararEntorno({});
delete process.env.ACCESO_SOLO;

const { GET: entrar } = await import("@/app/entrar/acceso/route");
const { POST: loginApi } = await import("@/app/api/auth/login/route");
const { POST: logoutApi } = await import("@/app/api/auth/logout/route");
const { default: PaginaIngresar } = await import("@/app/ingresar/page");
const { FormIngresar } = await import("@/app/ingresar/form");
const { COOKIE, exigirPagina, hashPassword } = await import("@/lib/auth");
const { armarEnlace, VIDA_ENLACE_MS } = await import("@/lib/acceso-dominio");
const { DURACION_SESION_DIAS } = await import("@/lib/permisos");
const { getDb, schema } = await import("@/lib/db");

beforeAll(async () => {
  const db = await getDb();
  await db.insert(schema.usuarios).values([
    { usuario: "maria.lopez", nombre: "María López", rol: "mecanico", passwordHash: await hashPassword("clave-correcta"), odooPartnerId: 1 },
    { usuario: "jefe.taller", nombre: "Jefe", rol: "jefe", passwordHash: "x" },
  ]);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ACCESO_SOLO apagado", () => {
  it("sin sesión, al login propio", async () => {
    nuevoPedido({ "x-taller-ruta": "/ordenes/5" });
    pedido.cookies.clear();
    expect(await redirigeA(() => exigirPagina("ver_ordenes" as never))).toBe("/ingresar");
  });

  it("/entrar/acceso ignora `a` y `s`: al inicio del rol, sin guardar s y con la duración del rol", async () => {
    nuevoPedido();
    pedido.cookies.clear();
    const q = new URLSearchParams({ t: armarEnlace(SECRETO, "jefe.taller", Date.now() + VIDA_ENLACE_MS - 1000), a: "/tablero", s: "a".repeat(32) });
    const r = await entrar(new Request(`http://t/entrar/acceso?${q}`));
    expect(r.headers.get("location")).toBe("/ordenes");
    const db = await getDb();
    const [s] = await db.select().from(schema.sesiones);
    expect(s.accesoSesion).toBeNull();
    expect(Math.round((s.expira.getTime() - Date.now()) / 86_400_000)).toBe(DURACION_SESION_DIAS.jefe);
  });

  it("el login propio sigue abierto a todos los roles", async () => {
    nuevoPedido();
    pedido.cookies.clear();
    const r = await loginApi(new Request("http://t/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: "maria.lopez", password: "clave-correcta" }) }), undefined as never);
    expect(r.status).toBe(200);
    expect(pedido.cookies.has(COOKIE)).toBe(true);
  });

  it("salir lleva a /ingresar", async () => {
    const r = await logoutApi(new Request("http://t/api/auth/logout", { method: "POST" }), undefined as never);
    expect(await r.json()).toEqual({ ok: true, ir: "/ingresar" });
  });

  it("/ingresar es el formulario de siempre, también con ?acceso=<motivo>", async () => {
    for (const searchParams of [{}, { acceso: "vencido" }]) {
      const el = (await PaginaIngresar({ searchParams: Promise.resolve(searchParams) } as never)) as { type: unknown; props: { acceso?: unknown } };
      expect(el.type).toBe(FormIngresar);
      expect(el.props.acceso).toBeNull();
    }
  });
});
