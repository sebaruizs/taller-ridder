import "server-only";
import { odoo, type Many2one } from "./odoo";
import { MODELO_ORDEN } from "./taller";
import { cambioDe, fechaHora, htmlATexto, type Cambio, type ValorTracking } from "./historial-formato";

export type EntradaHistorial = { id: number; fecha: string; autor: string; texto: string; cambios: Cambio[]; adjuntos: number };

// Lo mismo que muestra el chatter de la orden en Odoo, de lo más nuevo a lo más viejo.
export async function leerHistorial(ordenId: number, limite = 40): Promise<EntradaHistorial[]> {
  const mensajes = await odoo.searchRead<{
    id: number;
    date: string;
    author_id: Many2one;
    body: string | false;
    tracking_value_ids: number[];
    attachment_ids: number[];
  }>(
    "mail.message",
    [["model", "=", MODELO_ORDEN], ["res_id", "=", ordenId], ["message_type", "in", ["comment", "notification"]]],
    ["id", "date", "author_id", "body", "tracking_value_ids", "attachment_ids"],
    { limit: limite, order: "id desc" },
  );
  const ids = mensajes.flatMap((m) => m.tracking_value_ids);
  const valores = ids.length
    ? await odoo.read<ValorTracking & { id: number }>("mail.tracking.value", ids, [
        "field_id", "field_info", "old_value_char", "new_value_char", "old_value_float", "new_value_float",
        "old_value_integer", "new_value_integer", "old_value_datetime", "new_value_datetime", "currency_id",
      ])
    : [];
  const porId = new Map(valores.map((v) => [v.id, v]));
  return mensajes
    .map((m) => ({
      id: m.id,
      fecha: fechaHora(m.date),
      autor: m.author_id ? m.author_id[1] : "Odoo",
      texto: htmlATexto(m.body),
      cambios: m.tracking_value_ids.map((t) => porId.get(t)).filter((v): v is ValorTracking & { id: number } => !!v).map(cambioDe),
      adjuntos: m.attachment_ids.length,
    }))
    .filter((e) => e.texto || e.cambios.length || e.adjuntos);
}
