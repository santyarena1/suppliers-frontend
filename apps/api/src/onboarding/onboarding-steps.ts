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
    body: "Ese nombre es lo que ven tus distribuidores y tu equipo. Después NODO te vincula los que ya usás y cargás la cuenta de cada portal para ver tus precios.",
    href: null,
    spotlight: null,
    ctaLabel: "Crear y cargar demo",
    requiresTenant: false,
    skipIfExisting: true,
  },
  {
    id: "plan",
    kind: "setup",
    title: "Plan PRO",
    body: "Tu comercio ya está creado. Lo que sigue es un recorrido de práctica: dos distribuidores y productos de ejemplo. No son los tuyos. Al terminar, desaparecen.",
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
    body: "Solo ves a quien está vinculado. Demo Norte y Demo Sur son de práctica. Los reales los vincula NODO: cuando aparezcan, en cada uno tocás Cargar cuenta con el usuario y la clave del portal.",
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
    body: "Escribí «monitor», «logitech» o «ssd». Las tarjetas son de práctica: foto, precio y stock de los dos distribuidores demo, no de tu cuenta real.",
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
    body: "Usá los filtros de categoría, marca y distribuidor. Probá Redragon o Kingston para achicar el resultado.",
    href: "/search?q=teclado&marca=Redragon",
    spotlight: '[data-tour="search-filters"]',
    ctaLabel: "Ver filtros",
    requiresTenant: true,
    skipIfExisting: false,
  },
  {
    id: "product",
    kind: "tour",
    title: "Grilla de productos",
    body: "Mirá las tarjetas: foto, marca, precio y stock de tu comercio. Abrí una para ver la ficha completa.",
    href: "/search?q=logitech",
    spotlight: '[data-tour="search-results"]',
    ctaLabel: "Ver resultados",
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
    body: "El recorrido de práctica termina acá. Cuando NODO te vincule tus distribuidores, entrá a Proveedores y en cada uno tocá Cargar cuenta. Recién ahí ves tus precios y tu stock. Podés reabrir esta guía desde Configuración → Ayuda.",
    href: null,
    spotlight: null,
    ctaLabel: "Terminar recorrido",
    requiresTenant: true,
    skipIfExisting: false,
  },
];
