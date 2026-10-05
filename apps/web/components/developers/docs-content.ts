/**
 * Ejemplos de código de la documentación pública de la API de catálogo.
 * El contrato está en docs/PLAN_API_CATALOGO.md.
 */
import type { CodeSample } from "./CodeTabs";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

const KEY = "nodo_pk_4fK9wQ2mZx7LcT1vB8nR0aYs";

export function firstRequest(): CodeSample[] {
  return [
    {
      lang: "curl",
      label: "cURL",
      code: `curl "${API_BASE}/v1/products?limit=20&inStock=true" \\
  -H "X-Api-Key: ${KEY}" \\
  -H "X-Api-Secret: $NODO_API_SECRET"`,
    },
    {
      lang: "js",
      label: "JavaScript",
      code: `const res = await fetch("${API_BASE}/v1/products?limit=20&inStock=true", {
  headers: {
    "X-Api-Key": process.env.NODO_API_KEY,
    "X-Api-Secret": process.env.NODO_API_SECRET,
  },
});
if (!res.ok) throw new Error((await res.json()).error.message);
const { data, pagination } = await res.json();`,
    },
    {
      lang: "python",
      label: "Python",
      code: `import os, requests

res = requests.get(
    "${API_BASE}/v1/products",
    params={"limit": 20, "inStock": "true"},
    headers={
        "X-Api-Key": os.environ["NODO_API_KEY"],
        "X-Api-Secret": os.environ["NODO_API_SECRET"],
    },
    timeout=30,
)
res.raise_for_status()
body = res.json()
products, pagination = body["data"], body["pagination"]`,
    },
    {
      lang: "php",
      label: "PHP",
      code: `<?php
$ch = curl_init("${API_BASE}/v1/products?limit=20&inStock=true");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "X-Api-Key: " . getenv("NODO_API_KEY"),
        "X-Api-Secret: " . getenv("NODO_API_SECRET"),
    ],
]);
$body = json_decode(curl_exec($ch), true);
$products = $body["data"];`,
    },
  ];
}

export function basicAuth(): CodeSample[] {
  return [
    {
      lang: "curl",
      label: "cURL",
      code: `curl -u "${KEY}:$NODO_API_SECRET" "${API_BASE}/v1/me"`,
    },
    {
      lang: "js",
      label: "JavaScript",
      code: `const token = Buffer.from(\`\${process.env.NODO_API_KEY}:\${process.env.NODO_API_SECRET}\`).toString("base64");
const res = await fetch("${API_BASE}/v1/me", { headers: { Authorization: \`Basic \${token}\` } });`,
    },
    {
      lang: "python",
      label: "Python",
      code: `requests.get("${API_BASE}/v1/me", auth=(os.environ["NODO_API_KEY"], os.environ["NODO_API_SECRET"]))`,
    },
    {
      lang: "php",
      label: "PHP",
      code: `curl_setopt($ch, CURLOPT_USERPWD, getenv("NODO_API_KEY") . ":" . getenv("NODO_API_SECRET"));`,
    },
  ];
}

export function pagination(): CodeSample[] {
  return [
    {
      lang: "js",
      label: "JavaScript",
      code: `async function* allProducts() {
  let cursor;
  do {
    const url = new URL("${API_BASE}/v1/products");
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers });
    const body = await res.json();
    yield* body.data;
    cursor = body.pagination.hasMore ? body.pagination.nextCursor : null;
  } while (cursor);
}

for await (const product of allProducts()) {
  // guardar en tu base
}`,
    },
    {
      lang: "python",
      label: "Python",
      code: `def all_products(session):
    cursor = None
    while True:
        params = {"limit": 500, **({"cursor": cursor} if cursor else {})}
        body = session.get("${API_BASE}/v1/products", params=params, timeout=60).json()
        yield from body["data"]
        if not body["pagination"]["hasMore"]:
            break
        cursor = body["pagination"]["nextCursor"]`,
    },
    {
      lang: "php",
      label: "PHP",
      code: `$cursor = null;
do {
    $query = http_build_query(array_filter(["limit" => 500, "cursor" => $cursor]));
    $body = nodo_get("/v1/products?" . $query); // tu helper con los headers
    foreach ($body["data"] as $product) { /* guardar */ }
    $cursor = $body["pagination"]["hasMore"] ? $body["pagination"]["nextCursor"] : null;
} while ($cursor);`,
    },
  ];
}

export function changesLoop(): CodeSample[] {
  return [
    {
      lang: "js",
      label: "JavaScript",
      code: `// 1. La primera vez: export completo y guardás el cursor actual.
let cursor = (await nodo("/v1/changes")).pagination.nextCursor;

// 2. Cada 1–5 minutos: traés solo lo que cambió.
async function sync() {
  let hasMore = true;
  while (hasMore) {
    const body = await nodo(\`/v1/changes?cursor=\${encodeURIComponent(cursor)}&limit=500\`);
    for (const change of body.data) {
      if (change.type === "offer.removed") await removeOffer(change.offer.id);
      else await upsertOffer(change.offer);
    }
    cursor = body.pagination.nextCursor; // guardalo en tu base
    hasMore = body.pagination.hasMore;
  }
}`,
    },
    {
      lang: "python",
      label: "Python",
      code: `def sync(cursor):
    while True:
        body = nodo("/v1/changes", params={"cursor": cursor, "limit": 500})
        for change in body["data"]:
            if change["type"] == "offer.removed":
                remove_offer(change["offer"]["id"])
            else:
                upsert_offer(change["offer"])
        cursor = body["pagination"]["nextCursor"]  # guardalo
        if not body["pagination"]["hasMore"]:
            return cursor`,
    },
  ];
}

