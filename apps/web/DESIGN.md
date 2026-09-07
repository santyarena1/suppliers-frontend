---
name: NODO — Superficie pública
description: Mundo nocturno de datos para la landing de NODO; malla y cintas de partículas que convergen en filas de precio reales.
colors:
  void: "#0b0d1a"
  ink: "#13162b"
  night: "#1a1d3a"
  lilac: "#6a6cf6"
  lilac-deep: "#4033fc"
  mist: "#bfd2ff"
  ember: "#ff6a3d"
  fg: "#e9efff"
  fg-dim: "#a9b6dd"
  fg-faint: "#8b98c6"
  hair: "rgb(191 210 255 / 0.14)"
  hair-strong: "rgb(191 210 255 / 0.26)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.85rem, 8vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 74, 'wght' 800"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 3.6rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 74, 'wght' 800"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 3vw, 2.3rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 74, 'wght' 800"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.01em"
  label:
    fontFamily: "Chivo Mono, ui-monospace, monospace"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.2em"
  note:
    fontFamily: "Chivo Mono, ui-monospace, monospace"
    fontSize: "0.66rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0.06em"
  mono:
    fontFamily: "Chivo Mono, ui-monospace, monospace"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "'tnum' 1"
rounded:
  hair: "2px"
  chip: "3px"
  control: "4px"
  panel: "10px"
  pill: "999px"
spacing:
  row: "0.85rem 1.1rem"
  control: "0.95rem 1.4rem"
  panel: "1.5rem"
  panel-lg: "1.75rem"
  gutter: "1.5rem"
  gutter-lg: "2.5rem"
  section: "6rem"
  section-lg: "9rem"
components:
  button-primary:
    backgroundColor: "{colors.lilac}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "{spacing.control}"
  button-primary-hover:
    backgroundColor: "{colors.lilac}"
    textColor: "#ffffff"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "{spacing.control}"
  button-ghost-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ember}"
  panel:
    backgroundColor: "{colors.night}"
    textColor: "{colors.fg}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  panel-active:
    backgroundColor: "{colors.night}"
    textColor: "{colors.fg}"
    rounded: "{rounded.panel}"
  input:
    backgroundColor: "{colors.void}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "0.85rem 1rem"
    width: "100%"
  input-focus:
    backgroundColor: "{colors.void}"
    textColor: "{colors.fg}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.fg-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0.2rem 0.5rem"
  chip-ember:
    backgroundColor: "transparent"
    textColor: "{colors.ember}"
  chip-out:
    backgroundColor: "transparent"
    textColor: "{colors.fg-faint}"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    padding: "{spacing.row}"
  row-best:
    backgroundColor: "rgb(255 106 61 / 0.07)"
    textColor: "{colors.fg}"
    padding: "{spacing.row}"
---

# Design System: NODO — Superficie pública

> **Alcance.** Este documento describe **únicamente la superficie pública**: la landing en `app/(marketing)/landing`, el grupo de rutas `(marketing)` y los componentes bajo `components/landing/*`. Todo lo que vive dentro de la aplicación autenticada (`app/(app)`) sigue corriendo el tema Tailwind anterior de tokens `surface-*` / `brand-*` y **no está descripto acá**. Ninguna regla de este archivo se aplica a esas pantallas, y ninguna decisión de la app autenticada invalida lo que sigue.
>
> El aislamiento es literal en el código: `app/(marketing)/layout.tsx` monta un contenedor `.lnd` propio que pinta fondo opaco y declara sus variables, para que el tema de la app no se filtre. Los estilos viven en `app/(marketing)/landing.css` y todas las clases llevan prefijo `lnd-`.

## Overview

**Creative North Star: "El campo de datos que se ordena solo"**

El mundo es una noche azul-violácea, no negra: `void` (`#0b0d1a`) es un azul profundo con matiz, y todo lo que se apoya encima —paneles, reglas hairline, texto secundario— se tiñe del mismo matiz. Nada es gris. Sobre ese lecho corre un campo de partículas dibujado en canvas (`DataField`) que es la metáfora entera del producto: la oferta empieza dispersa y termina alineada en filas comparables. El resto del sistema es deliberadamente sobrio para que ese único momento tenga lugar dónde ocurrir: paneles hairline sin relleno, tipografía condensada en mayúsculas para los títulos, mono para todo lo que sea dato, y un solo acento cálido usado con avaricia.

