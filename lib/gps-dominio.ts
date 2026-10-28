// GPS de las motos (Traccar): vincular equipos con la chapa y armar su estado. Sin I/O.
import { NOTA_INTERNA, escaparHtml } from "./taller";
// En Traccar el nombre del equipo es la chapa, con sufijos: "816ABTI", "816ABTI-TC", "236ABXV - Monedas".

export type TipoEquipo = "gps" | "tc" | "monedas" | "otro";
export const NOMBRE_TIPO: Record<TipoEquipo, string> = { gps: "GPS", tc: "TC", monedas: "Monedas", otro: "Otro" };

export type DispositivoTraccar = {
  id: number;
  name: string;
  uniqueId?: string;
  status: string;
  lastUpdate: string | null;
  positionId: number;
  phone?: string | null;
  model?: string | null;
  attributes?: Record<string, unknown>;
};
export type PosicionTraccar = {
  id: number;
  deviceId: number;
  protocol?: string;
  fixTime: string;
  latitude?: number;
  longitude?: number;
  speed: number;
  attributes?: Record<string, unknown>;
};

export type EquipoGps = {
  id: number;
  nombre: string;
  tipo: TipoEquipo;
  enLinea: boolean;
  ultimaConexion: string | null;
  encendido: boolean | null;
  // Según el relé que reporta el GPS; null = el equipo no lo informa (no es "desbloqueado").
  bloqueado: boolean | null;
  kmh: number | null;
  enMovimiento: boolean;
  bateria: number | null;
  // Datos del equipo para el detalle.
  imei: string | null;
  modelo: string | null;
  protocolo: string | null;
  telefono: string | null;
  ultimoDato: string | null;
  ubicacion: { lat: number; lon: number } | null;
  // El bloqueo del encendido se manda al equipo con la chapa exacta.
  corta: boolean;
  // Si está fuera de línea en el nuevo pero el mismo equipo (IMEI) reportó después en el Traccar anterior.
  anterior: { enLinea: boolean; ultimaConexion: string } | null;
};

const soloLetrasYNumeros = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// La chapa y el tipo de equipo según su nombre en Traccar. "gps" es solo el que se llama exactamente
// como la chapa (sin "-TC" ni " - algo"): es el único al que se le manda el corte.
export function leerNombre(nombre: string): { chapa: string; tipo: TipoEquipo } {
  const [base, ...resto] = nombre.split(" - ");
  const sufijo = resto.join(" - ").toLowerCase();
  const tc = /-\s*TC\s*$/i.test(base);
  const chapa = soloLetrasYNumeros(tc ? base.replace(/-\s*TC\s*$/i, "") : base);
  if (sufijo.includes("moneda")) return { chapa, tipo: "monedas" };
  if (tc) return { chapa, tipo: "tc" };
  return { chapa, tipo: resto.length ? "otro" : "gps" };
}

const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function estadoEquipo(d: DispositivoTraccar, p: PosicionTraccar | undefined): EquipoGps {
  const { tipo } = leerNombre(d.name);
  const a = p?.attributes ?? {};
  // Traccar da la velocidad en nudos.
  const kmh = p ? Math.round(p.speed * 1.852) : null;
  return {
    id: d.id,
    nombre: d.name,
    tipo,
    enLinea: d.status === "online",
    ultimaConexion: d.lastUpdate,
    encendido: bool(a.ignition),
    bloqueado: bool(a.blocked),
    kmh,
    enMovimiento: (kmh ?? 0) > 0 || a.motion === true,
    bateria: numero(a.batteryLevel),
    imei: d.uniqueId || null,
    modelo: d.model || null,
    protocolo: p?.protocol || null,
    telefono: d.phone || null,
    ultimoDato: p?.fixTime || null,
    ubicacion: p && typeof p.latitude === "number" && typeof p.longitude === "number" ? { lat: p.latitude, lon: p.longitude } : null,
    corta: tipo === "gps",
    anterior: null,
  };
}

const ORDEN_TIPO: Record<TipoEquipo, number> = { gps: 0, tc: 1, monedas: 2, otro: 3 };

