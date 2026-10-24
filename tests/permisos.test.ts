import { describe, expect, it } from "vitest";
import { ACCIONES, DURACION_SESION_DIAS, inicioDe, limpiarPermisosOff, menuDe, modulosDelRol, moduloDeAccion, pantallasDe, permisosDelRol, puede, puedeU, resumenPermisosOff, type Accion } from "@/lib/permisos";
import { ROLES } from "@/lib/db/schema";

const MECANICO: Accion[] = ["ordenes.ver_en_proceso", "ordenes.ver_detalle", "ordenes.finalizar"];
const SOLO_JEFE_Y_ADMIN: Accion[] = [
  "ordenes.ver_todas",
  "ordenes.crear",
  "ordenes.editar",
  "ordenes.mover_estado",
  "ordenes.aprobar",
  "finalizaciones.ver_ajenas",
  "vehiculos.buscar",
  "vehiculos.historial",
  "inventario.ver",
  "inventario.crear",
  "inventario.editar_precio",
  "compras.ver",
  "compras.crear",
  "finanzas.ver",
];
const SOLO_ADMIN: Accion[] = ["usuarios.gestionar", "log.ver", "config.editar"];

describe("permisos por rol", () => {
  it("el mecánico puede ver y finalizar órdenes", () => {
    for (const a of MECANICO) expect(puede("mecanico", a)).toBe(true);
  });

  it("el mecánico no crea, edita, mueve ni administra", () => {
    for (const a of [...SOLO_JEFE_Y_ADMIN, ...SOLO_ADMIN]) expect(puede("mecanico", a), a).toBe(false);
  });

  it("el jefe hace todo lo del mecánico y lo de taller, pero no administra", () => {
    for (const a of [...MECANICO, ...SOLO_JEFE_Y_ADMIN]) expect(puede("jefe", a), a).toBe(true);
    for (const a of SOLO_ADMIN) expect(puede("jefe", a), a).toBe(false);
  });

  it("el admin puede todo", () => {
    for (const a of Object.keys(ACCIONES) as Accion[]) expect(puede("admin", a), a).toBe(true);
  });

  it("todas las acciones están clasificadas en los tests", () => {
    expect(new Set([...MECANICO, ...SOLO_JEFE_Y_ADMIN, ...SOLO_ADMIN])).toEqual(new Set(Object.keys(ACCIONES)));
  });

  it("la sesión del mecánico dura 30 días y la del admin es más corta", () => {
    expect(DURACION_SESION_DIAS.mecanico).toBe(30);
    for (const r of ROLES) expect(DURACION_SESION_DIAS.admin).toBeLessThanOrEqual(DURACION_SESION_DIAS[r]);
  });
});

describe("permisos por usuario", () => {
  it("a un jefe se le puede quitar cargar repuestos sin tocar lo demás", () => {
    const jefe = { rol: "jefe" as const, permisosOff: ["repuestos"] };
    expect(puedeU(jefe, "ordenes.editar")).toBe(false);
    expect(puedeU(jefe, "ordenes.aprobar")).toBe(true);
    expect(puedeU(jefe, "ordenes.crear")).toBe(true);
  });

  it("quitar un permiso nunca da algo que el rol no tiene", () => {
    expect(puedeU({ rol: "mecanico", permisosOff: [] }, "ordenes.crear")).toBe(false);
  });

  it("al admin no se le puede quitar nada", () => {
    expect(puedeU({ rol: "admin", permisosOff: ["repuestos", "aprobar"] }, "ordenes.editar")).toBe(true);
    expect(permisosDelRol("admin")).toEqual([]);
  });

  it("cada rol solo ofrece los permisos que tiene", () => {
    expect(permisosDelRol("mecanico")).toEqual(["ver_ordenes", "finalizar"]);
    expect(permisosDelRol("jefe")).toEqual(["ver_ordenes", "finalizar", "crear", "tablero", "repuestos", "aprobar", "inventario", "crear_productos", "editar_precios", "compras", "cargar_compras", "ver_finanzas"]);
    expect(limpiarPermisosOff("mecanico", ["repuestos", "finalizar", "finalizar", "inventado"])).toEqual(["finalizar"]);
  });

  it("la pantalla de inicio siempre es una a la que puede entrar (sin bucles)", () => {
    expect(inicioDe({ rol: "mecanico", permisosOff: [] })).toBe("/ordenes");
    expect(inicioDe({ rol: "jefe", permisosOff: ["ver_ordenes"] })).toBe("/tablero");
    expect(inicioDe({ rol: "mecanico", permisosOff: ["ver_ordenes", "finalizar"] })).toBe("/cuenta");
  });

  it("el menú muestra solo lo permitido", () => {
    const hrefs = pantallasDe({ rol: "jefe", permisosOff: ["tablero", "crear"] }).map((p) => p.href);
    expect(hrefs).toEqual(["/ordenes", "/verificar", "/inventario/nuevo", "/inventario", "/compras/nueva", "/compras", "/finanzas"]);
  });
});

