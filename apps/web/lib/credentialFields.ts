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
      "Cada usuario de Nodo carga la suya. Se guarda cifrada y no se comparte con el resto: cuando otro compañero entre, va a completar esta misma pantalla con su usuario de nb.com.ar.",
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
      "Cada usuario de Nodo carga la suya. Se guarda cifrada y no se comparte con el resto.",
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
      "Cada usuario de Nodo carga la suya. Se guarda cifrada y no se comparte con el resto.",
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
      "Cada usuario de Nodo carga la suya. Se guarda cifrada y no se comparte con el resto.",
    extra: "User ID y token de la API de clientes.elit.com.ar.",
    portalUrl: "https://clientes.elit.com.ar",
    portalLabel: "clientes.elit.com.ar",
    fields: [
      {
        key: "user_id",
        label: "User ID",
        type: "text",
        required: true,
        placeholder: "User ID de ELIT",
        aliases: ["userId", "user"],
      },
      {
        key: "token",
        label: "Token",
        type: "password",
        required: true,
        placeholder: "Token de la API",
        aliases: ["apiToken"],
      },
    ],
  },
  GRUPO_NUCLEO: {
    title: "Conectar tu cuenta de Grupo Núcleo",
    intro:
      "Cada usuario de Nodo carga la suya. Se guarda cifrada y no se comparte con el resto.",
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
