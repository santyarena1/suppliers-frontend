# Importación de listas de precios de proveedores — Diseño

Fecha: 2026-09-03. Estado: aprobado en conversación, pendiente de implementación.

## Problema

Hay proveedores y marcas que no tienen API ni portal: mandan su lista de precios
por WhatsApp o mail como Excel. Hoy la única vía es `FileImportService`, que
asume encabezado en la fila 1 y columnas con nombres fijos, y se rompe con
celdas unificadas, filas divisorias por marca o categoría, logos arriba, etc.

## Objetivo

Que cualquier usuario pueda crear un proveedor "por lista", configurarlo igual
que uno con API, subirle planillas desde su ficha, y que el sistema:

1. detecte la estructura de la planilla (hoja, fila de encabezado, divisores),
2. reconozca al proveedor por la huella del archivo y aplique un perfil guardado,
3. use IA solo la primera vez (o cuando cambia el formato) para proponer el perfil,
4. calcule el diff contra la carga anterior,
5. aplique solo si pasa chequeos de sanidad; si no, pida revisión,
6. permita revertir la última carga,
7. avise cuando una lista está vencida según la cadencia esperada.

## Decisiones

- **Proveedor por lista = `Tenant`** tipo DISTRIBUTOR o BRAND con `providerKey`
  autogenerado (`LIST_<SLUG>`), único e inmutable. No se crea entidad nueva.
- **`Provider` deja de ser unión cerrada.** Pasa a `string`; los 14 con adapter
  quedan en `KNOWN_PROVIDERS`. Etiquetas y logos se resuelven desde `Tenant` y
  `ProviderDisplayConfig`, con el mapa fijo como fallback.
- **Ficha del producto común** (`ProviderSyncCache`), la escribe quien suba.
- **Precio base** (`SupplierBaseOffer`, clave `provider+externalId`): solo lo
  escribe el proveedor dueño del `providerKey` o un superadmin. Lo ven todos los
  comercios vinculados (`TenantLink`), aplicando `discountPercent` del vínculo y
  el markup propio.
- **Precio propio** (`TenantProductOffer`, ya existe): lo escribe un comercio
  tipo 1 al subir su lista. Solo lo ve él. Si no tiene propio cae al base; si no
  hay base ve "sin precio".
- **La última carga aplicada de cada nivel manda** hasta que llegue otra.
- **Auto-aplicar (opción C)**: perfil conocido + diff sano → APPLIED. Cualquier
  chequeo que salte → NEEDS_REVIEW, no toca nada, notifica.
- **Costo de IA acotado**: una llamada por proveedor nuevo o cambio de formato,
  con encabezado + 25 filas de muestra. Proveedor estable: cero.
- **Canales automáticos (mail IMAP, Drive) quedan para fase 2**, fuera de este
  spec. El pipeline recibe "un archivo + quién lo sube + para qué proveedor",
  independiente del origen.

## Modelo de datos (Prisma)

```
SupplierBaseOffer   provider, externalId (unique), price, finalPrice, currency,
                    ivaPercent, stock, stockStatus, syncedAt, updatedAt
ImportProfile       id, provider, version, status (PROPOSED|ACTIVE|ARCHIVED),
                    fingerprint (hash), sheetName, sheetIndex, headerRow,
                    columnMap Json {header -> field|null}, currency,
                    priceIncludesIva Boolean, ivaPercent Decimal?,
                    numberFormat (DOT|COMMA), dividerMeaning (BRAND|CATEGORY|IGNORE),
                    sampleRows Json, proposedByAi Boolean, approvedByUserId?, createdAt
SupplierListImport  id, provider, tenantId (quien sube), uploadedByUserId,
                    level (BASE|TENANT), originalFileName, storedAssetId,
                    profileId?, status (PROCESSING|NEEDS_REVIEW|APPLIED|
                    DISCARDED|REVERTED|FAILED), rowsTotal, rowsData,
                    summary Json {created, priceChanged, unchanged, missing,
                    issues}, reviewReasons Json[], diff Json (muestras por grupo),
                    snapshot Json (ofertas previas), error?, createdAt, appliedAt?
ImportRowIssue      id, importId, row, column?, message
ProviderSyncConfig  + expectedUpdateDays Int? (null = no aplica)
Tenant.providerKey  se genera para proveedores por lista
PlatformSettings    + umbrales de sanidad (JSON) con defaults
```

Historial de precio base: `ProductPriceHistory` con `tenantId` = tenant de
plataforma (`PLATFORM_TENANT_ID`, constante, se crea en seed si no existe).

## Motor de parseo (`apps/api/src/list-import/`)

1. `grid-reader.ts` — lee xlsx/xls/csv con `xlsx` en modo crudo: matriz de
   celdas con valor, tipo, rangos unificados y estilo si existe.
