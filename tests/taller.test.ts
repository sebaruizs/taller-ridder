import { describe, expect, it } from "vitest";
import {
  cambioVehiculoAlFinalizar,
  clienteDesde,
  textoCliente,
  chapaDe,
  tieneChofer,
  diasEnTaller,
  dominioOrdenes,
  ESTADO_AL_APROBAR,
  ESTADO_AL_REPORTAR,
  hoyAsuncion,
  mensajeTelegramFinalizado,
  payloadCamposFinalizar,
  payloadNotaFinalizacion,
  payloadNuevaOrden,
  payloadNotaNuevaOrden,
  mensajeTelegramNuevaOrden,
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
    expect(dominioOrdenes({})).toEqual([["state", "=", "running"]]);
  });

  it("busca por chapa normalizada, tipo y mecánico en el dominio", () => {
    expect(dominioOrdenes({ chapa: " 230 abpt ", tipoId: 23, partnerId: 99 })).toEqual([
      ["state", "=", "running"],
      ["vehicle_id.license_plate", "ilike", "230ABPT"],
      ["service_type_id", "=", 23],
      ["vendor_id", "=", 99],
    ]);
  });

  it("'asignadas a mí' sin partner vinculado no devuelve nada en vez de devolver todo", () => {
    expect(dominioOrdenes({ partnerId: null })).toContainEqual(["vendor_id", "=", 0]);
  });
});

describe("payload de campos al finalizar", () => {
  it("escribe odómetro, mecánico, costo = repuestos y fecha de fin", () => {
    expect(
      payloadCamposFinalizar(orden(), vehiculo(), { odometro: 15230, partnerMecanico: 77, observacion: "" }, "2026-10-24"),
    ).toEqual({ odometer: 15230, amount: 327500, service_end_date: "2026-10-24", vendor_id: 77 });
  });

  it("completa el chofer desde el vehículo si la orden no lo tenía", () => {
    const vals = payloadCamposFinalizar(orden(), vehiculo({ driver_id: [2560, "Elias"] }), { odometro: 1, partnerMecanico: null, observacion: "" }, "2026-10-24");
    expect(vals.purchaser_id).toBe(2560);
    expect(vals).not.toHaveProperty("vendor_id");
  });

  it("si la orden no tenía mecánico, queda asignada al que reporta", () => {
    const vals = payloadCamposFinalizar(orden({ vendor_id: false }), vehiculo(), { odometro: 1, partnerMecanico: 1685, observacion: "" }, "2026-10-24");
    expect(vals.vendor_id).toBe(1685);
  });

  it("si la orden ya tenía mecánico asignado, no lo cambia", () => {
    const vals = payloadCamposFinalizar(orden({ vendor_id: [2068, "Kevin"] }), vehiculo(), { odometro: 1, partnerMecanico: 1685, observacion: "" }, "2026-10-24");
    expect(vals).not.toHaveProperty("vendor_id");
  });

  it("no pisa el chofer que ya tenía la orden", () => {
    const vals = payloadCamposFinalizar(orden({ purchaser_id: [1, "Otro"] }), vehiculo({ driver_id: [2560, "Elias"] }), { odometro: 1, partnerMecanico: 5, observacion: "" }, "2026-10-24");
    expect(vals).not.toHaveProperty("purchaser_id");
  });

  it("costo 0 cuando no hay repuestos", () => {
    expect(payloadCamposFinalizar(orden({ total_products_cost: 0 }), vehiculo(), { odometro: 1, partnerMecanico: 5, observacion: "" }, "x").amount).toBe(0);
  });
});

describe("flujo de estados", () => {
  it("el mecánico reporta a Listo para verificar y el jefe aprueba a Finalizado", () => {
    expect(ESTADO_AL_REPORTAR).toBe("cancelled");
    expect(ESTADO_AL_APROBAR).toBe("done");
  });

  it("moto con chofer: no se toca el vehículo; sin chofer: pasa a Para entregar", () => {
    expect(cambioVehiculoAlFinalizar(true, 1)).toBeNull();
    expect(cambioVehiculoAlFinalizar(false, 1)).toEqual({ state_id: 1 });
  });

  it("tiene chofer si lo tiene la orden o el vehículo", () => {
    expect(tieneChofer(orden(), vehiculo())).toBe(false);
    expect(tieneChofer(orden({ purchaser_id: [1, "x"] }), vehiculo())).toBe(true);
    expect(tieneChofer(orden(), vehiculo({ driver_id: [1, "x"] }))).toBe(true);
  });
});

