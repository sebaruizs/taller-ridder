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
- El contacto se elige entre los `res.partner` con la etiqueta **mecanico** (`ODOO_TAG_MECANICO`, id 20) para los mecánicos, **ejecutivo** (`ODOO_TAG_EJECUTIVO`, id 24) para los cobradores, y cualquiera de las dos para jefes y admin. Es obligatorio para los mecánicos: se usa como "Responsable" (`vendor_id`) al finalizar y para el filtro "Asignadas a mí".
- Cada uno cambia su contraseña en **Cuenta**. Cambiar la contraseña o desactivar un usuario cierra sus sesiones.
- Después de 5 intentos fallidos el usuario queda bloqueado 15 minutos; además hay un límite por IP.

Los usuarios nuevos de Cobranzas (salvo los de Finanzas) se crean solos acá como **Cobrador**, con el mismo usuario y contraseña. API para Cobranzas (solo servidor a servidor; con `WEBHOOK_USUARIOS_SECRET` vacío responde 404):

- Encabezados: `Authorization: Bearer <WEBHOOK_USUARIOS_SECRET>` y `X-Ridder-Usuario: <login de quien lo hizo, URL-encoded>` (o `automatico`). Queda en el log como `origen: "cobranzas"` y `por`.
- `POST /api/webhooks/usuarios` `{ usuario, nombre, password }`: crea un cobrador con `origen = "cobranzas"` y lo vincula al contacto **ejecutivo** de Odoo con el mismo nombre (sin mayúsculas, tildes ni espacios de más) si hay exactamente uno. Responde `{ id, creado, contacto: { id, nombre } | null, motivoContacto? }` (`201` si lo crea; `200` si ya existía: no lo modifica, salvo completar el contacto de una cuenta de Cobranzas que no lo tenía).
- `GET /api/webhooks/usuarios/<usuario>`: `{ existe: true, id, rol, activo, origen, contacto }`, o 404.
- `PATCH /api/webhooks/usuarios/<usuario>` `{ password?, activo? }`: solo cuentas con origen Cobranzas (si no, 409). Cambiar la contraseña o desactivar cierra sus sesiones.
- Errores: `{ error }` con 400 (datos), 401 (secreto), 404 (no existe / API apagada), 409 (cuenta del taller).

### API para Cobranzas

Cobranzas puede hacer todo lo que se hace en la web, con las mismas rutas `/api/...` (o con el alias `/api/integraciones/cobranzas/...`) y la misma lógica:

- Encabezados: `Authorization: Bearer <API_COBRANZAS_SECRET>` y `X-Ridder-Usuario: <login del taller, URL-encoded>`. La llamada actúa **como ese usuario**: su rol, sus permisos y su contacto de Odoo en las notas. En el log queda `origen: "cobranzas"` y `por`.
- `X-Ridder-Usuario: automatico` es un jefe de **solo lectura** (todo lo que escribe le da 403).
- Usuario inexistente o inactivo: 403. Secreto incorrecto o vacío: 401 (se comporta como un pedido sin sesión).
- Para Cobranzas se sumaron: `GET /api/tablero` (columnas con su primera página), filtros de `GET /api/ordenes` (`estado=todos`, `vehiculo`, `chofer`, `desde`, `hasta`) y el detalle completo en `GET /api/ordenes/<id>` (reporte, repuestos e historial).

- Devoluciones y recuperos: `GET /api/devoluciones?vehiculoId=<id de Odoo>` o `?chapa=<chapa>` devuelve las recepciones de esa moto (tipo, fecha, quién la recibió, observación e ids de fotos); las fotos salen de `GET /api/devoluciones/fotos/<id>` (`?tam=mini` para la miniatura). Con `automatico` alcanza.

### API móvil (Ridder App)

Lo que necesita Ridder App para trabajar sin señal, según la propuesta `contratos/SINCRONIZACION.md` del repo `ridder-app`. Código: `lib/movil.ts` (servicio), `lib/movil-dominio.ts` (reglas, testeadas), `lib/movil-auth.ts` (autenticación), `app/api/movil/`. Tests: `tests/movil-api.test.ts` (endpoints de punta a punta con PGlite y Odoo simulado) y `tests/movil-dominio.test.ts`.

