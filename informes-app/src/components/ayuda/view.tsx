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
  {
    titulo: "Inspección de seguridad con IA",
    acceso: "todos",
    resumen:
      "Tableros, Racks, Torres de Comunicaciones y Equipos Individuales tienen la misma sección de \"Inspección\": la IA revisa las fotos que ya sacaste para el relevamiento y marca por su cuenta hallazgos de seguridad (cables sueltos, falta de señalética, tapa faltante, lo que vea) — no hace falta sacar fotos extra para esto.",
    pasos: [
      "Cargá las fotos del relevamiento como siempre — la Inspección usa esas mismas fotos, no pide otras.",
      "Revisá la lista de hallazgos que propone la IA: tildá los que confirmás, destildá los que no aplican, y agregá a mano cualquiera que la IA no haya visto.",
      "Los hallazgos confirmados quedan en el comprobante PDF y visibles en la ficha del Sitio, para que quede registro de qué se detectó y cuándo.",
    ],
    tip: "La lista de hallazgos posibles por módulo la define un Administrador en Configuración → Catálogos — si te parece que falta uno frecuente, pedile que lo agregue.",
  },
  {
    titulo: "QR en el gabinete o la sala",
    acceso: "todos",
    resumen:
      "Tableros y Salas tienen una ficha pública con QR para pegar en el equipo físico — cualquiera que lo escanee (con o sin cuenta en la app) ve el estado actual del equipo sin tener que entrar a la app.",
    pasos: [
      "Desde la ficha del Sitio, cada tablero/sala tiene un botón \"Descargar QR\" — imprimilo y pegalo en el gabinete o la puerta.",
      "Al escanearlo sin sesión iniciada, se ve el esquema unifilar (en tableros) o la ficha básica (en salas), la última visita y el último mantenimiento — información de solo ese equipo, nada del resto del Sitio.",
      "Si lo escaneás estando logueado, además aparecen accesos directos para cargar una medición o un mantenimiento con ese tablero/sala ya preseleccionado.",
      "En Tableros además podés adjuntar archivos sueltos (un plano propio, un PDF, una foto del gabinete) que también se ven desde el QR — aparte del esquema unifilar (que siempre se dibuja solo, en vivo) y del DXF que genera cada Nueva Medición.",
    ],
  },
];

