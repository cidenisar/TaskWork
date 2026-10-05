import type { Rol } from "@/lib/types";
import { Icon } from "@/components/icon";

/**
 * Página de Ayuda — pensada para que un técnico nuevo aprenda solo, sin que
 * nadie se lo tenga que explicar en persona. Es contenido estático (sin
 * interactividad más allá de los <details> nativos), a propósito: no hace
 * falta ningún estado de cliente para esto.
 */

type Acceso = "todos" | "supervisor" | "admin";

const ACCESO_LABEL: Record<Acceso, string> = {
  todos: "Todos los roles",
  supervisor: "Supervisor y Administrador",
  admin: "Solo Administrador",
};

interface Seccion {
  titulo: string;
  acceso: Acceso;
  resumen: string;
  pasos: string[];
  tip?: string;
}

const PATRONES_COMUNES: Seccion[] = [
  {
    titulo: "Elegir o crear un Sitio (con GPS)",
    acceso: "todos",
    resumen:
      "Casi todos los módulos arrancan pidiendo el Sitio donde estás trabajando — es el mismo selector en todos lados, aprenderlo una vez te sirve para toda la app.",
    pasos: [
      "Elegí la Provincia para filtrar la lista — se achica mucho y es más fácil encontrar el Sitio.",
      "Si el Sitio ya existe, elegilo de la lista. Si no está, usá \"+ Crear nuevo\" y escribilo — queda disponible para la próxima vez que alguien lo busque, no hace falta avisarle a nadie.",
      "Si te deja, tocá el botón de GPS para marcar dónde estás parado. La primera vez que alguien confirma el GPS de un Sitio, esa ubicación queda guardada para siempre — la próxima persona que pase por ahí cae directo en el mismo Sitio en vez de tener que buscarlo.",
    ],
  },
  {
    titulo: "Fotos con IA (identificación automática)",
    acceso: "todos",
    resumen:
      "En Tableros, Comunicaciones, Equipos Individuales y Entregas a Depósito podés sacar fotos en vez de escribir todo a mano — una IA identifica qué es cada cosa.",
    pasos: [
      "Sacá o subí las fotos (podés mandar varias juntas, de cosas distintas o de ángulos distintos de lo mismo).",
      "Tocá \"Procesar fotos con IA\" — en unos segundos aparece una lista con lo que identificó: categoría, marca/modelo, N° de serie, etiqueta YPF.",
      "Revisá SIEMPRE antes de guardar. Si una foto no tenía una etiqueta legible, ese ítem queda marcado con un aviso para que lo corrijas a mano.",
      "La cantidad NUNCA la completa la IA — eso lo escribís vos siempre, para cada ítem.",
    ],
    tip: "Si la IA no identifica bien algo, no pasa nada: corregilo a mano o usá \"Agregar manual\" y cargalo vos directo, sin foto.",
  },
  {
    titulo: "\"Ver PDF\" y el N° de generación",
    acceso: "todos",
    resumen:
      "Cada vez que guardás algo (un informe, una medición, una baja, una entrega) la app genera un comprobante en PDF con un número único, por ejemplo BAJA-2026-0417 o DEP-2026-0032.",
    pasos: [
      "El ícono de ojo (\"Ver PDF\") lo abre en una pestaña nueva para mirarlo o imprimirlo — no lo descarga a tu celular.",
      "En algunos Historiales (como Informe Técnico) hay además un botón para descargar varios comprobantes juntos en un .zip — ese sí baja los archivos.",
      "El N° de generación es el identificador único de ese comprobante — sirve para buscarlo después en el Historial, o para nombrarlo si lo mencionás por mensaje/mail.",
    ],
  },
];

