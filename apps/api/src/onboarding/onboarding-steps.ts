/**
 * Pasos del recorrido de comercio. `setup` = alta inicial (se salta si ya hay org).
 * `tour` = guía interactiva con spotlight en la app.
 */

import type { TenantRole } from "@nodo/shared";

export type OnboardingStepId =
  | "org"
  | "plan"
  | "providers"
  | "search"
  | "filters"
  | "product"
  | "cart"
  | "orders"
  | "team"
  | "done";

export type OnboardingStepKind = "setup" | "tour" | "finish";

export type OnboardingStep = {
  id: OnboardingStepId;
  kind: OnboardingStepKind;
  title: string;
  body: string;
  href: string | null;
  /** Selector CSS del elemento a resaltar en la app (`data-tour="…"`). */
  spotlight: string | null;
  ctaLabel: string;
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
    id: "plan",
    kind: "setup",
    title: "Plan Mostrador (gratis)",
    body: "Entrá con el plan gratuito: búsqueda unificada, listas, pedidos de ejemplo y hasta 3 usuarios. Local y Cadena se habilitan cuando publiquemos precios.",
    href: null,
    spotlight: null,
    ctaLabel: "Entendido, ver la app",
    requiresTenant: true,
    skipIfExisting: true,
  },
  {
    id: "providers",
    kind: "tour",
    title: "Tus distribuidores",
    body: "Solo ves a quien está vinculado. Tocá Proveedores: ahí están Demo Norte y Demo Sur. Después los reemplazás canjeando un código real.",
    href: "/proveedores",
    spotlight: '[data-tour="nav-proveedores"]',
    ctaLabel: "Mostrame proveedores",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "search",
    kind: "tour",
    title: "Buscá un producto",
    body: "Escribí «monitor», «logitech» o «ssd» en el buscador. Una sola pantalla junta ambos distros demo.",
    href: "/search?q=monitor",
    spotlight: '[data-tour="search-input"]',
    ctaLabel: "Probar la búsqueda",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "filters",
    kind: "tour",
    title: "Filtros por marca, categoría y proveedor",
    body: "Usá los filtros de categoría, marca y distribuidor. Probá Redragon o Kingston para ver cómo se achica el resultado.",
    href: "/search?q=teclado&marca=Redragon",
    spotlight: '[data-tour="search-filters"]',
    ctaLabel: "Ver filtros",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "product",
    kind: "tour",
    title: "Ficha del producto",
    body: "Abrí una card: el precio y el stock son de tu comercio; nombre y marca son globales.",
    href: "/search?q=mouse",
    spotlight: '[data-tour="product-card"]',
    ctaLabel: "Abrir un producto",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "cart",
    kind: "tour",
    title: "Armá el carrito",
    body: "Sumá unidades y mirá el carrito de la organización: es el mismo para todo el equipo del local.",
    href: "/cart",
    spotlight: '[data-tour="nav-cart"]',
    ctaLabel: "Ir al carrito",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "orders",
    kind: "tour",
    title: "Pedidos de ejemplo",
    body: "En Pedidos hay dos offline de demostración (uno por distro). Ahí se entiende el historial y la aprobación si sumás un vendedor.",
    href: "/pedidos",
    spotlight: '[data-tour="nav-pedidos"]',
    ctaLabel: "Ver pedidos",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "team",
    kind: "tour",
    title: "Invitá a tu equipo",
    body: "Desde Equipo creás compradores o vendedores. Cada persona nueva también pasa por este recorrido la primera vez.",
    href: "/equipo",
    spotlight: '[data-tour="nav-equipo"]',
    ctaLabel: "Abrir equipo",
    roles: ["OWNER", "ADMIN"],
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "done",
    kind: "finish",
    title: "Listo para operar",
    body: "Cerrá el recorrido cuando quieras. Podés reabrirlo desde Configuración → Ayuda. El catálogo demo se puede regenerar.",
    href: null,
    spotlight: null,
    ctaLabel: "Terminar recorrido",
    requiresTenant: true,
    skipIfExisting: false,
  },
];
