import { redirect } from "next/navigation";
import { adondeSinSesion, usuarioActual } from "@/lib/auth";
import { inicioDe } from "@/lib/permisos";

export default async function Inicio() {
  const u = await usuarioActual();
  redirect(u ? inicioDe(u) : await adondeSinSesion());
}