**Estado: funciona en desarrollo; en producción responde 401 a todo** hasta que exista la credencial de dispositivo de Ridder Acceso (`contratos/ACCESO-MOVIL.md` de `ridder-app`, pendiente de revisión).

**Autenticación.** Todo pasa por una sola función, `personaDeDispositivo(req)` en `lib/movil-auth.ts`:

- **Ficha de Ridder Acceso** (`ACCESO-MOVIL.md` 3.5), solo con `MOVIL_FICHA_ACCESO=true`: `Authorization: Bearer <base64url(usuario)>.<vence en ms>.<firma>`, firma = HMAC-SHA256(`ACCESO_SECRET`, `movil|<usuario>|<vence>`) en hex. Es el mismo formato y la misma clave que el enlace de `/entrar/acceso`, con otro origen (un enlace no sirve como ficha ni al revés), 10 minutos de vida y varios usos. El formato lo confirmó la sesión de Acceso, pero **Acceso todavía no la emite y la propuesta no está revisada**: por eso el interruptor está apagado por defecto.
- **Token de prueba**, solo fuera de producción: `Authorization: Bearer <usuario>.<MOVIL_PRUEBA_TOKEN>`, con un usuario activo de Taller (por ejemplo `Bearer carlos.ramirez.<token>`). `MOVIL_PRUEBA_TOKEN` tiene 16 caracteres o más.
- Con `MOVIL_FICHA_ACCESO` apagado, **producción responde 401 a todo**.

**`GET /api/movil/taller/tareas`** (permiso «Ver motos en proceso»). En Taller una tarea es una **orden de Odoo** (`fleet.vehicle.log.services`): `id` y `ordenId` son el id de la orden, `titulo` el tipo de servicio, `indicaciones` la descripción, `modelo` y `chapa` los de la moto. Devuelve:

- Las órdenes **En proceso** asignadas al contacto de Odoo de la persona **o sin mecánico** (hoy las órdenes en proceso casi nunca tienen mecánico: se completa al finalizar). Estado `pendiente`, o `en_curso` si la persona ya mandó algo de esa orden desde el teléfono; `inicio` es la hora del teléfono del primer registro aceptado.
- Las que la persona reportó hoy (**Listo para verificar**), como `lista`.
- Un campo extra, `asignada` (false = sin mecánico, la puede tomar cualquiera). Sin contacto de Odoo vinculado, la lista está vacía.

**`GET /api/movil/devolucion/vehiculos`** (permiso «Registrar devoluciones y recuperos»): las motos que hoy tienen chofer en Odoo y las motos **a recuperar**, con `motivo: "recupero"` (aunque ya no tengan chofer). Las motos a recuperar salen de **Cobranzas** (`GET <COBRANZAS_URL>/api/integraciones/taller/motos-a-devolver` con `TALLER_LECTURA_SECRET`, consultado a lo sumo cada 5 minutos). Si Cobranzas no está configurada o no responde, se usa lo último leído y, si nunca se leyó, Odoo directo: clientes en «Para recuperar» (`res.partner.request_status_id`) con la moto de su suscripción. `cliente` = el chofer o el cliente a recuperar; `kmAnterior` = el odómetro de Odoo; las demás motos van con `motivo: null`.

**`POST /api/movil/registros`** `{ id, tipo, creado, datos, fotos? }`. Fotos: JPEG en base64 (con o sin `data:image/jpeg;base64,`), hasta 1 MB cada una y 12 por registro.

- `200 {"resultado":"aceptado"}`; un `id` repetido devuelve lo mismo que la primera vez **sin aplicarlo de nuevo** (tabla `registros_movil`, que guarda id, persona, tipo, hora del teléfono, hora de llegada, estado y motivo). Un id rechazado devuelve el mismo rechazo; un id de otra persona se rechaza.
- `422 {"resultado":"rechazado","motivo"}`: reglas del negocio y también datos mal formados, tipos desconocidos o fotos inválidas (reintentarlos no los arregla).
- `401`: sin credencial. `503 {"error"}`: Odoo no respondió o no dejó escribir; el registro queda «aplicando» con lo que ya se hizo y el reintento del teléfono sigue desde ahí sin duplicar.

