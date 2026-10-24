import { describe, expect, it } from "vitest";
import {
  cambioVehiculoAlFinalizar,
  chapaDe,
  checkListaEntregaPorDefecto,
  diasEnTaller,
  dominioOrdenesEnProceso,
  estadoFinal,
  hoyAsuncion,
  mensajeTelegramFinalizado,
  payloadCamposFinalizar,
  payloadObservacion,
  type OrdenOdoo,
  type VehiculoOdoo,
} from "@/lib/taller";
import { medidasEscaladas } from "@/lib/comprimir";

const orden = (o: Partial<OrdenOdoo> = {}): OrdenOdoo => ({
  id: 4358,
  vehicle_id: [82, "Buler/Faiter/230ABPT"],
  service_type_id: [23, "Mantenimeinto, Diagnóstico y Reparación"],
  description: "mantenimiento puesta a punto",
  date: "2026-10-20",
  service_end_date: false,
  odometer: 0,
  amount: 0,
  vendor_id: false,
  purchaser_id: false,
  state: "running",
  total_products_cost: 327500,
  ...o,
});

const vehiculo = (v: Partial<VehiculoOdoo> = {}): VehiculoOdoo => ({
  id: 82,
  display_name: "Buler/Faiter/230ABPT",
  license_plate: "230ABPT",
  driver_id: false,
  state_id: [2, "En taller"],
  odometer: 15000,
  ...v,
});

describe("dominio de órdenes en proceso", () => {
  it("filtra por estado en Odoo", () => {
    expect(dominioOrdenesEnProceso({})).toEqual([["state", "=", "running"]]);
  });

  it("busca por chapa normalizada, tipo y mecánico en el dominio", () => {
    expect(dominioOrdenesEnProceso({ chapa: " 230 abpt ", tipoId: 23, partnerId: 99 })).toEqual([
      ["state", "=", "running"],
      ["vehicle_id.license_plate", "ilike", "230ABPT"],
      ["service_type_id", "=", 23],
      ["vendor_id", "=", 99],
    ]);
  });

  it("'asignadas a mí' sin partner vinculado no devuelve nada en vez de devolver todo", () => {
    expect(dominioOrdenesEnProceso({ partnerId: null })).toContainEqual(["vendor_id", "=", 0]);
  });
});

describe("payload de campos al finalizar", () => {
  it("escribe odómetro, mecánico, costo = repuestos y fecha de fin", () => {
    expect(
      payloadCamposFinalizar(orden(), vehiculo(), { odometro: 15230, partnerMecanico: 77, observacion: "", listaEntrega: true }, "2026-10-24"),
    ).toEqual({ odometer: 15230, amount: 327500, service_end_date: "2026-10-24", vendor_id: 77 });
  });

  it("completa el chofer desde el vehículo si la orden no lo tenía", () => {
    const vals = payloadCamposFinalizar(orden(), vehiculo({ driver_id: [2560, "Elias"] }), { odometro: 1, partnerMecanico: null, observacion: "", listaEntrega: true }, "2026-10-24");
    expect(vals.purchaser_id).toBe(2560);
    expect(vals).not.toHaveProperty("vendor_id");
  });

  it("no pisa el chofer que ya tenía la orden", () => {
    const vals = payloadCamposFinalizar(orden({ purchaser_id: [1, "Otro"] }), vehiculo({ driver_id: [2560, "Elias"] }), { odometro: 1, partnerMecanico: 5, observacion: "", listaEntrega: true }, "2026-10-24");
    expect(vals).not.toHaveProperty("purchaser_id");
  });

  it("costo 0 cuando no hay repuestos", () => {
    expect(payloadCamposFinalizar(orden({ total_products_cost: 0 }), vehiculo(), { odometro: 1, partnerMecanico: 5, observacion: "", listaEntrega: true }, "x").amount).toBe(0);
  });
});

describe("estado al finalizar", () => {
  it("con el check pasa a Listo para entrega y no toca el vehículo", () => {
    expect(estadoFinal(true)).toBe("to_be_paid");
    expect(cambioVehiculoAlFinalizar(true, 1)).toBeNull();
  });

  it("sin el check pasa a Listo para verificar y el vehículo a Para entregar", () => {
    expect(estadoFinal(false)).toBe("cancelled");
    expect(cambioVehiculoAlFinalizar(false, 1)).toEqual({ state_id: 1 });
  });

  it("el check viene marcado si hay chofer en la orden o en el vehículo", () => {
    expect(checkListaEntregaPorDefecto(orden(), vehiculo())).toBe(false);
    expect(checkListaEntregaPorDefecto(orden({ purchaser_id: [1, "x"] }), vehiculo())).toBe(true);
    expect(checkListaEntregaPorDefecto(orden(), vehiculo({ driver_id: [1, "x"] }))).toBe(true);
  });
});

describe("nota de observación", () => {
  it("lleva el nombre del mecánico, es nota interna y escapa HTML", () => {
    const p = payloadObservacion("Juan", "cambié <b>freno</b>\ny cadena");
    expect(p.subtype_xmlid).toBe("mail.mt_note");
    expect(p.body).toBe("<p><b>Juan</b>: cambié &lt;b&gt;freno&lt;/b&gt;<br>y cadena</p>");
  });
});

describe("mensaje de Telegram", () => {
  const base = {
    mecanico: "Juan",
    tipo: [23, "Mantenimiento"] as [number, string],
    chapa: "230ABPT",
    odometro: 15230,
    descripcion: "puesta a punto" as string | false,
    observacion: "todo ok",
    estado: "to_be_paid" as const,
  };

  it("muestra el nombre del tipo, no el array", () => {
    const m = mensajeTelegramFinalizado(base);
    expect(m).toContain("✅ Trabajo finalizado por Juan");
    expect(m).toContain("📝 Tarea: Mantenimiento");
    expect(m).not.toContain("23,");
    expect(m).toContain("🚗 Vehículo: 230ABPT");
  });

  it("descripción y comentario vacíos se muestran como — y nunca false", () => {
    const m = mensajeTelegramFinalizado({ ...base, descripcion: false, observacion: "  " });
    expect(m).not.toContain("false");
    expect(m).toContain("🔧 Trabajos realizados: —");
    expect(m.trim().endsWith("—")).toBe(true);
  });
});

describe("utilidades", () => {
  it("días en taller según la fecha de Asunción", () => {
    const ahora = new Date("2026-10-24T02:00:00Z"); // 23:00 del 23 en Asunción
    expect(hoyAsuncion(ahora)).toBe("2026-10-23");
    expect(diasEnTaller("2026-10-15", ahora)).toBe(8);
    expect(diasEnTaller(false)).toBeNull();
  });

  it("chapa desde license_plate o desde el nombre del vehículo", () => {
    expect(chapaDe({ license_plate: "068ACEY", display_name: "x" })).toBe("068ACEY");
    expect(chapaDe({ license_plate: false, display_name: "Kenton/GTR150 LTD/068ACEY" })).toBe("068ACEY");
  });

  it("las fotos se achican a 1600 px del lado mayor", () => {
    expect(medidasEscaladas(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(medidasEscaladas(1200, 900)).toEqual({ w: 1200, h: 900 });
  });
});