// Equipos de cada chapa pedida (sin los archivados), el que corta primero.
export function equiposPorChapa(chapas: string[], dispositivos: DispositivoTraccar[], posiciones: PosicionTraccar[]): Record<string, EquipoGps[]> {
  const pedidas = new Set(chapas.map(soloLetrasYNumeros));
  const porId = new Map(posiciones.map((p) => [p.id, p]));
  const res: Record<string, EquipoGps[]> = {};
  for (const d of dispositivos) {
    if (d.attributes?.["ridder.archived"] === true) continue;
    const { chapa } = leerNombre(d.name);
    if (!pedidas.has(chapa)) continue;
    (res[chapa] ??= []).push(estadoEquipo(d, porId.get(d.positionId)));
  }
  for (const lista of Object.values(res)) lista.sort((x, y) => ORDEN_TIPO[x.tipo] - ORDEN_TIPO[y.tipo] || x.nombre.localeCompare(y.nombre));
  return res;
}

// Bloquear = cortar el encendido (engineStop); desbloquear = restablecerlo (engineResume).
export type AccionEncendido = "bloquear" | "desbloquear";
export const COMANDO: Record<AccionEncendido, string> = { bloquear: "engineStop", desbloquear: "engineResume" };

// Qué decirle a la persona según la respuesta de Traccar: 200 lo recibió el equipo, 202 quedó en cola.
export function resultadoComando(status: number, accion: AccionEncendido): { enCola: boolean; mensaje: string } {
  const que = accion === "bloquear" ? "bloqueo" : "desbloqueo";
  if (status === 202) return { enCola: true, mensaje: `El GPS está desconectado: el ${que} quedó en cola y se manda cuando se conecte.` };
  return { enCola: false, mensaje: `El GPS recibió el ${que}. Se confirma cuando el equipo informe el cambio (hasta unos 3 minutos).` };
}

export function payloadNotaEncendido(p: { autor: string; accion: AccionEncendido; equipo: string; enCola: boolean }) {
  const que = p.accion === "bloquear" ? "bloqueó el encendido" : "desbloqueó el encendido";
  return {
    body:
      `<p><b>${escaparHtml(p.autor)}</b> ${que} de la moto desde la app del taller (GPS «${escaparHtml(p.equipo)}»)` +
      `${p.enCola ? ": quedó en cola porque el GPS estaba desconectado" : ""}.</p>`,
    ...NOTA_INTERNA,
  };
}

// El dato del Traccar anterior para cada equipo fuera de línea en el nuevo: el mismo IMEI, el device con el
// lastUpdate más reciente (hay duplicados), y solo si reportó después que en el nuevo.
export function conTraccarAnterior(porChapa: Record<string, EquipoGps[]>, anteriores: Pick<DispositivoTraccar, "uniqueId" | "status" | "lastUpdate">[]) {
  const masReciente = new Map<string, Pick<DispositivoTraccar, "status" | "lastUpdate">>();
  for (const d of anteriores) {
    if (!d.uniqueId || !d.lastUpdate) continue;
    const ya = masReciente.get(d.uniqueId);
    if (!ya || (ya.lastUpdate ?? "") < d.lastUpdate) masReciente.set(d.uniqueId, d);
  }
  const res: Record<string, EquipoGps[]> = {};
  for (const [chapa, lista] of Object.entries(porChapa)) {
    res[chapa] = lista.map((e) => {
      const a = !e.enLinea && e.imei ? masReciente.get(e.imei) : undefined;
      if (!a?.lastUpdate) return e;
      const nuevo = e.ultimaConexion ? Date.parse(e.ultimaConexion) : 0;
      return Date.parse(a.lastUpdate) > nuevo ? { ...e, anterior: { enLinea: a.status === "online", ultimaConexion: a.lastUpdate } } : e;
    });
  }
  return res;
}

// Los IMEI a consultar en el Traccar anterior: solo los equipos fuera de línea en el nuevo.
export const imeisFueraDeLinea = (porChapa: Record<string, EquipoGps[]>) =>
  [...new Set(Object.values(porChapa).flat().filter((e) => !e.enLinea && e.imei).map((e) => e.imei as string))];

// Lo del Sheets («Moneda Google», «Sin moneda», «IOS»…) se muestra cuando la moto figura ahí y en Traccar
// la moneda no reporta (no hay equipo Monedas, o está fuera de línea y tampoco reporta en el Traccar anterior).
export function muestraMonedaGoogle(equipos: EquipoGps[], monedaEnSheets: string | null | undefined): boolean {
  if (!monedaEnSheets) return false;
  const moneda = equipos.find((e) => e.tipo === "monedas");
  return !moneda || (!moneda.enLinea && !moneda.anterior);
}
