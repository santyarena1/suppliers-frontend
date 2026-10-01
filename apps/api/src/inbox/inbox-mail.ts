import { escapeHtml } from "../mail/mail.service";
import { INBOX_TYPE_LABELS, type InboxInput } from "./inbox-types";

const ADMIN_URL = "https://nodohub.app/admin?tab=inbox";

function rows(input: InboxInput): [string, string][] {
  const out: [string, string][] = [];
  if (input.company) out.push(["Empresa", input.company]);
  if (input.contactName) out.push(["Nombre", input.contactName]);
  if (input.contactEmail) out.push(["Email", input.contactEmail]);
  if (input.contactPhone) out.push(["Teléfono", input.contactPhone]);
  for (const [key, value] of Object.entries(input.data ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    out.push([key, String(value)]);
  }
  return out;
}

/** Mail al dueño de NODO por cada solicitud nueva. */
export function inboxMail(input: InboxInput): { subject: string; text: string; html: string } {
  const label = INBOX_TYPE_LABELS[input.type];
  const subject = `NODO · ${label}: ${input.title}`.slice(0, 180);
  const lines = rows(input);
  const text =
    `${label}\n${input.title}\n\n` +
    lines.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (input.message ? `\n\nMensaje:\n${input.message}` : "") +
    `\n\nVer en la bandeja: ${ADMIN_URL}`;
  const tableRows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#8b90b3;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#ffffff;font-size:13px;">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  const message = input.message
    ? `<tr><td style="padding-top:14px;font-size:14px;line-height:1.55;color:#c5c8dc;white-space:pre-wrap;">${escapeHtml(input.message)}</td></tr>`
    : "";
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#0e1020;color:#e8eaf4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1020;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#16182c;border:1px solid #2a2d4a;border-radius:10px;padding:24px;">
        <tr><td style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8b90b3;">NODO · ${escapeHtml(label)}</td></tr>
        <tr><td style="padding-top:10px;font-size:19px;font-weight:700;color:#ffffff;">${escapeHtml(input.title)}</td></tr>
        <tr><td style="padding-top:14px;"><table role="presentation" cellpadding="0" cellspacing="0">${tableRows}</table></td></tr>
        ${message}
        <tr><td style="padding-top:20px;"><a href="${ADMIN_URL}" style="display:inline-block;background:#4033fc;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 16px;border-radius:8px;">Abrir la bandeja</a></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}
