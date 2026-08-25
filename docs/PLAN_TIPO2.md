# Tipo 2 — Cerrar el distribuidor

Fuente de verdad de este tipo. El modelo general está en
`docs/ARQUITECTURA_TENANTS.md`. El comercio (Tipo 1) ya está cerrado en
`docs/PLAN_TIPO1.md` y no se reabre acá.

NODO para el mayorista es **cartera**, no para comprar. No busca precios, no
arma carrito, no confirma pedidos propios. Administra los comercios que le
compran, el código con el que entran, el descuento de cada cuenta, el vendedor
asignado y el chat con el local.

No hay alta pública de distribuidor. Lo crea el superadmin porque lleva
`providerKey`. El Product Manager queda para más adelante: si alguien tiene ese
rol, ve Configuración y un aviso, no un panel.

---

## 1. Roles en pantalla

Nunca slugs. Nunca “Dueño”. Nunca la clave del proveedor.

| Rol interno | En pantalla | Qué hace |
|---|---|---|
| `OWNER` | Gerente | Equipo, códigos + QR, descuento por comercio, publicidad, asignar vendedor a cada cliente. No se puede dejar la organización sin un gerente activo. |
| `ADMIN` | Administrador | Lo mismo en el día a día. No reemplaza al gerente para el “último al mando”. |
| `SELLER` | Vendedor | **Solo sus clientes** (`TenantLink.accountManagerId`). Resumen de pedidos, contacto, descuento puntual, chat. No ve el comercio de un compañero. |
| `PRODUCT_MANAGER` | Product Manager | Más adelante. |
| `VIEWER` | Solo lectura | Mira cartera, pedidos y chat. No edita, no genera códigos, no escribe. |

---

## 2. Qué ve y qué no

Navegación del distribuidor: Inicio (resumen), Cartera, Códigos (gerente y
administrador), Pedidos de clientes, Chat, Configuración.

No aparecen búsqueda, carrito, pedidos propios ni el listado de proveedores
para comprar. Eso es del comercio.

En Configuración: Empresa, Equipo, Publicidad, Preferencias. El tilde del
comprador y el canje de códigos no aplican.

El comercio **sí** gana el chat en esta tanda: el hilo es el vínculo, y se ve
de los dos lados.

---

## 3. Cartera

Lista de comercios con `TenantLink` hacia este distribuidor.

- Gerente y administrador ven todos.
- Vendedor ve solo los que tiene asignados. Si no tiene ninguno, la lista
  queda vacía: no existe “el resto de la empresa”.
- Solo lectura ve lo mismo que el gerente, sin botones.

Por cliente:

- Nombre y contacto del local (`Tenant.name`, email, teléfono).
- Vendedor asignado. Lo cambia el gerente o el administrador.
- Descuento del vínculo, en porcentaje. Lo carga el mayorista. El comercio
  **no lo ve ni lo edita** (Tipo 1). **No se aplica al precio de catálogo**
  en esta tanda: se guarda y se muestra en la cartera. Aplicarlo al pedido
  es otra decisión, después.
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
(el vendedor del mayorista, solo si es *su* cliente).

Quién escribe: del local, quien no es solo lectura. Del mayorista, gerente,
administrador y el vendedor asignado. Solo lectura mira.

El mensaje no sale de ese vínculo. Un vendedor no entra al chat de un
compañero.

---

## 7. Equipo

Igual que el comercio: invitar genera una contraseña de una sola vez. Roles
que se pueden invitar acá: Gerente, Administrador, Vendedor, Solo lectura.
Product Manager no se invita desde este panel.

---

## 8. Lo que no entra

- Aplicar el descuento al listado de precios ni al checkout.
- Panel del Product Manager.
- Alta pública de distribuidor.
- Cupos de descuento, metas, alertas de inactivos, visibilidad de la
  competencia.
- Tipo 3 (marca). El Portal de Marcas se deja como está.
- Adapters de proveedor.
