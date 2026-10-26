import { z } from "zod";

const limpio = z
  .string()
  .optional()
  .default("")
  .transform((v) => v.trim().replace(/^["']|["']$/g, "").trim());

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
  // Sin espacios ni comillas alrededor: pegados así en Easypanel rompen la llamada a Telegram.
  TELEGRAM_BOT_TOKEN: limpio,
  TELEGRAM_CHAT_TALLER: limpio,
  TELEGRAM_CHAT_ERRORES: limpio,
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
