import { describe, expect, it } from "vitest";
import { cambiosDe, cierraSesiones, dejaSinAdmin, faltaContactoMecanico, usuarioAccesoSchema, type ActualAcceso } from "@/lib/acceso-api-dominio";

const cuerpo = { nombre: "María López", rol: "mecanico", activo: true, documento: "1234567", telefono: "0981123456", odooPartnerId: 2778 };
const actual: ActualAcceso = { nombre: "María López", rol: "mecanico", activo: true, odooPartnerId: 2778 };
const datos = (extra: Record<string, unknown> = {}) => usuarioAccesoSchema.parse({ ...cuerpo, ...extra });

describe("cuerpo del PUT de Ridder Acceso", () => {
  it("acepta el cuerpo del contrato", () => {
    expect(datos()).toEqual(cuerpo);
  });
  it("el contacto, el documento y el teléfono pueden faltar o venir en null", () => {
    expect(usuarioAccesoSchema.parse({ nombre: "Ana", rol: "jefe", activo: false })).toEqual({ nombre: "Ana", rol: "jefe", activo: false });
    expect(datos({ odooPartnerId: null, documento: null, telefono: null }).odooPartnerId).toBeNull();
  });
  it("recorta el nombre", () => {
    expect(datos({ nombre: "  María López " }).nombre).toBe("María López");
  });
  it("rechaza roles que Taller no tiene, y nombre o activo faltantes", () => {
    for (const rol of ["finanzas", "empleado", "Admin", ""]) expect(usuarioAccesoSchema.safeParse({ ...cuerpo, rol }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ ...cuerpo, nombre: "" }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ rol: "jefe", activo: true }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ nombre: "Ana", rol: "jefe" }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ ...cuerpo, activo: "true" }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ ...cuerpo, odooPartnerId: "2778" }).success).toBe(false);
    expect(usuarioAccesoSchema.safeParse({ ...cuerpo, odooPartnerId: -1 }).success).toBe(false);
  });
  it("lo que no es del contrato (contraseña, permisos, tema) se descarta", () => {
    const d = usuarioAccesoSchema.parse({ ...cuerpo, password: "x", permisosOff: ["finalizar"], tema: "oscuro", usuario: "otro" });
    expect(Object.keys(d).sort()).toEqual(["activo", "documento", "nombre", "odooPartnerId", "rol", "telefono"]);
  });
});

describe("qué cambia en un usuario que ya existe", () => {
  it("el mismo PUT dos veces no cambia nada (idempotente)", () => {
    expect(cambiosDe(actual, datos())).toEqual({});
  });
  it("solo lo que difiere", () => {
    expect(cambiosDe(actual, datos({ nombre: "María L. Benítez" }))).toEqual({ nombre: "María L. Benítez" });
    expect(cambiosDe(actual, datos({ rol: "jefe", activo: false }))).toEqual({ rol: "jefe", activo: false });
    expect(cambiosDe(actual, datos({ odooPartnerId: 3001 }))).toEqual({ odooPartnerId: 3001 });
  });
  it("si el contacto no viene, el que tiene no se toca", () => {
    expect(cambiosDe(actual, datos({ odooPartnerId: undefined }))).toEqual({});
    expect(cambiosDe(actual, datos({ odooPartnerId: null }))).toEqual({});
  });
  it("documento y teléfono no generan cambios", () => {
    expect(cambiosDe(actual, datos({ documento: "999", telefono: "000" }))).toEqual({});
  });
});

describe("reglas", () => {
  it("un mecánico necesita contacto; los demás roles no", () => {
    expect(faltaContactoMecanico("mecanico", null)).toBe(true);
    expect(faltaContactoMecanico("mecanico", undefined)).toBe(true);
    expect(faltaContactoMecanico("mecanico", 2778)).toBe(false);
    for (const rol of ["jefe", "cobrador", "admin"] as const) expect(faltaContactoMecanico(rol, null)).toBe(false);
  });
  it("desactivar o cambiar el rol cierra las sesiones; reactivar o cambiar el nombre no", () => {
    expect(cierraSesiones({ activo: false })).toBe(true);
    expect(cierraSesiones({ rol: "jefe" })).toBe(true);
    expect(cierraSesiones({ activo: true })).toBe(false);
    expect(cierraSesiones({ nombre: "Otro", odooPartnerId: 5 })).toBe(false);
  });
  it("no deja a Taller sin admin activo", () => {
    const admin: ActualAcceso = { nombre: "Seba", rol: "admin", activo: true, odooPartnerId: null };
    const d = (extra: Record<string, unknown>) => usuarioAccesoSchema.parse({ nombre: "Seba", rol: "admin", activo: true, ...extra });
    expect(dejaSinAdmin(admin, d({ activo: false }), 0)).toBe(true);
    expect(dejaSinAdmin(admin, d({ rol: "jefe" }), 0)).toBe(true);
    expect(dejaSinAdmin(admin, d({ activo: false }), 1)).toBe(false);
    expect(dejaSinAdmin(admin, d({ nombre: "Sebastián" }), 0)).toBe(false);
    expect(dejaSinAdmin({ ...admin, activo: false }, d({ activo: false }), 0)).toBe(false);
    expect(dejaSinAdmin(actual, datos({ activo: false }), 0)).toBe(false);
  });
});
