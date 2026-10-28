# Taller Ridder

Web app (PWA) para el taller de Ridder: los mecánicos finalizan las órdenes desde el celular y todo queda en Odoo.
Reemplaza el formulario externo + el flujo de n8n "Taller - Nuevo flujo".

**Odoo es la fuente de verdad.** La app lee y escribe `fleet.vehicle.log.services` y `fleet.vehicle` por JSON-RPC, solo desde el servidor.
La base propia (Postgres) guarda únicamente usuarios, sesiones, el log y el estado de cada finalización.

## Estado

- **Etapa 1 (lista):** ingreso con usuario y contraseña, roles, usuarios vinculados a su contacto de Odoo, lista de órdenes en proceso, finalizar y confirmación.
- **Nueva orden (jefe y admin):** buscar la moto por chapa contra Odoo, tipo de servicio, qué pide el chofer, mecánico (opcional) y fotos de recepción (opcional). Si la moto ya tiene una orden en proceso, avisa y ofrece abrirla en vez de duplicar.
- **Tablero (jefe y admin):** kanban con Nuevo · En proceso · Listo para verificar · Finalizado. Se mueve con botones: Nuevo → En proceso, Finalizar y Verificar. Finalizado muestra primero las más recientes, de a 30.
- **Para verificar (jefe y admin):** en las órdenes "Listo para verificar" se cargan o quitan los repuestos usados (líneas de `fleet.vehicle.log.services.product.line`, con el costo del producto en Odoo, sin mover stock) y se aprueba: pasa a "Listo para entrega" con `amount` = total de repuestos.
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
- Completá `ODOO_*`, `SESSION_SECRET`, `ADMIN_USER` y `ADMIN_PASSWORD`.

```bash
npm run dev        # http://localhost:3000
npm test           # tests unitarios
npm run typecheck
```

## Usuarios

Igual que en cobranzas: cada persona entra con **usuario y contraseña** (mínimo 8 caracteres).

- El primer admin se crea solo al arrancar si la base está vacía (`ADMIN_USER` / `ADMIN_PASSWORD`).
- El admin crea y edita usuarios en **Usuarios**: rol, nombre, contraseña, activo y **contacto de Odoo**.
- El contacto se elige entre los `res.partner` con la etiqueta **mecanico** (`ODOO_TAG_MECANICO`, id 20). Es obligatorio para los mecánicos: se usa como "Responsable" (`vendor_id`) al finalizar y para el filtro "Asignadas a mí".
- Cada uno cambia su contraseña en **Cuenta**. Cambiar la contraseña o desactivar un usuario cierra sus sesiones.
- Después de 5 intentos fallidos el usuario queda bloqueado 15 minutos; además hay un límite por IP.

Los usuarios nuevos de Cobranzas (salvo los de Finanzas) se crean solos acá como **Cobrador**, con el mismo usuario y contraseña. API para Cobranzas (solo servidor a servidor; con `WEBHOOK_USUARIOS_SECRET` vacío responde 404):

- Encabezados: `Authorization: Bearer <WEBHOOK_USUARIOS_SECRET>` y `X-Ridder-Usuario: <login de quien lo hizo, URL-encoded>` (o `automatico`). Queda en el log como `origen: "cobranzas"` y `por`.
- `POST /api/webhooks/usuarios` `{ usuario, nombre, password }`: crea un cobrador con `origen = "cobranzas"`. Si el usuario ya existe no lo toca: `200 { id, creado: false }`; si lo crea, `201 { id, creado: true }`.
- `GET /api/webhooks/usuarios/<usuario>`: `{ existe: true, id, rol, activo, origen }`, o 404.
- `PATCH /api/webhooks/usuarios/<usuario>` `{ password?, activo? }`: solo cuentas con origen Cobranzas (si no, 409). Cambiar la contraseña o desactivar cierra sus sesiones.
- Errores: `{ error }` con 400 (datos), 401 (secreto), 404 (no existe / API apagada), 409 (cuenta del taller).

Para emergencias (por ejemplo, recuperar el admin) se puede crear un usuario desde la terminal:

