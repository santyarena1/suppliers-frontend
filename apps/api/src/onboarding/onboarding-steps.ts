/**
 * Pasos del recorrido de comercio.
 *
 * `setup` = alta de la organización (solo si todavía no tiene una).
 * `tour` = guía dentro de la app: resalta un elemento (`spotlight`) en `href`.
 * `finish` = cierre.
 *
 * Cada paso pide una sola cosa. Los que se completan haciendo la acción
 * (`completeWhen`) avanzan solos cuando la persona la hace.
 *
 * `href` admite marcadores que el servicio completa con la demo de cada
 * comercio: `{demoSearch}` (una marca que está en los dos distribuidores demo),
 * `{demoProduct}` (`PROVEEDOR/externalId` de un producto demo) y `{demoProvider}`
 * (la clave de Demo Norte).
 */

import type { PlanCapabilityKey, TenantRole } from "@nodo/shared";

export type OnboardingStepId =
  | "org"
  | "welcome"
  | "search"
  | "filters"
  | "price-drops"
  | "local-prices"
  | "compare"
  | "add-to-cart"
  | "cart"
  | "orders"
  | "order-online"
  | "invoice"
  | "orders-stats"
  | "providers"
  | "provider-lists"
  | "provider-account"
  | "provider-sync"
  | "provider-config"
  | "provider-catalog"
  | "providers-stats"
  | "sale-margins"
  | "seller-view"
  | "quotes"
  | "team"
  | "done";

export type OnboardingStepKind = "setup" | "tour" | "finish";

/** Condición que la app detecta para dar el paso por hecho sin tocar "Siguiente". */
export type OnboardingCompletion = "cart-has-items";

export type OnboardingStep = {
  id: OnboardingStepId;
  kind: OnboardingStepKind;
  title: string;
  body: string;
  href: string | null;
  /** Selector CSS del elemento a resaltar (`data-tour="…"`). Sin selector, la tarjeta va centrada. */
  spotlight: string | null;
  ctaLabel: string;
  completeWhen?: OnboardingCompletion;
  roles?: TenantRole[];
  /** Solo si el plan del comercio lo incluye (p. ej. las estadísticas son de Pro). */
  capability?: PlanCapabilityKey;
  /**
   * Muestra costos (carrito, pedidos, facturas). Con modo vendedor, el vendedor
   * no ve costos y esas pantallas le quedan cerradas: el paso no le aparece.
   */
  costSensitive?: boolean;
  requiresTenant: boolean;
  /** Si ya tiene organización, no se muestra (configuración inicial). */
  skipIfExisting: boolean;
};

const MANAGERS: TenantRole[] = ["OWNER", "ADMIN"];

function tour(step: Omit<OnboardingStep, "kind" | "requiresTenant" | "skipIfExisting" | "ctaLabel"> & { ctaLabel?: string }): OnboardingStep {
  return { kind: "tour", requiresTenant: true, skipIfExisting: false, ctaLabel: "Siguiente", ...step };
}