La densidad es de herramienta, no de folleto. Las escenas centrales (`SearchScene`, `CostScene`, `BuyScene`, `Hero`) son maquetas de la interfaz real: tablas con encabezado de columna, chips de estado, precios en tabular-nums, filas con hover. La landing no ilustra el producto con dibujos; lo muestra en su propia gramática. Eso obliga a una disciplina de honestidad que es parte del sistema visual y no una nota legal: cada escena sintética lleva su `IllustrativeNote`, los distribuidores son anónimos ("Distribuidor A/B/C"), los planes están estampados `Precio a definir`, y el pie carga el descargo global.

El grano fino (`.lnd-grain`, ruido SVG al 40% en `mix-blend-mode: overlay`, fijo sobre todo el z-stack) es el material del mundo: mantiene los degradados sin bandas y le saca a la pantalla el acabado plano de CSS puro. Es atmósfera, no decoración: no se apaga por sección ni se intensifica para dar énfasis.

**Key Characteristics:**
- Noche azul-violácea con matiz en todos los neutros; ningún gris puro.
- Un solo momento autoral animado en toda la página (el campo del hero); el resto es quietud.
- Paneles hairline traslúcidos, sin sombra difusa salvo la de asiento.
- Display Archivo condensada en mayúsculas contra mono Chivo para dato y etiqueta.
- Ember (`#ff6a3d`) restringido a tres significados; nunca decorativo.
- Grano fijo sobre todo el mundo.
- Honestidad tipografiada: lo ilustrativo se declara ilustrativo, en el mismo estilo de nota mono.

## Colors

Paleta de una sola familia fría (azul → violeta) con un único acento cálido; los "neutros" no son neutros: son azules desaturados que comparten matiz con el fondo.

### Primary
- **Lilac** (`#6a6cf6`): el color de la marca en acción. Cara superior del degradado del botón primario, ícono de la barra de búsqueda, viñetas de lista, borde de `:focus` de los campos, y uno de los dos extremos del mezclado de partículas del campo.
- **Lilac Profundo** (`#4033fc`): cara inferior del degradado del botón primario, color de `::selection`, y la fuente del halo proyectado bajo el botón. No se usa como color de texto.

### Secondary
- **Ember** (`#ff6a3d`): el único cálido del mundo. Su escasez es el mecanismo. Ver *La Regla de los Tres Significados*.

### Tertiary
- **Mist** (`#bfd2ff`): azul claro de realce frío. Estado hover de la navegación y del riel, cifra destacada del contador del hero, y color base de las partículas del campo. Es también el matiz del que se derivan las reglas hairline y el hover de fila (`rgb(191 210 255 / …)`).

### Neutral
- **Void** (`#0b0d1a`): el lecho del mundo. Fondo de página, fondo de campos de formulario, riel de scrollbar, y el nodo de línea de tiempo de `HowToStart`.
- **Ink** (`#13162b`): cara inferior del degradado de panel.
- **Night** (`#1a1d3a`): cara superior del degradado de panel, pulgar de scrollbar, fondo de la pestaña activa en `Pricing`.
- **Texto principal** (`#e9efff`): títulos, cifras, nombres de producto.
- **Texto atenuado** (`#a9b6dd`): párrafos de cuerpo y ítems de lista.
- **Texto tenue** (`#8b98c6`): etiquetas mono, notas ilustrativas, metadatos, estado sin stock. **Este valor es un piso de contraste, no una preferencia estética**: se levantó a `#8b98c6` para superar 4.5:1 sobre fondos de panel (medido 5.78:1 sobre `night`). No oscurecerlo.
- **Hairline** (`rgb(191 210 255 / 0.14)`) y **Hairline fuerte** (`rgb(191 210 255 / 0.26)`): toda la separación estructural del sistema. Bordes de panel, líneas entre filas, reglas de encabezado de sección, borde de campo en reposo.

