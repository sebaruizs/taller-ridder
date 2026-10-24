// Convierte el chatter de Odoo (mail.message + mail.tracking.value) a algo mostrable en la app.
import { TZ } from "./taller";

export type ValorTracking = {
  field_id: [number, string] | false;
  field_info?: { desc?: string; type?: string } | false;
  old_value_char: string | false;
  new_value_char: string | false;
  old_value_float: number;
  new_value_float: number;
  old_value_integer: number;
  new_value_integer: number;
  old_value_datetime: string | false;
  new_value_datetime: string | false;
  currency_id: [number, string] | false;
};

export type Cambio = { campo: string; de: string; a: string };

const NOMBRES: Record<string, string> = {
  Stage: "Etapa",
  Cost: "Costo",
  "Sales Price": "Precio de venta",
  "Cost Price": "Costo",
  Status: "Estado",
  "Untaxed Amount": "Subtotal",
  Total: "Total",
  "Receipt Status": "Recepción",
  "Odometer Value": "Odómetro",
  Driver: "Chofer",
  "Service Type": "Tipo de servicio",
  Description: "Descripción",
};

const ENTIDADES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

// El chatter es HTML de Odoo: se pasa a texto para no inyectar HTML ajeno en la app.
export function htmlATexto(html: string | false | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|div|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function nombreCampo(t: Pick<ValorTracking, "field_id" | "field_info">): string {
  const crudo = (t.field_info && t.field_info.desc) || (t.field_id ? t.field_id[1] : "Campo");
  const limpio = crudo.replace(/\s*\([^)]*\)\s*$/, "");
  return NOMBRES[limpio] ?? limpio;
}

function numero(n: number, moneda: string | null): string {
  const s = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
  return moneda === "PYG" ? `Gs. ${s}` : s;
}

export function valoresTracking(t: ValorTracking): { de: string; a: string } {
  const tipo = t.field_info && t.field_info.type;
  const moneda = t.currency_id ? t.currency_id[1] : null;
  if (tipo === "float" || tipo === "monetary" || (!tipo && (t.old_value_float || t.new_value_float || moneda))) {
    return { de: numero(t.old_value_float, moneda), a: numero(t.new_value_float, moneda) };
  }
  if (tipo === "integer") return { de: numero(t.old_value_integer, null), a: numero(t.new_value_integer, null) };
  if (tipo === "date" || tipo === "datetime" || t.old_value_datetime || t.new_value_datetime) {
    return { de: fechaCorta(t.old_value_datetime), a: fechaCorta(t.new_value_datetime) };
  }
  return { de: t.old_value_char || "—", a: t.new_value_char || "—" };
}

export function cambioDe(t: ValorTracking): Cambio {
  return { campo: nombreCampo(t), ...valoresTracking(t) };
}

// Odoo guarda en UTC ("2026-10-24 16:10:44"); se muestra en hora de Asunción.
export function fechaHora(utc: string | false): string {
  if (!utc) return "—";
  const d = new Date(utc.replace(" ", "T") + "Z");
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-PY", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

function fechaCorta(v: string | false): string {
  if (!v) return "—";
  return v.slice(0, 10).split("-").reverse().join("/");
}
