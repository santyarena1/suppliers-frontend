import type { Provider } from "./api";

export type CredentialFieldType = "text" | "password";

export interface CredentialField {
  key: string;
  label: string;
  type: CredentialFieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  aliases?: string[];
  autoComplete?: string;
}

export interface CredentialSchema {
  title: string;
  intro: string;
  extra?: string;
  portalUrl?: string;
  portalLabel?: string;
  fields: CredentialField[];
}

export const PROVIDER_CREDENTIAL_SCHEMAS: Partial<Record<Provider, CredentialSchema>> = {
  NEW_BYTES: {
    title: "Conectar tu cuenta de NewBytes",
    intro:
      "Es la cuenta de tu organización: se guarda cifrada y la comparte todo tu equipo, así que tus compañeros no tienen que volver a cargarla.",
    extra:
      "Usuario y contraseña del portal habilitan catálogo completo, pedidos y cuenta corriente. El token de lista de precios es un respaldo opcional (solo catálogo CSV).",
    portalUrl: "https://www.nb.com.ar",
    portalLabel: "www.nb.com.ar",
    fields: [
      {
        key: "user",
        label: "Usuario",
        type: "text",
        required: true,
        placeholder: "Usuario de nb.com.ar",
        help: "El mismo usuario con el que entrás al portal.",
        aliases: ["username", "usuario"],
        autoComplete: "username",
      },
      {
        key: "password",
        label: "Contraseña",
        type: "password",
        required: true,
        placeholder: "Contraseña del portal",
        aliases: ["pass", "passwd"],
        autoComplete: "current-password",
      },
      {
        key: "token",
        label: "Token de lista de precios",
        type: "password",
        required: false,
        placeholder: "Opcional",
        help: "Respaldo si el login no está disponible. Lo sacás del portal, en la lista de precios CSV.",
        aliases: ["readToken"],
      },
    ],
  },
  INVID: {
    title: "Conectar tu cuenta de Invid",
    intro:
      "Es la cuenta de tu organización: se guarda cifrada y la comparte todo tu equipo.",
    extra: "Usuario y contraseña del portal invidcomputers.com.",
    portalUrl: "https://www.invidcomputers.com",
    portalLabel: "invidcomputers.com",
    fields: [
      {
        key: "username",
        label: "Usuario",
        type: "text",
        required: true,
        placeholder: "Usuario de Invid",
        aliases: ["user", "usuari"],
        autoComplete: "username",
      },
      {
        key: "password",
        label: "Contraseña",
        type: "password",
        required: true,
        placeholder: "Contraseña del portal",
        aliases: ["pass", "passwd"],
        autoComplete: "current-password",
      },
    ],
  },
  AIR: {
    title: "Conectar tu cuenta de Air",
    intro:
      "Es la cuenta de tu organización: se guarda cifrada y la comparte todo tu equipo.",
    extra: "Usuario y contraseña del portal www.air-intra.com.",
    portalUrl: "https://www.air-intra.com",
    portalLabel: "www.air-intra.com",
    fields: [
      {
        key: "user",
        label: "Usuario",
        type: "text",
        required: true,
        placeholder: "Usuario de Air",
        aliases: ["username"],
        autoComplete: "username",
      },
      {
        key: "pass",
        label: "Contraseña",
        type: "password",
        required: true,
        placeholder: "Contraseña del portal",
        aliases: ["password"],
        autoComplete: "current-password",
      },
    ],
  },
  ELIT: {
    title: "Conectar tu cuenta de ELIT",
    intro:
      "Es la cuenta de tu organización: se guarda cifrada y la comparte todo tu equipo.",
    extra:
      "User ID y token sincronizan el catálogo (clientes.elit.com.ar). Nro. de cliente y contraseña del portal habilitan pedidos y cuenta corriente en elit.com.ar.",
    portalUrl: "https://www.elit.com.ar",
    portalLabel: "www.elit.com.ar",
    fields: [
      {
        key: "user_id",
        label: "User ID (API catálogo)",
        type: "text",
        required: false,
        placeholder: "User ID de la API de clientes",
        help: "Opcional si ya cargás nro. de cliente y contraseña. Sirve para sincronizar el catálogo.",
        aliases: ["userId", "user"],
      },
      {
        key: "token",
        label: "Token (API catálogo)",
        type: "password",
        required: false,
        placeholder: "Token de la API",
        aliases: ["apiToken"],
      },
      {
        key: "id",
        label: "Nº de cliente (portal)",
        type: "text",
        required: false,
        placeholder: "El mismo número con el que entrás a elit.com.ar",
        help: "Para pedidos y cta. cte. Si está vacío se usa el User ID.",
        aliases: ["clientId", "nroCliente"],
        autoComplete: "username",
      },
      {
        key: "password",
        label: "Contraseña del portal",
        type: "password",
        required: false,
        placeholder: "Contraseña de elit.com.ar",
        aliases: ["pass"],
        autoComplete: "current-password",
      },
      {
        key: "agent",
        label: "Agente (opcional)",
        type: "text",
        required: false,
        placeholder: "Solo si tu login es nro-agente",
        help: "El form de Elit parte nro-agente. Dejalo vacío si no aplica.",
      },
    ],
  },
  GRUPO_NUCLEO: {
    title: "Conectar tu cuenta de Grupo Núcleo",
    intro:
      "Es la cuenta de tu organización: se guarda cifrada y la comparte todo tu equipo.",
    extra: "ID de empresa, usuario y contraseña de la API de Grupo Núcleo.",
    fields: [
      {
        key: "id",
        label: "ID de empresa",
        type: "text",
        required: true,
        placeholder: "ID numérico",
        aliases: ["empresaId"],
      },
      {
        key: "username",
        label: "Usuario",
        type: "text",
        required: true,
        placeholder: "Usuario",
        aliases: ["user"],
        autoComplete: "username",
      },
      {
        key: "password",
        label: "Contraseña",
        type: "password",
        required: true,
        placeholder: "Contraseña",
        aliases: ["pass"],
        autoComplete: "current-password",
      },
    ],
  },
  CEVEN: {
    title: "Ceven",
    intro: "El catálogo público de ceven.com se sincroniza sin login.",
    extra:
      "Precios de lista en ARS (SuiteCommerce). No es precio mayorista autenticado — si más adelante hay cuenta, se puede cargar acá.",
    portalUrl: "https://www.ceven.com/catalogo",
    portalLabel: "ceven.com",
    fields: [],
  },
  DIAPSTORE: {
    title: "Diapstore",
    intro: "El catálogo público de diapstore.com se sincroniza sin login.",
    extra:
      "La vista pública de api.cumar.com.ar trae nombre, SKU, stock e imagen. El precio mayorista no viene en esa vista (unit_price llega null) — no se inventa.",
    portalUrl: "https://diapstore.com",
    portalLabel: "diapstore.com",
    fields: [
      {
        key: "account_id",
        label: "Account ID (opcional)",
        type: "text",
        required: false,
        placeholder: "Solo si Simple Gestion te da otra cuenta",
        aliases: ["accountId"],
      },
    ],
  },
  POLYTECH: {
    title: "Conectar tu cuenta de Polytech",
    intro: "API Key de Gestión Resellers (HTTP Basic Auth). Se guarda cifrada y es solo tuya.",
    extra:
      "Endpoint confirmado: gestionresellers.com.ar/api/extranet/item/search. Falta una respuesta real para mapear campos.",
    portalUrl: "https://www.gestion-resellers.com.ar",
    portalLabel: "Gestión Resellers",
    fields: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "Key de Gestión Resellers",
        aliases: ["apiKey", "key", "token"],
      },
    ],
  },
  NEW_TREE: {
    title: "Conectar tu cuenta de NewTree",
    intro: "Usuario SOAP de GlobalBluePoint / NewTree. Se guarda cifrada y es solo tuya.",
    extra:
      "Protocolo SOAP (AuthenticateUser + getArticulos). Hace falta una llamada de prueba con tu cuenta para mapear el XML/JSON exacto.",
    portalUrl: "https://ws.globalbluepoint.com/newtree/app_webservices/wserpconnect.asmx",
    portalLabel: "WSDL NewTree",
    fields: [
      { key: "username", label: "Usuario", type: "text", required: true, aliases: ["user", "PUSERNAME"], autoComplete: "username" },
      { key: "password", label: "Contraseña", type: "password", required: true, aliases: ["pass", "PPASSWORD"], autoComplete: "current-password" },
      { key: "company", label: "Company", type: "text", required: true, aliases: ["PCOMPANY"] },
      { key: "webservice", label: "Web service ID", type: "text", required: false, help: "PWEBSERVICE. NewTree lo confirma.", aliases: ["PWEBSERVICE"] },
      { key: "client_id", label: "Client ID (getArticulos)", type: "text", required: false, placeholder: "15 por defecto en la doc", aliases: ["clientId"] },
    ],
  },
  HDC: {
    title: "Conectar tu cuenta de HDC",
    intro: "HDC corre sobre GlobalBluePoint (mismo SOAP que NewTree). Se guarda cifrada y es solo tuya.",
    extra: "Portal hdcsa.com.ar. Falta una llamada autenticada para mapear el catálogo.",
    portalUrl: "https://www.hdcsa.com.ar",
    portalLabel: "hdcsa.com.ar",
    fields: [
      { key: "username", label: "Usuario", type: "text", required: true, aliases: ["user"], autoComplete: "username" },
      { key: "password", label: "Contraseña", type: "password", required: true, aliases: ["pass"], autoComplete: "current-password" },
    ],
  },
  SOLUTION_BOX: {
    title: "Conectar tu cuenta de Solution Box",
    intro: "Usuario y contraseña de la API (createToken). Se guarda cifrada y es solo tuya.",
    extra:
      "Límite documentado: 2 requests/hora. El host lxc.solutionbox.com.ar todavía no expone el endpoint de artículos en las rutas probadas.",
    portalUrl: "https://www.solutionbox.com.ar",
    portalLabel: "solutionbox.com.ar",
    fields: [
      { key: "user", label: "Usuario API", type: "text", required: true, aliases: ["username", "usuario"], autoComplete: "username" },
      { key: "password", label: "Contraseña API", type: "password", required: true, aliases: ["pass"], autoComplete: "current-password" },
    ],
  },
  GC: {
    title: "Gaming City",
    intro: "La lista de precios es pública (Google Sites / Apps Script). No pide login.",
    extra:
      "Solo trae producto y precio (ARS, IVA incluido), sin SKU ni stock. Importá el Excel del listado en Sincronización hasta que esté el scraper de obtenerDatosFinales.",
    portalUrl: "https://sites.google.com/view/gcgremio/lista-general",
    portalLabel: "Lista Gaming City",
    fields: [],
  },
  ASHIR: {
    title: "Conectar tu cuenta de Ashir",
    intro: "Todavía no hay API documentada. Guardá lo que te dé Ashir para cuando esté el adapter.",
    extra: "ashir.com.ar es WordPress; no hay endpoint de catálogo público confirmado.",
    portalUrl: "https://ashir.com.ar",
    portalLabel: "ashir.com.ar",
    fields: [
      { key: "user", label: "Usuario", type: "text", required: false, aliases: ["username"], autoComplete: "username" },
      { key: "password", label: "Contraseña", type: "password", required: false, aliases: ["pass"], autoComplete: "current-password" },
    ],
  },
  DISTECNA: {
    title: "Conectar tu cuenta de Distécna",
    intro: "Distécna tiene API (api@distecna.com) pero la documentación no es pública.",
    extra: "Pedí acceso a api@distecna.com. Cuando llegue el contrato se arma el adapter sin adivinar campos.",
    portalUrl: "https://www.distecna.com",
    portalLabel: "distecna.com",
    fields: [
      { key: "user", label: "Usuario", type: "text", required: false, aliases: ["username"], autoComplete: "username" },
      { key: "password", label: "Contraseña", type: "password", required: false, aliases: ["pass"], autoComplete: "current-password" },
      { key: "token", label: "Token / API key", type: "password", required: false, aliases: ["apiKey", "api_key"] },
    ],
  },
};

