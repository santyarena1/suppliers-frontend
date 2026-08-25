# Tipo 2 — Cerrar el distribuidor

Fuente de verdad de este tipo. El modelo general está en
`docs/ARQUITECTURA_TENANTS.md`. El comercio (Tipo 1) ya está cerrado en
`docs/PLAN_TIPO1.md` y no se reabre acá.

NODO para el mayorista es **cartera** y **su catálogo**. No le compra a otras
integraciones, no arma carrito, no confirma pedidos propios. Administra los
comercios que le compran, el código con el que entran, el descuento de cada
cuenta, el descuento por marca, el vendedor asignado y el chat con el local.

No hay alta pública de distribuidor. Lo crea el superadmin porque lleva
`providerKey`.

---

## 1. Roles en pantalla

Nunca slugs. Nunca “Dueño”. Nunca la clave del proveedor.

| Rol interno | En pantalla | Qué hace |
|---|---|---|
| `OWNER` | Gerente | Equipo (incluido Product Manager y sus marcas), códigos + QR, descuento por comercio, descuento por marca, publicidad, asignar vendedor a cada cliente. No se puede dejar la organización sin un gerente activo. |
| `ADMIN` | Administrador | Lo mismo en el día a día. No reemplaza al gerente para el “último al mando”. |
| `SELLER` | Vendedor | **Solo sus clientes** (`TenantLink.accountManagerId`). Resumen de pedidos, contacto, descuento puntual, chat. No ve el comercio de un compañero. Ve el catálogo propio, sin carrito. |
| `PRODUCT_MANAGER` | Product Manager | Solo las marcas de su `ProductManagerScope`, dentro de este distribuidor. Busca ese recorte y carga el descuento de esas marcas (lista general o locales). Ve **toda** la cartera: todos los comercios de todos los vendedores y quién está asignado a cada uno. No edita vendedor ni descuento de cuenta, no entra a códigos, publicidad ni chat. Si no tiene marcas, el catálogo queda vacío. |
| `VIEWER` | Solo lectura | Mira cartera, pedidos, chat y catálogo. No edita, no genera códigos, no escribe. |

---

## 2. Qué ve y qué no

Navegación del distribuidor: Inicio, **Búsqueda** (solo su catálogo), Cartera
(el Product Manager ve todos los clientes y el vendedor de cada uno),
Códigos (gerente y administrador), Pedidos de clientes, Chat, Configuración.

No aparecen carrito, pedidos propios ni el listado de proveedores para comprar.
Eso es del comercio. En búsqueda no hay “agregar al carrito” ni otras
integraciones.

En Configuración: Empresa, Equipo, Publicidad, Marcas (descuentos), Preferencias.
El tilde del comprador y el canje de códigos no aplican.

El comercio **sí** gana el chat: el hilo es el vínculo, y se ve de los dos lados.

---

## 3. Cartera

Lista de comercios con `TenantLink` hacia este distribuidor.

- Gerente y administrador ven todos.
- Vendedor ve solo los que tiene asignados. Si no tiene ninguno, la lista
  queda vacía: no existe “el resto de la empresa”.
- Solo lectura ve lo mismo que el gerente, sin botones.
- Product Manager ve todos, con el vendedor de cada uno. No edita.

Por cliente:

- Nombre y contacto del local (`Tenant.name`, email, teléfono).
- Vendedor asignado. Lo cambia el gerente o el administrador.
- Descuento del vínculo, en porcentaje. Lo carga el mayorista. El comercio
  **no lo ve ni lo edita** (Tipo 1). **Sí se aplica** al precio de catálogo
  cuando el comercio lo lee.
- Resumen de pedidos de ese comercio **hacia este proveedor**
  (`ProviderOrder.provider = Tenant.providerKey`).

El distribuidor **no** carga la cuenta API del local. Le da un código o le
abre la cuenta en *su* portal; el comercio la pega en NODO.

---

## 4. Códigos y QR

El gerente (o el administrador) genera un `TenantAccessCode`. En pantalla:

- El código escrito, para dictar o copiar.
- Un QR que **es ese mismo código**. El comercio lo tipea o lo escanea con
  la cámara del celular (eso ya existe en Tipo 1).

Reglas que no se tocan: el canje no revela a qué organización pertenece el
código antes de completarse, y no se pueden enumerar códigos. Recién después
del canje el mayorista ve qué local lo usó.

---

## 5. Publicidad

Un tilde en Configuración: `Tenant.advertisingEnabled`. Lo prende el gerente
o el administrador. Es lo que ya usa el descubrimiento cerrado: sin el tilde,
un comercio no vinculado no sabe que este mayorista existe. Con el tilde,
aparece como publicidad paga, sin abrirle el catálogo.

---

## 6. Chat

Un hilo por `TenantLink`. No es un CRM.

Quién lee: cualquiera de las dos organizaciones que pueda ver ese vínculo
(el vendedor del mayorista, solo si es *su* cliente). El Product Manager no.

Quién escribe: del local, quien no es solo lectura. Del mayorista, gerente,
administrador y el vendedor asignado. Solo lectura mira.

El mensaje no sale de ese vínculo. Un vendedor no entra al chat de un
compañero.

---

## 7. Equipo

Igual que el comercio: invitar genera una contraseña de una sola vez. Roles
que se pueden invitar acá: Gerente, Administrador, Vendedor, Product Manager,
Solo lectura.

Al Product Manager el gerente le asigna marcas del catálogo propio
(`ProductManagerScope`). Superadmin también puede desde el árbol.

---

## 8. Búsqueda del mayorista

Lee la ficha global (`ProviderSyncCache`) de **su** `providerKey`. Si piden
otro proveedor, la respuesta es vacía. El Product Manager filtra por las
marcas de su alcance. El precio que ve el mayorista es de lista (sin el
descuento de cuenta, que es del comercio).

---

## 9. Descuentos

Al leer el precio del comercio:

`precio * (1 - cuenta/100) * (1 - marca/100) * (1 + markup/100)`

- **Cuenta**: `TenantLink.discountPercent`. Lo carga el mayorista. El comercio
  no ve el porcentaje.
- **Marca**: `TenantBrandDiscount`. Lo carga el gerente (todas) o el Product
  Manager (solo las suyas). **Lista general** (todos los vinculados) o
  **locales concretos**. El PM ve el nombre de los comercios para asignar;
  no entra a la cartera. El comercio no ve el porcentaje.
- **Markup**: lo carga el comercio sobre *su* oferta.

Se aplican al leer, no al guardar. La oferta conserva el valor crudo del
proveedor.

---

## 10. Lo que no entra

- Alta pública de distribuidor.
- Cupos de descuento, metas, alertas de inactivos, visibilidad de la
  competencia.
- Tipo 3 (marca). El Portal de Marcas se deja como está.
- Adapters de proveedor.