| Tipo | Qué hace en Taller | Rechazos |
|---|---|---|
| `taller.inicio` `{ tareaId }` | Si la orden no tenía mecánico, queda a nombre de quien la empezó (`vendor_id`). Nota «Trabajo empezado por X» en la orden (si falla la nota, se acepta igual). | Orden borrada, reasignada a otro mecánico, todavía en Nuevo, Bloqueado, ya reportada o finalizada; usuario sin contacto de Odoo o sin permiso «Finalizar trabajos». |
| `taller.avance` `{ tareaId, nota? }` + fotos | Las fotos como adjuntos de la orden (una vez cada una, por su id) y una nota «Avance de X» con ellas. | Lo mismo, y sin nota ni fotos. |
| `taller.cierre` `{ tareaId, nota, odometro? }` + 1 o más fotos | La **misma finalización que la web** (sección «Qué hace "Finalizar"»), con el id del registro como clave: odómetro, mecánico, fotos, nota, Listo para verificar y aviso por Telegram. | Lo mismo, y sin nota o sin foto. Un cierre de una tarea que no se había empezado desde el teléfono se acepta. |
| `devolucion.recepcion` `{ vehiculo: { id, chapa }, kilometraje, entregoLlave, danos, observaciones, motivo? }` + fotos | Una recepción en **Devoluciones** (la misma tabla de la web) con sus fotos; km, llave y daños quedan en la observación. `motivo: "recupero"` → Recupero; `"cambio"` o sin motivo → Devolución. Odoo solo se lee. | `motivo: "fin_contrato"` (la moto queda con el cliente), sin permiso «Registrar devoluciones», la moto no existe o su chapa no coincide, kilometraje menor que el odómetro de Odoo, ya figura devuelta (hay una recepción desde la última asignación a un chofer, o de hoy si nunca tuvo), sin fotos. |

**Odoo simulado (solo desarrollo).** Con `MOVIL_ODOO_SIMULADO=true` Taller lee del Odoo real pero **no escribe nada**: cada escritura (`write`, `create`, `message_post`, `unlink`…) queda en memoria, se superpone a lo que se lee (así la tarea pasa a en curso y a lista) y sale en el log con `[odoo simulado]`. Los registros aceptados responden `{"resultado":"aceptado","simulado":true}` y en el log de acciones quedan con `odooSimulado: true`. Se pierde al reiniciar. Con `NODE_ENV=production` el servidor **no arranca** (`instrumentation.ts`, `errorDeEntorno` en `lib/env.ts`). Afecta a todo el servidor, también a la web. Para que no salgan avisos al grupo del taller, arrancarlo con `TELEGRAM_BOT_TOKEN=` vacío. **Siempre con una base propia** (`DATABASE_URL=pglite://<carpeta temporal>`): la base de Taller sí se escribe (registros aceptados, finalizaciones, devoluciones, log), y en la base de desarrollo de siempre quedarían trabajos que en Odoo nunca pasaron.

*Límite conocido del recupero:* se toma la última suscripción del cliente en «Para recuperar». Si esa moto ya se le dio a otro chofer y nadie le sacó el estado al cliente, la moto sale como recupero a nombre del cliente anterior. Hoy hay un solo cliente en ese estado y no pasa.

**Qué falta**