const MODULOS: Seccion[] = [
  {
    titulo: "Informe Técnico",
    acceso: "todos",
    resumen:
      "El informe \"para cualquier cosa\" — úsalo cuando el trabajo no entra en ninguno de los módulos específicos de abajo (una instalación, una visita de mantenimiento general, lo que sea).",
    pasos: [
      "Nuevo Informe: completá el asunto, cliente y proyecto.",
      "Sumá los técnicos y vehículos que participaron.",
      "Cargá las fotos que documenten el trabajo.",
      "Revisá todo en el último paso antes de generar el PDF.",
    ],
  },
  {
    titulo: "Rendición de Gastos",
    acceso: "todos",
    resumen: "Para dejar constancia de gastos de una visita o viaje — combustible, viáticos, lo que sea.",
    pasos: [
      "Cargá cada gasto con su categoría, monto y, si tenés, una foto del comprobante.",
      "Indicá si recibiste viático y los técnicos asociados al gasto.",
      "Al guardar se genera el comprobante — desde el Historial también podés exportarlo a Excel.",
    ],
  },
  {
    titulo: "Relevamiento de Equipos — Tableros",
    acceso: "todos",
    resumen: "Para tableros eléctricos: medís sus circuitos y dejás constancia de su estado.",
    pasos: [
      "Nueva Medición: elegí el Sitio y cargá los circuitos del tablero (a mano o con fotos + IA).",
      "Mantenimiento: usalo cuando volvés a un tablero que ya existe, para una visita de mantenimiento sin cargar todo de cero.",
      "Historial: buscá mediciones anteriores de cualquier tablero.",
    ],
  },
  {
    titulo: "Relevamiento de Equipos — Comunicaciones (Racks)",
    acceso: "todos",
    resumen: "Para racks de comunicaciones y el equipamiento montado adentro (routers, switches, UPS de rack).",
    pasos: [
      "Nuevo Relevamiento: elegí el Sitio y cargá el equipamiento del rack (a mano o con fotos + IA).",
      "Historial: buscá relevamientos anteriores de cualquier rack.",
    ],
  },
  {
    titulo: "Relevamiento de Equipos — Equipos Individuales",
    acceso: "todos",
    resumen:
      "Para equipo suelto que NO vive dentro de un rack ni de un tablero: UPS standalone, cámaras, control de acceso, impresoras, climatización, telefonía.",
    pasos: [
      "Nuevo Relevamiento: elegí el Sitio y cargá los equipos (a mano o con fotos + IA — la IA también estima el consumo eléctrico típico cuando reconoce la marca/modelo, nunca lo mide).",
      "Si sos Supervisor o Administrador, también podés usar \"Traer equipo desde depósito\" para buscar un equipo que está en depósito (de cualquier Sitio) e instalarlo acá — queda reactivado y reubicado en este Sitio.",
      "Historial: buscá relevamientos anteriores de cualquier equipo.",
    ],
  },
  {
    titulo: "Sitios",
    acceso: "todos",
    resumen: "La ficha de cada lugar donde YPF tiene equipamiento — acá se ve TODO lo que hay cargado en ese Sitio, de todos los módulos.",
    pasos: [
      "Entrá a \"Todos los Sitios\" y buscá el que te interesa.",
      "En la ficha vas a ver sus tableros, racks, equipos, informes, y (si tenés acceso) sus bajas y entregas a depósito — todo junto, no hace falta ir módulo por módulo.",
    ],
  },
  {
    titulo: "Bajas de Equipamiento",
    acceso: "supervisor",
    resumen:
      "Para dar de baja DEFINITIVAMENTE un equipo que se rompió, quedó obsoleto o se retira para siempre — distinto de Entregas a Depósito (ver abajo).",
    pasos: [
      "Desde la ficha del Sitio, al lado del equipo (tablero-circuito, rack-equipamiento o equipo individual), tocá \"Dar de baja\".",
      "Elegí el motivo (rotura, ampliación, obsolescencia u otro), la fecha y un comentario.",
      "Se genera un comprobante — entregalo junto con el equipo físico en depósito.",
    ],
    tip: "Una vez dado de baja, el equipo desaparece de las listas de equipamiento activo, pero su historial de mediciones/relevamientos anteriores queda guardado — nada se borra.",
  },
  {
    titulo: "Entregas a Depósito",
    acceso: "supervisor",
    resumen:
      "Para material o equipo que VUELVE al depósito — nuevo sin usar, o usado pero todavía funcional. Distinto de una Baja: esto puede volver a instalarse después.",
    pasos: [
      "Desde la ficha del Sitio podés entregar un equipo que ya estaba cargado ahí (botón \"Entregar a depósito\").",
      "O, si es material que nunca se había registrado (sobrante de obra, repuestos), usá \"Nueva Entrega\" — ahí podés cargar VARIOS materiales distintos en una sola carga, con fotos + IA y números de serie, más 1-2 fotos de evidencia general que quedan guardadas en el comprobante.",
      "Elegí el motivo (sobrante de obra, reemplazo funcional, retorno post-mantenimiento, u otro).",
    ],
    tip: "Lo que entregás acá podés después \"traerlo\" de vuelta desde Equipos Individuales → Nuevo Relevamiento, para instalarlo en otro Sitio (o el mismo).",
  },
  {
    titulo: "Instalación",
    acceso: "todos",
    resumen:
      "Para registrar qué instalaste en un Sitio a partir de un remito en papel del depósito — y devolver solo, sin pasar por otro módulo, lo que sobró.",
    pasos: [
      "Sacale una foto al remito que te dio depósito — la IA lee la lista de materiales y cantidades (revisala y corregila si hace falta).",
      "Sacá fotos de lo que efectivamente instalaste (cámaras, domos, UPS, tableros, lo que sea) — la IA arma la lista con marca, modelo y N° de serie.",
      "Para cada línea del remito que no se usó completa, ajustá la cantidad sobrante.",
      "Al guardar se genera el comprobante de instalación — y si quedó algo sobrante, se genera SOLA la devolución a depósito correspondiente.",
    ],
    tip: "No hace falta ir después a Entregas a Depósito a cargar lo que sobró — queda hecho automáticamente al guardar la instalación.",
  },
  {
    titulo: "Estadísticas",
    acceso: "supervisor",
    resumen: "Resumen y analítica de toda la actividad cargada en la app.",
    pasos: ["Entrá a Estadísticas → Resumen para ver los números generales de todos los módulos."],
  },
  {
    titulo: "Configuración",
    acceso: "admin",
    resumen: "Ajustes generales de la empresa y herramientas de mantenimiento de la app.",
    pasos: [
      "Logo de la empresa, que aparece en todos los PDF generados.",
      "Liberación automática de storage: un trabajo que archiva y libera PDFs viejos para no acumular espacio sin límite.",
      "Emails de envío automático de resúmenes.",
      "Herramientas de borrado (borrar un registro puntual, o vaciar todos los datos de prueba) — pensadas para mientras la app está en pruebas, no para uso normal.",
    ],
  },
  {
    titulo: "Mi cuenta",
    acceso: "todos",
    resumen: "Tu perfil: foto, teléfono y los datos con los que entrás a la app.",
    pasos: ["Entrá desde el link \"Mi cuenta\" arriba a la derecha, en cualquier pantalla."],
  },
];

