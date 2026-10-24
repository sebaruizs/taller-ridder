import "server-only";
import { odoo } from "./odoo";
import { env } from "./env";
import { enviarTelegram } from "./telegram";
import { CAMPOS_VEHICULO, MODELO_VEHICULO, chapaDe, hoyAsuncion, normalizarChapa, type VehiculoOdoo } from "./taller";
import { DatoInvalido, crearOrden, ordenesEnProcesoDe, type EntradaNuevaOrden } from "./crear-orden";
import { registrar, type Usuario } from "./auth";

export async function buscarVehiculos(q: string) {
  const vehiculos = await odoo.searchRead<VehiculoOdoo>(
    MODELO_VEHICULO,
    [["license_plate", "ilike", normalizarChapa(q)], ["active", "in", [true, false]]],
    [...CAMPOS_VEHICULO, "active"],
    { limit: 8, order: "license_plate asc" },
  );
  const enProceso = await ordenesEnProcesoDe(odoo, vehiculos.map((v) => v.id));
  return vehiculos.map((v) => ({
    id: v.id,
    chapa: chapaDe(v),
    nombre: v.display_name,
    chofer: v.driver_id ? v.driver_id[1] : null,
    estado: v.state_id ? v.state_id[1] : null,
    activo: (v as VehiculoOdoo & { active: boolean }).active,
    ordenesEnProceso: enProceso
      .filter((o) => o.vehicle_id && o.vehicle_id[0] === v.id)
      .map((o) => ({ id: o.id, tipo: o.service_type_id ? o.service_type_id[1] : null, fecha: o.date || null })),
  }));
}

export type VehiculoBuscado = Awaited<ReturnType<typeof buscarVehiculos>>[number];

// Un alta a la vez por moto: evita dos órdenes si el jefe toca dos veces "Crear".
const enCurso = new Set<number>();

export async function crearOrdenComo(e: EntradaNuevaOrden, autor: Usuario) {
  if (enCurso.has(e.vehiculoId)) throw new DatoInvalido("Ya se está creando una orden para esta moto");
  enCurso.add(e.vehiculoId);
  try {
    const cfg = env();
    const r = await crearOrden(e, {
      odoo,
      telegram: enviarTelegram,
      autor: autor.nombre,
      config: { chatTaller: cfg.TELEGRAM_CHAT_TALLER, chatErrores: cfg.TELEGRAM_CHAT_ERRORES, hoy: hoyAsuncion() },
    });
    await registrar(autor.id, "orden.crear", {
      ordenId: r.ordenId,
      vehiculoId: e.vehiculoId,
      detalle: {
        chapa: r.chapa,
        tipoId: e.tipoId,
        descripcion: e.descripcion,
        mecanicoPartnerId: e.mecanicoPartnerId,
        fotos: e.fotos.length,
        avisos: r.avisos,
      },
    });
    return r;
  } finally {
    enCurso.delete(e.vehiculoId);
  }
}