1. **Que Ridder Acceso emita la ficha en producción.** Ya la emite en su rama `movil-dispositivos` (sin desplegar); una ficha generada con su código real pasa en `tests/movil-auth.test.ts`. Cuando Acceso esté desplegado, se prende `MOVIL_FICHA_ACCESO=true` en Taller; hasta entonces, producción responde 401.
2. **Cambio de moto no se registra en ningún lado.** Sebastián confirmó que existe (problema mecánico, accidente u otro motivo), pero hay que definir quién carga un cambio pendiente; por ejemplo, Taller al diagnosticar. Mientras tanto, esas motos van con `motivo: null` y la persona elige el motivo en el teléfono. **Fin de contrato no es un motivo de devolución** (Sebastián, 2026-11-17): con el contrato finalizado la moto queda con el cliente y se archiva. Taller rechaza una devolución con `motivo: "fin_contrato"`.
3. Probar inicio, avance y cierre contra el Odoo real con escritura. En local, con `ODOO_READONLY=true`, esos registros responden 503 y quedan «aplicando»; para probar el flujo completo está el Odoo simulado (abajo).
4. Para decidir: si un rechazo avisa al jefe (hoy queda en `registros_movil` y en el log como `movil.<tipo>`), cuánto se guardan los ids recibidos (propuesta: 90 días; hoy no se borran), y si el kilometraje de la devolución actualiza el odómetro en Odoo (hoy no).

**Cambios propuestos al contrato** (`SINCRONIZACION.md`; Taller ya los acepta, todos opcionales):

- `taller.cierre` puede llevar `odometro`: la finalización de Taller lo registra. Sin él se finaliza «sin odómetro».
- `devolucion.recepcion` puede llevar `motivo` (`fin_contrato` | `recupero` | `cambio`), elegido en el teléfono cuando la descarga no lo trae. En la descarga de vehículos `motivo` puede ser `null` (todo lo que no es recupero).
- La descarga de tareas suma `asignada` (boolean).

Los tres los aceptó la sesión de Ridder App (2026-11-17): el cierre manda siempre `odometro`, la devolución manda `motivo` cuando la descarga trae `null`, y la app muestra «Sin asignar».

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
| `ODOO_TAG_EJECUTIVO` | id de la etiqueta de contactos "ejecutivo", para cobradores (24) |
| `WEBHOOK_USUARIOS_SECRET` | Secreto del webhook de altas desde Cobranzas (vacío = apagado) |
| `API_COBRANZAS_SECRET` | Secreto de la API para Cobranzas (vacío = apagada) |
| `TRACCAR_URL`, `TRACCAR_TOKEN` | GPS: Traccar y el token del usuario «Ridder taller» (vacío = sin GPS en el tablero) |
| `TRACCAR_ANTERIOR_URL`, `TRACCAR_ANTERIOR_TOKEN` | Traccar anterior, solo lectura (vacío = no se consulta) |
| `MONEDAS_SHEET_CSV_URL` | Google Sheets de monedas publicado como CSV (vacío = no se usa) |
| `ASISTENCIAS_URL`, `ASISTENCIAS_SECRET` | «Marcar asistencia»: entra a Asistencias con el mismo usuario por un link firmado de 2 minutos (`GET /api/asistencias/marcar`). El secreto es `WEBHOOK_SECRET_TALLER` allá. Vacías = no aparece |
| `ACCESO_SECRET` | Clave compartida con Ridder Acceso (app.ridder.com.py), 32 caracteres o más. Con ella, `GET /entrar/acceso?t=<usuario>.<vence>.<firma>` abre la sesión sin contraseña a quien ya ingresó allá: enlace de un solo uso, 2 minutos, firma HMAC-SHA256 de `acceso\|<usuario>\|<vence>`. El usuario tiene que existir en Taller. Vacía = puerta apagada |
| `ACCESO_URL` | URL de Ridder Acceso. Con ella el menú muestra «Inicio de Ridder» y los enlaces a los otros módulos (`/ir/cobranzas`, `/ir/asistencias`). Vacía = no se muestran |
| `ACCESO_API_SECRET` | Clave de la API con la que Ridder Acceso da de alta, actualiza y da de baja usuarios: `PUT` y `GET /api/acceso/usuarios/<usuario>` con `Authorization: Bearer` y `X-Ridder-Usuario` (quién hizo el cambio). 32 caracteres o más y distinta de las demás claves. El `PUT` crea el usuario con una contraseña al azar (entra por `/entrar/acceso`) o actualiza solo nombre, rol, activo y contacto de Odoo; no toca contraseña, permisos ni tema, y nunca borra. `POST /api/acceso/usuarios/<usuario>/cerrar-sesiones` (cuerpo `{}`) cierra todas sus sesiones de Taller cuando Acceso cierra un teléfono o cambia la contraseña: responde `{ ok: true, sesiones: <n> }` (también con 0), 404 si no existe; no lo desactiva y queda en el log como `usuario.cerrar_sesiones`. Vacía = responde 503 |
| `COBRANZAS_URL`, `TALLER_LECTURA_SECRET` | De dónde saca la API móvil las motos a recuperar: Cobranzas, `GET /api/integraciones/taller/motos-a-devolver`. La clave es la misma que en Cobranzas, 32 caracteres o más. Vacías = se lee Odoo directo |
| `MOVIL_ODOO_SIMULADO` | **Solo desarrollo.** `true` = lee del Odoo real y simula todas las escrituras (ver «API móvil»). Con `NODE_ENV=production` el servidor no arranca |
| `MOVIL_FICHA_ACCESO` | `true` = la API móvil acepta la ficha de Ridder Acceso (firmada con `ACCESO_SECRET`, ver «API móvil»). Por defecto `false`: dejarlo así hasta que Acceso emita la ficha |
| `MOVIL_PRUEBA_TOKEN` | **Solo desarrollo.** Token de prueba de la API móvil (`/api/movil/*`) mientras Acceso no emita la credencial de dispositivo: `Authorization: Bearer <usuario>.<token>`, 16 caracteres o más. En producción se ignora (la API móvil responde 401). Vacía = 401 |
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

