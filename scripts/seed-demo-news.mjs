/**
 * Publica (o reescribe) notas de muestra con cuerpo largo e identidad propia.
 *
 * Uso:
 *   API_URL=... ADMIN_PASSWORD=... node scripts/seed-demo-news.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-production-f4aa.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123";

const IMG = {
  gpu: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=1600&q=80",
  gpu2: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1600&q=80",
  warehouse: "https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1600&q=80",
  dock: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80",
  monitor: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1600&q=80",
  desk: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=80",
  laptop: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1600&q=80",
  board: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
  numbers: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80",
  store: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80",
  chips: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80",
  night: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1600&q=80",
};

function noteHtml({ accent, ink, paper, kicker, font, body }) {
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font}&display=swap"/>
<style>
  .ed { font-family: ${font.split(":")[0].replace(/\+/g, " ")}, Georgia, serif; color: ${ink}; background: ${paper}; padding: 28px 22px 48px; }
  .ed .k { font-family: Inter, system-ui, sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: ${accent}; margin: 0 0 14px; }
  .ed p { font-size: 18px; line-height: 1.75; margin: 0 0 1.15em; }
  .ed h2 { font-size: 26px; line-height: 1.25; font-weight: 600; letter-spacing: -0.02em; margin: 1.55em 0 0.55em; }
  .ed h3 { font-size: 18px; margin: 1.3em 0 0.4em; }
  .ed figure { margin: 1.8em 0; }
  .ed img { width: 100%; height: auto; display: block; }
  .ed figcaption { font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #6b665c; margin-top: 8px; }
  .ed blockquote { margin: 1.6em 0; padding: 0 0 0 18px; border-left: 3px solid ${accent}; font-size: 22px; line-height: 1.35; font-style: italic; }
  .ed table { width: 100%; border-collapse: collapse; font-size: 15px; margin: 1.2em 0 1.6em; }
  .ed th, .ed td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .ed th { font-family: Inter, system-ui, sans-serif; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b665c; }
  .ed ul, .ed ol { font-size: 18px; line-height: 1.65; padding-left: 1.2em; margin: 0 0 1.2em; }
  .ed .caja { border: 1px solid ${accent}; padding: 16px 18px; margin: 1.6em 0; }
  .ed .caja p { margin: 0; font-size: 16px; }
</style>
<div class="ed">
  <p class="k">${kicker}</p>
  ${body}
</div>`;
}

const NOTES = [
  {
    author: "New Bytes",
    username: "newbytes.gerente",
    replace: ["Llegaron las RTX 50: hay para armar"],
    title: "Avellaneda: el primer contenedor de RTX 50 ya se está abriendo",
    excerpt: "El 27 de agosto salió de Santos. Ayer cortamos precinto. 5070 y 5080 con stock real; el que pide en NODO antes de las 16 sale hoy.",
    kind: "INCOMING",
    isPublic: true,
    publishedAt: "2026-09-03T11:20:00.000Z",
    coverUrl: IMG.gpu,
    images: [
      { url: IMG.gpu2, caption: "El primer pallet, todavía con precinto de aduana." },
      { url: IMG.warehouse, caption: "Calle 4 del depósito. Ahí se arma el combo." },
    ],
    bodyHtml: noteHtml({
      accent: "#c9a227",
      ink: "#1a1814",
      paper: "#f6f1e6",
      kicker: "Ingreso · GeForce",
      font: "Fraunces:ital,wght@0,500;0,700;1,500",
      body: `
  <p>El contenedor tardó once días más de lo que habíamos prometido. No vamos a maquillarlo: el barco se quedó en Santos y el local que ya le había prometido la placa al cliente nos escribió todos los días. Ayer a las 18:40 cortamos el precinto en Avellaneda. Esta mañana hay stock real, no “en tránsito”.</p>
  <blockquote>Si el pedido entra a NODO antes de las 16, sale en el viaje de hoy. Después de esa hora, mañana a primera.</blockquote>
  <p>Lo que abrió bien es la 5070 y la 5080. La 5090 viene en el segundo contenedor, no en este: si alguien la está vendiendo como si ya estuviera en calle, está vendiendo aire. La 5070 Ti llega la semana que viene y la vamos a publicar en el feed el mismo día, no antes.</p>
  <figure>
    <img src="${IMG.gpu2}" alt="Placas en pallet"/>
    <figcaption>El primer pallet. Todavía con la cinta de aduana.</figcaption>
  </figure>
  <h2>Qué hay, de verdad</h2>
  <table>
    <thead><tr><th>SKU</th><th>Qué es</th><th>Cómo sale</th></tr></thead>
    <tbody>
      <tr><td>RTX 5070 12G</td><td>El volumen. Combo con mother B850 y fuente 750W.</td><td>Hoy</td></tr>
      <tr><td>RTX 5080 16G</td><td>La que pide el que arma para render o esports.</td><td>Hoy, cupo por cuenta</td></tr>
      <tr><td>RTX 5070 Ti</td><td>Segundo contenedor.</td><td>La semana que viene</td></tr>
      <tr><td>RTX 5090</td><td>No está. No adelantar.</td><td>Octubre</td></tr>
    </tbody>
  </table>
  <p>El combo no es obligatorio, pero si arman placa + mother + fuente en el mismo carrito de NODO, el depósito lo pica junto y no se les desarma el pedido en dos remitos. Eso es lo que más reclamos nos trajo el año pasado.</p>
  <h2>Cómo pedirlo</h2>
  <p>El camino que vale es el carrito. WhatsApp queda para la excepción: un cliente que necesita la 5080 sí o sí y hay que mover cupo. Si el SKU no aparece en el buscador, todavía no sincronizó el feed: escribanle al vendedor de la cuenta y lo cargamos a mano, no inventen un código.</p>
  <div class="caja"><p>El vendedor de cada cuenta está en Proveedores → New Bytes. Si no hay nadie asignado, escríbanle a <strong>newbytes.gerente</strong> desde Mensajes. No abran un hilo nuevo por cada placa.</p></div>
  <p>Última cosa, porque ya pasó: no cotizen la 5090 “a confirmar”. Cuando esté, sale una nota igual que esta. Hasta entonces, no existe.</p>`,
    }),
  },
  {
    author: "New Bytes",
    username: "newbytes.gerente",
    replace: ["Lista de precios · septiembre"],
    title: "Septiembre cambia la lista: lo que sube, lo que no, y el Excel que sí vale",
    excerpt: "Vigente hasta el 30. El feed de NODO es la verdad del precio. El Excel es el respaldo para cotizar afuera, no al revés.",
    kind: "PRICE_LIST",
    isPublic: false,
    publishedAt: "2026-09-01T13:00:00.000Z",
    expiresAt: "2026-09-30T23:59:59.000Z",
    coverUrl: IMG.numbers,
    attachments: [{ kind: "LINK", title: "Lista septiembre (portal)", contentUrl: "https://www.newbytes.com.ar", visibility: "IN_APP" }],
    bodyHtml: noteHtml({
      accent: "#1f4d3a",
      ink: "#141414",
      paper: "#f3f4f0",
      kicker: "Lista de precios · septiembre",
      font: "Source+Serif+4:ital,wght@0,500;0,700;1,500",
      body: `
  <p>Septiembre no es un ajuste parejo. Sube memoria, sube notebook de 15, y se mantienen placas y fuentes. Lo armamos así porque el mes pasado cotizaron con una lista de agosto que ya no existía y después discutimos el remito. Esta nota vence el 30: si siguen usándola en octubre, están cotizando mal.</p>
  <p>Hay dos lugares donde vive el precio. El que gana es el feed de NODO: lo que aparece en la ficha del producto, con el stock de ese momento. El Excel de esta nota es el respaldo para armar un presupuesto en papel o mandarlo por mail. Si hay desfasaje, gana la ficha. Avisanos y lo corregimos el mismo día.</p>
  <h2>Qué se mueve</h2>
  <ul>
    <li><strong>Memoria DDR5 32 GB:</strong> +4% promedio. El 16 GB no se toca.</li>
    <li><strong>Notebook 15" i5/Ryzen 5:</strong> +3% en las líneas de volumen. Las workstation no.</li>
    <li><strong>Placas y fuentes:</strong> se mantienen. No adelanten una suba que no está.</li>
    <li><strong>Monitores 27 144 Hz:</strong> hay precio de liquidación en tres SKUs. Están marcados en el feed.</li>
  </ul>
  <figure>
    <img src="${IMG.numbers}" alt="Planilla"/>
    <figcaption>La lista de septiembre. Si la imprimen, anoten la fecha arriba: el 1 de octubre ya no sirve.</figcaption>
  </figure>
  <p>El archivo no viaja al link público. Lo ven las cuentas vinculadas, adentro de NODO. Si un cliente les pide “la lista”, no reenvíen este Excel: arman el presupuesto desde el carrito o piden uno puntual al vendedor. La lista completa en la calle nos complica a todos.</p>
  <div class="caja"><p>Vigencia: 1 al 30 de septiembre. El 1 de octubre sale otra nota. La de agosto ya no está en el feed.</p></div>`,
    }),
  },
  {
    author: "New Bytes",
    username: "newbytes.gerente",
    replace: [],
    title: "Dejen el WhatsApp para la excepción: el pedido que vale es el del carrito",
    excerpt: "El chat queda. El remito no se arma con un audio de las 23. Cómo usar NODO este mes, sin teatro.",
    kind: "NOTICE",
    isPublic: true,
    publishedAt: "2026-09-03T09:00:00.000Z",
    coverUrl: IMG.store,
    images: [{ url: IMG.laptop, caption: "El carrito de NODO es el que pica el depósito. El resto es conversación." }],
    bodyHtml: noteHtml({
      accent: "#111111",
      ink: "#111111",
      paper: "#ffffff",
      kicker: "Operación · NODO",
      font: "Newsreader:ital,wght@0,500;0,700;1,500",
      body: `
  <p>Vamos a decirlo sin vuelta: el pedido que entra por un audio a las once de la noche no existe hasta que está en el carrito. El depósito pica lo que ve en NODO. Si el vendedor “ya lo anotó”, y el carrito está vacío, mañana no hay remito y el enojo es de ustedes, no nuestro.</p>
  <blockquote>WhatsApp es para la excepción. El carrito es el pedido.</blockquote>
  <p>NODO no es un catálogo para mirar. Es el lugar donde comparan New Bytes con el resto de la red, arman el combo, y el vendedor de la cuenta ve el mismo carrito que ustedes. Si hay que cambiar una fuente, se cambia ahí. Si hay que aprobarlo porque lo armó un vendedor del local, el dueño lo aprueba en Pedidos. No en un grupo de WhatsApp que se pierde.</p>
  <h2>El recorrido que pedimos este mes</h2>
  <ol>
    <li>Buscan el SKU. Si no está, Mensajes al vendedor asignado: no un grupo nuevo.</li>
    <li>Arman el carrito. Combo en la misma orden, no tres carritos sueltos.</li>
    <li>Si el local tiene vendedor de salón, el dueño aprueba. Si no, cierra solo.</li>
    <li>El remito sale del depósito. El estado lo ven en Pedidos, no nos pregunten “¿salió?” a las 17.</li>
  </ol>
  <figure>
    <img src="${IMG.laptop}" alt="Pedido en pantalla"/>
    <figcaption>Si no está acá, no está pedido.</figcaption>
  </figure>
  <p>El chat de NODO (Mensajes) no reemplaza al carrito: es para cupo, una falla, un cambio de domicilio. Ahí queda el hilo de la cuenta, no se mezcla con el grupo de la familia. Si el vendedor no responde en el día, escribile al gerente. El dato está en la ficha del proveedor.</p>
  <p>Última regla, y esta es nueva: no vamos a reservar stock por un mensaje. Reserva es carrito cerrado o, si hace falta, una nota de pedido en estado pendiente de aprobación. Lo demás es conversación.</p>`,
    }),
  },
  {
    author: "Elit",
    username: "elit.gerente",
    replace: ["Septiembre: 30/60 en notebooks y monitores"],
    title: "30 y 60 en notebooks y monitores: las reglas de septiembre, sin letra chica",
    excerpt: "Cierra el 30. No entra liquidación. El tope es el de siempre. Si el carrito mezcla outlet y línea, se cae todo el plazo.",
    kind: "PROMO",
    isPublic: true,
    publishedAt: "2026-09-02T14:30:00.000Z",
    expiresAt: "2026-09-30T23:59:59.000Z",
    coverUrl: IMG.laptop,
    images: [{ url: IMG.monitor, caption: "La promo cubre línea. El monitor de liquidación, no." }],
    bodyHtml: noteHtml({
      accent: "#0b3d91",
      ink: "#102033",
      paper: "#eef3fb",
      kicker: "Promo · septiembre",
      font: "Literata:ital,wght@0,500;0,700;1,500",
      body: `
  <p>Septiembre es el mes en el que el local arma la góndola de notebooks para el último trimestre. Lo sabemos, y por eso el 30/60 no es un titular: es una condición con cuatro reglas. Si una no se cumple, el pedido vuelve a contado. No hay “casi”.</p>
  <blockquote>30 y 60 sobre el neto, sin recargo, en notebooks y monitores de línea. Punto.</blockquote>
  <h2>Qué entra</h2>
  <p>Notebooks de las líneas vigentes (no outlet, no exhibición, no “abierto”). Monitores 24 y 27 de catálogo. El 32 gaming entra; el 32 de liquidación que está marcado en el feed, no. Si tienen duda, miren la ficha: si dice liquidación, no pidan el plazo.</p>
  <h2>Las cuatro reglas</h2>
  <ol>
    <li>El pedido tiene que <strong>cerrarse en septiembre</strong>. Un carrito armado el 30 y aprobado el 1 de octubre ya es octubre.</li>
    <li>El tope por cuenta es el que ya tienen informado. No se agranda por esta promo.</li>
    <li>Si mezclan en el mismo carrito una notebook de línea y un monitor de outlet, <strong>se cae el plazo de todo el pedido</strong>. Armen dos carritos.</li>
    <li>El plazo se aplica al neto. IVA y percepciones van en la factura, no se financian.</li>
  </ol>
  <figure>
    <img src="${IMG.monitor}" alt="Monitores"/>
    <figcaption>Línea sí. Liquidación, no. El feed lo marca; no improvisen.</figcaption>
  </figure>
  <p>Cómo se pide: carrito en NODO, igual que siempre. En el mensaje al vendedor pueden poner “aplica 30/60 septiembre” para que no se les escape en el armado. No hace falta un mail a gerencia. Si la cuenta está al límite del tope, el vendedor lo va a decir antes de confirmar, no después.</p>
  <div class="caja"><p>Vence el 30 de septiembre. No se extiende. El 1 de octubre esta nota sale del feed.</p></div>
  <p>Si un cliente del local les pide “el mismo plazo que ustedes”, esa es conversación de ustedes. Nosotros financiamos el pedido del comercio, no la venta de mostrador.</p>`,
    }),
  },
  {
    author: "Elit",
    username: "elit.gerente",
    replace: ["Depósito: nuevo corte de salida a las 15:30"],
    title: "El depósito corta a las 15.30: cómo no perderse el viaje del día",
    excerpt: "A partir del lunes 1. Atención comercial no cambia. El que confirma a las 15.40 viaja mañana, sin discusión.",
    kind: "NOTICE",
    isPublic: false,
    publishedAt: "2026-09-01T10:00:00.000Z",
    coverUrl: IMG.dock,
    bodyHtml: noteHtml({
      accent: "#8a1c1c",
      ink: "#1b1512",
      paper: "#f7f1ea",
      kicker: "Operación · depósito",
      font: "Source+Serif+4:ital,wght@0,500;0,700;1,500",
      body: `
  <p>Desde el lunes 1 de septiembre el picking cierra a las 15.30. No es un ensayo. El camión de CABA y GBA sale a las 16.10 y el que llega después se queda hasta el día hábil siguiente. El mes pasado perdimos tres viajes porque se “confirmaba” un pedido a las 15.50 y el depósito lo armaba igual, mal, y a las 18 estábamos rearmando bultos.</p>
  <p>Atención comercial no se toca: el vendedor sigue hasta las 18. Lo que cambia es la ventana de preparación. Un pedido cerrado a las 17 puede existir; no viaja hoy.</p>
  <h2>Cómo no perder el día</h2>
  <ul>
    <li>Cierren el carrito en NODO <strong>antes de las 15</strong> si lo necesitan hoy. Dejen diez minutos de margen.</li>
    <li>Si el local tiene aprobación (el vendedor arma, el dueño confirma), el dueño tiene que aprobar antes del corte. Un carrito pendiente no se pica.</li>
    <li>Cambio de domicilio o de transporte: Mensajes, no un audio. El depósito no lee WhatsApp.</li>
  </ul>
  <figure>
    <img src="${IMG.dock}" alt="Muelle"/>
    <figcaption>El muelle a las 16.10. Lo que no está en el manifiesto, no sube.</figcaption>
  </figure>
  <p>Interior: el esquema de días no cambia (el camión de Rosario sigue saliendo martes y jueves). El corte de las 15.30 aplica igual el día de viaje. Si confirman el lunes a las 16, viaja el jueves, no el martes.</p>
  <p>No vamos a hacer excepciones “porque es un cliente importante”. Importante es el que cierra a horario. El resto viaja mañana, y mañana también hay camión.</p>`,
    }),
  },
  {
    author: "Asus",
    username: "asus.admin",
    replace: ["ROG Strix OLED: ya está en el canal"],
    title: "ROG Strix OLED: el 27 que van a pedir y el 32 que hay que saber vender",
    excerpt: "Arranca la familia. Stock en New Bytes. Precio sugerido y argumento de mostrador, acá. El 27 es volumen; el 32 no se empuja a cualquiera.",
    kind: "LAUNCH",
    isPublic: true,
    publishedAt: "2026-09-02T16:00:00.000Z",
    coverUrl: IMG.monitor,
    images: [
      { url: IMG.desk, caption: "El 27 en un escritorio real. Ese es el que se vende solo." },
    ],
    bodyHtml: noteHtml({
      accent: "#e10600",
      ink: "#f4f1ea",
      paper: "#14110f",
      kicker: "Lanzamiento · ROG",
      font: "Cormorant+Garamond:ital,wght@0,600;0,700;1,600",
      body: `
  <p style="color:#f4f1ea">Hay lanzamientos que son una foto y un PDF. Este no. El Strix OLED es el monitor que el gamer ya vio en YouTube y va a entrar al local a pedir “el ROG ese”. Si el vendedor de mostrador no tiene el argumento, le van a vender un IPS de 27 a precio de OLED, o al revés: le van a empujar el 32 a alguien que necesita un 27 y se vuelve a la semana.</p>
  <blockquote style="color:#f4f1ea;border-color:#e10600">El 27 es el que hay que tener en góndola. El 32 es una conversación.</blockquote>
  <h2 style="color:#fff">Los dos tamaños, sin humo</h2>
  <p style="color:#ddd6c8">El 27 (2560×1440, 240 Hz) es el volumen. Precio sugerido al público: el que está en el semáforo de NODO, en el espacio de Asus. Si el distro está por encima, la luz no es verde: no lo empujen como si fuera oferta. El 32 (4K, 165 Hz) es creador y el que arma un escritorio único. No es el monitor del pibe que viene por la 5060.</p>
  <figure>
    <img src="${IMG.desk}" alt="Escritorio ROG"/>
    <figcaption style="color:#9a9284">Un 27 en un escritorio de verdad. Ahí se entiende el producto.</figcaption>
  </figure>
  <h2 style="color:#fff">Dónde está el stock</h2>
  <p style="color:#ddd6c8">Hoy, New Bytes. El feed a veces tarda un día en mostrar el SKU: si no lo ven, no es que no existe. Pidan el código al vendedor de la cuenta. Elit todavía no tiene cupo de este corte; cuando entre, actualizamos el semáforo. No prometan Elit.</p>
  <p style="color:#ddd6c8">Material de góndola (faja, ficha A4, video de 40 segundos) está en <strong>Marcas → Asus → Materiales</strong>. No reenvíen un render de Instagram: el de materiales es el que tiene el precio sugerido correcto.</p>
  <h2 style="color:#fff">La acción, aparte</h2>
  <p style="color:#ddd6c8">Hay una acción de trimestre para el canal: 40 unidades y hay un rebate. Eso va en la nota de al lado, no acá. Esta es la ficha del producto. La otra es la plata. No las mezclen en el mostrador.</p>
  <div class="caja" style="border-color:#e10600"><p style="color:#f4f1ea">Si el cliente pregunta “¿es el mismo panel que el de Europa?”: sí. No hay SKU local recortado. Eso sí se puede decir.</p></div>`,
    }),
  },
  {
    author: "Asus",
    username: "asus.admin",
    replace: [],
    title: "Acción del trimestre: 40 OLED y hay USD 800. El progreso se ve en NODO",
    excerpt: "1 al 30 de septiembre. Unidades, no facturación. El rebate no se discute por WhatsApp: lo marca la acción en el espacio de la marca.",
    kind: "PROMO",
    isPublic: true,
    publishedAt: "2026-09-03T12:40:00.000Z",
    expiresAt: "2026-09-30T23:59:59.000Z",
    coverUrl: IMG.desk,
    bodyHtml: noteHtml({
      accent: "#e10600",
      ink: "#111",
      paper: "#fff8f6",
      kicker: "Acción · canal",
      font: "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
      body: `
  <p>Esta no es una promo de precio. Es una acción de canal, de las que se miden. Del 1 al 30 de septiembre, las cuentas vinculadas que compren <strong>40 monitores ROG Strix OLED</strong> (27 o 32, da igual) tienen un rebate de <strong>USD 800</strong>. Planos. No es por unidad, no es “casi 40”. Es 40.</p>
  <blockquote>El progreso no se pide por mail. Está en Marcas → Asus → Acciones.</blockquote>
  <p>Lo armamos en NODO para que no pase lo de siempre: el local cree que lleva 38, el distro dice 41, y en diciembre discutimos un Excel. Cada unidad que entra por New Bytes (el único distro con cupo de este corte) suma sola. Si compran por otro lado, no suma. Si el remito es de Elit, no suma. Si es un 27 de otra familia ROG, no suma.</p>
  <h2>Quién puede entrar</h2>
  <p>Comercios vinculados a Asus. Si todavía no hay vínculo, un código de la marca —no un mail a un amigo de Asus— y recién ahí ven la acción. Un distro no “lleva” la acción por ustedes: la lleva el comercio, contra sus propias compras.</p>
  <h2>Cómo se cobra</h2>
  <p>El rebate se acredita en octubre, contra la cuenta, no en efectivo. Si la acción no se cumple, no hay proporcional. Treinta y nueve unidades es cero dólares. Eso también está escrito en la acción, no en esta nota: esta nota es el anuncio.</p>
  <div class="caja"><p>Miren el semáforo del 27. Si está amarillo, hay poco. No prometan 40 unidades si el distro no tiene. La acción no inventa stock.</p></div>
  <p>Material de venta y el argumentario del OLED están en la nota de lanzamiento. Esta es solo la plata. El vendedor de New Bytes sabe que existe: no hace falta “avisarle a la marca” cada vez que cargan un monitor al carrito.</p>`,
    }),
  },
  {
    author: "Gigabyte",
    username: "gigabyte.admin",
    replace: ["B850: qué mother conviene según el Ryzen"],
    title: "B850 contra X870: qué mother ponerle a cada Ryzen (y cuál no empujar)",
    excerpt: "Una guía de mostrador. El 90% de lo que se vende cierra en B850. X870 no es un upgrade automático.",
    kind: "CATALOG",
    isPublic: true,
    publishedAt: "2026-09-01T15:10:00.000Z",
    coverUrl: IMG.board,
    images: [{ url: IMG.chips, caption: "AM5. El chipset se elige con el procesador, no al revés." }],
    bodyHtml: noteHtml({
      accent: "#0e7c66",
      ink: "#10211c",
      paper: "#eef6f3",
      kicker: "Catálogo · AM5",
      font: "IBM+Plex+Serif:ital,wght@0,500;0,700;1,500",
      body: `
  <p>El error del mostrador este año es siempre el mismo: entra un Ryzen 5 7600 y le arman un X870 “por las dudas”. El cliente paga de más, el local se come un cambio, y nosotros recibimos el mail de “la mother no rinde”. B850 cubre el noventa por ciento de lo que se vende en un comercio de barrio o un integrador chico. X870 es una conversación, no el default.</p>
  <blockquote>El chipset se elige con el procesador. No al revés.</blockquote>
  <h2>La regla que pedimos que impriman</h2>
  <table>
    <thead><tr><th>Procesador</th><th>Mother</th><th>Por qué</th></tr></thead>
    <tbody>
      <tr><td>7600 / 7600X / 8700G</td><td>B850 Eagle</td><td>Alcanza. No hay cuello que justifique X870.</td></tr>
      <tr><td>7700 / 9700X</td><td>B850 Aorus Elite</td><td>Mejor VRM, mismo chipset. El que arma para laburar.</td></tr>
      <tr><td>9800X3D / 9950X</td><td>X870 Aorus</td><td>Ahí sí. PCIe 5.0 de verdad y el que paga por eso.</td></tr>
    </tbody>
  </table>
  <p>Wi-Fi: el SKU lo dice en el nombre. No le armen un USB Wi-Fi a una Eagle sin antena “porque queda más barato”. Queda mal, y vuelve.</p>
  <figure>
    <img src="${IMG.board}" alt="Motherboard"/>
    <figcaption>B850 Aorus. Es la que más van a vender si el 9700X se mueve.</figcaption>
  </figure>
  <h2>Semáforo y precio sugerido</h2>
  <p>En el espacio de Gigabyte en NODO (Marcas → Gigabyte → Productos) está el semáforo de estas tres. Verde es empujar. Amarillo es consultar stock al distro. Rojo es no prometer. El precio sugerido es el de góndola, no el de ustedes: si venden por debajo, es decisión del local, no un “precio de marca”.</p>
  <p>Stock hoy: New Bytes y Elit, según el SKU. No todos los B850 están en los dos. El feed de NODO es más honesto que un “tengo, traelo mañana”.</p>
  <div class="caja"><p>Si el cliente trae un cooler de torre alto, miren el clearance de la Eagle antes de cerrar. El cambio por “no entra el cooler” es el segundo reclamo del trimestre.</p></div>
  <p>Capacitación de 12 minutos (dónde van los cables, qué BIOS dejar) está en Capacitaciones. Mandensela al vendedor de salón. No a gerencia.</p>`,
    }),
  },
];

const ASUS_ACTION = {
  title: "ROG Strix OLED · Q3",
  kind: "PURCHASE_QTY",
  description:
    "40 monitores ROG Strix OLED (27 o 32) entre el 1 y el 30 de septiembre. Rebate plano de USD 800. Solo compras por New Bytes. Sin proporcional.",
  startsAt: "2026-09-01T03:00:00.000Z",
  endsAt: "2026-09-30T23:59:59.000Z",
  targetQty: 40,
  rewardKind: "FLAT",
  rewardUsd: 800,
  notifyRetailers: false,
};

async function call(method, path, token, body) {
  const sinCuerpo = method === "GET" || method === "DELETE";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(sinCuerpo ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(sinCuerpo ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

async function upsertNote(token, note, items) {
  const match = items.find((item) => item.title === note.title || (note.replace ?? []).includes(item.title));
  const body = {
    title: note.title,
    excerpt: note.excerpt,
    bodyHtml: note.bodyHtml,
    coverUrl: note.coverUrl,
    kind: note.kind,
    status: "PUBLISHED",
    isPublic: note.isPublic,
    notifyOnPublish: false,
    publishedAt: note.publishedAt ?? null,
    expiresAt: note.expiresAt ?? null,
    attachments: note.attachments ?? [],
    images: note.images ?? [],
  };
  if (match) {
    const saved = await call("PUT", `/my/news/${match.id}`, token, body);
    return { saved, created: false, id: match.id };
  }
  const saved = await call("POST", "/my/news", token, body);
  return { saved, created: true, id: saved.payload.data?.id };
}

async function ensureAsusAction(token) {
  const current = await call("GET", "/my/brand/actions", token);
  const actions = current.payload.data?.actions ?? [];
  const existing = actions.find((row) => row.title === ASUS_ACTION.title);
  if (existing) {
    console.log(`= Asus acción: ${existing.title}`);
    return;
  }
  const created = await call("POST", "/my/brand/actions", token, { ...ASUS_ACTION, status: "DRAFT" });
  const id = created.payload.data?.id;
  if (!id) {
    console.log(`! Asus acción: ${created.payload.message ?? created.status}`);
    return;
  }
  const activated = await call("POST", `/my/brand/actions/${id}/status`, token, { status: "ACTIVE" });
  if (activated.status >= 400) {
    console.log(`! Asus acción activar: ${activated.payload.message ?? activated.status}`);
    return;
  }
  console.log(`+ Asus acción: ${ASUS_ACTION.title}`);
}

async function main() {
  console.log(`Autenticando como ${ADMIN_USER} en ${API_URL}`);
  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error(login.payload.message ?? "No se pudo entrar como administrador");

  const users = (await call("GET", "/admin/users", adminToken)).payload.data ?? [];
  const byUsername = new Map(users.map((user) => [user.username, user]));

  let created = 0;
  let updated = 0;

  const tokens = new Map();
  async function asUser(username) {
    if (tokens.has(username)) return tokens.get(username);
    const user = byUsername.get(username);
    if (!user) return null;
    const session = await call("POST", `/admin/users/${user.id}/impersonate`, adminToken, {});
    const token = session.payload.data?.token;
    if (token) tokens.set(username, token);
    return token;
  }

  const asusToken = await asUser("asus.admin");
  if (asusToken) await ensureAsusAction(asusToken);

  for (const note of NOTES) {
    const token = await asUser(note.username);
    if (!token) {
      console.log(`! ${note.author}: no está ${note.username}`);
      continue;
    }
    const mine = await call("GET", "/my/news", token);
    const items = mine.payload.data?.items ?? [];
    const { saved, created: isNew, id } = await upsertNote(token, note, items);
    if (saved.status >= 400 || saved.payload.success === false) {
      console.log(`! ${note.author}: ${note.title} → ${saved.payload.message ?? saved.status}`);
      continue;
    }
    if (isNew) {
      created += 1;
      console.log(`+ ${note.author}: ${note.title}`);
    } else {
      updated += 1;
      console.log(`~ ${note.author}: ${note.title}`);
    }
    for (const extra of items) {
      if (extra.id === id) continue;
      if ((note.replace ?? []).includes(extra.title)) {
        await call("DELETE", `/my/news/${extra.id}`, token);
      }
    }
  }

  console.log(`\nListo. ${created} nuevas, ${updated} reescritas.`);
}

main().catch((err) => {
  console.error("Falló el seed:", err.message);
  process.exit(1);
});
