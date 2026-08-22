import { asNumber, asRecord, asString } from "./json-value";

export interface ElitRscOrder {
  orderNumber: string;
  invoiceNumber: string;
  status: string;
  date: string;
  amount: number | null;
  currency: string;
  form: string;
  warehouseName?: string;
  saleCondition?: string;
  shippingMethod?: string;
}

export interface ElitRscMovement {
  date: string;
  form: string;
  number: string;
  debit: number | null;
  credit: number | null;
  total: number | null;
  balance: number | null;
  balanceUsd: number | null;
  currency: string;
}

function extractObjectsWithKey(text: string, key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let from = 0;
  while (from < text.length) {
    const hit = text.indexOf(key, from);
    if (hit < 0) break;
    const start = text.lastIndexOf("{", hit);
    if (start < 0) {
      from = hit + key.length;
      continue;
    }
    try {
      const parsed = decodeJson(text.slice(start));
      if (parsed.ok) {
        const rec = asRecord(parsed.value);
        const id = rec ? asString(rec._id) || asString(rec.number) || `${start}` : `${start}`;
        if (rec && !seen.has(id)) {
          seen.add(id);
          out.push(rec);
        }
        from = start + parsed.end;
        continue;
      }
    } catch {
      /* fall through */
    }
    from = hit + key.length;
  }
  return out;
}

function decodeJson(slice: string): { ok: true; value: unknown; end: number } | { ok: false } {
  try {
    const { value, end } = scanJson(slice);
    return { ok: true, value, end };
  } catch {
    return { ok: false };
  }
}

/** Parsea un JSON embebido en el RSC de Next (sin eval). */
function scanJson(slice: string): { value: unknown; end: number } {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { value: JSON.parse(slice.slice(0, i + 1)), end: i + 1 };
      }
    }
  }
  throw new Error("unterminated json");
}

function currencyLabel(code: unknown): string {
  const n = asNumber(code);
  if (n === 2) return "USD";
  if (n === 1) return "ARS";
  return asString(code) || "";
}

export function parseElitPedidosRsc(rsc: string): ElitRscOrder[] {
  return extractObjectsWithKey(rsc, '"form":"NOTA DE VENTA"').map((rec) => {
    const ship = asRecord(rec.shippingMethodInfo);
    const sale = asRecord(rec.saleConditionInfo);
    return {
      orderNumber: asString(rec.number) || asString(rec.internalNumber) || "",
      invoiceNumber: asString(rec.invoiceNumber) || "",
      status: asString(rec.message) || asString(rec.status) || "",
      date: asString(rec.date) || "",
      amount: asNumber(rec.debit) ?? asNumber(rec.balance) ?? null,
      currency: currencyLabel(rec.currency),
      form: asString(rec.form) || "NOTA DE VENTA",
      warehouseName: asString(rec.warehouseName),
      saleCondition: asString(sale?.name) || asString(rec.saleCondition),
      shippingMethod: asString(ship?.name) || asString(rec.shippingMethod),
    };
  });
}

export function parseElitCtaRsc(rsc: string): { balance: number | null; movements: ElitRscMovement[] } {
  const rows = extractObjectsWithKey(rsc, '"invoiceCode":').filter((rec) => asString(rec.form));
  const movements = rows.map((rec) => ({
    date: asString(rec.date) || "",
    form: asString(rec.form) || "",
    number: asString(rec.number) || "",
    debit: asNumber(rec.debit) ?? null,
    credit: asNumber(rec.credit) ?? null,
    total: asNumber(rec.total) ?? null,
    balance: asNumber(rec.balance) ?? null,
    balanceUsd: asNumber(rec.balanceUSD) ?? null,
    currency: currencyLabel(rec.currency),
  }));
  const saldo = movements.find((m) => /saldo/i.test(m.form));
  const first = movements[0];
  return {
    balance: first?.balanceUsd ?? first?.balance ?? saldo?.total ?? null,
    movements,
  };
}

export { scanJson as scanEmbeddedJson };
