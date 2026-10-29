import "server-only";
import { env } from "./env";
import { odoo } from "./odoo";
import { registrar, type Usuario } from "./auth";
import { MODELO_ORDEN, conAutor } from "./taller";
import {
  COMANDO,
  conTraccarAnterior,
  equiposPorChapa,
  imeisFueraDeLinea,
  payloadNotaEncendido,
  resultadoComando,
  type AccionEncendido,
  type DispositivoTraccar,
  type EquipoGps,
  type PosicionTraccar,
} from "./gps-dominio";

// Traccar (track.ridder.com.py) con el token del usuario «Ridder taller». Sin TRACCAR_TOKEN, apagado.
export class ErrorGps extends Error {
  constructor(
    mensaje: string,
    readonly status = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(mensaje);
  }
}

export const gpsHabilitado = () => Boolean(env().TRACCAR_TOKEN);

async function traccar(ruta: string, init: RequestInit = {}): Promise<Response> {
  const cfg = env();
  if (!cfg.TRACCAR_TOKEN) throw new ErrorGps("El GPS no está configurado (falta TRACCAR_TOKEN)", 503);
  return pedir(cfg.TRACCAR_URL, cfg.TRACCAR_TOKEN, ruta, init, 15_000);
}

async function pedir(base: string, token: string, ruta: string, init: RequestInit, timeout: number): Promise<Response> {
  const r = await fetch(base.replace(/\/$/, "") + ruta, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (r.status >= 400) {
    const texto = (await r.text().catch(() => "")).slice(0, 200);
    throw new ErrorGps(`Traccar respondió ${r.status}${texto ? `: ${texto}` : ""}`, 502);
  }
  return r;
}

// La lista de equipos cambia poco: se guarda medio minuto.
let cacheEquipos: { hasta: number; lista: DispositivoTraccar[] } | undefined;
async function dispositivos(): Promise<DispositivoTraccar[]> {
  if (cacheEquipos && cacheEquipos.hasta > Date.now()) return cacheEquipos.lista;
  const lista = (await (await traccar("/api/devices")).json()) as DispositivoTraccar[];
  cacheEquipos = { hasta: Date.now() + 30_000, lista };
  return lista;
}

async function posiciones(ids: number[]): Promise<PosicionTraccar[]> {
  if (!ids.length) return [];
  const q = ids.map((id) => `id=${id}`).join("&");
  return (await (await traccar(`/api/positions?${q}`)).json()) as PosicionTraccar[];
}

export async function estadoGps(chapas: string[]): Promise<Record<string, EquipoGps[]>> {
  const todos = await dispositivos();
  const previo = equiposPorChapa(chapas, todos, []);
  const ids = new Set(Object.values(previo).flat().map((e) => e.id));
  const usados = todos.filter((d) => ids.has(d.id));
  const porChapa = equiposPorChapa(chapas, usados, await posiciones(usados.map((d) => d.positionId).filter((p) => p > 0)));
  return conTraccarAnterior(porChapa, await anteriores(imeisFueraDeLinea(porChapa)));
}

// Traccar anterior: solo lectura, una consulta con todos los IMEI. Si no responde, se sigue sin ese dato.
async function anteriores(imeis: string[]): Promise<DispositivoTraccar[]> {
  const cfg = env();
  if (!cfg.TRACCAR_ANTERIOR_TOKEN || !imeis.length) return [];
  try {
    const q = imeis.map((i) => `uniqueId=${encodeURIComponent(i)}`).join("&");
    return (await (await pedir(cfg.TRACCAR_ANTERIOR_URL, cfg.TRACCAR_ANTERIOR_TOKEN, `/api/devices?${q}`, {}, 5_000)).json()) as DispositivoTraccar[];
  } catch (e) {
    console.error("[gps] Traccar anterior", e instanceof Error ? e.message : e);
    return [];
  }
}

// Un comando por equipo cada 90 segundos: evita reenviar mientras el anterior sigue en camino o en cola.
const ultimoComando = new Map<string, number>();
const ESPERA_MS = 90_000;

export async function cambiarEncendido(
  d: { chapa: string; accion: AccionEncendido; ordenId?: number; confirmaEnMovimiento: boolean },
  u: Usuario,
): Promise<{ mensaje: string; enCola: boolean; equipo: string }> {
  cacheEquipos = undefined;
  const equipos = (await estadoGps([d.chapa]))[d.chapa.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? [];
  const equipo = equipos.find((e) => e.corta);
  if (!equipo) throw new ErrorGps("Esta moto no tiene en Traccar un GPS con la chapa exacta: no se puede bloquear desde acá", 404);
  // Fuera de línea en el nuevo pero reportando en el Traccar anterior: el comando va al anterior, al mismo IMEI.
  const enAnterior = Boolean(equipo.anterior);
  const deviceId = equipo.anterior?.id ?? equipo.id;
  const enviar = (ruta: string, init: RequestInit = {}) => {
    if (!enAnterior) return traccar(ruta, init);
    const cfg = env();
    if (!cfg.TRACCAR_ANTERIOR_TOKEN) throw new ErrorGps("El GPS reporta en el Traccar anterior y falta TRACCAR_ANTERIOR_TOKEN", 503);
    return pedir(cfg.TRACCAR_ANTERIOR_URL, cfg.TRACCAR_ANTERIOR_TOKEN, ruta, init, 15_000);
  };
  // En movimiento: según la última posición del Traccar donde reporta.
  const mov = enAnterior ? await movimientoAnterior(deviceId, enviar) : { enMovimiento: equipo.enMovimiento, kmh: equipo.kmh };
  if (d.accion === "bloquear" && mov.enMovimiento && !d.confirmaEnMovimiento) {
    throw new ErrorGps(`La moto está en movimiento (${mov.kmh ?? 0} km/h). Confirmá si igual querés bloquearla.`, 409, { requiereConfirmar: true });
  }
  const clave = `${enAnterior ? "anterior" : "nuevo"}:${deviceId}`;
  const antes = ultimoComando.get(clave);
  if (antes && Date.now() - antes < ESPERA_MS) {
    throw new ErrorGps("Ya se mandó un comando a este GPS hace menos de un minuto y medio. Esperá a que el equipo lo confirme.", 429);
  }
  const tipos = (await (await enviar(`/api/commands/types?deviceId=${deviceId}`)).json()) as { type: string }[];
  if (!tipos.some((t) => t.type === COMANDO[d.accion])) throw new ErrorGps(`El GPS «${equipo.nombre}» no acepta ese comando`, 409);

  ultimoComando.set(clave, Date.now());
  const r = await enviar("/api/commands/send", {
    method: "POST",
    // Traccar lo registra como «Ridder taller (<persona>)».
    headers: { "Content-Type": "application/json", "X-Ridder-Usuario": encodeURIComponent(u.nombre) },
    body: JSON.stringify({ deviceId, type: COMANDO[d.accion] }),
  }).catch((e) => {
    ultimoComando.delete(clave);
    throw e;
  });
  const res = resultadoComando(r.status, d.accion);
  if (enAnterior) res.mensaje = `Se mandó por el Traccar anterior. ${res.mensaje}`;

  await registrar(u.id, d.accion === "bloquear" ? "gps.bloquear" : "gps.desbloquear", {
    ordenId: d.ordenId,
    detalle: { chapa: d.chapa, equipo: equipo.nombre, deviceId, traccar: enAnterior ? "anterior" : "nuevo", enCola: res.enCola, enMovimiento: mov.enMovimiento },
  });
  if (d.ordenId) {
    await odoo
      .messagePost(
        MODELO_ORDEN,
        d.ordenId,
        conAutor(payloadNotaEncendido({ autor: u.nombre, accion: d.accion, equipo: equipo.nombre, enCola: res.enCola, enAnterior }), u.odooPartnerId),
      )
      .catch((e) => console.error("[gps] nota", e));
  }
  return { ...res, equipo: equipo.nombre };
}

// Velocidad y movimiento del equipo en el Traccar anterior (su última posición).
async function movimientoAnterior(deviceId: number, enviar: (ruta: string) => Promise<Response>) {
  const [dev] = (await (await enviar(`/api/devices?id=${deviceId}`)).json()) as DispositivoTraccar[];
  if (!dev?.positionId) return { enMovimiento: false, kmh: null };
  const [p] = (await (await enviar(`/api/positions?id=${dev.positionId}`)).json()) as PosicionTraccar[];
  const kmh = p ? Math.round(p.speed * 1.852) : null;
  return { enMovimiento: (kmh ?? 0) > 0 || p?.attributes?.motion === true, kmh };
}
