// Por qué no se pudo entrar desde Ridder Acceso. Aparte de acceso-dominio.ts porque también lo usa la pantalla de login (cliente).
export type MotivoRechazo = "apagado" | "invalido" | "vencido" | "usado" | "sin_usuario" | "bloqueado" | "demasiados";

export const MENSAJES_ACCESO: Record<MotivoRechazo, string> = {
  apagado: "El ingreso desde Ridder todavía no está configurado en Taller. Ingresá con tu usuario y contraseña.",
  invalido: "Ese enlace de ingreso no es válido. Volvé a Ridder y abrí Taller de nuevo, o ingresá con tu usuario y contraseña.",
  vencido: "Ese enlace de ingreso venció. Volvé a Ridder y abrí Taller de nuevo.",
  usado: "Ese enlace de ingreso ya se usó. Volvé a Ridder y abrí Taller de nuevo.",
  sin_usuario: "No tenés usuario en Taller. Pedile a un administrador que te lo cree.",
  bloqueado: "Tu usuario de Taller está bloqueado por intentos fallidos. Probá de nuevo en unos minutos.",
  demasiados: "Demasiados intentos. Probá de nuevo en unos minutos.",
};

// Con ACCESO_SOLO no hay contraseña para los demás: los mensajes no la ofrecen.
const SOLO: Partial<Record<MotivoRechazo, string>> = {
  apagado: "El ingreso desde Ridder todavía no está configurado en Taller. Avisale a un administrador.",
  invalido: "Ese enlace de ingreso no es válido. Volvé a Ridder y abrí Taller de nuevo.",
};

export function mensajeAcceso(codigo: string | null | undefined, solo = false): string | null {
  if (!codigo || !Object.hasOwn(MENSAJES_ACCESO, codigo)) return null;
  const m = codigo as MotivoRechazo;
  return (solo && SOLO[m]) || MENSAJES_ACCESO[m];
}