```bash
npm run usuario -- --usuario admin2 --nombre "Admin" --rol admin --password "una-clave-larga"
```

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
| `ODOO_TAG_MECANICO` | id de la etiqueta de contactos "mecanico" (20) |
| `WEBHOOK_USUARIOS_SECRET` | Secreto del webhook de altas desde Cobranzas (vacío = apagado) |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` | Primer admin (solo si no hay usuarios) |

## Qué hace "Finalizar"

Cada envío lleva una clave única que genera el celular. El servidor guarda primero los datos y las fotos en la base, y después ejecuta los pasos en orden, marcando cada uno al terminar:

1. Escribe `odometer`, `vendor_id` (mecánico), `amount = total_products_cost`, `service_end_date = hoy`. Si la orden no tenía chofer, completa `purchaser_id` con el chofer del vehículo.
2. Sube las fotos (`ir.attachment`) y las publica en el chatter como nota interna. Sin fotos, este paso no hace nada.
3. Publica la observación como nota interna con el nombre del mecánico.
4. Cambia el estado: con el check "lista para entregar al chofer" → **Listo para entrega** (`to_be_paid`). Sin el check → **Listo para verificar** (`cancelled`) y el vehículo pasa a **Para entregar**.
5. Avisa al grupo del taller por Telegram.

Si algo falla a la mitad, avisa al grupo de errores y el celular muestra **Reintentar**. El reintento usa la misma clave y sigue desde el paso que falló, sin duplicar fotos ni notas.
El check viene marcado si la orden o el vehículo tienen chofer, igual que la regla que usaba n8n.

## Flujo de una orden

1. **Nuevo:** el jefe carga la orden (moto, tipo, pedido del chofer, mecánico, fotos de recepción).
2. **En proceso:** el jefe la pasa desde el Tablero.
3. **Listo para verificar:** el mecánico reporta el trabajo (odómetro, fotos, observación). Si la moto no tiene chofer, el vehículo pasa a "Para entregar".
4. **Finalizado:** el jefe carga los repuestos usados y aprueba.

## Seguimiento

Todo queda en el historial (chatter) de la orden en Odoo, y la app lo muestra igual en las pantallas de finalizar y verificar:

| Acción | En Odoo | Log de la app | Telegram |
|---|---|---|---|
| Orden nueva | Nota "Orden cargada por X", mecánico y fotos de recepción | `orden.crear` | 🆕 Nueva orden |
| Nuevo → En proceso | Etapa (automático) + nota "X pasó la orden…" | `orden.cambiar_estado` | — |
| Reporte del mecánico | Etapa, Costo y Odómetro (automático) + nota "Trabajo finalizado por X" y fotos | `orden.finalizar` | ✅ Trabajo finalizado |
| Repuestos | "Repuestos del servicio actualizados" (automático de Odoo) | `orden.repuesto_agregar` / `orden.repuesto_quitar` | — |
| Aprobación | Etapa y Costo (automático) + nota "Verificado por X" con el detalle | `orden.verificar` | 🔎 Verificado |
| Ingreso, usuarios, permisos | — | `login`, `usuario.*` | — |

- Las notas de la app se publican **a nombre del contacto de Odoo del usuario** (`author_id`) y como HTML (`body_is_html`), así se ven con formato y con quién lo hizo.
- Los cambios automáticos de Odoo (Etapa, Costo) figuran a nombre del usuario de la API, porque la app escribe con ese usuario; la nota de al lado dice quién fue.
- Cualquier falla al escribir en Odoo se avisa al grupo de errores de Telegram.

## Permisos

Cada rol tiene permisos por defecto y el admin puede quitarle permisos puntuales a cada usuario (pantalla Usuarios):
Ver motos en proceso · Finalizar trabajos · Cargar órdenes nuevas · Tablero · Cargar repuestos · Aprobar verificación.
El admin siempre tiene todo. Los permisos se controlan en el servidor en cada endpoint.

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
lib/auth.ts, lib/permisos.ts     sesiones, contraseñas y permisos por rol
lib/usuarios.ts                  alta y edición de usuarios, contactos de Odoo
lib/db/         esquema Drizzle; las migraciones están en drizzle/
tests/          tests unitarios (Vitest)
```

Si cambiás el esquema, generá la migración con `npm run db:generate`.
