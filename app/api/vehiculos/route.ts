import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { buscarVehiculos } from "@/lib/nueva-orden-servicio";

const query = z.object({ chapa: z.string().trim().min(2, "Escribí al menos 2 caracteres de la chapa").max(20) });

export const GET = manejar(async (req) => {
  // También la usa el alta de Devoluciones para elegir la moto.
  await exigir(["vehiculos.buscar", "devoluciones.registrar"]);
  const { chapa } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ vehiculos: await buscarVehiculos(chapa) });
});
