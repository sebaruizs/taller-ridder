import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { editarSchema, editarUsuario } from "@/lib/usuarios";

export const PATCH = manejar(async (req, ctx: RouteContext<"/api/admin/usuarios/[id]">) => {
  const autor = await exigir("usuarios.gestionar");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const body = (await req.json()) as Record<string, unknown>;
  if (body.password === "") delete body.password;
  await editarUsuario(id, editarSchema.parse(body), autor);
  return json({ ok: true });
});
