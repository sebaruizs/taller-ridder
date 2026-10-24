import { describe, expect, it } from "vitest";
import { ACCIONES, DURACION_SESION_DIAS, puede, type Accion } from "@/lib/permisos";
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
