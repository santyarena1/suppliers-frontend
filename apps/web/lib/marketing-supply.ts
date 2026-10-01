/**
 * Lo que NODO hace para distribuidores y marcas, para la landing (tarjetas en
 * planes) y sus páginas de detalle. Solo funciones que existen en la app: cada
 * grupo corresponde a una pantalla del menú de ese tipo de organización.
 */

export type SupplyKind = "distribuidores" | "marcas";

export interface SupplyGroup {
  title: string;
  text: string;
  items: string[];
}

export interface SupplyAudience {
  kind: SupplyKind;
  /** Título de la tarjeta en planes. */
  name: string;
  /** Una línea: qué gana. */
  lead: string;
  /** Lo más importante, para la tarjeta. */
  highlights: string[];
  /** Página de detalle. */
  title: string;
  intro: string;
  groups: SupplyGroup[];
  href: string;
}

export const SUPPLY: Record<SupplyKind, SupplyAudience> = {
  distribuidores: {
    kind: "distribuidores",
    name: "NODO para distribuidores",
    lead: "Los comercios te encuentran en su búsqueda, te piden sin llamarte y ves toda tu cartera en un lugar.",
    highlights: [
      "Cartera de comercios con el vendedor de cada cuenta",
      "Pedidos de tus clientes, con su historial",
      "Chat y novedades para tus comercios",
      "Publicidad dentro del buscador",
    ],
    title: "Tu cartera de comercios, ordenada y al día",
    intro:
      "Tus clientes ya buscan y compran en NODO. Con tu espacio de distribuidor ves quién te compra, quién dejó de hacerlo, qué te piden y les hablás sin salir de la plataforma.",
    href: "/landing/distribuidores",
    groups: [
      {
        title: "Cartera de comercios",
        text: "Todos los comercios vinculados con vos, en una lista que se puede filtrar.",
        items: [
          "Vendedor asignado a cada cuenta: cada vendedor ve solo las suyas",
          "Filtros por vendedor, por estado y por comercios que dejaron de comprar",
          "Ficha de cada cliente con sus pedidos, su carrito y las condiciones del vínculo",
        ],
      },
      {
        title: "Pedidos de clientes",
        text: "Lo que te piden los comercios, en un solo lugar y con su estado.",
        items: ["Pedidos de todos tus clientes, filtrados por estado", "Historial de compras de cada comercio"],
      },
      {
        title: "Sumar comercios",
        text: "Vos decidís quién te encuentra.",
        items: ["Códigos de invitación para vincular comercios nuevos", "El comercio se conecta y ya te ve en su búsqueda"],
      },
      {
        title: "Comunicación",
        text: "Le hablás a tu cartera sin listas de difusión.",
        items: [
          "Chat con cada comercio, con el historial guardado",
          "Novedades para tus comercios, con aviso opcional",
          "Notificaciones de lo que pasa con tus clientes",
        ],
      },
      {
        title: "Publicidad",
        text: "Aparecés donde el comercio está buscando.",
        items: ["Espacios dentro del buscador de los comercios", "Costo y visitas de cada campaña"],
      },
      {
        title: "Tu equipo",
        text: "Cada uno entra con su usuario.",
        items: ["Usuarios con permisos por rol", "Vendedores con su propia cartera"],
      },
    ],
  },
  marcas: {
    kind: "marcas",
    name: "NODO para marcas",
    lead: "Sabés dónde está tu producto, a cuánto se vende en el canal y le hablás directo a los comercios.",
    highlights: [
      "Semáforo de stock por distribuidor",
      "Estadísticas de lo que se compra de tu marca",
      "Tu página pública para compartir",
      "Eventos con confirmación de asistencia",
    ],
    title: "Tu marca en cada mostrador",
    intro:
      "Dejás de preguntar por teléfono quién tiene tu producto y a cuánto. NODO te muestra el stock y el precio en cada distribuidor, lo que compran los comercios y te da un canal directo para lanzamientos, eventos y materiales.",
    href: "/landing/marcas",
    groups: [
      {
        title: "Semáforo de stock",
        text: "Qué distribuidor tiene cada producto tuyo, con cuánto stock y a qué precio.",
        items: [
          "Stock de cada SKU en cada distribuidor",
          "Precio en el canal contra tu precio sugerido",
          "Los que se quedan sin stock, a la vista",
        ],
      },
      {
        title: "Estadísticas",
        text: "Qué se compra de tu marca en los comercios que usan NODO.",
        items: ["Compras por mes, por producto y por distribuidor", "Los productos que más se mueven"],
      },
      {
        title: "Mi página",
        text: "Una página pública de tu marca, con su link para compartir.",
        items: [
          "Lanzamientos, eventos, promociones y materiales en un lugar",
          "Los comercios se vinculan con tu marca desde el link",
        ],
      },
      {
        title: "Lanzamientos y eventos",
        text: "Capacitaciones y eventos con la gente confirmada.",
        items: [
          "Confirmación de asistencia, con cupo y fecha límite",
          "Recordatorio automático antes del evento",
          "Lista de asistentes para descargar",
        ],
      },
      {
        title: "Novedades",
        text: "Publicás y elegís si avisar a los comercios vinculados.",
        items: ["Notas con fotos para el canal", "Aviso opcional a los comercios al publicar"],
      },
      {
        title: "Materiales, capacitaciones y promociones",
        text: "Todo lo que el comercio necesita para vender tu producto.",
        items: [
          "Materiales públicos o solo para comercios vinculados",
          "Capacitaciones para el canal",
          "Promociones vigentes",
        ],
      },
      {
        title: "Comercios y equipo",
        text: "Quién trabaja tu marca y quién la gestiona.",
        items: [
          "Comercios vinculados y códigos de invitación",
          "Publicidad dentro del buscador",
          "Usuarios de tu equipo con permisos",
        ],
      },
    ],
  },
};