export const RETAILER_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "org",
    kind: "setup",
    title: "Nombrá tu comercio",
    body: "La organización es tu local en NODO. El nombre es lo único que ven distribuidores y equipo.",
    href: null,
    spotlight: null,
    ctaLabel: "Crear y cargar demo",
    requiresTenant: false,
    skipIfExisting: true,
  },
  tour({
    id: "welcome",
    title: "Bienvenido a NODO",
    body: "Te armamos un local de práctica con dos distribuidores de prueba, productos reales, pedidos y facturas de ejemplo. Nada de esto se le manda a nadie. Te mostramos todo en unos 5 minutos.",
    href: "/",
    spotlight: null,
    ctaLabel: "Empezar",
  }),
  tour({
    id: "search",
    title: "Buscá una vez, te responden todos",
    body: "Una búsqueda consulta a todos tus distribuidores a la vez. El mismo producto aparece en Demo Norte y Demo Sur con distinto precio y stock: comparás sin abrir ningún portal.",
    href: "/search?q={demoSearch}",
    spotlight: '[data-tour="search-results"]',
  }),
  tour({
    id: "filters",
    title: "Filtrá el resultado",
    body: "Acá elegís distribuidor, marca, categoría o rango de precio, y ordenás por precio o stock. Probá elegir un solo distribuidor: el resultado cambia al instante.",
    href: "/search?q={demoSearch}",
    spotlight: '[data-tour="search-filters"]',
  }),
  tour({
    id: "price-drops",
    title: "Bajaron de precio",
    body: "Cada día te mostramos lo que bajó de precio en tus distribuidores, ordenado por cuánto bajó. Ideal para reponer o armar una oferta.",
    href: "/search",
    spotlight: '[data-tour="price-drops"]',
  }),
  tour({
    id: "local-prices",
    title: "¿A cuánto lo venden los locales?",
    body: "En la ficha de cada producto ves los precios de venta al público de locales y tiendas online, y tu margen contra ellos. Te sirve para poner tu precio.",
    href: "/product/{demoProduct}",
    spotlight: '[data-tour="local-prices"]',
  }),
  tour({
    id: "compare",
    title: "El comparador",
    body: "Poné lado a lado productos de distintos distribuidores (y de locales) para decidir. Te dejamos dos cargados: probá cambiar el modo de precio o sumar otro.",
    href: "/comparador",
    spotlight: '[data-tour="compare-board"]',
  }),
  tour({
    id: "add-to-cart",
    costSensitive: true,
    title: "Sumá un producto al carrito",
    body: "Tocá + en cualquier tarjeta. Apenas lo agregues, seguimos.",
    href: "/search?q={demoSearch}",
    spotlight: '[data-tour="add-to-cart"]',
    ctaLabel: "Ya lo agregué",
    completeWhen: "cart-has-items",
  }),
  tour({
    id: "cart",
    costSensitive: true,
    title: "Tu carrito, separado por distribuidor",
    body: "Cada distribuidor tiene su pedido con precios, IVA y percepciones. El carrito es del local: lo ve todo tu equipo. Desde acá confirmás el pedido o se lo mandás al vendedor.",
    href: "/cart",
    spotlight: '[data-tour="cart-list"]',
  }),
  tour({
    id: "orders",
    costSensitive: true,
    title: "Tus pedidos",
    body: "Acá queda todo lo que pediste: los que salieron por el portal del distribuidor y los que cargaste offline. Te dejamos varios de ejemplo de los últimos meses.",
    href: "/pedidos",
    spotlight: '[data-tour="orders-list"]',
  }),
  tour({
    id: "order-online",
    costSensitive: true,
    title: "Un pedido enviado al distribuidor",
    body: "Los pedidos online llevan el número que les dio el distribuidor, la forma de pago y de envío, y el detalle con IVA. Si cambia algo, lo ves acá.",
    href: "/pedidos",
    spotlight: '[data-tour="order-online"]',
  }),
  tour({
    id: "invoice",
    costSensitive: true,
    title: "La factura del pedido",
    body: "En la cuenta corriente de cada distribuidor ves sus facturas y tu saldo. Esta es la factura del pedido de recién: neto, IVA, percepciones y vencimiento.",
    href: "/proveedores/{demoProvider}?tab=demo-account",
    spotlight: '[data-tour="demo-invoice"]',
    roles: MANAGERS,
  }),
  tour({
    id: "orders-stats",
    title: "Estadísticas de tus compras",
    body: "Cuánto gastaste por mes, qué marcas y categorías comprás más, qué días pedís y cómo te llega. Se arma solo con tus pedidos.",
    href: "/proveedores",
    spotlight: '[data-tour="stats-spend"]',
    capability: "advancedAnalytics",
  }),
  tour({
    id: "providers",
    title: "Tus distribuidores",
    body: "Acá están todos tus distribuidores. Los reales se suman con tu usuario de cada uno, con su lista de precios en Excel o con el código que te da el vendedor.",
    href: "/proveedores",
    spotlight: '[data-tour="add-provider"]',
    roles: MANAGERS,
  }),
  tour({
    id: "provider-lists",
    title: "Configurar un distribuidor: su lista",
    body: "Si el distribuidor no tiene integración, subís su Excel tal como te lo manda. NODO entiende las columnas solo y te avisa cuándo vence la lista.",
    href: "/proveedores/{demoProvider}?tab=lists",
    spotlight: '[data-tour="provider-tab-content"]',
    roles: MANAGERS,
  }),
  tour({
    id: "provider-account",
    title: "Tu cuenta en el distribuidor",
    body: "Con los que tienen integración cargás tu usuario del portal y NODO trae tus precios y stock solo, cada hora.",
    href: "/proveedores/{demoProvider}?tab=credentials",
    spotlight: '[data-tour="provider-tab-content"]',
    roles: MANAGERS,
  }),
  tour({
    id: "provider-sync",
    title: "Sincronización",
    body: "Cada sincronización trae el catálogo con tus precios. Si el portal falla, te avisamos y sigue sola cuando se restablece.",
    href: "/proveedores/{demoProvider}?tab=sync",
    spotlight: '[data-tour="provider-tab-content"]',
    roles: MANAGERS,
  }),
  tour({
    id: "provider-config",
    title: "Configuración del distribuidor",
    body: "Tu margen, el stock mínimo, qué hacer con lo que no tiene stock, formas de envío y si le comprás offline o en esquema. Cada distribuidor con su regla.",
    href: "/proveedores/{demoProvider}?tab=config",
    spotlight: '[data-tour="provider-tab-content"]',
    roles: MANAGERS,
  }),
  tour({
    id: "provider-catalog",
    title: "Su catálogo",
    body: "Todo lo que te vende este distribuidor, con tu precio. Podés buscar adentro e incluir lo que está sin stock.",
    href: "/proveedores/{demoProvider}?tab=catalog",
    spotlight: '[data-tour="provider-tab-content"]',
    roles: MANAGERS,
  }),
  tour({
    id: "providers-stats",
    title: "Comparación entre distribuidores",
    body: "A quién le comprás más, cuánto pesa cada uno en tu gasto y cómo cambió respecto del período anterior.",
    href: "/proveedores",
    spotlight: '[data-tour="stats-providers"]',
    capability: "advancedAnalytics",
  }),
  tour({
    id: "sale-margins",
    title: "Tus márgenes de venta",
    body: "Con el modo vendedor ponés tu margen por distribuidor, por categoría o por producto. NODO calcula el precio de venta y tus vendedores ven solo ese precio, nunca tu costo. Los márgenes se cargan en cada distribuidor, en la pestaña Márgenes de venta.",
    href: "/configuracion",
    spotlight: '[data-tour="seller-mode"]',
    roles: MANAGERS,
    capability: "sellerMode",
  }),
  tour({
    id: "seller-view",
    title: "Mirá NODO como un vendedor",
    body: "Prendé este interruptor para ver la app exactamente como la ve un vendedor: precios de venta y sin compras. Lo apagás desde acá o desde el aviso de abajo.",
    href: "/configuracion",
    spotlight: '[data-tour="seller-view-toggle"]',
    roles: MANAGERS,
    capability: "sellerMode",
  }),
  tour({
    id: "quotes",
    title: "Presupuestos para tus clientes",
    body: "Armá un presupuesto con precios de venta, cargale el nombre y el teléfono del cliente y mandáselo por WhatsApp. Si lo acepta, lo pasás al carrito y comprás. Cada vendedor ve los suyos; vos, los de todo el equipo.",
    href: "/presupuestos",
    spotlight: '[data-tour="quotes-new"]',
    capability: "sellerMode",
  }),
  tour({
    id: "team",
    title: "Sumá a tu equipo",
    body: "Agregá compradores y vendedores. En Permisos decidís qué puede hacer cada uno, por ejemplo quién aprueba los pedidos.",
    href: "/equipo",
    spotlight: '[data-tour="team-add"]',
    roles: MANAGERS,
  }),
  {
    id: "done",
    kind: "finish",
    title: "Listo para operar",
    body: "Ya viste todo. Al terminar se van los datos de ejemplo y quedás con tu local limpio. Podés repetir este recorrido cuando quieras desde Configuración → Ayuda.",
    href: null,
    spotlight: null,
    ctaLabel: "Terminar",
    requiresTenant: true,
    skipIfExisting: false,
  },
];
