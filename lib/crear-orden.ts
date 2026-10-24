// Alta de una orden por el jefe de taller. Deja seguimiento en Odoo (nota), en Telegram y en el log (lo hace quien llama).
import type { Many2one, OdooClient } from "./odoo";
import {
  CAMPOS_VEHICULO,
  MODELO_ORDEN,
  MODELO_VEHICULO,
  chapaDe,
  mensajeTelegramError,
  mensajeTelegramNuevaOrden,
  payloadFotos,
  payloadNotaNuevaOrden,
  payloadNuevaOrden,
  type DatosNuevaOrden,
  type VehiculoOdoo,
} from "./taller";

export type FotoRecepcion = { nombre: string; mimetype: string; datos: Buffer };

export type EntradaNuevaOrden = DatosNuevaOrden & { vehiculoId: number; mecanicoNombre: string | null; fotos: FotoRecepcion[] };

export type DepsNuevaOrden = {
  odoo: Pick<OdooClient, "searchRead" | "create" | "messagePost">;
  telegram: (chatId: string, texto: string) => Promise<void>;
  autor: string;
  config: { chatTaller: string; chatErrores: string; hoy: string };
};

export type OrdenExistente = { id: number; tipo: string | null; fecha: string | null };

export class OrdenDuplicada extends Error {
  constructor(readonly existentes: OrdenExistente[]) {
    super("Esta moto ya tiene una orden en proceso");
  }
}

export class DatoInvalido extends Error {}

export type ResultadoNuevaOrden = { ordenId: number; chapa: string; avisos: string[] };

export async function ordenesEnProcesoDe(odoo: DepsNuevaOrden["odoo"], vehiculoIds: number[]) {
  if (!vehiculoIds.length) return [];
  return odoo.searchRead<{ id: number; vehicle_id: Many2one; service_type_id: Many2one; date: string | false }>(
    MODELO_ORDEN,
    [["vehicle_id", "in", vehiculoIds], ["state", "=", "running"]],
    ["id", "vehicle_id", "service_type_id", "date"],
    { limit: 50, order: "date desc" },
  );
}

export async function crearOrden(e: EntradaNuevaOrden, deps: DepsNuevaOrden): Promise<ResultadoNuevaOrden> {
  const { odoo, config } = deps;

  const [vehiculo] = await odoo.searchRead<VehiculoOdoo>(
    MODELO_VEHICULO,
    [["id", "=", e.vehiculoId], ["active", "in", [true, false]]],
    [...CAMPOS_VEHICULO],
    { limit: 1 },
  );
  if (!vehiculo) throw new DatoInvalido("La moto no existe en Odoo");

  const existentes = await ordenesEnProcesoDe(odoo, [vehiculo.id]);
  if (existentes.length) {
    throw new OrdenDuplicada(existentes.map((o) => ({ id: o.id, tipo: o.service_type_id ? o.service_type_id[1] : null, fecha: o.date || null })));
  }

  const [tipo] = await odoo.searchRead<{ id: number; name: string }>("fleet.service.type", [["id", "=", e.tipoId]], ["id", "name"], { limit: 1 });
  if (!tipo) throw new DatoInvalido("El tipo de servicio no existe en Odoo");

  const ordenId = await odoo.create(MODELO_ORDEN, payloadNuevaOrden(vehiculo, e, config.hoy));
  const chapa = chapaDe(vehiculo);
  const avisos: string[] = [];

  // La orden ya existe: lo que falle de acá en adelante se avisa, no se deshace.
  const intentar = async (que: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      avisos.push(`No se pudo ${que}: ${msg}`);
      await deps
        .telegram(config.chatErrores, mensajeTelegramError({ chapa, ordenId, paso: que, error: msg }))
        .catch((te) => console.error("[telegram errores]", te));
    }
  };

  await intentar("publicar la nota de seguimiento", () =>
    odoo.messagePost(MODELO_ORDEN, ordenId, payloadNotaNuevaOrden({ autor: deps.autor, mecanico: e.mecanicoNombre, fotos: e.fotos.length })),
  );

  if (e.fotos.length) {
    await intentar("subir las fotos de recepción", async () => {
      const ids: number[] = [];
      for (const f of e.fotos) {
        ids.push(
          await odoo.create("ir.attachment", {
            name: f.nombre,
            type: "binary",
            datas: f.datos.toString("base64"),
            mimetype: f.mimetype,
            res_model: MODELO_ORDEN,
            res_id: ordenId,
          }),
        );
      }
      await odoo.messagePost(MODELO_ORDEN, ordenId, payloadFotos(ids, "Fotos de recepción"));
    });
  }

  try {
    await deps.telegram(
      config.chatTaller,
      mensajeTelegramNuevaOrden({
        autor: deps.autor,
        chapa,
        tipo: tipo.name,
        descripcion: e.descripcion,
        mecanico: e.mecanicoNombre,
        chofer: vehiculo.driver_id ? vehiculo.driver_id[1] : null,
        ordenId,
      }),
    );
  } catch {
    avisos.push("No se pudo avisar por Telegram");
  }

  return { ordenId, chapa, avisos };
}
