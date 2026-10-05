import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, Plug, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import "../landing/nodo-landing.css";
import "./developers.css";
import { Footer } from "@/components/marketing/Footer";
import { Nav } from "@/components/marketing/Nav";
import { CodeBlock, CodeTabs } from "@/components/developers/CodeTabs";
import { DocsNav, type DocsNavGroup } from "@/components/developers/DocsNav";
import {
  API_BASE,
  ERROR_RESPONSE,
  OFFER_RESPONSE,
  PRODUCT_RESPONSE,
  RATE_LIMIT_HEADERS,
  WEBHOOK_PAYLOAD,
  basicAuth,
  changesLoop,
  firstRequest,
  pagination,
  verifySignature,
} from "@/components/developers/docs-content";
import { CATALOG_API_ADDON_PRICE_USD, CATALOG_API_SCOPE_LABELS, CATALOG_API_SCOPES, CATALOG_API_WEBHOOK_EVENT_LABELS, CATALOG_API_WEBHOOK_EVENTS } from "@/lib/catalog-api";

export const metadata: Metadata = {
  title: "API de catálogo | NODO para desarrolladores",
  description:
    "Integrá el catálogo de todos tus distribuidores en tu tienda, ERP, Google Merchant o Meta: productos, precios con impuestos, stock, webhooks y cambios incrementales.",
};

