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