export function verifySignature(): CodeSample[] {
  return [
    {
      lang: "js",
      label: "Node.js",
      code: `import crypto from "node:crypto";

/** rawBody: el cuerpo tal cual llegó (string), antes de parsear el JSON. */
export function verifyNodoSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express: app.post("/webhooks/nodo", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifyNodoSignature(req.body.toString("utf8"), req.get("Nodo-Signature"), process.env.NODO_WEBHOOK_SECRET))
//     return res.sendStatus(400);
//   res.sendStatus(200); // respondé rápido y procesá en segundo plano
// });`,
    },
    {
      lang: "python",
      label: "Python",
      code: `import hmac, hashlib, time

def verify_nodo_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.strip().split("=", 1) for p in header.split(","))
    timestamp = int(parts.get("t", "0"))
    if not timestamp or abs(time.time() - timestamp) > tolerance:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))

# Flask: verify_nodo_signature(request.get_data(), request.headers["Nodo-Signature"], os.environ["NODO_WEBHOOK_SECRET"])`,
    },
    {
      lang: "php",
      label: "PHP",
      code: `<?php
function verify_nodo_signature(string $rawBody, string $header, string $secret, int $tolerance = 300): bool {
    $parts = [];
    foreach (explode(",", $header) as $pair) {
        [$k, $v] = array_map("trim", explode("=", $pair, 2));
        $parts[$k] = $v;
    }
    $timestamp = (int) ($parts["t"] ?? 0);
    if (!$timestamp || abs(time() - $timestamp) > $tolerance) return false;
    $expected = hash_hmac("sha256", $timestamp . "." . $rawBody, $secret);
    return hash_equals($expected, $parts["v1"] ?? "");
}

$ok = verify_nodo_signature(file_get_contents("php://input"), $_SERVER["HTTP_NODO_SIGNATURE"], getenv("NODO_WEBHOOK_SECRET"));`,
    },
  ];
}

export const PRODUCT_RESPONSE = `{
  "data": [
    {
      "id": "prd_Yt5Wc9KqA2mN7xV1pL3sD8",
      "name": "Placa de video ASUS Dual GeForce RTX 5070 12GB",
      "brand": { "id": "brd_asus", "name": "ASUS" },
      "category": { "id": "cat_gpu", "name": "Placas de video", "path": ["Componentes", "Placas de video"] },
      "ean": "4711387759411",
      "partNumber": "DUAL-RTX5070-O12G",
      "description": "…",
      "images": [{ "url": "https://…/rtx5070.jpg", "source": "provider" }],
      "specs": { "warranty": "36 meses", "weight": { "value": 1.1, "unit": "kg" } },
      "availability": { "inStock": true, "totalStock": 34, "offers": 3 },
      "priceRange": { "min": 698.5, "max": 731.2 },
      "bestOffer": { "id": "off_8hQ2vX1mT9cLk3PzR7aB4n", "…": "ver Oferta" },
      "offers": [ "…" ],
      "updatedAt": "2026-10-05T14:32:10Z"
    }
  ],
  "pagination": { "nextCursor": "eyJ1IjoiMjAyNi0xMC0wNVQxNDozMjoxMFoiLCJpIjo…", "hasMore": true, "limit": 100 },
  "meta": {
    "currency": "USD",
    "fx": null,
    "generatedAt": "2026-10-05T14:35:02Z"
  }
}`;

export const OFFER_RESPONSE = `{
  "id": "off_8hQ2vX1mT9cLk3PzR7aB4n",
  "productId": "prd_Yt5Wc9KqA2mN7xV1pL3sD8",
  "provider": { "id": "prv_3Jd8sK2qLm9xV0aT", "name": "Proveedor 1" },
  "sku": "DUAL-RTX5070-O12G",
  "stock": { "quantity": 12, "status": "in_stock", "minThresholdApplied": 2 },
  "price": {
    "currency": "USD",
    "cost": {
      "net": 698.5,
      "taxes": [
        { "type": "iva", "label": "IVA", "percent": 10.5, "amount": 73.34 },
        { "type": "perception", "label": "Percepción IIBB", "percent": 3, "amount": 20.96 }
      ],
      "gross": 792.8
    },
    "sale": { "net": 838.2, "gross": 951.36, "markupPercent": 20 },
    "listSource": "api"
  },
  "freshness": { "syncedAt": "2026-10-05T14:32:10Z", "stale": false, "providerSync": "ok" }
}`;

export const ERROR_RESPONSE = `{
  "error": {
    "code": "insufficient_scope",
    "message": "Esta key no tiene el permiso export:read.",
    "requestId": "req_9Gx2kLm4Qa",
    "docs": "https://nodohub.app/developers#errores"
  }
}`;

export const WEBHOOK_PAYLOAD = `POST /webhooks/nodo HTTP/1.1
Content-Type: application/json
Nodo-Event-Id: evt_5Kq9mX2vT8aLc1Pz
Nodo-Event-Type: catalog.changes
Nodo-Signature: t=1791214330,v1=6f1c0e…b9a2

{
  "id": "evt_5Kq9mX2vT8aLc1Pz",
  "type": "catalog.changes",
  "createdAt": "2026-10-05T14:32:10Z",
  "data": {
    "items": [
      { "type": "price.changed", "productId": "prd_Yt5W…", "offer": { "id": "off_8hQ2…", "…": "oferta completa" }, "at": "2026-10-05T14:32:09Z" },
      { "type": "offer.removed", "productId": "prd_Ab3d…", "offer": { "id": "off_Zx81…" }, "at": "2026-10-05T14:32:09Z" }
    ]
  }
}`;

export const RATE_LIMIT_HEADERS = `HTTP/1.1 200 OK
X-Request-Id: req_9Gx2kLm4Qa
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1791214380`;
