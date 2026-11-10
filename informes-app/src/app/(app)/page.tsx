import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarBajas, puedeGestionarDeposito, puedeVerPanel } from "@/lib/types";
import { cargarAreaDe } from "@/lib/guardia/datos";
import { esOficina } from "@/lib/guardia/permisos";
import { ModuleIcon } from "@/components/module-icon";
import { Icon } from "@/components/icon";

/** Heurística simple de "¿esto es un celular?" por user-agent — alcanza para elegir pantalla de arranque, no hace falta nada más fino. */
function esMobile(userAgent: string): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
}

/** Hora y fecha de Argentina, no del servidor (Vercel corre en UTC): si no, a las 22 hs diría "Buen día". */
const ZONA = "America/Argentina/Buenos_Aires";
function saludo(): string {
  const hora = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hourCycle: "h23", timeZone: ZONA }).format(new Date()));
  if (hora >= 5 && hora < 13) return "Buen día";
  if (hora >= 13 && hora < 20) return "Buenas tardes";
  return "Buenas noches";
}
function fechaDeHoy(): string {
  const f = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).format(new Date());
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export default async function HomePage() {
  const profile = await requireProfile();

  // En notebook/PC, Admin y Supervisor arrancan directo en el Panel de Supervisión (para eso lo usan) — en el
  // celular (el técnico en el campo) se queda en este menú de módulos, que es mobile-first. Si volvió acá a
  // propósito desde el Panel (el link "Volver a la app" de su sidebar), no lo rebota de nuevo — si no, "Volver a
  // la app" nunca llegaría a ningún lado. Un técnico ahora también puede ENTRAR al Panel (limitado), pero sigue
  // arrancando acá siempre, sea PC o celular — el Panel no reemplaza este menú para él, que es donde carga todo
  // lo suyo (informes, rendiciones, control de vehículo, etc.), cosas que el Panel limitado no tiene.
  if (profile.rol !== "tecnico" && puedeVerPanel(profile.rol)) {
    const encabezados = await headers();
    const userAgent = encabezados.get("user-agent") ?? "";
    const vieneDelPanel = (encabezados.get("referer") ?? "").includes("/panel");
    if (!esMobile(userAgent) && !vieneDelPanel) redirect("/panel");
  }

  const panelLocked = !puedeVerPanel(profile.rol);
  const bajasLocked = !puedeGestionarBajas(profile.rol);
  const depositoLocked = !puedeGestionarDeposito(profile.rol);

  // El módulo no se muestra "con candado" como Bajas/Depósito — a quien no hace ninguna
  // guardia ni es oficina no le aplica para nada, así que directamente no aparece (mismo
  // criterio que Estadísticas/Configuración, que un técnico ni ve en el Panel).
  const supabase = await createClient();
  const areaGuardia = await cargarAreaDe(supabase, profile.id);
  const muestraGuardia = areaGuardia !== null || esOficina(profile.rol);

  return (
    <div>
      <div className="page-heading mz-saludo">
        <p className="mz-saludo-fecha">{fechaDeHoy()}</p>
        <h1>
          {saludo()}, {profile.nombreCompleto.split(" ")[0] || profile.nombreCompleto}
        </h1>
        <p>¿Qué querés hacer hoy? Elegí un módulo para empezar.</p>
      </div>
      <div className="module-grid">
        <Link href="/informe-tecnico/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="informe" />
          </div>
          <div className="module-title">Informe Técnico</div>
          <div className="module-sub">Cargá un informe de trabajo con fotos, técnicos y firma</div>
        </Link>
        <Link href="/rendicion-gastos/nueva" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="rendicion" />
          </div>
          <div className="module-title">Rendición de Gastos</div>
          <div className="module-sub">
            Cargá el viático recibido, tus gastos con comprobante y cerrá la rendición
          </div>
        </Link>
        <Link href="/relevamiento" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="relevamiento" />
          </div>
          <div className="module-title">Relevamiento de Equipos</div>
          <div className="module-sub">
            Tableros eléctricos, racks de comunicaciones y demás equipamiento de un sitio — elegí qué vas a relevar
          </div>
        </Link>
        <Link href="/escanear-qr" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="escanear" />
          </div>
          <div className="module-title">Escanear QR</div>
          <div className="module-sub">Apuntá la cámara al QR de un tablero o sala y abrí su plano al toque</div>
        </Link>
        <Link href="/riesgo-viaje/nueva" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="riesgo-viaje" />
          </div>
          <div className="module-title">Riesgo de Viaje</div>
          <div className="module-sub">
            Evaluación de Riesgo del Viaje antes de salir — vehículo, conductor, ruta y los 8 criterios de siempre
          </div>
        </Link>
        <Link href="/control-vehiculo/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="control-vehiculo" />
          </div>
          <div className="module-title">Control de Vehículo</div>
          <div className="module-sub">Control periódico — fotos del vehículo, kilometraje, y si el matafuego y el botiquín están al día</div>
        </Link>
        <Link href="/bajas/historial" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="bajas" />
          </div>
          <div className="module-title">
            Bajas de Equipamiento {bajasLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">
            Dar de baja equipamiento por rotura, ampliación u obsolescencia y generar el comprobante para depósito
          </div>
        </Link>
        <Link href="/entregas-deposito/nueva" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="deposito" />
          </div>
          <div className="module-title">
            Entregas a Depósito {depositoLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">
            Material o equipo (nuevo o usado-funcional) que vuelve al depósito — con comprobante de constancia
          </div>
        </Link>
        <Link href="/panel/materiales?tab=alta" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="materiales" />
          </div>
          <div className="module-title">Materiales</div>
          <div className="module-sub">
            Dá de alta lo que sacás de depósito apenas lo tenés en la mano (con fotos), buscá dónde quedó algo, o devolvé lo que no usaste
          </div>
        </Link>
        {muestraGuardia && (
          <Link href="/guardia" className="module-card">
            <div className="module-ico">
              <Icon name="bell" size={22} />
            </div>
            <div className="module-title">Guardia General</div>
            <div className="module-sub">
              {areaGuardia ? `Tu guardia de ${areaGuardia} — eventos, novedades y cambios` : "Eventos de guardia de las cuatro áreas"}
            </div>
          </Link>
        )}
        <Link href="/panel" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="panel" />
          </div>
          <div className="module-title">
            Panel de Supervisión {panelLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">Vista general de sitios, equipamiento y vencimientos — pensado para pantalla grande</div>
        </Link>
      </div>
    </div>
  );
}