2. `structure-analyzer.ts` — determinístico. Clasifica filas en HEADER, DIVIDER,
   DATA, EMPTY, FOOTER. Elige la hoja con más DATA, ubica la fila de encabezado,
   asigna a cada DATA su divisor vigente. Emite huella = hash(encabezados
   normalizados + nº hojas).
3. `profile-resolver.ts` — huella exacta → perfil; parcial (columnas clave
   iguales) → perfil + revisión; ninguna → aprendiz.
4. `profile-learner.ts` — llama a OpenAI (vía infraestructura de
   `catalog-ai.service.ts`) con encabezado + 25 filas + 3 divisores; JSON
   estricto validado con esquema. Resultado = perfil PROPOSED, siempre pasa por
   revisión humana.
5. `row-normalizer.ts` — perfil + filas → `NormalizedProduct[]` + issues.
   `externalId` = código del proveedor, o hash(nombre normalizado + marca) si la
   lista no trae código.
6. `diff.ts` — compara contra la última carga APPLIED del mismo provider+level.
7. `sanity-checks.ts` — umbrales por defecto: missing > 30 %, priceChanged >
   80 %, todos los cambios con el mismo %, > 5 % filas con precio inválido,
   filas < 50 % de la carga anterior, perfil parcial o PROPOSED.
8. `apply.ts` — snapshot → reutiliza `runSync`/`upsertPage` de
   `ProvidersService`, escribiendo en `SupplierBaseOffer` o `TenantProductOffer`
   según `level`. Revert = restaurar snapshot, solo la última carga del nivel.
9. Procesamiento en cola BullMQ (`list-import`), reintento ×2, luego FAILED.

`FileImportService` actual se elimina; su endpoint pasa a usar este motor.

## Frescura

`expectedUpdateDays` por proveedor. Ficha: última carga, próxima esperada,
semáforo (verde / amarillo a 2 días / rojo vencido). Buscador: junto a la fecha
de actualización del producto, leyenda "Lista vencida, se sugiere actualizar"
para quien pueda subir. Cron diario → `OrgNotification` al proveedor y superadmin.

## Endpoints

```
POST   /providers                                  crear proveedor por lista
POST   /providers/:key/imports                     subir archivo (multipart)
GET    /providers/:key/imports                     historial
GET    /providers/:key/imports/:id                 detalle, diff, issues
POST   /providers/:key/imports/:id/apply
POST   /providers/:key/imports/:id/discard
POST   /providers/:key/imports/:id/revert
GET    /providers/:key/import-profile
PUT    /providers/:key/import-profile
POST   /providers/:key/import-profile/suggest
GET    /providers/:key/freshness
```

Permisos: subir/editar perfil/revertir → superadmin; OWNER/ADMIN del tenant
dueño del `providerKey` (nivel BASE); OWNER/ADMIN de un comercio vinculado
(nivel TENANT).

## Pantallas (`apps/web/app/(app)/proveedores/`)

1. Listado: botón "Nuevo proveedor" → formulario (nombre, tipo, cadencia, y el
   bloque de configuración existente).
2. Ficha `[provider]`: pestaña "Listas" solo si no hay adapter: frescura, zona
   de subida, historial con revertir.
3. `[provider]/listas/[importId]`: motivo de revisión, diff por grupo con
   buscador, issues resaltados, botones Aplicar / Descartar / Corregir perfil.
4. `[provider]/listas/perfil`: primeras 30 filas crudas, selector de campo por
   columna, opciones (hoja, fila encabezado, moneda, IVA, formato, divisores),
   "Sugerir con IA", "Guardar y reprocesar". Cada guardado = versión nueva.
5. Buscador: leyenda de lista vencida.

## Errores

Toda carga termina en un estado visible. Archivo ilegible → FAILED. IA falla →
editor vacío, la carga no se pierde. Falla a mitad de aplicación → snapshot
previo permite revert. Job muerto → 2 reintentos → FAILED con error guardado.

## Tests

Unitarios con fixtures reales del analizador (encabezado en fila N, celdas
unificadas, divisores por color, dos hojas, "1.234,50", csv), del diff, de cada
chequeo, del normalizador. Integración: subida → oferta escrita (BASE y TENANT)
y revert. Aprendiz con respuesta mockeada; validación de esquema real.

## Fases

1. Proveedores dinámicos: `Provider` abierto, crear proveedor con config,
   `SupplierBaseOffer`, lectura base/propio en buscador.
2. Motor + carga manual: lector, analizador, normalizador, perfil manual +
   editor, diff, chequeos, auto-aplicar, revisión, revert, pestaña Listas.
3. IA + frescura: aprendiz, "Sugerir con IA", `expectedUpdateDays`, semáforo,
   leyenda, notificación.
4. (Futuro) IMAP / Drive como fuentes de ingesta.
