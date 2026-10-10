import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { ModuleIcon } from "@/components/module-icon";

/**
 * Hub de Configuración — antes era una sola pantalla con 9 tarjetas
 * apiladas una debajo de la otra (todo junto, scroll largo); ahora cada
 * sección es su propia subruta con su propio fetch acotado, mismo criterio
 * que el hub de "Relevamiento de Equipos" (`/relevamiento`). Solo
 * Administrador — ya no aparece en el menú principal de los técnicos, se
 * accede desde el Panel de Supervisión (`PanelNav`).
 */
export default async function ConfiguracionHubPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para administradores"
        description="Los emails de envío, los catálogos y las políticas de almacenamiento solo los puede modificar un Administrador. Pedile acceso a tu responsable si necesitás cambiar algo acá."
      />
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Configuración</h1>
        <p>Elegí qué querés configurar</p>
      </div>
      <div className="module-grid">
        <Link href="/configuracion/empresa" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="empresa" />
          </div>
          <div className="module-title">Empresa</div>
          <div className="module-sub">Logo que aparece en la cabecera de todos los PDF que se generan</div>
        </Link>
        <Link href="/configuracion/usuarios" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="usuarios" />
          </div>
          <div className="module-title">Usuarios</div>
          <div className="module-sub">Alta, rol, torre asignada, blanqueo de contraseña y baja de cuentas</div>
        </Link>
        <Link href="/configuracion/catalogos" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="catalogos" />
          </div>
          <div className="module-title">Catálogos</div>
          <div className="module-sub">
            Torres (cuadrillas), clientes, provincias, tipos de informe, categorías de gasto y tramos de torre
          </div>
        </Link>
        <Link href="/configuracion/emails" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="emails" />
          </div>
          <div className="module-title">Emails de envío</div>
          <div className="module-sub">Envío automático de informes y la lista de direcciones que los reciben</div>
        </Link>
        <Link href="/configuracion/almacenamiento" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="almacenamiento" />
          </div>
          <div className="module-title">Almacenamiento</div>
          <div className="module-sub">Umbral de aviso, recordatorio semanal y liberación automática de archivos viejos</div>
        </Link>
        <Link href="/configuracion/resumen-semanal" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="resumen-ia" />
          </div>
          <div className="module-title">Resumen semanal IA</div>
          <div className="module-sub">El mensaje que la IA redacta cada semana con lo que hizo el equipo</div>
        </Link>
        <Link href="/configuracion/auditoria" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="auditoria" />
          </div>
          <div className="module-title">Auditoría</div>
          <div className="module-sub">Quién hizo qué — últimas 100 acciones de administración registradas</div>
        </Link>
        <Link href="/configuracion/errores" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="errores" />
          </div>
          <div className="module-title">Errores reportados</div>
          <div className="module-sub">Errores que capturó la app en el navegador de los usuarios</div>
        </Link>
        <Link href="/configuracion/datos-prueba" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="datos-prueba" />
          </div>
          <div className="module-title">Datos de prueba</div>
          <div className="module-sub">Vaciar todo lo cargado de prueba antes de arrancar en producción real</div>
        </Link>
      </div>
    </div>
  );
}
