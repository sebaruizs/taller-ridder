import { z } from "zod";

const sinComillas = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
const prendido = (v: string) => v === "1" || v === "true";
export const URL_ACCESO = /^https?:\/\/[^\s"'<>]+$/;

const limpio = z
  .string()
  .optional()
  .default("")
  .transform(sinComillas);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ODOO_URL: z.string().url(),
  ODOO_DB: z.string().min(1),
  ODOO_USER: z.string().min(1),
  ODOO_API_KEY: z.string().min(1),
  ODOO_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  // "true" bloquea toda escritura en Odoo (lecturas sí).
  ODOO_READONLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  ODOO_VEHICLE_STATE_PARA_ENTREGAR: z.coerce.number().int().default(1),
  ODOO_TAG_MECANICO: z.coerce.number().int().positive().default(20),
  // Etiqueta de contactos de los cobradores (ejecutivos de cuenta).
  ODOO_TAG_EJECUTIVO: z.coerce.number().int().positive().default(24),
  // Sin espacios ni comillas alrededor: pegados así en Easypanel rompen la llamada a Telegram.
  TELEGRAM_BOT_TOKEN: limpio,
  TELEGRAM_CHAT_TALLER: limpio,
  TELEGRAM_CHAT_ERRORES: limpio,
  APP_URL: z.string().url().optional(),
  // Secreto compartido con Cobranzas para crear usuarios cobradores por webhook. Vacío = webhook apagado.
  WEBHOOK_USUARIOS_SECRET: limpio,
  // Secreto de la API para Cobranzas: con él, cada ruta /api actúa como el usuario de X-Ridder-Usuario. Vacío = apagada.
  API_COBRANZAS_SECRET: limpio,
  // GPS (track.ridder.com.py): token de API del usuario «Ridder taller». Vacío = sin estados de GPS ni cortes.
  TRACCAR_URL: z.string().url().default("https://track.ridder.com.py"),
  TRACCAR_TOKEN: limpio,
  // Traccar anterior (gps.ridder.com.py), solo lectura: se consulta cuando un equipo está fuera de línea en el nuevo.
  // Vacío = no se consulta.
  TRACCAR_ANTERIOR_URL: z.string().url().default("https://gps.ridder.com.py"),
  TRACCAR_ANTERIOR_TOKEN: limpio,
  // Google Sheets de monedas publicado como CSV (Archivo > Compartir > Publicar en la web > CSV). Vacío = no se usa.
  MONEDAS_SHEET_CSV_URL: limpio,
  // Asistencias: con las dos, el menú muestra «Marcar asistencia» (entra allá con el mismo usuario). Vacías = no aparece.
  ASISTENCIAS_URL: limpio,
  ASISTENCIAS_SECRET: limpio,
  // Ridder Acceso (ingreso único, app.ridder.com.py). ACCESO_SECRET: clave compartida (32 caracteres o más) con la que
  // Acceso firma los enlaces de /entrar/acceso; vacía = esa puerta está apagada. ACCESO_URL: adónde llevan los
  // enlaces «Ridder» del menú; vacía = no se muestran. Son independientes.
  ACCESO_SECRET: limpio,
  ACCESO_URL: limpio,
  // Clave de la API con la que Acceso crea, actualiza y desactiva usuarios (/api/acceso/usuarios). 32 caracteres o más
  // y distinta de las demás; vacía = esa API responde 503.
  ACCESO_API_SECRET: limpio,
  // Etapa 2 de Ridder Acceso (CONTRATO.md de Acceso, sección 5): "1" o "true" = Acceso es el único ingreso. Quien llega
  // sin sesión va a ACCESO_URL/ir/taller y vuelve a donde estaba; Salir cierra también Acceso (ACCESO_URL/salir); el
  // login propio queda solo para admins (entrada de emergencia). Necesita ACCESO_URL y ACCESO_SECRET. Apagado por defecto:
  // no prender en producción hasta que esté desplegada la etapa 2 de Acceso (la 0.7.0 no tiene /salir ni /ir?a=).
  ACCESO_SOLO: limpio.pipe(z.enum(["", "0", "1", "true", "false"])).transform(prendido),
  // API móvil (Ridder App), SOLO DESARROLLO: mientras Ridder Acceso no emita la credencial de dispositivo, con
  // NODE_ENV distinto de production se acepta "Authorization: Bearer <usuario>.<MOVIL_PRUEBA_TOKEN>" (16 caracteres o
  // más). En producción se ignora y la API móvil responde 401 a todo (lib/movil-auth.ts).
  MOVIL_PRUEBA_TOKEN: limpio,
  // "true": la API móvil acepta la ficha de Ridder Acceso ("Authorization: Bearer <ficha>", firmada con ACCESO_SECRET,
  // ACCESO-MOVIL.md 3.5). Apagada por defecto: el formato es una propuesta sin revisar y Acceso todavía no la emite.
  // Cobranzas: de dónde saca la API móvil las motos a recuperar (GET /api/integraciones/taller/motos-a-devolver).
  // TALLER_LECTURA_SECRET es el mismo valor que en Cobranzas, 32 caracteres o más. Vacías = Taller lee Odoo directo.
  COBRANZAS_URL: limpio,
  TALLER_LECTURA_SECRET: limpio,
  MOVIL_FICHA_ACCESO: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // SOLO DESARROLLO: "true" lee del Odoo real pero simula todas las escrituras (lib/odoo-simulado.ts), para probar
  // Ridder App de punta a punta. Con NODE_ENV=production el servidor no arranca (ver errorDeEntorno e instrumentation.ts).
  MOVIL_ODOO_SIMULADO: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** Combinaciones prohibidas: el servidor no arranca con ellas. */
export function errorDeEntorno(vars: Record<string, string | undefined>): string | null {
  if (vars.NODE_ENV === "production" && vars.MOVIL_ODOO_SIMULADO?.trim() === "true") {
    return "MOVIL_ODOO_SIMULADO=true no se puede usar en producción: simula las escrituras en Odoo. Sacala del entorno.";
  }
  if (prendido(sinComillas(vars.ACCESO_SOLO))) {
    if (!URL_ACCESO.test(sinComillas(vars.ACCESO_URL))) return "ACCESO_SOLO prendido sin ACCESO_URL (https://…): nadie podría ingresar. Configurá ACCESO_URL o apagá ACCESO_SOLO.";
    if (sinComillas(vars.ACCESO_SECRET).length < 32) return "ACCESO_SOLO prendido sin ACCESO_SECRET (32 caracteres o más): nadie podría ingresar desde Ridder. Configurala o apagá ACCESO_SOLO.";
  }
  return null;
}

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const prohibido = errorDeEntorno(process.env);
    if (prohibido) throw new Error(prohibido);
    cached = schema.parse(process.env);
  }
  return cached;
}
