// Uso: npm run usuario -- --usuario juanp --nombre "Juan Pérez" --rol mecanico --password "clave-segura" [--partner 1685]
// Lo normal es crear usuarios desde la pantalla Usuarios; esto queda para emergencias (por ejemplo, recuperar el admin).
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";

config({ path: [".env.local", ".env"], quiet: true });

const { values } = parseArgs({
  options: {
    usuario: { type: "string" },
    nombre: { type: "string" },
    rol: { type: "string" },
    password: { type: "string" },
    partner: { type: "string" },
  },
});

const { usuarioSchema, passwordSchema } = await import("../lib/credenciales");
const datos = z
  .object({
    usuario: usuarioSchema,
    nombre: z.string().trim().min(2),
    rol: z.enum(["mecanico", "jefe", "admin"]),
    password: passwordSchema,
    partner: z.coerce.number().int().positive().optional(),
  })
  .parse(values);

const { hash } = await import("@node-rs/argon2");
const { getDb, schema } = await import("../lib/db/index");
const db = await getDb();
const [u] = await db
  .insert(schema.usuarios)
  .values({
    usuario: datos.usuario,
    nombre: datos.nombre,
    rol: datos.rol,
    passwordHash: await hash(datos.password),
    odooPartnerId: datos.partner ?? null,
  })
  .returning({ id: schema.usuarios.id });
console.log(`Usuario #${u.id} "${datos.usuario}" (${datos.rol}) creado.`);
process.exit(0);