const MODULOS: Seccion[] = [
  {
    titulo: "Informe Técnico",
    acceso: "todos",
    resumen:
      "El informe \"para cualquier cosa\" — úsalo cuando el trabajo no entra en ninguno de los módulos específicos de abajo (una instalación, una reparación, una visita de mantenimiento general, lo que sea).",
    pasos: [
      "Nuevo Informe: completá el asunto, cliente y proyecto.",
      "Sumá los técnicos y vehículos que participaron.",
      "Si el trabajo usó materiales o equipos (una instalación, una reparación con repuestos, lo que sea), tocá \"+ Agregar materiales/equipos\" en el paso \"Técnicos y Recursos\" — ahí podés sacarle una foto al remito de depósito (la IA arma la lista esperada) y fotos de lo que efectivamente usaste/instalaste (la IA identifica cada uno). Cada material queda dado de alta como equipo real en el Sitio, y si algo del remito sobró, se genera sola la devolución a depósito — todo en el mismo informe, sin cargar nada aparte.",
      "Cargá las fotos que documenten el trabajo.",
      "Revisá todo en el último paso antes de generar el PDF.",
    ],
    tip: "No hace falta elegir entre \"cargar una instalación\" o \"cargar un informe\" — son la misma carga. La sección de materiales es opcional: si el trabajo no usó nada, simplemente no la tocás.",
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
      "Nueva Medición: elegí el Sitio y cargá los circuitos del tablero (a mano o con fotos + IA) — con cada medición se recalcula solo el calibre de cable recomendado y se genera el plano unifilar y su DXF descargable.",
      "Mantenimiento: usalo cuando volvés a un tablero que ya existe, para una visita de mantenimiento sin cargar todo de cero.",
      "Historial: buscá mediciones anteriores de cualquier tablero, y descargá el DXF de cualquiera de ellas.",
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
    titulo: "Relevamiento de Equipos — Torres de Comunicaciones",
    acceso: "todos",
    resumen: "Para torres de comunicaciones y el equipamiento montado en ellas (antenas, radioenlaces, baliza, pararrayos, feeder).",
    pasos: [
      "Nuevo Relevamiento: elegí el Sitio y cargá el equipamiento de la torre (a mano o con fotos + IA) — la IA también identifica el tipo de torre y cuenta los tramos visibles en la foto para estimar su altura total (el largo real de cada tramo sale de un catálogo configurado, no lo inventa la IA).",
      "Historial: buscá relevamientos anteriores de cualquier torre.",
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
    titulo: "Relevamiento de Equipos — Salas",
    acceso: "todos",
    resumen: "Para salas técnicas o shelters completos (no un equipo suelto): aire acondicionado, UPS de sala, tablero propio, detección de incendio — con su propio checklist de inspección por tipo de construcción.",
    pasos: [
      "Nuevo Relevamiento: elegí el Sitio, indicá el tipo de construcción de la sala y completá el checklist correspondiente.",
      "Historial: buscá relevamientos anteriores de cualquier sala.",
      "Igual que Tableros, cada sala tiene su propio QR para pegar en la puerta (ver \"QR en el gabinete o la sala\" arriba).",
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
    titulo: "Plan de Mantenimiento",
    acceso: "supervisor",
    resumen:
      "Panel → Mantenimientos: cruza los intervalos configurados (cada cuánto corresponde un mantenimiento, por categoría) con el último mantenimiento registrado de cada equipo, para avisar quién está vencido, quién se acerca y quién nunca tuvo uno.",
    pasos: [
      "Pendientes: la lista ordenada por urgencia (vencido primero), con el pronóstico de lluvia del Sitio para decidir si conviene programar la visita. Tocá cualquier KPI de arriba para filtrar la lista por ese estado.",
      "Calendario: vista anual de lo programado, mes a mes.",
      "Realizados: historial de mantenimientos ya registrados, con foto y descripción.",
      "Dotación: estimación de cuántos técnicos hacen falta por provincia para no acumular atrasos, según los supuestos configurados.",
      "Configuración (solo Admin): acá se definen los intervalos por categoría, el checklist de inspección de cada una, y los supuestos usados para calcular la Dotación.",
      "Desde la ficha de un Sitio podés \"Registrar mantenimiento\" (dejar constancia de que ya se hizo, con checklist) o \"Programar\" (agendarlo para una fecha, con un técnico asignado y, si corresponde, un motivo de reprogramación).",
    ],
    tip: "Si una categoría no tiene intervalo configurado, simplemente no aparece en el Plan — no significa que esté \"al día\", significa que todavía nadie definió cada cuánto hay que revisarla.",
  },
  {
    titulo: "Vehículos",
    acceso: "supervisor",
    resumen: "Panel → Vehículos: la flota de la empresa, con su documentación y su estado.",
    pasos: [
      "Flota: lista de vehículos con su vencimiento de tarjeta verde y RTO, y la galería de fotos de su último alta (exterior/interior).",
      "Nueva alta: sacá fotos del exterior y el tablero del vehículo — la IA lee patente, marca/modelo, estado/daños visibles y kilometraje, para no tener que tipearlo todo a mano.",
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
    titulo: "Vista General (Panel)",
    acceso: "supervisor",
    resumen:
      "La portada del Panel de Supervisión (Panel → Vista general) — pensada para pantalla grande (notebook/PC), no para el celular del técnico en el campo. Resume todo lo cargado y deja navegar de la región más amplia hasta un Sitio puntual.",
    pasos: [
      "Arriba, 4 cuadros resumen: equipamiento relevado (tableros/racks/torres/salas), actividad (informes por tipo), gente y flota (técnicos activos/vehículos), y el estado del Plan de Mantenimiento (hechos/por hacer/vencidos/reprogramados). Tocá cualquier fila para ir directo a esa lista ya filtrada.",
      "Abajo, un árbol navegable: Región → Provincia → Localidad → Sitio. Andá entrando para achicar el universo hasta llegar al Sitio que te interesa — cada nivel muestra cuánto equipamiento y qué urgencia de mantenimiento tiene adentro.",
      "Cuando llegás a un Sitio con mantenimiento vencido o checklist pendiente, se avisa ahí mismo; si no, se muestra la estimación de consumo eléctrico del Sitio.",
      "Mapa de relevamientos: todos los tableros/racks/torres/equipos/salas con GPS cargado, cada uno con su propio ícono y color (verde = al día, amarillo = próximo, rojo = vencido, gris = sin mantenimiento configurado). Podés filtrar por módulo, por categoría de Equipo Individual, por estado de mantenimiento (Vencido/Próximo) y buscar por nombre — y hacer zoom con la rueda del mouse.",
      "Es un resumen ejecutivo y de navegación; el detalle fila por fila sigue estando en el Historial de cada módulo y en la ficha del Sitio.",
    ],
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
    resumen: "Ajustes generales de la empresa, catálogos y herramientas de mantenimiento de la app — un hub con 9 secciones, cada una en su propia pantalla.",
    pasos: [
      "Empresa: el logo que aparece en todos los PDF generados.",
      "Usuarios: alta de cuentas, rol, torre/cuadrilla asignada, blanqueo de contraseña y baja.",
      "Catálogos: acá viven todos los catálogos chicos de la app — torres (cuadrillas), clientes, provincias, tipos de informe, categorías de gasto, tramos de torre, calibre de cable, recurso por altura (para cámaras) y la lista de hallazgos de seguridad por módulo.",
      "Emails de envío: envío automático de informes y la lista de direcciones que los reciben.",
      "Almacenamiento: umbral de aviso, recordatorio semanal y liberación automática de archivos viejos.",
      "Resumen semanal IA: el mensaje que la IA redacta cada semana con lo que hizo el equipo.",
      "Auditoría: quién hizo qué — últimas 100 acciones de administración registradas.",
      "Errores reportados: errores que la app capturó sola en el navegador de los usuarios.",
      "Datos de prueba: herramientas de borrado (un registro puntual, o vaciar todo lo de prueba) — para mientras la app está en pruebas, nunca para uso normal.",
    ],
    tip: "Los intervalos de mantenimiento, su checklist y los supuestos de dotación NO están acá — viven en Panel → Mantenimientos → Configuración, porque son del Plan de Mantenimiento específicamente.",
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