function AccesoBadge({ acceso }: { acceso: Acceso }) {
  return <span className="role-pill">{ACCESO_LABEL[acceso]}</span>;
}

function SeccionItem({ seccion }: { seccion: Seccion }) {
  return (
    <details className="help-item">
      <summary>
        <span className="help-item-titulo">{seccion.titulo}</span>
        <AccesoBadge acceso={seccion.acceso} />
      </summary>
      <div className="help-item-body">
        <p>{seccion.resumen}</p>
        <ul>
          {seccion.pasos.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ul>
        {seccion.tip && (
          <div className="hint" style={{ margin: "8px 0 0" }}>
            <Icon name="lightbulb" size={13} /> {seccion.tip}
          </div>
        )}
      </div>
    </details>
  );
}

export function AyudaView({ rol }: { rol: Rol }) {
  return (
    <div>
      <div className="page-heading">
        <h1>Ayuda</h1>
        <p>Qué hace cada parte de la app y cómo usarla — pensada para aprender sola, sin tener que preguntarle a nadie.</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 4px" }}>
          Tu rol actual: <b>{rol === "admin" ? "Administrador" : rol === "supervisor" ? "Supervisor" : "Técnico"}</b>. Las secciones
          marcadas &ldquo;Supervisor y Administrador&rdquo; o &ldquo;Solo Administrador&rdquo; existen igual en esta guía aunque no las
          veas en tu menú — así sabés qué hace el resto del equipo.
        </div>
      </div>

      <div className="card">
        <div className="section-label">Patrones que vas a ver en varios módulos</div>
        <div className="help-list">
          {PATRONES_COMUNES.map((s) => (
            <SeccionItem key={s.titulo} seccion={s} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Módulos de la app</div>
        <div className="help-list">
          {MODULOS.map((s) => (
            <SeccionItem key={s.titulo} seccion={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
