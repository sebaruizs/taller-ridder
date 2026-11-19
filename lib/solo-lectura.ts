import { AsyncLocalStorage } from "node:async_hooks";
import type { Rol } from "./db/schema";

// Rol «revisor»: ve lo mismo que un jefe y no puede cambiar nada. Lo usa gente de fuera de Ridder (los revisores
// de las tiendas de apps). Los permisos no alcanzan para garantizarlo, porque varias pantallas de solo ver están
// detrás de un permiso de escribir (los repuestos de una orden, las motos a devolver). Por eso hay dos barreras
// en el servidor, las dos acá:
//   1. Toda petición que no sea de lectura (GET/HEAD/OPTIONS) de un revisor se rechaza con 403: en el mismo lugar
//      donde la ruta averigua quién es (`usuarioActual` para la sesión web y las llamadas de Cobranzas,
//      `personaDeDispositivo` para la ficha del teléfono) y, antes de eso, en `manejar` (lib/api.ts).
//   2. Mientras se atiende a un revisor, lib/odoo.ts no deja pasar ningún método que escriba en Odoo, tampoco
//      desde un GET.
// Contrato con Ridder App (Gestiones): con `codigo: "solo_lectura"` la app no reintenta el registro.
export const CODIGO_SOLO_LECTURA = "solo_lectura";
export const MENSAJE_SOLO_LECTURA = "Cuenta de solo lectura: no se guardan cambios.";

export class SoloLectura extends Error {
  readonly status = 403;
  readonly codigo = CODIGO_SOLO_LECTURA;
  constructor() {
    super(MENSAJE_SOLO_LECTURA);
    this.name = "SoloLectura";
  }
}

export const esSoloLectura = (rol: Rol): boolean => rol === "revisor";

const METODOS_DE_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);
export const esPeticionDeLectura = (metodo: string): boolean => METODOS_DE_LECTURA.has(metodo.toUpperCase());

// Salir y volver a ingresar no cambian datos del negocio: se dejan pasar.
const RUTAS_LIBRES = new Set(["/api/auth/logout", "/api/auth/login"]);
export function rutaLibre(url: string): boolean {
  try {
    return RUTAS_LIBRES.has(new URL(url, "http://local").pathname.replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

// El pedido en curso. `manejar` abre el contexto con el método y la URL; quien resuelve al usuario (usuarioActual,
// personaDeDispositivo) lo revisa ahí mismo, con el mismo usuario que va a usar la ruta. Así la barrera 1 no depende
// de leer la sesión dos veces de dos maneras.
type Contexto = { soloLectura: boolean; metodo: string; url: string };
const contexto = new AsyncLocalStorage<Contexto>();

export function conContexto<T>(req: { method: string; url: string }, fn: () => Promise<T>): Promise<T> {
  return contexto.run({ soloLectura: false, metodo: req.method, url: req.url }, fn);
}

export const pedidoSoloLectura = (): boolean => contexto.getStore()?.soloLectura === true;

// Barrera 1. Marca el pedido si es de un revisor y, si no es de lectura, no lo deja seguir.
// Sin `req` usa el pedido del contexto (fuera de `manejar`, en las páginas, no hay: solo se leen datos).
export function rechazarEscritura(rol: Rol, req?: { method: string; url: string }): void {
  if (!esSoloLectura(rol)) return;
  const c = contexto.getStore();
  if (c) c.soloLectura = true;
  const metodo = req?.method ?? c?.metodo;
  const url = req?.url ?? c?.url;
  if (metodo && !esPeticionDeLectura(metodo) && !(url && rutaLibre(url))) throw new SoloLectura();
}