describe("permisos por módulo", () => {
  it("apagar un módulo quita todas sus acciones y deja las de otros módulos", () => {
    const jefe = { rol: "jefe" as const, permisosOff: ["modulo.inventario"] };
    expect(puedeU(jefe, "inventario.ver")).toBe(false);
    expect(puedeU(jefe, "inventario.editar_precio")).toBe(false);
    expect(puedeU(jefe, "compras.crear")).toBe(true);
    expect(puedeU(jefe, "ordenes.aprobar")).toBe(true);
    expect(pantallasDe(jefe).some((p) => p.seccion === "Inventario")).toBe(false);
  });

  it("sin el módulo Taller, el jefe entra directo a Inventario", () => {
    expect(inicioDe({ rol: "jefe", permisosOff: ["modulo.taller"] })).toBe("/inventario");
  });

  it("al admin no se le apaga ningún módulo", () => {
    expect(puedeU({ rol: "admin", permisosOff: ["modulo.taller"] }, "ordenes.crear")).toBe(true);
  });

  it("cada acción de órdenes, inventario y compras pertenece a su módulo", () => {
    for (const a of Object.keys(ACCIONES) as Accion[]) {
      if (SOLO_ADMIN.includes(a)) expect(moduloDeAccion(a), a).toBeNull();
      else expect(moduloDeAccion(a), a).not.toBeNull();
    }
  });

  it("el mecánico solo tiene el módulo Taller; el jefe todos", () => {
    expect(modulosDelRol("mecanico")).toEqual(["taller"]);
    expect(modulosDelRol("jefe")).toEqual(["taller", "inventario", "compras", "finanzas"]);
    expect(limpiarPermisosOff("mecanico", ["modulo.compras", "modulo.taller"])).toEqual(["modulo.taller"]);
  });

  it("el resumen muestra el módulo apagado sin repetir sus permisos", () => {
    expect(resumenPermisosOff(["modulo.compras", "cargar_compras", "repuestos"])).toEqual(["módulo Compras", "Cargar repuestos"]);
  });
});

describe("menú lateral", () => {
  it("las pantallas de alta no van en el menú: se entra desde cada módulo", () => {
    const hrefs = menuDe(pantallasDe({ rol: "jefe", permisosOff: [] })).map((p) => p.href);
    expect(hrefs).toEqual(["/tablero", "/ordenes", "/verificar", "/inventario", "/compras", "/finanzas"]);
  });

  it("si cargar es lo único que tiene en el módulo, el alta sí aparece", () => {
    const u = { rol: "jefe" as const, permisosOff: ["ver_ordenes", "tablero", "repuestos", "aprobar", "finalizar", "inventario"] };
    const hrefs = menuDe(pantallasDe(u)).map((p) => p.href);
    expect(hrefs).toContain("/ordenes/nueva");
    expect(hrefs).toContain("/inventario/nuevo");
    expect(hrefs).not.toContain("/compras/nueva");
  });
});
