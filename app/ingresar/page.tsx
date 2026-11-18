import { accesoSolo } from "@/lib/auth";
import { mensajeAcceso } from "@/lib/acceso-mensajes";
import { FormIngresar } from "./form";

// Login propio. Con ACCESO_SOLO (Ridder Acceso es el único ingreso) es la entrada de emergencia de los admins, y
// /ingresar?acceso=<motivo> (un enlace de Acceso que no sirvió) muestra el motivo y la vuelta a Ridder en lugar del
// formulario: nunca redirige sola a Acceso, que armaría un rulo.
export default async function Ingresar({ searchParams }: PageProps<"/ingresar">) {
  // searchParams primero: hace la página dinámica antes de leer el entorno (en el build no hay variables).
  const motivo = (await searchParams).acceso;
  const acceso = accesoSolo();
  const aviso = acceso ? mensajeAcceso(typeof motivo === "string" ? motivo : null, true) : null;
  if (!acceso || !aviso) return <FormIngresar acceso={acceso} />;
  return (
    <main className="login-pantalla">
      <div className="login-caja">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/brand/ridder-logo.svg" alt="Ridder" />
          <h1>Taller</h1>
          <p className="sub">No se pudo entrar desde Ridder.</p>
        </div>
        <div className="alert alert-warn" role="status">{aviso}</div>
        <a className="btn btn-primary btn-block btn-lg" href={`${acceso}/`}>
          Volver a Ridder
        </a>
      </div>
    </main>
  );
}
