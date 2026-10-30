// Finalización por pasos. Cada paso se marca al terminar; un reintento sigue desde el que falló.
import type { Many2one, OdooClient } from "./odoo";
import { choferQueCorresponde } from "./chofer-orden";
import {
  MODELO_ORDEN,
  MODELO_VEHICULO,
  ESTADO_AL_REPORTAR,
  cambioVehiculoAlFinalizar,
  conAutor,
  chapaDe,
  mensajeTelegramError,
  mensajeTelegramFinalizado,
  payloadCamposFinalizar,
  payloadFotos,
  payloadNotaFinalizacion,
  tieneChofer,
  type EstadoOrden,
  type OrdenOdoo,
  type VehiculoOdoo,
} from "./taller";

export type Paso = "campos" | "fotos" | "nota" | "estado" | "telegram";

export type EstadoFinalizacion = {
  id: number;
  ordenId: number;
  odometro: number;
  observacion: string;
  camposOk: boolean;
  fotosOk: boolean;
  attachmentIds: number[];
  notaOk: boolean;
  estadoOk: boolean;
  telegramOk: boolean;
};

export type FotoPendiente = { id: number; nombre: string; mimetype: string; datos: Buffer; attachmentId: number | null };

export type Resumen = {
  ordenId: number;
  chapa: string;
  vehiculo: string;
  tipo: string | null;
  odometro: number;
  fotos: number;
  observacion: string;
  estado: EstadoOrden;
  avisoTelegram: boolean;
};

export type Deps = {
  odoo: Pick<OdooClient, "read" | "searchRead" | "write" | "create" | "messagePost">;
  telegram: (chatId: string, texto: string) => Promise<void>;
  store: {
    guardar(patch: Partial<EstadoFinalizacion> & { error?: string | null; resumen?: Resumen; terminado?: Date }): Promise<void>;
    fotos(): Promise<FotoPendiente[]>;
    marcarFoto(fotoId: number, attachmentId: number): Promise<void>;
    borrarFotos(): Promise<void>;
  };
  mecanico: { nombre: string; partnerId: number | null };
  config: { estadoParaEntregar: number; chatTaller: string; chatErrores: string; hoy: string };
};

export class FinalizarError extends Error {
  constructor(
    readonly paso: Paso | "lectura" | "validacion",
    message: string,
  ) {
    super(message);
    this.name = "FinalizarError";
  }
}

const NOMBRE_PASO: Record<FinalizarError["paso"], string> = {
  lectura: "leer la orden",
  validacion: "validar",
  campos: "cargar odómetro, mecánico y costo",
  fotos: "subir las fotos",
  nota: "publicar la nota de seguimiento",
  estado: "cambiar el estado",
  telegram: "avisar por Telegram",
};

