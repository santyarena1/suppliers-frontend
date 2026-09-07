# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tres tipos de organización, cada una con su propia experiencia dentro de la misma app:

- **Comercios (Tipo 1 / RETAILER):** locales de informática/tecnología en Argentina que compran a distribuidores. Buscan y comparan productos entre proveedores, arman carritos por proveedor, cargan pedidos offline o por esquema, y gestionan sus credenciales de cada portal de distribuidor.
- **Distribuidores (Tipo 2 / DISTRIBUTOR):** proveedores mayoristas (Elit, Invid, New Bytes, Air, New Tree, Grupo Núcleo, Solution Box, y otros que llegan por planilla). Ven solo su propio catálogo sincronizado.
- **Marcas (Tipo 3 / BRAND):** fabricantes/marcas que quieren visibilidad de dónde y a qué precio se vende su producto entre los distribuidores, con mapa de SKUs, semáforo de precio sugerido y materiales.
- **Administración de plataforma (superadmin):** rol interno que necesita ver y operar sobre todos los distribuidores sin depender de un vínculo comercial.

## Product Purpose

Nodo agrega el catálogo de múltiples distribuidores de tecnología (sincronizado por API o por planilla Excel/CSV cuando el proveedor no tiene API) en una sola búsqueda y un solo carrito multi-proveedor, para que un comercio no tenga que entrar a 10 portales distintos para comprar, comparar precios y hacer seguimiento de pedidos.

## Positioning

Ningún competidor directo conocido unifica: (a) sincronización real por API con adapters propios por distribuidor, (b) ingestión de listas de precios por Excel con detección automática de estructura y mapeo asistido por IA, y (c) checkout real dentro de la propia app (no solo comparación) con historial de pedidos, cuenta corriente y facturas leídos directamente de cada portal de distribuidor.

## Operating Context

- El comercio recibe listas de precio por WhatsApp o mail de sus distribuidores 2 a 4 veces por semana; hoy las carga a mano en Nodo.
- Un mismo distribuidor puede ofrecer dos canales de precio: API (sincronización automática) o Lista (Excel cargado por el comercio o por el distribuidor); el canal se configura por vínculo comercio-distribuidor.
- El checkout varía por distribuidor: algunos permiten compra real dentro de Nodo (carrito → pedido en el portal del distribuidor), otros que cotizan por lista solo generan un pedido "offline" (mensaje para el vendedor) porque no tienen checkout online.
- Impuestos (IVA, IIBB, otras percepciones) a veces vienen del propio distribuidor al cotizar el carrito, y a veces hay que cargarlos a mano en Configuración porque el distribuidor no los informa (compras por lista) o el comercio quiere pisar lo que cotiza el portal.
- Hay chat interno entre comercio y vendedor asignado del distribuidor.

## Capabilities and Constraints

- Next.js 15 (App Router) + React 19 + Tailwind CSS 3, cliente Axios (`lib/api.ts`), auth JWT en localStorage.
- El backend (NestJS + Fastify + Prisma/Postgres, repo hermano `apps/api`) hace todo el trabajo pesado: sync de proveedores, checkout, IA de catálogo. Este proyecto (`apps/web`) es el frontend.
- Proveedores conocidos con adapter propio y proveedores "por lista" (`LIST_<SLUG>`) conviven bajo el mismo tipo `Provider` (string abierto), no un enum cerrado.
- Roles y permisos varían fuerte: lo que ve un comercio, un distribuidor, una marca y un superadmin es distinto en las mismas rutas.
- Tema actual: dark-first con tokens `surface-*` / `brand-*` de Tailwind ya en uso en todo el código (ver Evidence on Hand).

## Evidence on Hand

- Implementación visual incumbente completa en `apps/web/app` y `apps/web/components` (dark UI, tokens `surface-*`/`brand-*`, ya en producción con usuarios reales). Es la autoridad visual actual: cualquier refinamiento parte de ahí; un rediseño la trata como evidencia y anti-referencia, no como punto de partida a preservar.
- Sin capturas de pantalla ni research de usuario documentado fuera del código. No inventar testimonios, métricas de uso ni casos de éxito.
- Contrato de API real documentado en `API_CONTRACT.md` (raíz del repo) y contexto de negocio en `CLAUDE.md` / `apps/web/CLAUDE.md`.

## Product Principles

1. Un solo lugar para comparar y comprar entre distribuidores, sin perder ninguna función de portal que el comercio ya usaba (checkout, cuenta corriente, facturas).
2. Nunca inventar un dato de precio, stock o impuesto que el distribuidor no informó: mostrar el hueco o pedirlo, no adivinarlo.
3. El rol del usuario decide qué ve, no una sola vista genérica: comercio, distribuidor, marca y superadmin son experiencias distintas sobre el mismo dato.
4. Cuando un distribuidor no tiene API, el camino de planilla debe sentirse tan cuidado como el de sincronización automática, no como un parche.

## Accessibility & Inclusion

Sin requisito de accesibilidad específico confirmado todavía. Público es profesional B2B (dueños/empleados de comercios de tecnología en Argentina), no público general.
