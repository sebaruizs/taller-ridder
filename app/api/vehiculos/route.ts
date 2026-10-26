import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { buscarVehiculos } from "@/lib/nueva-orden-servicio";

const query = z.object({ chapa: z.string().trim().min(2, "Escribí al menos 2 caracteres de la chapa").max(20) });

export const GET = manejar(async (req) => {
  await exigir("vehiculos.buscar");
  const { chapa } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ vehiculos: await buscarVehiculos(chapa) });
});
