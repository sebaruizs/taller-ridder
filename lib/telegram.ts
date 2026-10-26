import "server-only";
import { env } from "./env";

export async function enviarTelegram(chatId: string, texto: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN } = env();
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn("[telegram] sin token o chat, no se envía:", texto.split("\n")[0]);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

type RespuestaTg<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function llamar<T>(metodo: string, params: Record<string, unknown> = {}): Promise<RespuestaTg<T>> {
  const res = await fetch(`https://api.telegram.org/bot${env().TELEGRAM_BOT_TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as RespuestaTg<T>;
}

// Solo consulta (no manda mensajes): qué bot es el del token y si está en cada grupo.
export async function diagnosticoTelegram() {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_TALLER, TELEGRAM_CHAT_ERRORES } = env();
  if (!TELEGRAM_BOT_TOKEN) return { token: "falta TELEGRAM_BOT_TOKEN" };
  const formato = /^\d+:[\w-]{30,}$/.test(TELEGRAM_BOT_TOKEN) ? "ok" : "no parece un token de bot (número:clave)";
  const me = await llamar<{ id: number; username: string; first_name: string }>("getMe");
  if (!me.ok || !me.result) return { token: formato, bot: `Telegram rechazó el token: ${me.description ?? "sin detalle"}` };
  const bot = me.result;
  const grupo = async (chatId: string) => {
    if (!chatId) return "sin configurar";
    const chat = await llamar<{ title?: string; type: string }>("getChat", { chat_id: chatId });
    if (!chat.ok) return `${chatId}: ${chat.description ?? "error"}`;
    const miembro = await llamar<{ status: string }>("getChatMember", { chat_id: chatId, user_id: bot.id });
    return `${chatId}: «${chat.result?.title ?? "?"}» (${chat.result?.type}) · el bot está como ${miembro.ok ? miembro.result?.status : miembro.description}`;
  };
  return {
    token: formato,
    bot: `@${bot.username} (${bot.first_name})`,
    grupoTaller: await grupo(TELEGRAM_CHAT_TALLER),
    grupoErrores: await grupo(TELEGRAM_CHAT_ERRORES),
  };
}
