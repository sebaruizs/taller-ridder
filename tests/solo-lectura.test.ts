// Rol «revisor»: ve lo que ve un jefe y el servidor no le deja cambiar nada (lib/solo-lectura.ts).
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ACCIONES, inicioDe, pantallasDe, puede, type Accion } from "@/lib/permisos";
import { SoloLectura, conContexto, esPeticionDeLectura, pedidoSoloLectura, rechazarEscritura, rutaLibre } from "@/lib/solo-lectura";
import type { Usuario } from "@/lib/auth";

const usuario = vi.hoisted(() => ({ actual: null as Usuario | null }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), usuarioDePedido: async () => usuario.actual }));

const pedido = (metodo: string, ruta = "/api/ordenes") => new Request(`http://t${ruta}`, { method: metodo });

describe("permisos del revisor", () => {
  const SIN_PANTALLA: Accion[] = ["ordenes.eliminar", "gps.encendido"];

  it("tiene las acciones del jefe, menos las dos que no abren ninguna pantalla", () => {
    for (const a of Object.keys(ACCIONES) as Accion[]) {
      expect(puede("revisor", a), a).toBe(puede("jefe", a) && !SIN_PANTALLA.includes(a));
    }
  });

  it("no administra: ni usuarios, ni ajustes, ni el log, ni borrar devoluciones", () => {
    for (const a of ["usuarios.gestionar", "config.editar", "log.ver", "devoluciones.borrar"] as Accion[]) expect(puede("revisor", a), a).toBe(false);
  });

  it("ve las mismas pantallas que el jefe y empieza en la misma", () => {
    const u = { rol: "revisor" as const };
    expect(pantallasDe(u)).toEqual(pantallasDe({ rol: "jefe" }));
    expect(inicioDe(u)).toBe(inicioDe({ rol: "jefe" }));
  });
});

describe("barrera 1: el pedido que escribe no sigue", () => {
  it("solo GET, HEAD y OPTIONS son de lectura", () => {
    for (const m of ["GET", "get", "HEAD", "OPTIONS"]) expect(esPeticionDeLectura(m), m).toBe(true);
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) expect(esPeticionDeLectura(m), m).toBe(false);
  });

  it("al revisor se le rechaza toda escritura; a los demás roles, ninguna", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() => rechazarEscritura("revisor", pedido(m)), m).toThrow(SoloLectura);
      for (const rol of ["mecanico", "jefe", "cobrador", "admin"] as const) expect(() => rechazarEscritura(rol, pedido(m))).not.toThrow();
    }
    expect(() => rechazarEscritura("revisor", pedido("GET"))).not.toThrow();
  });

  it("salir y volver a ingresar se dejan pasar; nada más", () => {
    expect(rutaLibre("http://t/api/auth/logout")).toBe(true);
    expect(rutaLibre("http://t/api/auth/login/")).toBe(true);
    for (const r of ["/api/auth/logout/x", "/api/cuenta/password", "/api/cuenta/tema", "/api/ordenes?x=/api/auth/logout"]) expect(rutaLibre(`http://t${r}`), r).toBe(false);
    expect(() => rechazarEscritura("revisor", pedido("POST", "/api/auth/logout"))).not.toThrow();
  });

  it("el error lleva el código y el texto que espera Ridder App", () => {
    const e = new SoloLectura();
    expect({ status: e.status, codigo: e.codigo, error: e.message }).toEqual({ status: 403, codigo: "solo_lectura", error: "Cuenta de solo lectura: no se guardan cambios." });
  });
});

describe("manejar: corta antes de entrar a la ruta", () => {
  const persona = (rol: Usuario["rol"]): Usuario => ({ id: 1, usuario: "x", nombre: "X", rol, odooPartnerId: null, permisosOff: [], tema: "claro" });

  it("revisor: 403 «solo_lectura» y la ruta no corre; las lecturas y el logout sí", async () => {
    const { manejar, json } = await import("@/lib/api");
    const ruta = vi.fn(async () => json({ ok: true }));
    const h = manejar(ruta);
    usuario.actual = persona("revisor");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await h(pedido(m), {});
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: "Cuenta de solo lectura: no se guardan cambios.", codigo: "solo_lectura" });
    }
    expect(ruta).not.toHaveBeenCalled();
    expect((await h(pedido("GET"), {})).status).toBe(200);
    expect((await h(pedido("POST", "/api/auth/logout"), {})).status).toBe(200);
  });

  it("jefe y pedido sin sesión: la ruta corre como siempre", async () => {
    const { manejar, json } = await import("@/lib/api");
    const h = manejar(async () => json({ ok: true }));
    usuario.actual = persona("jefe");
    expect((await h(pedido("POST"), {})).status).toBe(200);
    usuario.actual = null;
    expect((await h(pedido("POST"), {})).status).toBe(200);
  });
});

