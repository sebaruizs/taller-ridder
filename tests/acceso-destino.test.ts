// Regla de la ruta de vuelta (`a`) de Ridder Acceso, etapa 2. Los casos son los de Ridder-acceso/test/destino.test.js,
// copiados tal cual: Taller tiene que aceptar y rechazar exactamente lo mismo que Acceso.
import { describe, expect, it } from "vitest";
import { destinoDeVuelta, enlaceIrATaller, idSesionAcceso, rutaPedida, rutaSegura } from "@/lib/acceso-destino";

describe("rutaSegura (casos de Ridder Acceso)", () => {
  it("acepta rutas del mismo módulo, con búsqueda y hash", () => {
    for (const a of ["/", "/clientes/5", "/clientes?q=perez&p=2", "/#/cartera", "/#/cliente/123?tab=pagos", "/ordenes/a%20b", "/x?u=http://a//b", "/#//x", "/archivo.v2/..x"]) {
      expect(rutaSegura(a), a).toBe(a);
    }
  });

  it("rechaza todo lo que pueda llevar a otro sitio", () => {
    const malas: unknown[] = ["", "clientes", "https://otro.com", "http://otro.com/", "//otro.com", "/\\otro.com", "\\\\otro.com", "/%2F%2Fotro.com", "/%5Cotro.com",
      "/%2fotro.com", "javascript:alert(1)", "\t/clientes", "/clien tes", "/x\ny", "/x\\y", "/%0d%0aSet-Cookie:x", "/%E0%A4%A", "/.//otro.com", "/..//otro.com", "/a/../..//otro.com", "/./x", "/a/..", "/a//b", "/a/%2F/b", "/%2E%2E/x", "x".repeat(10), "/" + "a".repeat(2001), null, undefined, 5];
    for (const a of malas) expect(rutaSegura(a), JSON.stringify(a)).toBeNull();
  });
});

describe("destino de vuelta en Taller", () => {
  it("vuelve a la pantalla pedida", () => {
    expect(destinoDeVuelta("/ordenes/5?tab=fotos")).toBe("/ordenes/5?tab=fotos");
    expect(destinoDeVuelta("/tablero")).toBe("/tablero");
  });
  it("no vuelve al ingreso (armaría un rulo) ni a algo que no entra en la cabecera Location", () => {
    for (const a of ["/ingresar", "/ingresar?acceso=vencido", "/entrar/acceso?t=x", "/entrar", "/ordenes/ñandú", "//otro.com"]) expect(destinoDeVuelta(a), a).toBeNull();
    expect(destinoDeVuelta("/ingresarx")).toBe("/ingresarx");
  });
});

describe("id de la sesión de Acceso (s)", () => {
  it("solo 32 hexadecimales en minúscula, como los manda Acceso", () => {
    expect(idSesionAcceso("3f9c" + "0".repeat(28))).toBe("3f9c" + "0".repeat(28));
    for (const s of [null, undefined, "", "3F9C" + "0".repeat(28), "a".repeat(31), "a".repeat(33), "g".repeat(32), " " + "a".repeat(31)]) expect(idSesionAcceso(s), String(s)).toBeNull();
  });
});

describe("enlace a Acceso sin sesión", () => {
  it("lleva la ruta actual codificada", () => {
    expect(enlaceIrATaller("https://app.ridder.com.py", "/ordenes/5?tab=fotos")).toBe("https://app.ridder.com.py/ir/taller?a=%2Fordenes%2F5%3Ftab%3Dfotos");
    expect(enlaceIrATaller("https://app.ridder.com.py/", "/tablero")).toBe("https://app.ridder.com.py/ir/taller?a=%2Ftablero");
  });
  it("sin ruta, con la raíz o con una ruta que no pasa la regla, va sin a", () => {
    for (const r of [null, "/", "//otro.com", "/ingresar"]) expect(enlaceIrATaller("https://app.ridder.com.py", r)).toBe("https://app.ridder.com.py/ir/taller");
  });
  it("la ruta pedida no lleva el _rsc de las navegaciones de Next", () => {
    expect(rutaPedida("/ordenes", "?_rsc=abc12")).toBe("/ordenes");
    expect(rutaPedida("/ordenes", "?estado=abierta&_rsc=abc12")).toBe("/ordenes?estado=abierta");
    expect(rutaPedida("/tablero", "")).toBe("/tablero");
  });
});

describe("arranque con ACCESO_SOLO", async () => {
  const { errorDeEntorno } = await import("@/lib/env");
  const base = { ACCESO_URL: "https://app.ridder.com.py", ACCESO_SECRET: "s".repeat(32) };
  it("apagado no pide nada", () => {
    for (const ACCESO_SOLO of [undefined, "", "0", "false"]) expect(errorDeEntorno({ ACCESO_SOLO })).toBeNull();
  });
  it("prendido sin ACCESO_URL o sin ACCESO_SECRET no arranca: nadie podría ingresar", () => {
    expect(errorDeEntorno({ ...base, ACCESO_SOLO: "1", ACCESO_URL: "" })).toMatch(/ACCESO_URL/);
    expect(errorDeEntorno({ ...base, ACCESO_SOLO: "true", ACCESO_URL: "app.ridder.com.py" })).toMatch(/ACCESO_URL/);
    expect(errorDeEntorno({ ...base, ACCESO_SOLO: "1", ACCESO_SECRET: "corta" })).toMatch(/ACCESO_SECRET/);
  });
  it("prendido con las dos, arranca (también con comillas pegadas en Easypanel)", () => {
    expect(errorDeEntorno({ ...base, ACCESO_SOLO: "1" })).toBeNull();
    expect(errorDeEntorno({ ACCESO_SOLO: '"1"', ACCESO_URL: '"https://app.ridder.com.py"', ACCESO_SECRET: `'${"s".repeat(32)}'` })).toBeNull();
  });
});
