# Enriquecimiento del catálogo — diseño

Módulo de superadmin **"Productos enriquecidos"** para mejorar las fichas del
catálogo (fotos oficiales, descripciones, atributos normalizados y, más
adelante, compatibilidades) sin tocar lo que ven los comercios hasta que el
superadmin lo aplique.

Decisiones del dueño del producto (2026-10-09):

| Tema | Decisión |
|---|---|
| Dónde corre | En producción, **como propuestas**: nada se ve fuera del módulo hasta "Aplicar" |
| Unificación | Solo dentro del módulo (producto maestro con las fichas de cada distribuidor). **El buscador y los demás usuarios no se unifican** |
| Aplicar | Se copia a **cada ficha** (`ProviderSyncCache`) lo aprobado. La regla de qué se pisa se decide **después de ver ejemplos**: en esta entrega no se aplica nada |
| Alcance | Todo el catálogo |
| Fuentes | Open Icecat (usuario en `ICECAT_USERNAME`), webs oficiales de fabricantes, IA (OpenAI ya configurado en `CatalogEnrichmentSettings`). **Sin Serper** |

Catálogo medido (2026-10-09): 20.723 fichas · 4.367 con foto elegida por IA
(Serper) · 208 sin foto · 7.691 sin descripción · 80 % con part number · 39 %
con EAN · 87 de listas Excel. Categorías crudas desordenadas.

## 1. Producto maestro (solo para el módulo)

- Agrupa fichas de distintos distribuidores que son el mismo artículo:
  1. EAN/GTIN válido (8/12/13/14, dígito verificador), si no
  2. marca canónica + part number normalizado (mayúsculas, sin espacios ni signos), si no
  3. la ficha sola.
- Tablas nuevas `CatalogMaster` (clave, marca, part number, EAN, nombre
  elegido, categoría unificada, estado del enriquecimiento) y
  `CatalogMasterMember` (master ↔ provider+externalId). Se recalculan con un
  proceso idempotente (botón "Reagrupar" y al sincronizar).
- Agrupaciones dudosas (mismo part number con marcas distintas, nombres muy
  distintos) quedan marcadas para revisión; se pueden separar o unir a mano.

## 2. Taxonomía y atributos

- Taxonomía unificada (~40 categorías) mapeada desde las categorías crudas de
  cada distribuidor (reutilizar `PlatformCatalogTerm`/alias donde se pueda).
- Esquema de atributos por categoría, con tipo, unidad y valores permitidos.
  Arranque: placa de video, motherboard, procesador, RAM, fuente, gabinete,
  cooler, almacenamiento (SSD/HDD), monitor, notebook, mouse, teclado,
  auriculares, networking (router/switch), impresora. El resto: atributos
  genéricos (marca, modelo, color, garantía, conectividad).
- Cada valor guarda fuente (`icecat` | `manufacturer` | `distributor` | `ai`),
  confianza (0–1) y evidencia (URL o texto).

## 3. Fuentes, en orden de confianza

1. **Open Icecat** por EAN o marca+part number (XML/JSON abierto con
   `ICECAT_USERNAME`): fotos oficiales, especificaciones, descripciones del
   fabricante. Con mención de fuente.
2. **Webs oficiales** de fabricantes: conectores por marca que buscan el part
   number (empezar por ASUS, MSI, Gigabyte, Logitech, Kingston, HyperX, Corsair,
   Samsung, LG, Lenovo, HP, TP-Link). Si una web no es accesible, el conector
   se omite sin romper el resto.
3. **Datos de los distribuidores** ya sincronizados (todas las fichas del maestro).
4. **IA**: extraer atributos desde los textos recolectados con salida forzada
   al esquema y validada; redactar descripciones **solo con atributos
   verificados**.

Todo lo bajado de afuera se cachea (respuesta cruda + fecha) para no repetir
llamadas, con límite de velocidad por fuente.

## 4. Propuestas

