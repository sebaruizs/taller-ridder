import { logout } from "@/lib/auth";
import { json, manejar } from "@/lib/api";

export const POST = manejar(async () => {
  await logout();
  return json({ ok: true });
});