## GPS en el tablero

En las tarjetas **En proceso** y **Listo para verificar** se ve un resumen del estado de los GPS de la moto según Traccar (`TRACCAR_URL`, `TRACCAR_TOKEN`): todos los equipos cuyo nombre es la chapa (la chapa sola, `-TC` y ` - Monedas`; los archivados no). Al tocar la tarjeta (Finalizar, Verificar o el detalle de la orden), el panel **GPS** muestra todos los datos de cada equipo: conexión, último dato y ubicación, encendido, bloqueo (según el relé que informa el GPS; «¿?» si no lo informa), velocidad, batería, IMEI, modelo y teléfono.

Quien tiene el permiso **Bloquear el encendido** (jefe y admin) puede **Bloquear** o **Desbloquear** desde ese panel. El comando va **solo al equipo que se llama exactamente como la chapa** (`engineStop` / `engineResume`, si el modelo lo acepta); si no hay uno así, no hay botón. Siempre con confirmación; si la moto está en movimiento pide confirmar otra vez. Un comando por equipo cada 90 segundos. Si el GPS está desconectado queda en cola en Traccar (se avisa). Queda en el log, como nota en la orden de Odoo y en el historial de Traccar como «Ridder taller (<nombre>)» (se manda `X-Ridder-Usuario: <nombre>`; el token tiene que ser del usuario 14 «Ridder taller»).

Si un equipo está **fuera de línea en el Traccar nuevo**, se busca el mismo IMEI en el **Traccar anterior** (`TRACCAR_ANTERIOR_URL`, `TRACCAR_ANTERIOR_TOKEN`, solo lectura, una consulta con todos los IMEI, timeout de 5 s). Si ahí reportó después que en el nuevo, la tarjeta muestra ese último reporte con la etiqueta «Traccar anterior». Bloquear y desbloquear van siempre al Traccar nuevo.

**Moneda Google:** si el Google Sheets de monedas (`MONEDAS_SHEET_CSV_URL`, publicado como CSV, columnas «Nro. de Chapa» y «Moneda») dice que la moto tiene moneda —cualquier valor salvo «No»: Si, IOS, YGTAG…— y en Traccar no hay equipo Monedas o no reporta (tampoco en el anterior), la tarjeta Moneda muestra «Moneda Google». La hoja se lee cada 10 minutos; si Google no responde se usa lo último leído.

**Colores del último reporte:** en las tarjetas del GPS y en el tablero, «hace cuánto» reportó cada equipo se pinta verde, amarillo o rojo. El admin define desde cuántas horas es amarillo y desde cuántas rojo en **Ajustes** (menú del engranaje; por defecto 5 h y 24 h). Se guarda en la tabla `config` (`gps.colores_reporte`).
