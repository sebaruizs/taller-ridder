import { describe, expect, it } from "vitest";
import { cambioDe, fechaHora, htmlATexto, nombreCampo, type ValorTracking } from "@/lib/historial-formato";
import { NOTA_INTERNA, conAutor, payloadFotos, payloadNotaVerificacion } from "@/lib/taller";

const base: ValorTracking = {
  field_id: false, field_info: false, old_value_char: false, new_value_char: false, old_value_float: 0, new_value_float: 0,
  old_value_integer: 0, new_value_integer: 0, old_value_datetime: false, new_value_datetime: false, currency_id: false,
};

describe("historial de Odoo", () => {
  it("pasa el HTML del chatter a texto sin etiquetas", () => {
    expect(htmlATexto("<b>Repuestos del servicio actualizados</b><ul><li><b>GPS</b>: línea agregada</li></ul>")).toBe(
      "Repuestos del servicio actualizados\n• GPS: línea agregada",
    );
    expect(htmlATexto("<p>&lt;p&gt;Fotografías del vehículo&lt;/p&gt;</p>")).toBe("<p>Fotografías del vehículo</p>");
    expect(htmlATexto(false)).toBe("");
  });

  it("cambio de etapa como en Odoo", () => {
    const t = { ...base, field_id: [10526, "Stage (Services for vehicles)"] as [number, string], old_value_char: "Running", new_value_char: "Listo para entrega" };
    expect(cambioDe(t)).toEqual({ campo: "Etapa", de: "Running", a: "Listo para entrega" });
  });

  it("cambio de costo en guaraníes", () => {
    const t = { ...base, field_id: [10513, "Cost (Services for vehicles)"] as [number, string], new_value_float: 160000, currency_id: [157, "PYG"] as [number, string] };
    expect(cambioDe(t)).toEqual({ campo: "Costo", de: "Gs. 0", a: "Gs. 160.000" });
  });

  it("nombre de campo desconocido se muestra sin el sufijo del modelo", () => {
    expect(nombreCampo({ field_id: [1, "Responsable (Services for vehicles)"], field_info: false })).toBe("Responsable");
  });

  it("las fechas de Odoo (UTC) se muestran en hora de Asunción", () => {
    expect(fechaHora("2026-10-24 16:10:44")).toBe("24/10 13:10");
  });
});

describe("notas que publica la app", () => {
  it("van como HTML para que Odoo no muestre las etiquetas", () => {
    expect(payloadFotos([1])).toMatchObject({ body_is_html: true, subtype_xmlid: "mail.mt_note" });
    expect(payloadNotaVerificacion({ autor: "X", lineas: [] })).toMatchObject(NOTA_INTERNA);
  });

  it("figuran a nombre del contacto de quien hizo la acción", () => {
    expect(conAutor(payloadFotos([1]), 1685)).toMatchObject({ author_id: 1685 });
    expect(conAutor(payloadFotos([1]), null)).not.toHaveProperty("author_id");
  });
});
