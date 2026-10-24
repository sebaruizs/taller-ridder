import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { listarOrdenes } from "@/lib/ordenes";
import { leerFotos } from "@/lib/fotos-form";
import { mecanicosOdoo } from "@/lib/usuarios";
import { crearOrdenComo } from "@/lib/nueva-orden-servicio";
import { DatoInvalido, OrdenDuplicada } from "@/lib/crear-orden";
import type { Accion } from "@/lib/permisos";

// Cada columna se puede ver con cualquiera de estas acciones (así cada permiso funciona solo).
const ACCIONES_POR_ESTADO: Record<string, Accion[]> = {
  running: ["ordenes.ver_en_proceso", "ordenes.ver_todas"],
  cancelled: ["ordenes.ver_todas", "ordenes.aprobar", "ordenes.editar"],
  new: ["ordenes.ver_todas"],
  to_be_paid: ["ordenes.ver_todas"],
  done: ["ordenes.ver_todas"],
};

const query = z.object({
  estado: z.enum(["new", "running", "cancelled", "to_be_paid", "done"]).default("running"),
  q: z.string().trim().max(20).optional(),
  tipo: z.coerce.number().int().positive().optional(),
  mias: z.enum(["1", "0"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const GET = manejar(async (req) => {
  const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const u = await exigir(ACCIONES_POR_ESTADO[p.estado]);
  const data = await listarOrdenes({
    estado: p.estado,
    chapa: p.q || undefined,
    tipoId: p.tipo,
    partnerId: p.mias === "1" ? u.odooPartnerId : undefined,
    pagina: p.page,
  });
  return json({ ...data, sinPartner: p.mias === "1" && !u.odooPartnerId });
});

const nueva = z.object({
  vehiculoId: z.coerce.number({ error: "Elegí la moto" }).int().positive("Elegí la moto"),
  tipoId: z.coerce.number({ error: "Elegí el tipo de servicio" }).int().positive("Elegí el tipo de servicio"),
  descripcion: z.string().trim().min(3, "Escribí qué pide el chofer").max(2000),
  mecanicoPartnerId: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().positive().nullable()),
});

export const POST = manejar(async (req) => {
  const u = await exigir("ordenes.crear");
  const form = await req.formData();
  const datos = nueva.parse({
    vehiculoId: form.get("vehiculoId"),
    tipoId: form.get("tipoId"),
    descripcion: form.get("descripcion") ?? "",
    mecanicoPartnerId: form.get("mecanicoPartnerId") || undefined,
  });

  let mecanicoNombre: string | null = null;
  if (datos.mecanicoPartnerId) {
    const m = (await mecanicosOdoo()).find((x) => x.id === datos.mecanicoPartnerId);
    if (!m) return errorJson("Ese mecánico no tiene la etiqueta «mecanico» en Odoo", 400);
    mecanicoNombre = m.nombre;
  }

  const leidas = await leerFotos(form, `recepcion-${datos.vehiculoId}`);
  if ("error" in leidas) return errorJson(leidas.error, 400);

  try {
    const r = await crearOrdenComo({ ...datos, mecanicoNombre, fotos: leidas.fotos }, u);
    return json(r, 201);
  } catch (e) {
    if (e instanceof OrdenDuplicada) return errorJson(e.message, 409, { existentes: e.existentes });
    if (e instanceof DatoInvalido) return errorJson(e.message, 400);
    throw e;
  }
});
