import { describe, expect, it } from "vitest";
import {
  MAX_INTENTOS,
  contactoPorNombre,
  etiquetasDelRol,
  textoEtiquetas,
  datosUsuarioSchema,
  estaBloqueado,
  ipBloqueada,
  passwordSchema,
  registrarFalloIp,
  trasIntentoFallido,
  usuarioSchema,
} from "@/lib/credenciales";

describe("usuario y contraseña", () => {
  it("el usuario se normaliza a minúsculas y no admite espacios", () => {
    expect(usuarioSchema.parse("  Carlos.Ramirez ")).toBe("carlos.ramirez");
    expect(usuarioSchema.safeParse("carlos ramirez").success).toBe(false);
    expect(usuarioSchema.safeParse("ab").success).toBe(false);
  });

  it("la contraseña tiene al menos 8 caracteres", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });

  it("los datos del usuario validan rol y contacto", () => {
    expect(datosUsuarioSchema.safeParse({ nombre: "Carlos", rol: "mecanico", odooPartnerId: 1685 }).success).toBe(true);
    expect(datosUsuarioSchema.safeParse({ nombre: "Carlos", rol: "jefe", odooPartnerId: null }).success).toBe(true);
    expect(datosUsuarioSchema.safeParse({ nombre: "Carlos", rol: "superadmin", odooPartnerId: null }).success).toBe(false);
  });
});

describe("bloqueo por intentos", () => {
  it(`bloquea después de ${MAX_INTENTOS} intentos fallidos`, () => {
    const ahora = new Date("2026-10-24T12:00:00Z");
    let e = { intentosFallidos: 0, bloqueadoHasta: null as Date | null };
    for (let i = 1; i < MAX_INTENTOS; i++) {
      e = trasIntentoFallido(e, ahora);
      expect(estaBloqueado(e, ahora)).toBe(false);
    }
    e = trasIntentoFallido(e, ahora);
    expect(estaBloqueado(e, ahora)).toBe(true);
    expect(estaBloqueado(e, new Date(ahora.getTime() + 16 * 60_000))).toBe(false);
  });

  it("al vencer el bloqueo vuelve a contar desde cero", () => {
    const ahora = new Date("2026-10-24T12:00:00Z");
    const vencido = { intentosFallidos: 4, bloqueadoHasta: new Date(ahora.getTime() - 1000) };
    expect(trasIntentoFallido(vencido, ahora)).toEqual({ intentosFallidos: 1, bloqueadoHasta: null });
  });

  it("una IP con muchos fallos queda frenada durante la ventana", () => {
    const t = 1_000_000;
    for (let i = 0; i < 19; i++) registrarFalloIp("1.2.3.4", t);
    expect(ipBloqueada("1.2.3.4", t)).toBe(false);
    registrarFalloIp("1.2.3.4", t);
    expect(ipBloqueada("1.2.3.4", t)).toBe(true);
    expect(ipBloqueada("1.2.3.4", t + 16 * 60_000)).toBe(false);
    expect(ipBloqueada("5.6.7.8", t)).toBe(false);
  });
});

describe("contacto de Odoo según el rol", () => {
  it("mecánico «mecanico», cobrador «ejecutivo», jefe y admin las dos", () => {
    expect(etiquetasDelRol("mecanico")).toEqual(["mecanico"]);
    expect(etiquetasDelRol("cobrador")).toEqual(["ejecutivo"]);
    expect(etiquetasDelRol("jefe")).toEqual(["mecanico", "ejecutivo"]);
    expect(etiquetasDelRol("admin")).toEqual(["mecanico", "ejecutivo"]);
    expect(textoEtiquetas(["mecanico", "ejecutivo"])).toBe("«mecanico» o «ejecutivo»");
  });
});

describe("vincular por nombre el contacto de Odoo", () => {
  const ejecutivos = [
    { id: 1, nombre: "Osvaldo Matías  Ortellado Benitez" },
    { id: 2, nombre: "Julian Daniel Vergara Medina" },
    { id: 3, nombre: "Ana Pérez" },
    { id: 4, nombre: "ana perez" },
  ];
  it("compara sin mayúsculas, tildes ni espacios de más", () => {
    expect(contactoPorNombre(" osvaldo matias ortellado BENITEZ ", ejecutivos)).toEqual({ contacto: ejecutivos[0] });
  });
  it("sin coincidencia o con varias, no vincula", () => {
    expect(contactoPorNombre("Nadie", ejecutivos)).toEqual({ contacto: null, motivo: "sin coincidencia" });
    expect(contactoPorNombre("Ana Perez", ejecutivos)).toEqual({ contacto: null, motivo: "varias coincidencias: Ana Pérez, ana perez" });
  });
});