describe("nota de seguimiento al finalizar", () => {
  it("dice quién finalizó, el odómetro y el estado, es nota interna y escapa HTML", () => {
    const p = payloadNotaFinalizacion({ mecanico: "Juan", observacion: "cambié <b>freno</b>\ny cadena", odometro: 15230, estado: "cancelled" });
    expect(p.subtype_xmlid).toBe("mail.mt_note");
    expect(p.body).toContain("<b>Trabajo finalizado por Juan</b>");
    expect(p.body).toContain("Odómetro: 15.230 km · Nuevo estado: Listo para verificar");
    expect(p.body).toContain("Observación: cambié &lt;b&gt;freno&lt;/b&gt;<br>y cadena");
  });

  it("sin observación igual deja la nota, sin la línea de observación", () => {
    const p = payloadNotaFinalizacion({ mecanico: "Juan", observacion: "  ", odometro: 1, estado: "cancelled" });
    expect(p.body).toContain("Trabajo finalizado por Juan");
    expect(p.body).not.toContain("Observación");
  });
});

describe("nueva orden", () => {
  it("crea en proceso, con fecha de hoy y el chofer del vehículo", () => {
    expect(
      payloadNuevaOrden(vehiculo({ driver_id: [2560, "Elias"] }), { tipoId: 11, descripcion: "  ruido en el motor ", mecanicoPartnerId: 1685 }, "2026-10-24"),
    ).toEqual({ vehicle_id: 82, service_type_id: 11, description: "ruido en el motor", date: "2026-10-24", state: "new", purchaser_id: 2560, vendor_id: 1685 });
  });

  it("sin chofer ni mecánico no manda esos campos", () => {
    const vals = payloadNuevaOrden(vehiculo(), { tipoId: 11, descripcion: "x", mecanicoPartnerId: null }, "2026-10-24");
    expect(vals).not.toHaveProperty("purchaser_id");
    expect(vals).not.toHaveProperty("vendor_id");
  });

  it("la nota dice quién la cargó y a quién se asignó", () => {
    const p = payloadNotaNuevaOrden({ autor: "Ramón <jefe>", mecanico: null, fotos: 2 });
    expect(p.body).toContain("Orden cargada por Ramón &lt;jefe&gt;");
    expect(p.body).toContain("Mecánico asignado: sin asignar · Fotos de recepción: 2");
  });

  it("el aviso de Telegram nunca muestra false", () => {
    const m = mensajeTelegramNuevaOrden({ autor: "Ramón", chapa: "230ABPT", tipo: "Reparación", descripcion: "", mecanico: null, chofer: null, ordenId: 9 });
    expect(m).toContain("🆕 Nueva orden de taller #9");
    expect(m).toContain("🔧 Pedido: —");
    expect(m).toContain("Mecánico: Sin asignar");
    expect(m).not.toContain("false");
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

describe("antigüedad del chofer como cliente", () => {
  const ahora = new Date("2026-10-27T15:00:00Z");
  it("toma la fecha más vieja entre factura y asignación", () => {
    expect(clienteDesde(["2025-08-04", "2025-06-26", false, null])).toBe("2025-06-26");
    expect(clienteDesde([false, undefined])).toBeNull();
  });
  it("arma el texto en años, meses o días", () => {
    expect(textoCliente("2025-06-26", ahora)).toBe("Cliente hace 1 año y 4 meses (desde 26/06/2025)");
    expect(textoCliente("2024-10-27", ahora)).toBe("Cliente hace 2 años (desde 27/10/2024)");
    expect(textoCliente("2026-09-28", ahora)).toBe("Cliente hace 29 días (desde 28/09/2026)");
    expect(textoCliente("2026-09-27", ahora)).toBe("Cliente hace 1 mes (desde 27/09/2026)");
    expect(textoCliente("2026-10-26", ahora)).toBe("Cliente hace 1 día (desde 26/10/2026)");
    expect(textoCliente("2026-10-27", ahora)).toBe("Cliente desde hoy (27/10/2026)");
  });
});
