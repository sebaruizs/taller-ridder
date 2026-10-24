# Taller Ridder

Web app (PWA) para el taller de Ridder: los mecánicos finalizan las órdenes desde el celular y todo queda en Odoo.
Reemplaza el formulario externo + el flujo de n8n "Taller - Nuevo flujo".

**Odoo es la fuente de verdad.** La app lee y escribe `fleet.vehicle.log.services` y `fleet.vehicle` por JSON-RPC, solo desde el servidor.
La base propia (Postgres) guarda únicamente usuarios, sesiones, el log y el estado de cada finalización.

## Estado

- **Etapa 1 (lista):** ingreso con PIN, roles, lista de órdenes en proceso, finalizar y confirmación.
- Etapa 2: nueva orden, kanban y detalle (jefe).
- Etapa 3: historial, usuarios y log (admin).

## Desarrollo local

Requiere Node 22 o superior. No hace falta instalar Postgres: en local se usa PGlite (Postgres embebido).

```bash
npm install
cp .env.example .env.local
```

En `.env.local`:

- `DATABASE_URL=pglite://./.data/pglite`
- `COOKIE_SECURE=false`
- `ODOO_READONLY=true`: **recomendado para probar con la instancia real**. Bloquea toda escritura en Odoo; las lecturas funcionan.
- Completá `ODOO_*`, `SESSION_SECRET`, `ADMIN_NOMBRE` y `ADMIN_PIN`.

```bash
npm run dev        # http://localhost:3000
npm test           # tests unitarios
npm run typecheck
```

El primer admin se crea solo al arrancar si la base está vacía (`ADMIN_NOMBRE` / `ADMIN_PIN`).
Hasta que esté la pantalla de usuarios (Etapa 3), los usuarios se crean desde la terminal (con el servidor apagado si usás PGlite):

```bash
npm run usuario -- --nombre "Carlos Ramirez" --rol mecanico --pin 1234 --partner 1685
```

`--partner` es el id del `res.partner` del mecánico en Odoo. Se usa como "Responsable" (`vendor_id`) al finalizar y para el filtro "Asignadas a mí".

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres propio (`postgres://…`) o `pglite://carpeta` en local |
| `SESSION_SECRET` | Secreto de las sesiones, 32 caracteres o más (`openssl rand -base64 48`) |
| `COOKIE_SECURE` | `true` en producción (HTTPS) |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY` | Conexión a Odoo |
| `ODOO_TIMEOUT_MS` | Timeout de cada llamada a Odoo (por defecto 20000) |
| `ODOO_READONLY` | `true` bloquea escrituras en Odoo |
| `ODOO_VEHICLE_STATE_PARA_ENTREGAR` | id de `fleet.vehicle.state` "Para entregar" (1) |
| `TELEGRAM_BOT_TOKEN` | Token del bot |
| `TELEGRAM_CHAT_TALLER` | Grupo del taller (avisos de trabajos) |
| `TELEGRAM_CHAT_ERRORES` | Grupo de errores (fallas al escribir en Odoo) |
| `ADMIN_NOMBRE`, `ADMIN_PIN`, `ADMIN_ODOO_PARTNER_ID` | Primer admin (solo si no hay usuarios) |

## Qué hace "Finalizar"

Cada envío lleva una clave única que genera el celular. El servidor guarda primero los datos y las fotos en la base, y después ejecuta los pasos en orden, marcando cada uno al terminar:

1. Escribe `odometer`, `vendor_id` (mecánico), `amount = total_products_cost`, `service_end_date = hoy`. Si la orden no tenía chofer, completa `purchaser_id` con el chofer del vehículo.
2. Sube las fotos (`ir.attachment`) y las publica en el chatter como nota interna. Sin fotos, este paso no hace nada.
3. Publica la observación como nota interna con el nombre del mecánico.
4. Cambia el estado: con el check "lista para entregar al chofer" → **Listo para entrega** (`to_be_paid`). Sin el check → **Listo para verificar** (`cancelled`) y el vehículo pasa a **Para entregar**.
5. Avisa al grupo del taller por Telegram.

Si algo falla a la mitad, avisa al grupo de errores y el celular muestra **Reintentar**. El reintento usa la misma clave y sigue desde el paso que falló, sin duplicar fotos ni notas.
El check viene marcado si la orden o el vehículo tienen chofer, igual que la regla que usaba n8n.

## Deploy en Easypanel

Pensado para el servidor 31.97.161.21.

1. **Base:** en el proyecto `taller`, agregá un servicio **Postgres** (por ejemplo `taller_db`). No lo expongas a internet.
2. **App:** agregá un servicio **App** desde GitHub (`sebaruizs/taller-ridder`, rama `main`), con build **Dockerfile**.
3. **Entorno:** cargá las variables de la tabla. `DATABASE_URL` usa el host interno del Postgres (por ejemplo `postgres://postgres:CLAVE@taller_taller_db:5432/taller`). Poné `COOKIE_SECURE=true` y `ODOO_READONLY=false`.
4. **Dominio:** `taller.ridder.com.py` → puerto **3000**, con HTTPS activado.
5. **Implementar.** Las migraciones de la base corren solas al arrancar y el primer admin se crea si la base está vacía.
6. Cuando esté funcionando, **apagá en n8n el flujo "Taller - Nuevo flujo"**. Si no, los avisos de Telegram salen duplicados.

## Estructura

```
app/            páginas y API (route handlers)
lib/odoo.ts     cliente JSON-RPC (timeout, uid cacheado, modo solo lectura)
lib/taller.ts   reglas del taller y armado de payloads (sin I/O, testeado)
lib/finalizar.ts                 pasos de la finalización (testeado con Odoo simulado)
lib/finalizar-servicio.ts        persistencia y candado por clave
lib/auth.ts, lib/permisos.ts     sesiones, PIN y permisos por rol
lib/db/         esquema Drizzle; las migraciones están en drizzle/
tests/          tests unitarios (Vitest)
```

Si cambiás el esquema, generá la migración con `npm run db:generate`.