export function emptyValues(schema: CredentialSchema): Record<string, string> {
  return Object.fromEntries(schema.fields.map((field) => [field.key, ""]));
}

/** Une lo guardado con el schema: si solo había token, igual aparecen usuario y contraseña vacíos. */
export function valuesFromSaved(
  schema: CredentialSchema,
  saved: Record<string, string>
): Record<string, string> {
  const values = emptyValues(schema);
  for (const field of schema.fields) {
    const keys = [field.key, ...(field.aliases ?? [])];
    for (const key of keys) {
      const raw = saved[key];
      if (raw != null && String(raw).length > 0) {
        values[field.key] = String(raw);
        break;
      }
    }
  }
  return values;
}

export function toSavePayload(
  schema: CredentialSchema,
  values: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of schema.fields) {
    const value = (values[field.key] ?? "").trim();
    if (value) out[field.key] = value;
  }
  return out;
}

export function validateCredentialValues(
  provider: Provider,
  values: Record<string, string>
): string | null {
  const schema = PROVIDER_CREDENTIAL_SCHEMAS[provider];
  if (!schema) {
    const hasAny = Object.values(values).some((value) => value.trim());
    return hasAny ? null : "Cargá al menos un campo.";
  }

  if (provider === "NEW_BYTES") {
    const user = (values.user ?? "").trim();
    const password = (values.password ?? "").trim();
    const token = (values.token ?? "").trim();
    if (user && password) return null;
    if (token) return null;
    if (user || password) {
      return "Completá usuario y contraseña juntos, o el token de lista de precios.";
    }
    return "Cargá usuario y contraseña de nb.com.ar, o el token de lista de precios.";
  }

  if (provider === "ELIT") {
    const userId = (values.user_id ?? "").trim();
    const token = (values.token ?? "").trim();
    const password = (values.password ?? "").trim();
    const id = (values.id ?? "").trim();
    if ((id || userId) && password) return null;
    if (userId && token) return null;
    if (password) return "Cargá el nº de cliente junto con la contraseña del portal.";
    return "Cargá nro. de cliente y contraseña del portal, o user id y token de catálogo.";
  }

  for (const field of schema.fields) {
    if (field.required && !(values[field.key] ?? "").trim()) {
      return `Falta ${field.label.toLowerCase()}.`;
    }
  }
  return null;
}

export function hasNewBytesPortalLogin(values: Record<string, string>): boolean {
  return Boolean((values.user ?? "").trim() && (values.password ?? "").trim());
}

export function hasElitPortalLogin(values: Record<string, string>): boolean {
  const id = (values.id ?? values.user_id ?? "").trim();
  const password = (values.password ?? "").trim();
  return Boolean(id && password);
}
