import { json, manejar } from "@/lib/api";
import { personaDeDispositivo } from "@/lib/movil-auth";
import { recibirRegistro } from "@/lib/movil";
import { MAX_BYTES_PEDIDO, registroSchema } from "@/lib/movil-dominio";

// Ridder App: lo cargado en el teléfono (con o sin señal) llega acá de a uno y en orden.
// 200 aceptado (también si el id ya había llegado) · 422 rechazado con motivo · 401 credencial · 503 reintentar.
// Contrato: ridder-app/contratos/SINCRONIZACION.md.
export const POST = manejar(async (req) => {
  const u = await personaDeDispositivo(req);
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_PEDIDO) return rechazo("El registro es demasiado grande (fotos de más de 1 MB o demasiadas fotos)");
  const texto = await req.text();
  if (texto.length > MAX_BYTES_PEDIDO) return rechazo("El registro es demasiado grande (fotos de más de 1 MB o demasiadas fotos)");
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return json({ error: "El cuerpo no es JSON" }, 400);
  }
  const r = registroSchema.safeParse(cuerpo);
  // Mal formado: reintentarlo no lo arregla, así que no se deja en la cola para siempre.
  if (!r.success) return rechazo(r.error.issues[0]?.message ?? "Registro mal formado");
  const res = await recibirRegistro(u, r.data);
  return json(res.body, res.status);
});

const rechazo = (motivo: string) => json({ resultado: "rechazado", motivo }, 422);