describe("barrera 2: mientras se atiende a un revisor, nada escribe en Odoo", () => {
  it("el pedido queda marcado solo dentro de su contexto", async () => {
    expect(pedidoSoloLectura()).toBe(false);
    await conContexto(pedido("GET"), async () => {
      rechazarEscritura("jefe");
      expect(pedidoSoloLectura()).toBe(false);
      rechazarEscritura("revisor");
      expect(pedidoSoloLectura()).toBe(true);
    });
    await conContexto(pedido("GET"), async () => expect(pedidoSoloLectura()).toBe(false));
    expect(pedidoSoloLectura()).toBe(false);
  });

  it("quien resuelve al usuario corta con el método del pedido en curso, sin que se lo pasen", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      await conContexto(pedido(m), async () => {
        expect(() => rechazarEscritura("revisor"), m).toThrow(SoloLectura);
        expect(() => rechazarEscritura("jefe"), m).not.toThrow();
      });
    }
    await conContexto(pedido("POST", "/api/auth/logout"), async () => expect(() => rechazarEscritura("revisor")).not.toThrow());
    // Fuera de manejar (páginas): no hay pedido que cortar.
    expect(() => rechazarEscritura("revisor")).not.toThrow();
  });

  it("executeKw rechaza los métodos que escriben, también desde un GET", async () => {
    const { executeKw } = await import("@/lib/odoo");
    await conContexto(pedido("GET"), async () => {
      rechazarEscritura("revisor");
      for (const metodo of ["write", "create", "unlink", "message_post", "action_confirm"]) {
        await expect(executeKw("fleet.vehicle.log.services", metodo, [[1], {}]), metodo).rejects.toBeInstanceOf(SoloLectura);
      }
    });
  });
});

describe("ninguna ruta que escribe queda fuera de las barreras", () => {
  const raiz = path.resolve(import.meta.dirname, "../app/api");
  const rutas = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? rutas(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
  const todas = rutas(raiz);

  it("fuera de app/api no hay rutas que escriban", () => {
    const app = path.resolve(import.meta.dirname, "../app");
    for (const f of rutas(app).filter((r) => !r.startsWith(raiz + path.sep))) {
      expect(fs.readFileSync(f, "utf8"), path.relative(app, f)).not.toMatch(/export\s+(?:const|async function|function)\s+(POST|PUT|PATCH|DELETE)\b/);
    }
  });

  // GET que no pasan por manejar(): cada uno tiene que rechazar al revisor por su cuenta si hace algo más que leer.
  const FUERA_DE_MANEJAR: Record<string, string> = { "asistencias/marcar/route.ts": "esSoloLectura(u.rol)" };

  it("toda ruta que escribe pasa por manejar(); las demás, también o están revisadas a mano", () => {
    expect(todas.length).toBeGreaterThan(30);
    const fuera: string[] = [];
    for (const f of todas) {
      const nombre = path.relative(raiz, f).split(path.sep).join("/");
      const codigo = fs.readFileSync(f, "utf8");
      const metodos = [...codigo.matchAll(/export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
      const conManejar = [...codigo.matchAll(/export const (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) = manejar\(/g)].map((m) => m[1]);
      expect(metodos.length, nombre).toBeGreaterThan(0);
      const sueltos = metodos.filter((m) => !conManejar.includes(m));
      expect(sueltos.filter((m) => m !== "GET"), nombre).toEqual([]);
      if (sueltos.length) {
        fuera.push(nombre);
        expect(codigo, nombre).toContain(FUERA_DE_MANEJAR[nombre] ?? "(ruta sin revisar)");
      }
    }
    expect(fuera).toEqual(Object.keys(FUERA_DE_MANEJAR));
  });

  it("toda ruta del teléfono se autentica con personaDeDispositivo", () => {
    const movil = todas.filter((f) => f.includes(`${path.sep}movil${path.sep}`));
    expect(movil.length).toBeGreaterThan(0);
    for (const f of movil) expect(fs.readFileSync(f, "utf8"), path.relative(raiz, f)).toContain("await personaDeDispositivo(req)");
  });
});
