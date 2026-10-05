import type { Quote } from "@/lib/quotes";
import { quoteTitle } from "@/lib/quotes";

type Money = (amount: number | null, currency: string) => string;

function today(): string {
  return new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Texto para WhatsApp o para copiar: corto, legible en el celular del cliente. */
export function quoteText(q: Quote, opts: { storeName: string | null; money: Money; total: string }): string {
  const head = [opts.storeName, `Presupuesto #${q.number}`].filter(Boolean).join(" · ");
  const lines = [head];
  if (q.clientName) lines.push(`Para: ${q.clientName}`);
  lines.push("");
  for (const it of q.items) {
    const unit = opts.money(it.unitFinalPrice, it.currency);
    const line = it.unitFinalPrice != null ? opts.money(it.unitFinalPrice * it.qty, it.currency) : "consultar";
    lines.push(it.qty > 1 ? `• ${it.qty} × ${it.name} — ${unit} c/u = ${line}` : `• ${it.name} — ${line}`);
  }
  lines.push("");
  lines.push(`Total: ${opts.total}`);
  lines.push(`Precios finales con IVA, válidos al ${today()}.`);
  if (q.notes) lines.push("", q.notes);
  return lines.join("\n");
}

/** wa.me con el teléfono del cliente si lo hay (solo dígitos; sin código de país se asume Argentina). */
export function whatsappUrl(text: string, phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  let target = digits;
  if (digits && !digits.startsWith("54")) {
    target = `549${digits.replace(/^0/, "").replace(/^15/, "")}`;
  }
  const base = target ? `https://wa.me/${target}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Hoja simple para imprimir o guardar como PDF desde el navegador. */
export function printQuote(q: Quote, opts: { storeName: string | null; money: Money; total: string }) {
  const rows = q.items
    .map(
      (it) => `<tr>
        <td>${esc(it.name)}${it.sku ? `<div class="sku">${esc(it.sku)}</div>` : ""}</td>
        <td class="n">${it.qty}</td>
        <td class="n">${esc(opts.money(it.unitFinalPrice, it.currency))}</td>
        <td class="n">${esc(it.unitFinalPrice != null ? opts.money(it.unitFinalPrice * it.qty, it.currency) : "—")}</td>
      </tr>`
    )
    .join("");
  const client = [q.clientName, q.clientPhone].filter(Boolean).map((s) => esc(s as string)).join(" · ");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(quoteTitle(q))}</title>
<style>
  body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#14172a;margin:40px}
  h1{font-size:20px;margin:0}.muted{color:#646c85}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #14172a;padding-bottom:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#646c85;border-bottom:1px solid #d8dbe6;padding:8px 6px}
  td{padding:9px 6px;border-bottom:1px solid #eceef4;vertical-align:top}.n{text-align:right;white-space:nowrap}.sku{font-size:11px;color:#8a90a6}
  .total{display:flex;justify-content:flex-end;gap:24px;margin-top:16px;font-size:18px;font-weight:700}.notes{margin-top:22px;white-space:pre-wrap}
  @media print{body{margin:16mm}}
</style></head><body>
<div class="head"><div><div class="muted">${esc(opts.storeName ?? "")}</div><h1>Presupuesto #${q.number}</h1>${client ? `<div>${client}</div>` : ""}</div>
<div class="muted">${today()}</div></div>
<table><thead><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Unitario</th><th class="n">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><span>Total</span><span>${esc(opts.total)}</span></div>
<p class="muted">Precios finales con IVA, válidos al ${today()}.</p>
${q.notes ? `<div class="notes">${esc(q.notes)}</div>` : ""}
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const win = window.open("", "_blank", "noopener=no,width=820,height=960");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
