import { describe, expect, it } from "vitest";
import { decodificarFoto, estadoDeTarea, motivoRechazoTarea, observacionDevolucion, tipoDeDevolucion, usuarioDeTokenDePrueba } from "@/lib/movil-dominio";

const TOKEN = "token-de-prueba-largo-1234";

describe("credencial de prueba de la API móvil", () => {
  it("acepta <usuario>.<token>, con puntos en el usuario", () => {
    expect(usuarioDeTokenDePrueba(`Bearer carlos.ramirez.${TOKEN}`, TOKEN, false)).toBe("carlos.ramirez");
  });
  it("rechaza en producción, con token corto, sin usuario o con otro token", () => {
    expect(usuarioDeTokenDePrueba(`Bearer carlos.${TOKEN}`, TOKEN, true)).toBeNull();
    expect(usuarioDeTokenDePrueba("Bearer carlos.corto", "corto", false)).toBeNull();
    expect(usuarioDeTokenDePrueba(`Bearer ${TOKEN}`, TOKEN, false)).toBeNull();
    expect(usuarioDeTokenDePrueba(`Bearer carlos.${TOKEN}x`, TOKEN, false)).toBeNull();
    expect(usuarioDeTokenDePrueba(null, TOKEN, false)).toBeNull();
  });
});

describe("tareas", () => {
  it("estado de la tarea según la orden y el inicio", () => {
    expect(estadoDeTarea("running", false)).toBe("pendiente");
    expect(estadoDeTarea("running", true)).toBe("en_curso");
    expect(estadoDeTarea("cancelled", false)).toBe("lista");
    expect(estadoDeTarea("new", false)).toBeNull();
    expect(estadoDeTarea("done", true)).toBeNull();
  });
  it("una orden sin mecánico la puede tomar cualquiera con contacto de Odoo", () => {
    const base = { tipo: "taller.inicio" as const, estado: "running" as const, mecanicoNombre: null };
    expect(motivoRechazoTarea({ ...base, mecanicoId: null, partnerId: 5 })).toBeNull();
    expect(motivoRechazoTarea({ ...base, mecanicoId: 5, partnerId: 5 })).toBeNull();
    expect(motivoRechazoTarea({ ...base, mecanicoId: null, partnerId: null })).toMatch(/no está vinculado/);
  });
});

describe("devolución", () => {
  it("recupero es recupero; fin de contrato, cambio o sin motivo son devolución", () => {
    expect(tipoDeDevolucion("recupero")).toBe("recupero");
    expect(tipoDeDevolucion("cambio")).toBe("devolucion");
    expect(tipoDeDevolucion(undefined)).toBe("devolucion");
  });
  it("arma la observación con lo cargado", () => {
    expect(observacionDevolucion({ vehiculo: { id: 1, chapa: "A", modelo: "" }, kilometraje: 1200, entregoLlave: false, danos: [], observaciones: " " })).toBe(
      "Km: 1.200 · No entregó la llave · Sin daños marcados\n(Cargado desde Ridder App)",
    );
  });
  it("fotos: JPEG con o sin prefijo data:", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0]).toString("base64");
    expect(decodificarFoto({ id: "1", toma: "", datos: jpeg })).toHaveLength(5);
    expect(decodificarFoto({ id: "1", toma: "", datos: `data:image/jpeg;base64,${jpeg}` })).toHaveLength(5);
    expect(() => decodificarFoto({ id: "1", toma: "", datos: Buffer.from("hola").toString("base64") })).toThrow("no es un JPEG");
  });
});
