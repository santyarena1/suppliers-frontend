/**
 * Pasos del recorrido de comercio.
 *
 * `setup` = alta de la organización (solo si todavía no tiene una).
 * `tour` = guía dentro de la app: resalta un elemento (`spotlight`) en `href`.
 * `finish` = cierre.
 *
 * Cada paso pide una sola cosa. Los que se completan haciendo la acción
 * (`completeWhen`) avanzan solos cuando la persona la hace.
 */

import type { TenantRole } from "@nodo/shared";

export type OnboardingStepId =
  | "org"
  | "welcome"
  | "search"
  | "add-to-cart"
  | "cart"
  | "orders"
  | "providers"
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
  requiresTenant: boolean;
  /** Si ya tiene organización, no se muestra (configuración inicial). */
  skipIfExisting: boolean;
};

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
  {
    id: "welcome",
    kind: "tour",
    title: "Bienvenido a NODO",
    body: "Te cargamos dos distribuidores de prueba con productos reales para que pruebes sin miedo: nada de esto se le manda a nadie. Son 2 minutos.",
    href: "/",
    spotlight: null,
    ctaLabel: "Empezar",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "search",
    kind: "tour",
    title: "Buscá una vez, te responden todos",
    body: "Una búsqueda consulta a todos tus distribuidores a la vez. Fijate que el mismo mouse aparece en Demo Norte y Demo Sur con distinto precio y stock.",
    href: "/search?q=logitech",
    spotlight: '[data-tour="search-results"]',
    ctaLabel: "Siguiente",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "add-to-cart",
    kind: "tour",
    title: "Sumá un producto al carrito",
    body: "Tocá + en cualquier tarjeta. Apenas lo agregues, seguimos.",
    href: "/search?q=logitech",
    spotlight: '[data-tour="add-to-cart"]',
    ctaLabel: "Ya lo agregué",
    completeWhen: "cart-has-items",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "cart",
    kind: "tour",
    title: "Tu carrito, separado por distribuidor",
    body: "Cada distribuidor tiene su pedido con precios, IVA y percepciones. El carrito es del local: lo ve todo tu equipo.",
    href: "/cart",
    spotlight: '[data-tour="cart-list"]',
    ctaLabel: "Siguiente",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "orders",
    kind: "tour",
    title: "Tus pedidos",
    body: "Acá queda el historial de todo lo que pediste. Te dejamos dos pedidos de ejemplo para que veas cómo se ven.",
    href: "/pedidos",
    spotlight: '[data-tour="orders-list"]',
    ctaLabel: "Siguiente",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "providers",
    kind: "tour",
    title: "Conectá tus distribuidores reales",
    body: "Cuando quieras operar de verdad, agregá tus distribuidores con tu usuario de cada uno o subí su lista de precios.",
    href: "/proveedores",
    spotlight: '[data-tour="add-provider"]',
    ctaLabel: "Siguiente",
    roles: ["OWNER", "ADMIN"],
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "team",
    kind: "tour",
    title: "Sumá a tu equipo",
    body: "Agregá compradores y vendedores. En Permisos decidís qué puede hacer cada uno.",
    href: "/equipo",
    spotlight: '[data-tour="team-add"]',
    ctaLabel: "Siguiente",
    roles: ["OWNER", "ADMIN"],
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "done",
    kind: "finish",
    title: "Listo para operar",
    body: "Ya sabés lo básico. Podés repetir este recorrido cuando quieras desde Configuración → Ayuda.",
    href: null,
    spotlight: null,
    ctaLabel: "Terminar",
    requiresTenant: true,
    skipIfExisting: false,
  },
];