export async function ejecutarFinalizacion(fin: EstadoFinalizacion, deps: Deps): Promise<Resumen> {
  const { odoo, store, config } = deps;
  const f = { ...fin };

  const [orden] = await odoo.read<OrdenOdoo>(MODELO_ORDEN, [f.ordenId], [
    "id", "vehicle_id", "service_type_id", "description", "state", "purchaser_id", "vendor_id", "total_products_cost", "date",
  ]);
  if (!orden || !orden.vehicle_id) throw new FinalizarError("lectura", "La orden no existe en Odoo");
  const [vehiculo] = await odoo.searchRead<VehiculoOdoo>(
    MODELO_VEHICULO,
    [["id", "=", orden.vehicle_id[0]], ["active", "in", [true, false]]],
    ["id", "display_name", "license_plate", "driver_id", "state_id", "odometer"],
    { limit: 1 },
  );
  if (!vehiculo) throw new FinalizarError("lectura", "El vehículo de la orden no existe en Odoo");
  const chapa = chapaDe(vehiculo);

  if (!f.camposOk && orden.state !== "running") {
    throw new FinalizarError("validacion", "Esta orden ya no está en proceso. Actualizá la lista.");
  }

  const paso = async (nombre: Paso, fn: () => Promise<Partial<EstadoFinalizacion>>) => {
    try {
      const patch = await fn();
      Object.assign(f, patch);
      await store.guardar({ ...patch, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[finalizar] orden ${f.ordenId} paso ${nombre}:`, e);
      await store.guardar({ error: `${NOMBRE_PASO[nombre]}: ${msg}` });
      if (nombre !== "telegram") {
        await deps
          .telegram(config.chatErrores, mensajeTelegramError({ chapa, ordenId: f.ordenId, paso: NOMBRE_PASO[nombre], error: msg }))
          .catch((te) => console.error("[telegram errores]", te));
      }
      throw new FinalizarError(nombre, msg);
    }
  };

  if (!f.camposOk) {
    await paso("campos", async () => {
      // Orden sin chofer: el que tenía la moto en la fecha de la orden; si nunca tuvo, queda vacío.
      const choferId = orden.purchaser_id ? null : await choferQueCorresponde(odoo, vehiculo.id, (orden as OrdenOdoo).date ?? false);
      const vals = payloadCamposFinalizar(orden as OrdenOdoo, {
        odometro: f.odometro,
        partnerMecanico: deps.mecanico.partnerId,
        observacion: f.observacion,
        choferId,
      }, config.hoy);
      await odoo.write(MODELO_ORDEN, [f.ordenId], vals);
      return { camposOk: true };
    });
  }

  const fotos = f.fotosOk ? [] : await store.fotos();
  if (!f.fotosOk) {
    await paso("fotos", async () => {
      const ids: number[] = [];
      for (const foto of fotos) {
        let attId = foto.attachmentId;
        if (!attId) {
          attId = await odoo.create("ir.attachment", {
            name: foto.nombre,
            type: "binary",
            datas: Buffer.from(foto.datos).toString("base64"),
            mimetype: foto.mimetype,
            res_model: MODELO_ORDEN,
            res_id: f.ordenId,
          });
          await store.marcarFoto(foto.id, attId);
        }
        ids.push(attId);
      }
      if (ids.length) await odoo.messagePost(MODELO_ORDEN, f.ordenId, conAutor(payloadFotos(ids), deps.mecanico.partnerId));
      return { fotosOk: true, attachmentIds: ids };
    });
    await store.borrarFotos();
  }

  const estado = ESTADO_AL_REPORTAR;
  if (!f.notaOk) {
    await paso("nota", async () => {
      await odoo.messagePost(
        MODELO_ORDEN,
        f.ordenId,
        conAutor(payloadNotaFinalizacion({ mecanico: deps.mecanico.nombre, observacion: f.observacion, odometro: f.odometro, estado }), deps.mecanico.partnerId),
      );
      return { notaOk: true };
    });
  }

  if (!f.estadoOk) {
    await paso("estado", async () => {
      await odoo.write(MODELO_ORDEN, [f.ordenId], { state: estado });
      const veh = cambioVehiculoAlFinalizar(tieneChofer(orden as OrdenOdoo, vehiculo), config.estadoParaEntregar);
      if (veh) await odoo.write(MODELO_VEHICULO, [vehiculo.id], veh);
      return { estadoOk: true };
    });
  }

  let avisoTelegram = f.telegramOk;
  if (!f.telegramOk) {
    try {
      await paso("telegram", async () => {
        await deps.telegram(
          config.chatTaller,
          mensajeTelegramFinalizado({
            mecanico: deps.mecanico.nombre,
            tipo: orden.service_type_id as Many2one,
            chapa,
            odometro: f.odometro,
            descripcion: orden.description,
            observacion: f.observacion,
            estado,
          }),
        );
        return { telegramOk: true };
      });
      avisoTelegram = true;
    } catch {
      // El trabajo ya quedó en Odoo; un Telegram caído no lo invalida.
      avisoTelegram = false;
    }
  }

  const resumen: Resumen = {
    ordenId: f.ordenId,
    chapa,
    vehiculo: vehiculo.display_name,
    tipo: orden.service_type_id ? orden.service_type_id[1] : null,
    odometro: f.odometro,
    fotos: f.attachmentIds.length,
    observacion: f.observacion,
    estado,
    avisoTelegram,
  };
  await store.guardar({ resumen, terminado: new Date() });
  return resumen;
}