const NAV: DocsNavGroup[] = [
  {
    title: "Empezar",
    items: [
      { id: "introduccion", label: "Introducción" },
      { id: "inicio-rapido", label: "Inicio rápido" },
      { id: "autenticacion", label: "Autenticación" },
      { id: "errores", label: "Errores" },
      { id: "limites", label: "Límites" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { id: "paginacion", label: "Paginación" },
      { id: "vistas", label: "Productos y ofertas" },
      { id: "filtros", label: "Filtros y orden" },
      { id: "ids", label: "Ids estables" },
      { id: "precios", label: "Precios e impuestos" },
      { id: "monedas", label: "Monedas y cotización" },
      { id: "frescura", label: "Frescura de los datos" },
      { id: "endpoints", label: "Endpoints" },
    ],
  },
  {
    title: "Mantenerse al día",
    items: [
      { id: "cambios", label: "Cambios incrementales" },
      { id: "webhooks", label: "Webhooks" },
      { id: "export", label: "Exportar" },
      { id: "feeds", label: "Feeds Google y Meta" },
    ],
  },
  {
    title: "Más",
    items: [
      { id: "buenas-practicas", label: "Buenas prácticas" },
      { id: "referencia", label: "Referencia interactiva" },
      { id: "changelog", label: "Cambios de versión" },
    ],
  },
];

const ERRORS: [string, number, string][] = [
  ["missing_credentials", 401, "Faltan la key o el secret."],
  ["invalid_credentials", 401, "La key no existe o el secret no coincide."],
  ["key_revoked", 401, "La key fue revocada."],
  ["key_expired", 401, "La key venció."],
  ["addon_required", 402, "La organización no tiene activo el módulo de API de catálogo."],
  ["subscription_suspended", 402, "La suscripción de la organización está suspendida."],
  ["ip_not_allowed", 403, "La IP del pedido no está en la lista permitida de la key."],
  ["insufficient_scope", 403, "La key no tiene el permiso que pide el endpoint."],
  ["not_found", 404, "El recurso no existe o no es visible para esta key."],
  ["invalid_parameter", 400, "Un parámetro tiene un valor inválido. El mensaje dice cuál."],
  ["invalid_cursor", 400, "El cursor está mal formado o es de otro endpoint."],
  ["cursor_expired", 410, "El cursor de cambios tiene más de 30 días: hacé un export completo y arrancá de nuevo."],
  ["feed_link_required", 422, "Para los feeds hace falta configurar el link de producto de tu tienda."],
  ["rate_limited", 429, "Pasaste el límite por minuto. Esperá lo que indica Retry-After."],
  ["internal_error", 500, "Error nuestro. Reintentá con backoff; el requestId nos ayuda a encontrarlo."],
];

const ENDPOINTS: [string, string, string, string][] = [
  ["GET", "/v1/me", "—", "Tu key: nombre, permisos, configuración efectiva, límites y estado del módulo."],
  ["GET", "/v1/products", "catalog:read", "Productos agrupados (mismo producto de varios distribuidores en una fila)."],
  ["GET", "/v1/products/{productId}", "catalog:read", "Un producto con todas sus ofertas."],
  ["GET", "/v1/offers", "catalog:read", "Una fila por producto y distribuidor."],
  ["GET", "/v1/offers/{offerId}", "catalog:read", "Una oferta."],
  ["GET", "/v1/offers/{offerId}/price-history", "catalog:read", "Cambios de precio de los últimos 12 meses."],
  ["GET", "/v1/changes", "changes:read", "Feed de cambios desde un cursor."],
  ["GET", "/v1/brands", "catalog:read", "Marcas con cantidad de productos."],
  ["GET", "/v1/categories", "catalog:read", "Árbol de categorías con conteos."],
  ["GET", "/v1/providers", "catalog:read", "Tus distribuidores (o sus alias) y el estado de su sincronización."],
  ["GET", "/v1/fx", "—", "Cotizaciones disponibles y la que usa tu key."],
  ["GET", "/v1/export", "export:read", "Catálogo completo en CSV, XLSX o JSON."],
  ["GET", "/v1/feeds/{feedToken}/google.xml", "feeds:read", "Feed de Google Merchant."],
  ["GET", "/v1/feeds/{feedToken}/meta.csv", "feeds:read", "Feed del catálogo de Meta."],
  ["GET", "/v1/webhooks", "webhooks:manage", "Tus webhooks."],
  ["POST", "/v1/webhooks", "webhooks:manage", "Crear un webhook."],
  ["PATCH", "/v1/webhooks/{id}", "webhooks:manage", "Cambiar URL, eventos o pausarlo."],
  ["DELETE", "/v1/webhooks/{id}", "webhooks:manage", "Borrar un webhook."],
  ["POST", "/v1/webhooks/{id}/test", "webhooks:manage", "Mandar un evento ping de prueba."],
  ["GET", "/v1/openapi.json", "público", "Especificación OpenAPI 3.1."],
];

const FILTERS: [string, string][] = [
  ["q", "Texto libre: nombre, marca, SKU, part number o EAN."],
  ["brand · category · subcategory", "Id o nombre canónico (los de /v1/brands y /v1/categories)."],
  ["provider", "Id del distribuidor (prv_…). Varios separados por coma."],
  ["inStock", "true para solo productos con stock."],
  ["minPrice · maxPrice", "Sobre el precio de venta con impuestos, en la moneda de la key."],
  ["ean · partNumber", "Búsqueda exacta (normalizada)."],
  ["updatedSince", "ISO 8601. Solo lo que cambió desde esa fecha."],
  ["sort", "relevance · name · price · -price · updatedAt · -updatedAt (el - invierte)."],
  ["limit", "De 1 a 500. Por defecto 100."],
  ["view", "products u offers. Pisa la vista por defecto de la key."],
];

export default function DevelopersPage() {
  return (
    <div className="nl dv">
      <Nav />
      <main className="relative z-[1]">
        <header className="dv-hero">
          <div className="nl-shell">
            <p className="nl-kicker">NODO para desarrolladores · API v1</p>
            <h1 className="dv-hero__title mt-3">API de catálogo</h1>
            <p className="nl-lead mt-5">
              Todos los distribuidores de tu comercio en una sola API: ficha completa, fotos, precio con impuestos y tu margen, stock y
              frescura de cada dato. Para tu tienda online, tu ERP, Google Merchant o Meta.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#inicio-rapido" className="nl-btn nl-btn--primary">
                Hacer el primer pedido <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <Link href="/developers/referencia" className="nl-btn nl-btn--ghost">
                Referencia interactiva
              </Link>
            </div>
            <div className="dv-hero__meta">
              <span>
                Base URL <code>{API_BASE}</code>
              </span>
              <span>JSON · UTF-8 · OpenAPI 3.1</span>
              <span>
                Módulo de US$ {CATALOG_API_ADDON_PRICE_USD}/mes · incluido en Custom
              </span>
            </div>
          </div>
        </header>

        <div className="nl-shell dv-layout">
          <aside>
            <DocsNav groups={NAV} />
          </aside>

          <article className="dv-main">
            <details className="dv-mobile-toc">
              <summary>Índice</summary>
              <DocsNav groups={NAV} />
            </details>

            <section id="introduccion" className="dv-section">
              <h2>Introducción</h2>
              <p>
                La API expone el catálogo de <strong>tu</strong> comercio tal como lo ves en NODO: los distribuidores que tenés
                conectados, con tus precios, tus percepciones y tu margen. Cada key es de una organización y nunca ve el catálogo de
                otra.
              </p>
              <div className="dv-cards">
                <div className="dv-card">
                  <Zap className="h-4 w-4 text-[var(--accent-2)]" aria-hidden />
                  <h4>Actualizada todo el día</h4>
                  <p>Precio y stock salen de la última sincronización con cada distribuidor, que NODO corre de forma continua.</p>
                </div>
                <div className="dv-card">
                  <ShieldCheck className="h-4 w-4 text-[var(--accent-2)]" aria-hidden />
                  <h4>Sin caídas ni datos a medias</h4>
                  <p>Si un distribuidor se cae, la API sigue respondiendo con el último dato bueno y te dice qué tan fresco es.</p>
                </div>
                <div className="dv-card">
                  <Plug className="h-4 w-4 text-[var(--accent-2)]" aria-hidden />
                  <h4>Se integra con todo</h4>
                  <p>REST con JSON, webhooks firmados, cambios incrementales, exportación y feeds de Google y Meta.</p>
                </div>
              </div>
              <p>
                Las keys se crean en NODO, en <strong>Configuración → API de catálogo</strong>. Ahí también elegís qué ve cada key:
                qué distribuidores, si se ve el costo, qué margen aplicar, en qué moneda y si se muestra el nombre del distribuidor.
              </p>
            </section>

            <section id="inicio-rapido" className="dv-section">
              <h2>Inicio rápido</h2>
              <div className="dv-steps">
                <div className="dv-step">
                  <h3>Activá el módulo y creá una key</h3>
                  <p>
                    En Configuración → API de catálogo. Al crearla vas a ver el <code>secret</code> una sola vez: guardalo en una variable
                    de entorno (<code>NODO_API_SECRET</code>).
                  </p>
                </div>
                <div className="dv-step">
                  <h3>Hacé el primer pedido</h3>
                  <CodeTabs samples={firstRequest()} />
                </div>
                <div className="dv-step">
                  <h3>Recibís productos con todas sus ofertas</h3>
                  <CodeBlock title="200 OK · application/json" code={PRODUCT_RESPONSE} />
                </div>
              </div>
            </section>

            <section id="autenticacion" className="dv-section">
              <h2>Autenticación</h2>
              <p>
                Cada key tiene una parte pública (<code>nodo_pk_…</code>) y un secret (<code>nodo_sk_…</code>). Mandalos en cada pedido
                por HTTPS de cualquiera de estas dos formas, que son equivalentes:
              </p>
              <ul className="dv-list">
                <li>
                  Headers <code>X-Api-Key</code> y <code>X-Api-Secret</code>.
                </li>
                <li>
                  HTTP Basic: usuario = key, contraseña = secret. Sirve para herramientas que solo aceptan Basic.
                </li>
              </ul>
              <CodeTabs samples={basicAuth()} />
              <div className="dv-callout dv-callout--warn">
                <TriangleAlert className="dv-callout__icon h-4 w-4" aria-hidden />
                <p>
                  El secret es de tu servidor. <strong>Nunca</strong> lo pongas en el código que corre en el navegador o en una app:
                  cualquiera podría leerlo. Si tu tienda necesita el catálogo en el navegador, pasalo por tu backend.
                </p>
              </div>
              <h3>Permisos (scopes)</h3>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>Scope</th>
                      <th>Para qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATALOG_API_SCOPES.map((s) => (
                      <tr key={s}>
                        <td>
                          <code>{s}</code>
                        </td>
                        <td>{CATALOG_API_SCOPE_LABELS[s]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Rotar el secret sin cortes</h3>
              <p>
                Al rotar, NODO te da un secret nuevo y el anterior <strong>sigue funcionando 24 horas</strong>. Actualizá tus sistemas
                en ese rato. También podés limitar cada key a ciertas IPs (acepta rangos CIDR) y ponerle vencimiento.
              </p>
            </section>

            <section id="errores" className="dv-section">
              <h2>Errores</h2>
              <p>
                Los errores usan los códigos HTTP de siempre y un cuerpo con un <code>code</code> estable para que tu código decida, un
                mensaje en español y el <code>requestId</code> del pedido (también en el header <code>X-Request-Id</code>).
              </p>
              <CodeBlock title="403 Forbidden" code={ERROR_RESPONSE} />
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>code</th>
                      <th>HTTP</th>
                      <th>Qué pasó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ERRORS.map(([code, status, text]) => (
                      <tr key={code}>
                        <td>
                          <code>{code}</code>
                        </td>
                        <td>{status}</td>
                        <td>{text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="limites" className="dv-section">
              <h2>Límites</h2>
              <p>
                Cada key puede hacer <strong>120 pedidos por minuto</strong> por defecto (si necesitás más, escribinos). Cada respuesta
                dice cuántos te quedan:
              </p>
              <CodeBlock code={RATE_LIMIT_HEADERS} />
              <p>
                Si te pasás, recibís <code>429 rate_limited</code> con el header <code>Retry-After</code> en segundos. Para traer todo el
                catálogo usá <code>limit=500</code> o el export, no miles de pedidos chicos.
              </p>
            </section>

            <section id="paginacion" className="dv-section">
              <h2>Paginación</h2>
              <p>
                Las listas se paginan con cursor: pedís, y si <code>pagination.hasMore</code> es <code>true</code>, volvés a pedir con
                <code>cursor=pagination.nextCursor</code>. El cursor es opaco (no lo armes a mano) y mantiene el orden aunque el
                catálogo cambie mientras recorrés.
              </p>
              <CodeTabs samples={pagination()} />
            </section>

            <section id="vistas" className="dv-section">
              <h2>Productos y ofertas</h2>
              <p>El catálogo se puede leer de dos formas. Cada key tiene una vista por defecto y podés pisarla con <code>?view=</code>.</p>
              <ul className="dv-list">
                <li>
                  <strong>Productos</strong> (<code>/v1/products</code>): el mismo producto de varios distribuidores es una sola fila, con
                  la mejor oferta, el rango de precios, el stock sumado y la lista de ofertas. Ideal para una tienda online.
                </li>
                <li>
                  <strong>Ofertas</strong> (<code>/v1/offers</code>): una fila por producto y distribuidor, como la búsqueda de NODO.
                  Ideal para un ERP o para comparar.
                </li>
              </ul>
              <p>
                Dos ofertas son el mismo producto cuando comparten <strong>EAN</strong> válido o, si no lo tienen, la misma{" "}
                <strong>marca y part number</strong> normalizados. Un producto trae la ficha completa: nombre, marca y categoría
                canónicas, EAN, part number, SKU, descripciones, todas las fotos, garantía, peso, medidas y etiquetas.
              </p>
              <h3>Una oferta</h3>
              <CodeBlock code={OFFER_RESPONSE} />
            </section>

            <section id="filtros" className="dv-section">
              <h2>Filtros y orden</h2>
              <p>
                <code>/v1/products</code> y <code>/v1/offers</code> aceptan los mismos parámetros. Se combinan con AND.
              </p>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>Parámetro</th>
                      <th>Qué hace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FILTERS.map(([p, t]) => (
                      <tr key={p}>
                        <td>
                          <code>{p}</code>
                        </td>
                        <td>{t}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="ids" className="dv-section">
              <h2>Ids estables</h2>
              <p>Los ids no cambian entre pedidos ni entre sincronizaciones: usalos como clave en tu base.</p>
              <ul className="dv-list">
                <li>
                  <code>off_…</code> identifica una oferta (producto de un distribuidor). No revela qué distribuidor es.
                </li>
                <li>
                  <code>prd_…</code> identifica un producto agrupado. Si un producto que estaba solo suma una oferta de otro distribuidor
                  con el mismo EAN, mantiene su id.
                </li>
                <li>
                  <code>prv_…</code> identifica a un distribuidor. Con el nombre oculto, sale como «Proveedor 1, 2…» con un id que no
                  cambia, para que tu web no muestre de quién comprás.
                </li>
              </ul>
            </section>

            <section id="precios" className="dv-section">
              <h2>Precios e impuestos</h2>
              <p>Según la configuración de la key, cada oferta trae:</p>
              <ul className="dv-list">
                <li>
                  <strong>cost</strong>: lo que te cobra el distribuidor. <code>net</code> sin impuestos, <code>taxes</code> con cada
                  impuesto desglosado (IVA, impuestos internos y tus percepciones, con alícuota y monto) y <code>gross</code> final.
                </li>
                <li>
                  <strong>sale</strong>: tu precio de venta = costo más tu margen (el que usás en NODO para cada distribuidor, o uno fijo
                  para la key), redondeado como elijas.
                </li>
              </ul>
              <p>
                Los impuestos se calculan con la misma lógica que la pantalla de NODO: lo que ves en el sistema y lo que devuelve la API
                siempre coinciden. Si una key alimenta una web pública, apagá el costo y dejá solo el precio de venta.
              </p>
            </section>

            <section id="monedas" className="dv-section">
              <h2>Monedas y cotización</h2>
              <p>
                Los precios salen en <strong>USD</strong> o en <strong>ARS</strong>. En pesos, la key usa la cotización que elijas
                (oficial, blue, MEP, tarjeta o una fija). La cotización se actualiza cada 10 minutos y cada respuesta dice cuál usó en{" "}
                <code>meta.fx</code>. Si el servicio de cotizaciones no responde, se usa la última conocida y <code>meta.fx.stale</code>{" "}
                vale <code>true</code>.
              </p>
            </section>

            <section id="frescura" className="dv-section">
              <h2>Frescura de los datos</h2>
              <div className="dv-callout dv-callout--good">
                <ShieldCheck className="dv-callout__icon h-4 w-4" aria-hidden />
                <p>
                  <strong>La API nunca devuelve datos a medias.</strong> Los portales de algunos distribuidores se caen o responden
                  incompleto; NODO no expone ese estado intermedio. Mientras un distribuidor no responde, sus ofertas siguen con el último
                  dato bueno y te avisamos que no está al día.
                </p>
              </div>
              <ul className="dv-list">
                <li>
                  <code>freshness.syncedAt</code>: cuándo se confirmó ese precio y stock con el distribuidor.
                </li>
                <li>
                  <code>freshness.stale</code>: <code>true</code> si pasó más tiempo del normal sin poder actualizarlo.
                </li>
                <li>
                  <code>freshness.providerSync</code>: <code>ok</code>, <code>error</code> (reintentando) o <code>paused</code>.{" "}
                  <code>/v1/providers</code> trae el detalle por distribuidor.
                </li>
              </ul>
              <p>
                Con esto podés decidir, por ejemplo, no vender online lo que esté <code>stale</code>, o mostrarlo como «a confirmar».
              </p>
            </section>

            <section id="endpoints" className="dv-section">
              <h2>Endpoints</h2>
              <p>
                Todos bajo <code>{API_BASE}</code>. El detalle de cada uno, con parámetros y esquemas, está en la{" "}
                <Link href="/developers/referencia">referencia interactiva</Link>.
              </p>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Scope</th>
                      <th>Devuelve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map(([method, path, scope, text]) => (
                      <tr key={`${method} ${path}`}>
                        <td>
                          <span className={`dv-method dv-method--${method.toLowerCase()}`}>{method}</span>{" "}
                          <code>{path}</code>
                        </td>
                        <td>
                          <code>{scope}</code>
                        </td>
                        <td>{text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="cambios" className="dv-section">
              <h2>Cambios incrementales</h2>
              <p>
                Para mantener tu base al día sin bajar todo el catálogo, usá <code>/v1/changes</code>. Cada cambio es un{" "}
                <code>offer.created</code>, <code>offer.updated</code> u <code>offer.removed</code> con la oferta completa (o solo su id
                si salió). Una oferta sale cuando el distribuidor la da de baja, se queda sin stock (si tu key no incluye sin stock) o
                desconectás al distribuidor.
              </p>
              <CodeTabs samples={changesLoop()} />
              <div className="dv-callout dv-callout--accent">
                <Info className="dv-callout__icon h-4 w-4" aria-hidden />
                <p>
                  <code>/v1/changes</code> sin cursor te devuelve el cursor de ahora. El flujo recomendado: pedís el cursor, hacés el
                  export completo y después consumís cambios desde ese cursor. Un cursor de más de 30 días responde{" "}
                  <code>410 cursor_expired</code>.
                </p>
              </div>
            </section>

            <section id="webhooks" className="dv-section">
              <h2>Webhooks</h2>
              <p>
                En vez de preguntar, NODO te avisa. Configurás una URL <strong>https</strong> y los eventos que te interesan (desde la
                pantalla de la key o por API con <code>webhooks:manage</code>). Los cambios llegan en lotes de hasta 100 en un evento{" "}
                <code>catalog.changes</code>, más o menos un minuto después de que NODO los detecta.
              </p>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATALOG_API_WEBHOOK_EVENTS.map((ev) => (
                      <tr key={ev}>
                        <td>
                          <code>{ev}</code>
                        </td>
                        <td>{CATALOG_API_WEBHOOK_EVENT_LABELS[ev]}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <code>ping</code>
                      </td>
                      <td>Prueba manual desde NODO.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <CodeBlock title="Lo que recibe tu servidor" code={WEBHOOK_PAYLOAD} />
              <h3>Verificar la firma</h3>
              <p>
                Cada evento viene firmado en <code>Nodo-Signature</code> con HMAC-SHA256 de <code>{"{t}.{cuerpo}"}</code> y el signing
                secret del webhook. Verificala siempre con el cuerpo crudo, antes de parsear el JSON, y rechazá eventos de más de 5
                minutos para evitar repeticiones.
              </p>
              <CodeTabs samples={verifySignature()} />
              <h3>Reintentos</h3>
              <p>
                Tu servidor tiene que responder <code>2xx</code> en menos de 10 segundos (respondé rápido y procesá en segundo plano).
                Si no, reintentamos a los 1 min, 5 min, 30 min, 2 h, 6 h, 12 h y 24 h. Usá <code>Nodo-Event-Id</code> para no procesar
                dos veces el mismo evento. Tras 20 fallos seguidos el webhook se deshabilita y le avisamos al dueño de la cuenta;
                después de arreglarlo, se reactiva desde NODO y se ponen al día los cambios pendientes.
              </p>
            </section>

            <section id="export" className="dv-section">
              <h2>Exportar</h2>
              <p>
                <code>GET /v1/export?format=csv|xlsx|json&amp;view=products|offers</code> devuelve el catálogo completo con la
                configuración de la key y los mismos filtros que las listas. Se envía en stream: empieza a llegar enseguida aunque sean
                decenas de miles de filas. El CSV va en UTF-8 con BOM (abre bien en Excel) y acepta <code>delimiter=;</code>.
              </p>
            </section>

            <section id="feeds" className="dv-section">
              <h2>Feeds de Google y Meta</h2>
              <p>
                Para publicar el catálogo en Google Shopping o en el catálogo de Meta/Instagram, cada key tiene dos links privados (no
                necesitan headers, porque Google y Meta no los mandan):
              </p>
              <ul className="dv-list">
                <li>
                  <code>/v1/feeds/{"{feedToken}"}/google.xml</code>: RSS 2.0 con los campos de Google Merchant (<code>g:id</code>,{" "}
                  <code>g:price</code>, <code>g:availability</code>, <code>g:gtin</code>, <code>g:mpn</code>, <code>g:brand</code>…).
                </li>
                <li>
                  <code>/v1/feeds/{"{feedToken}"}/meta.csv</code>: CSV con las columnas del administrador de catálogos de Meta.
                </li>
              </ul>
              <p>
                El precio es tu precio de venta con impuestos. Hace falta configurar en la key el link de cada producto en tu tienda (con{" "}
                <code>{"{id}"}</code>, <code>{"{sku}"}</code>, <code>{"{ean}"}</code>, <code>{"{partNumber}"}</code> o{" "}
                <code>{"{slug}"}</code>). Si el link se filtra, generá uno nuevo desde NODO.
              </p>
            </section>

            <section id="buenas-practicas" className="dv-section">
              <h2>Buenas prácticas</h2>
              <ul className="dv-list">
                <li>Una key por sistema: si una se filtra, la revocás sin cortar las demás.</li>
                <li>Guardá el secret en variables de entorno o un gestor de secretos; nunca en el repositorio.</li>
                <li>Para el arranque, export completo; después, webhooks o <code>/v1/changes</code>. No recorras todo el catálogo cada hora.</li>
                <li>Usá los ids (<code>prd_</code>, <code>off_</code>) como clave, no el nombre ni el SKU del distribuidor.</li>
                <li>Mirá <code>freshness.stale</code> antes de vender algo online.</li>
                <li>Ante <code>429</code> o <code>5xx</code>, reintentá con backoff exponencial y jitter.</li>
                <li>Mandá el <code>X-Request-Id</code> cuando nos escribas por un problema.</li>
              </ul>
            </section>

            <section id="referencia" className="dv-section">
              <h2>Referencia interactiva</h2>
              <p>
                Todos los endpoints con sus parámetros, esquemas y ejemplos, generados desde la especificación OpenAPI. Podés probarlos
                con tu key desde el navegador.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/developers/referencia" className="nl-btn nl-btn--primary">
                  Abrir la referencia <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a href={`${API_BASE}/v1/openapi.json`} className="nl-btn nl-btn--ghost" target="_blank" rel="noreferrer">
                  Descargar openapi.json
                </a>
              </div>
            </section>

            <section id="changelog" className="dv-section">
              <h2>Cambios de versión</h2>
              <p>
                La API está versionada en la ruta (<code>/v1</code>). Dentro de v1 solo agregamos campos, parámetros y eventos: nunca
                sacamos ni cambiamos el significado de algo existente. Ignorá los campos que no conozcas.
              </p>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Octubre 2026</td>
                      <td>
                        Lanzamiento de v1: productos y ofertas, cambios incrementales, webhooks, exportación y feeds de Google y Meta.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </article>
        </div>
      </main>
      <div className="relative z-[1]">
        <Footer />
      </div>
    </div>
  );
}
