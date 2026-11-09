import Link from "next/link";
import { Icon } from "@/components/icon";

export default function GuardiaGeneralHubPage() {
  return (
    <div>
      <div className="page-heading">
        <h1>Guardia General</h1>
        <p>Personas, parámetros, calendario de feriados y cronograma de las cuatro guardias (General, Infraestructura, Datos, Enlaces)</p>
      </div>
      <div className="module-grid">
        <Link href="/panel/guardia/personas" className="module-card">
          <div className="module-ico">
            <Icon name="users" size={22} />
          </div>
          <div className="module-title">Personas</div>
          <div className="module-sub">Quién hace cada guardia, orden de rotación y teléfono de WhatsApp</div>
        </Link>
        <Link href="/panel/guardia/parametros" className="module-card">
          <div className="module-ico">
            <Icon name="settings" size={22} />
          </div>
          <div className="module-title">Parámetros</div>
          <div className="module-sub">Horarios, valores de activación, hora de cambio y período de liquidación — con historial</div>
        </Link>
        <Link href="/panel/guardia/calendario" className="module-card">
          <div className="module-ico">
            <Icon name="calendar" size={22} />
          </div>
          <div className="module-title">Calendario</div>
          <div className="module-sub">Vista mensual con quién está de guardia cada día y los feriados marcados</div>
        </Link>
        <Link href="/panel/guardia/cronograma" className="module-card">
          <div className="module-ico">
            <Icon name="clock" size={22} />
          </div>
          <div className="module-title">Cronograma</div>
          <div className="module-sub">Generar la programación anual, editar semana por semana y cambios de guardia</div>
        </Link>
      </div>
    </div>
  );
}