`EnrichmentProposal` por maestro y campo (`images`, `description`,
`longDescription`, `attributes`, `category`), con valor propuesto, valor
actual de cada ficha, fuente, confianza y estado (`PENDING`, `APPROVED`,
`REJECTED`, `APPLIED`). Fotos: candidatas descargadas a nuestro
almacenamiento (`StoredAsset`), sin duplicados (hash perceptual), descartando
chicas o con marca de agua; prioridad oficial > Icecat > distribuidor.

## 5. Módulo de superadmin

- Lista de productos maestros: buscador, filtros (categoría unificada, marca,
  distribuidor, estado, "tiene foto IA", "sin descripción", confianza),
  cantidad de fichas por maestro.
- Detalle: fichas de cada distribuidor lado a lado; **antes / después** por
  campo con fuente y confianza; galería propuesta; atributos en tabla.
- Acciones: enriquecer este producto, enriquecer una muestra / un filtro (en
  segundo plano, con progreso y tope de costo), aprobar / rechazar por campo o
  en bloque por umbral de confianza, separar/unir maestros.
- "Aplicar a las fichas": queda **deshabilitado** en esta entrega, con la
  vista previa de qué cambiaría en cada ficha según la regla elegida.

## 6. Más adelante

- Regla de aplicación (tras ver ejemplos) y aplicar por categoría.
- Compatibilidades: socket CPU↔mother, tipo de RAM, largo de GPU↔gabinete,
  watts de fuente↔GPU, altura de cooler↔gabinete.

## 7. Primera entrega (2026-10-09) — qué quedó hecho

- **Base**: migración aditiva `20261009120000_catalog_enrichment_masters` (`CatalogMaster`,
  `CatalogMasterMember`, `EnrichmentProposal`, `EnrichmentSourceCache`, `EnrichmentRun`).
  Nada de lo existente cambia.
- **Código**: `apps/api/src/enrichment/` (API `/admin/enrichment/*`, ver `API_CONTRACT.md`) y
  la pestaña **Administración → Productos enriquecidos** (`apps/web/components/admin/enrichment/`).
- **Agrupación**: GTIN con dígito verificador (UPC-12 = EAN-13 con 0), si no marca + part
  number normalizado, si no la ficha sola. Las variantes de marca que comparten un código
  ("LENOVO COMPUTOS", "HyperX Perifericos") se toman como la marca raíz. Dudosos: marcas
  distintas, part number con otra marca o nombres muy distintos (Jaccard < 0,15).
- **Taxonomía**: 41 categorías (`taxonomy.ts`). Esquemas versionados para 17 categorías
  (`schemas/`), el resto usa los atributos genéricos.
- **Fuentes**: Icecat por GTIN y después marca + código. Webs oficiales con conector:
  ASUS (buscador odinapi + JSON-LD), Lenovo (PSREF por tipo de máquina), TP-Link (búsqueda +
  og:image/galería), HyperX y Redragon (Shopify). Sin conector: MSI, Gigabyte, Kingston (403),
  Samsung (Akamai), Logitech (búsqueda en JS), LG (404), Corsair (bloqueo parcial), HP (sin probar).
  Todo resultado externo se verifica (código, EAN o modelo exacto en la URL/título) antes de usarlo.
- **IA**: extrae atributos solo si Icecat cubre menos del 60 % del esquema; cada valor necesita
  una cita literal del texto (si no, confianza 0,3). Redacta descripciones solo si no hay texto
  oficial, con ≥ 3 atributos verificados, y se descartan si mencionan números que no están en
  los datos.
- **Fotos** (cambio respecto de §4): las candidatas se verifican en memoria (tipo, medidas por
  cabecera, mínimo 300 px, huella sha256 para repetidas) y la propuesta guarda solo URLs y
  medidas. Se copian a `StoredAsset` **al aprobar**, para no llenar la base con fotos de
  propuestas que nadie aprobó. Sin hash perceptual ni detección de marca de agua en esta
  entrega (requieren decodificar la imagen; queda para cuando se sume una librería de imágenes).
- **Pendiente**: regla de aplicación y "Aplicar"; reagrupar al terminar cada sync (hoy es
  manual con "Reagrupar"); más conectores de fabricantes.