### Named Rules

**La Regla de los Tres Significados.** Ember tiene exactamente tres significados en la superficie pública: **mejor precio**, **baja de precio**, y **estado activo** (pestaña seleccionada, plan recomendado, panel enfocado, ítem activo del riel). Se le suman dos usos funcionales del navegador: el anillo de `:focus-visible` y el `caret-color`. Cualquier otro uso de ember —un ícono, una viñeta, un borde decorativo, un título— está fuera del sistema. Test: si tapás el ember de una pantalla y no perdés información de precio ni de estado, ese ember sobraba.

**La Regla del Matiz.** No existe un gris en este mundo. Todo neutro —texto secundario, línea, sombra, borde— se construye desde el matiz del fondo o desde mist con alfa. Un `#888` en esta superficie es un defecto, no una variante.

**La Regla Sin Semáforo.** El estado de stock no se pinta con verde/amarillo/rojo. "Con stock" y "sin stock" se distinguen por chip, ícono de trazo y peso de texto (`fg-dim` contra `fg-faint` con opacidad 0.7), nunca por color de semáforo. No hay verde importado en la paleta y no se agrega uno.

## Typography

**Display Font:** Archivo variable, eje `wdth` real, self-hosteada con `next/font/google` (fallback `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** la misma Archivo en ancho normal (`"wdth" 100`)
**Label/Mono Font:** Chivo Mono, pesos 300/400/500 (fallback `ui-monospace, monospace`)

**Character:** Una sola familia sostiene título y cuerpo, y el contraste lo aporta el eje de ancho, no un segundo tipo decorativo: el display se condensa de verdad a `"wdth" 74` en lugar de falsearse con `scaleX`. Contra esa masa condensada en mayúsculas, la mono aparece siempre pequeña, espaciada y en minúsculas o versalitas: la voz del dato frente a la voz del titular. Ambas caras son de Omnibus-Type; ninguna baja de un CDN en runtime.

### Hierarchy
- **Display** (`"wdth" 74 / "wght" 800`, `clamp(2.85rem, 8vw, 6rem)`, `line-height: 0.86`, `letter-spacing: -0.02em`, mayúsculas, `text-wrap: balance`): un solo uso por página, el titular del hero.
- **Headline** (mismo eje, `clamp(2.4rem, 5vw, 3.6rem)`): títulos de sección vía `SectionHead`.
- **Title** (mismo eje, `clamp(1.7rem, 3vw, 2.3rem)`): nombres de plan y de audiencia dentro de panel.
- **Body** (Archivo `wdth 100`, ~`0.98–1.02rem`, `line-height: 1.6`, `letter-spacing: 0.01em`, color atenuado, **`max-width: 68ch`**): bajadas de sección y párrafos.
- **Label** (Chivo Mono, `0.625rem`, `letter-spacing: 0.2em`, mayúsculas, color tenue): navegación, riel, encabezados de columna, metadatos de sección, texto de botón.
- **Note** (Chivo Mono, `0.66rem`, `letter-spacing: 0.06em`, `line-height: 1.7`, color tenue): la voz de la honestidad — notas ilustrativas, timestamps, descargo del pie.
- **Mono/dato** (Chivo Mono con `font-variant-numeric: tabular-nums`; el contenedor `.lnd` además fuerza `font-feature-settings: "tnum" 1`): todo precio, cantidad, porcentaje, fecha y numeral.

### Named Rules

**La Regla del Número Alineado.** Cualquier cifra que un usuario pueda comparar contra otra cifra se compone en mono con tabular-nums. Los precios de una columna tienen que caer sobre la misma grilla vertical; un precio en la cara display es un defecto.

**La Regla del Título Sin Anuncio.** La metadata de sección (`01 · Búsqueda`) no se apila encima del título como antetítulo. Va al costado, sobre una regla hairline que ocupa el espacio sobrante, alineada a la línea base inferior del título. En viewport chico la regla y la metadata desaparecen; el título queda solo. No se introducen antetítulos ni kickers apilados.

**La Regla de la Mayúscula Condensada.** Las mayúsculas están reservadas al display condensado y a la mono espaciada. El cuerpo nunca va en mayúsculas, y el display nunca va en caja mixta.

## Layout

El contenedor es único: `Shell`, `max-width: 1240px`, gutters de `1.5rem` que pasan a `2.5rem` desde `sm`. Cada sección de contenido lo usa; no hay anchos alternativos por sección.

El ritmo vertical es plano y repetido a propósito: cada sección es `py-24` (`6rem`) que pasa a `py-36` (`9rem`) desde `sm`. Es la respiración constante que le da al hero el monopolio del acontecimiento. El hero es la única excepción de altura: `min-h-[100svh]` con `pt-24 / sm:pt-28` para librar la nav fija.

Las composiciones son de dos columnas asimétricas con proporciones explícitas y siempre `minmax(0, …)` para que las celdas puedan encogerse: `1fr / 1.05fr` en el hero, `1fr / 0.85fr` en costo, `1.15fr / 1fr` en compra, `1fr / 0.9fr` en el alta. `Audiences` y `Pricing` usan grillas parejas (`md:grid-cols-2`, `lg:grid-cols-3`) porque comparan pares iguales.

En pantalla chica todo colapsa a una columna y **el orden del DOM manda**: en el hero, titular → panel de precios → datos al pie, para que la prueba de precio entre en el primer viewport del teléfono. Las columnas laterales de las tablas (`Lo tienen`, `7 días`, stock) se ocultan por debajo de `sm` y su información se pliega dentro de la línea de nota de cada fila, en vez de hacer scroll horizontal.

Anclas y navegación: cinco secciones tienen `id` (`buscar`, `costo`, `comprar`, `empezar`, `planes`) más `cuenta` para el alta. `scroll-margin-top: 96px` en toda sección con `id`. El riel lateral fijo aparece solo desde `1180px`.

### Named Rules

**La Regla del Ritmo Único.** Todas las secciones respiran igual (`6rem` / `9rem`). Una sección no pide énfasis con más aire; lo pide con su contenido. La única altura especial de la página es el hero.

## Elevation & Depth

El sistema es **traslúcido y estratificado, no elevado**. No hay vocabulario de sombras por niveles y no se debe inventar uno. La profundidad viene de cuatro mecanismos, en este orden: capas de alfa sobre el lecho, bordes hairline, viñeta, y paralaje real del campo de partículas.

Los paneles no flotan: se apoyan. Su fondo es un degradado de `night` a `ink` al 72% de opacidad, con un borde hairline y una única sombra de asiento muy difusa y desplazada hacia abajo. La variante `sheer` baja la opacidad a 0.50/0.58 y agrega `backdrop-filter: blur(3px)` con un propósito concreto: dejar ver el lecho de partículas sobre el que el panel aterriza.

El z-stack es fijo y corto: campo (0) → viñeta (1) → contenido (10) → riel (40) → nav (50) → grano (60). El grano y la viñeta son `pointer-events: none`. La viñeta es un doble degradado (radial desplazado al 22%/44% más un lineal de cierre) cuyo único trabajo es darle contraste al texto sobre el campo.

### Shadow Vocabulary
- **Asiento de panel** (`box-shadow: 0 24px 60px -30px rgb(0 0 0 / 0.9)`): la sombra por defecto y única de todo panel. Es un oscurecimiento del lecho, no un halo.
- **Halo de acción** (`box-shadow: 0 10px 30px -12px rgb(64 51 252 / 0.9)`, en hover `0 14px 36px -12px … / 0.95`): exclusivo del botón primario. Es luz de color, no sombra negra: el botón proyecta su propio lilac sobre el fondo.

### Named Rules

**La Regla del Vidrio Sobre el Campo.** El `backdrop-filter` está reservado a dos superficies que tienen algo detrás que vale la pena dejar ver: el panel del hero (sobre el campo de partículas) y la barra de navegación una vez que la página scrolleó (`blur(14px)` a partir de `scrollY > 24`). Un panel apoyado sobre fondo liso se pinta opaco; desenfocar la nada es costo sin lectura.

**La Regla de la Sombra Que No Sube.** Ningún elemento se eleva al hover. El feedback de estado es borde, color y translación mínima; la única transformación de hover en el sistema es la flecha del botón (`translateX(3px)`), y la única del `:active` es `translateY(1px)`. Nada crece, nada levita.

## Shapes

El radio crece con la superficie y se mantiene chico en todos los casos: `2px` para el anillo de foco, `3px` para chips y sellos, `4px` para botones y campos, `10px` para paneles, `999px` solo para el pulgar del scrollbar y las viñetas circulares de lista. Nada es pill salvo esas dos excepciones; nada es cuadrado a cero.

El lenguaje de forma dominante no es la esquina sino **la línea de 1px**. Reglas hairline separan encabezados de sección, filas de tabla, cabeceras y pies de panel, y bloques del footer. Las filas de datos se separan con `border-top`, nunca con espaciado o con fondos alternos: la tabla es una pila de líneas, no un cebrado.

Los íconos son de trazo, todos a `strokeWidth: 1.25` (`ICON_STROKE`), en tamaños de 12 a 16px. Ese valor es del sistema: un ícono más grueso rompe el peso de la línea hairline.

Único caso de borde punteado del sistema: el sello `Precio a definir` (`1px dashed rgb(255 106 61 / 0.4)`). El punteado significa *provisorio*, y ese es su único uso.

### Named Rules

**La Regla de la Línea, No el Bloque.** Estructura, división y jerarquía se expresan con líneas de 1px sobre alfa de mist. No se usan fondos de bloque, franjas alternas ni cajas de relleno para agrupar. Test: si le sacás todos los `border` a una escena y sigue habiendo estructura pintada con rellenos, sobra relleno.

## Components

### Buttons
- **Forma:** rectángulo apenas suavizado (`4px`), `inline-flex` con `gap: 0.85rem`, texto en mono `0.72rem` con `letter-spacing: 0.16em` en mayúsculas, `padding: 0.95rem 1.4rem`.
- **Primario:** degradado vertical de lilac a lilac profundo, texto blanco, halo de acción proyectado.
- **Fantasma:** transparente con borde hairline fuerte y texto principal.
- **Hover:** *ambas variantes se marcan con ember en el borde* — el primario cambia solo el borde a ember y sube apenas el halo; el fantasma pasa borde **y** texto a ember. La transición corre a 160 ms con `ease-out`.
- **Anatomía fija:** todo botón lleva una flecha `ArrowRight` de 16px a trazo 1.25 que avanza `3px` en hover. Es parte del componente, no un adorno opcional.
- **Activo / deshabilitado:** `translateY(1px)` en `:active`; opacidad 0.45 y cursor bloqueado en `[disabled]`.

### Chips
- **Estilo:** borde hairline, radio `3px`, mono `0.6rem` con `letter-spacing: 0.12em` en mayúsculas, fondo transparente, texto atenuado. Admite un ícono de trazo de 12px adentro.
- **Estados:** `ember` (borde `rgb(255 106 61 / 0.5)` y texto ember) para filtro activo o marca de recomendado; `out` (texto tenue, opacidad 0.7) para stock agotado. El neutro es el reposo.

### Cards / Containers (`lnd-panel`)
- **Esquina:** `10px`.
- **Fondo:** degradado `night → ink` al 72%; variante `sheer` al 50/58% con desenfoque de fondo.
- **Sombra:** asiento de panel (ver Elevation).
- **Borde:** hairline; la variante `--active` reemplaza el borde por ember y es la única forma de marcar "este es el que importa" (plan recomendado, distribuidor con compra online).
- **Padding interno:** `1.5rem` que pasa a `1.75–2rem` desde `sm` para paneles de contenido; los paneles-tabla no llevan padding propio y delegan en el padding de fila.

### Inputs / Fields
- **Estilo:** fondo `void` al 72%, borde hairline fuerte, radio `4px`, `padding: 0.85rem 1rem`, ancho completo, placeholder en texto tenue.
- **Foco:** el borde pasa a lilac y el fondo se cierra a 90% de opacidad. El `outline` nativo se suprime dentro del campo porque el borde ya es la señal; el `caret` es ember.
- **Foco global:** cualquier otro elemento enfocable de la superficie recibe `outline: 2px solid ember` con `outline-offset: 3px`. Ese anillo no se desactiva.

### Navigation
- **Barra superior:** fija, transparente en el tope de la página; a partir de `scrollY > 24` adquiere fondo `void` al 82%, borde hairline y `backdrop-filter: blur(14px)`, con transición de 300 ms. Los enlaces son labels mono que pasan a mist en hover. Marca: icono de 24px + "NODO" en display a `"wdth" 92 / "wght" 700` con `letter-spacing: 0.16em`.
- **Riel de secciones:** columna fija a la izquierda, visible solo desde `1180px`, `aria-hidden` y `tabIndex={-1}` porque duplica la navegación de la barra. Cada entrada es tick + numeral mono + label. El activo se tiñe ember. **El tick cambia con `transform: scaleX(0.5 → 1)` y origen a la izquierda, nunca con `width`**: la misma marca, sin recalcular layout.

### Filas de datos (`lnd-row`) — componente de firma
La unidad atómica de todo el sistema: la landing entera está construida sobre ella. Grilla de columnas declarada por escena, `align-items: center`, `padding: 0.85rem 1.1rem`, separada de la anterior por un `border-top` hairline. Hover: fondo `rgb(191 210 255 / 0.04)`. La variante `--best` lleva fondo ember al 7% (11% en hover) y su precio se compone en ember con la etiqueta "Mejor precio" debajo. Es el único fondo teñido del sistema y existe porque marca el dato que el producto promete encontrar.

### Campo de datos (`DataField`) — componente de firma
Canvas detrás del hero, en composición aditiva (`globalCompositeOperation = "lighter"`), en dos planos:

- **Malla desplazada** (fondo): grilla regular de paso 20px (26px en angosto) deformada por una onda; alfa 0.05–0.15. Es el catálogo entero, ordenado y lejano. **Nunca aterriza**: sigue respirando y respondiendo al puntero incluso con la animación terminada.
- **Cintas de interferencia** (frente): 1500 / 2400 / 3400 partículas según ancho, distribuidas en cuatro cintas sinusoidales con desplazamiento perpendicular cúbico (núcleo brillante, borde deshilachado). El 34% de ellas son "tus coincidencias" y convergen a **las filas reales del DOM**, medidas en vivo con `getBoundingClientRect()` sobre `[data-field-row]`. Color por mezcla mist→lilac→ember; la fila del medio es la del mejor precio y se tiñe ember al llegar.
- **Ritmo:** compás de `520 ms` antes de arrancar, convergencia de `1700 ms` con `easeOutExpo`. El panel del hero se revela a los `520 + 1700·0.66 ms`, para que las filas aparezcan donde el campo dejó las partículas.
- **Paralaje:** el puntero arrastra cada partícula en proporción a su profundidad `z`; lo cercano se mueve, el fondo casi no. El arrastre se amortigua a 0.06 por frame y se reduce (30 → 17) a medida que el dato se asienta.

**El momento autoral vive en el tránsito, no en el cuadro asentado.** El brillo sigue una campana: `transit = sin(π · settled)`, `focus = 0.3 + transit·1.45 + settled·0.24`. Está apagado en la partida, alcanza su máximo en pleno viaje, y se asienta en un lecho tenue. **Una captura de pantalla del estado final muestra casi nada, a propósito.** No es un efecto faltante y no se "arregla" convirtiéndolo en un resplandor permanente.

**Las cintas están contenidas dentro del panel.** Las filas medidas se recortan a `x0 = left + 6` y `x1 = right − 6`: ninguna partícula sobresale del recuadro. Una versión anterior las dejaba salir y cruzar el titular; eso fue rechazado por decisión explícita. Las colas que sobresalen son un estado descartado, no una opción sin explorar.

### Revelado (`Reveal`)
Una sola gramática de entrada en toda la página: opacidad 0→1 y `translate3d(0, 14px, 0)` a 620 ms con `ease-out`, disparada por `IntersectionObserver` (`rootMargin: 0 0 -12% 0`, `threshold: 0.12`) que se desconecta al primer cruce. Se aplica a **nueve nodos en toda la landing**, y está deliberadamente **ausente de `Pricing`, `Audiences` y `CostScene`**. La escasez es la decisión: si cada sección entrara, el scroll sería una cascada de entradas idénticas y ninguna significaría nada. Los escalonamientos, donde existen, son de 70–90 ms.

## Do's and Don'ts

### Do:
- **Do** construir toda escena nueva sobre `lnd-panel` + `lnd-row`: panel hairline, filas separadas por `border-top`, precios en mono tabular a la derecha.
- **Do** componer cualquier cifra comparable en Chivo Mono con tabular-nums.
- **Do** reservar ember para mejor precio, baja de precio y estado activo (más anillo de foco y caret), y aceptar que una pantalla entera pueda no tener ningún ember.
- **Do** derivar todo neutro del matiz azul del fondo o de mist con alfa; usar `hair` / `hair-strong` para toda separación.
- **Do** animar solo `transform` y `opacity`, con `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` y `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.
- **Do** poner una `IllustrativeNote` debajo de toda escena con datos sintéticos, mantener anónimos a los distribuidores de ejemplo y estampar `Precio a definir` mientras el número no sea el definitivo.
- **Do** respetar el ritmo de sección `6rem / 9rem` y el contenedor único de 1240px.
- **Do** dar a todo ícono trazo `1.25` (`ICON_STROKE`).
- **Do** dejar el contenido legible sin JavaScript: el bloque `<noscript>` que fuerza `.lnd-reveal` visible se mantiene, y toda entrada nueva tiene que caer bajo esa misma clase.
- **Do** dibujar el estado final una sola vez y sin bucle de `requestAnimationFrame` cuando `prefers-reduced-motion: reduce` esté activo.

### Don't:
- **Don't** convertir el estado asentado del campo en un resplandor permanente. La campana `sin(π · settled)` es la obra; el cuadro final callado es intencional.
- **Don't** dejar que las partículas del campo sobresalgan del panel ni crucen el titular. El recorte `+6 / −6` es una decisión tomada, no un descuido.
- **Don't** usar gris (`#888`, `#666`, `slate-*`) para texto secundario, borde ni sombra. Ni un neutro sin matiz.
- **Don't** oscurecer `fg-faint` por debajo de `#8b98c6`: es el piso de contraste medido (5.78:1 sobre `night`), no una preferencia.
- **Don't** introducir verde ni una paleta de semáforo para stock, disponibilidad o éxito. El estado se dice con chip, ícono y peso.
- **Don't** usar ember para íconos, viñetas, títulos ni bordes decorativos.
- **Don't** animar `width`, `height`, `top`, `left`, `margin` ni `font-size`. El tick del riel usa `scaleX` justamente porque una transición de `width` fue reemplazada.
- **Don't** poner `Reveal` en cada sección ni en cada hijo de una lista. Nueve nodos en la página entera es el techo observado; una cascada por sección anula el mecanismo.
- **Don't** agregar niveles de sombra ni elevar elementos al hover. El sistema tiene exactamente dos sombras: asiento de panel y halo de acción.
- **Don't** aplicar `backdrop-filter` a un panel que no tenga el campo de partículas o contenido scrolleable detrás.
- **Don't** apilar antetítulos, kickers o etiquetas encima de un título. La metadata va al costado sobre una regla hairline.
- **Don't** suprimir el anillo de foco ember (`outline: 2px solid` con offset `3px`) en ningún elemento interactivo.
- **Don't** llevar tokens `surface-*` / `brand-*` de la app autenticada a esta superficie, ni al revés: son dos mundos y el aislamiento del contenedor `.lnd` es deliberado.
