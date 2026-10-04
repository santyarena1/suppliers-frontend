import { escapeHtml, type MailMessage } from "../mail/mail.service";

const TEAM_URL = "https://nodohub.app/equipo";
const APP_URL = "https://nodohub.app/";

function layout(title: string, paragraphs: string[], cta?: { label: string; href: string }): string {
  const body = paragraphs
    .map((p) => `<tr><td style="padding-top:12px;font-size:14px;line-height:1.55;color:#c5c8dc;">${p}</td></tr>`)
    .join("");
  const button = cta
    ? `<tr><td style="padding:24px 0 4px;"><a href="${cta.href}" style="display:inline-block;background:#4033fc;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;padding:12px 20px;">${escapeHtml(cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#0e1020;color:#e8eaf4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1020;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background:#16182c;border:1px solid #2a2d4a;border-radius:10px;padding:28px 24px;">
          <tr><td style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8b90b3;">NODO</td></tr>
          <tr><td style="padding-top:12px;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</td></tr>
          ${body}
          ${button}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Al dueño: alguien pidió sumarse a su comercio. */
export function joinRequestToOwnerMail(opts: {
  to: string;
  ownerName: string;
  tenantName: string;
  requester: { username: string; email: string };
}): MailMessage {
  const { requester } = opts;
  const subject = `${requester.username} quiere sumarse a ${opts.tenantName} en NODO`;
  const text =
    `Hola ${opts.ownerName},\n\n` +
    `${requester.username} (${requester.email}) pidió sumarse al equipo de ${opts.tenantName}.\n` +
    `Para aprobarlo (eligiendo su rol) o rechazarlo, entrá a Equipo: ${TEAM_URL}\n\n` +
    `Si no conocés a esta persona, rechazá el pedido: no entra a nada hasta que lo apruebes.`;
  const html = layout(
    "Pedido para sumarse a tu equipo",
    [
      `Hola ${escapeHtml(opts.ownerName)}.`,
      `<strong style="color:#ffffff;">${escapeHtml(requester.username)}</strong> (${escapeHtml(requester.email)}) pidió sumarse al equipo de <strong style="color:#ffffff;">${escapeHtml(opts.tenantName)}</strong>.`,
      "Desde Equipo lo aprobás eligiendo su rol, o lo rechazás. No entra a nada hasta que lo apruebes.",
    ],
    { label: "Ver pedido en Equipo", href: TEAM_URL }
  );
  return { to: opts.to, subject, text, html };
}

/** Al solicitante: resultado del pedido. */
export function joinRequestDecisionMail(opts: {
  to: string;
  username: string;
  tenantName: string;
  approved: boolean;
  roleLabel?: string;
}): MailMessage {
  if (opts.approved) {
    const subject = `Ya sos parte de ${opts.tenantName} en NODO`;
    const text =
      `Hola ${opts.username},\n\n` +
      `${opts.tenantName} aprobó tu pedido: entraste como ${opts.roleLabel ?? "miembro"}.\n` +
      `Entrá a NODO: ${APP_URL}`;
    const html = layout(
      "Te aprobaron",
      [
        `Hola ${escapeHtml(opts.username)}.`,
        `<strong style="color:#ffffff;">${escapeHtml(opts.tenantName)}</strong> aprobó tu pedido: entraste como ${escapeHtml(opts.roleLabel ?? "miembro")}.`,
      ],
      { label: "Entrar a NODO", href: APP_URL }
    );
    return { to: opts.to, subject, text, html };
  }
  const subject = `Tu pedido para sumarte a ${opts.tenantName} no fue aprobado`;
  const text =
    `Hola ${opts.username},\n\n` +
    `${opts.tenantName} no aprobó tu pedido para sumarte a su equipo.\n` +
    `Podés crear tu propio comercio, entrar con un código de invitación o pedirle a otro comercio: ${APP_URL}`;
  const html = layout(
    "Pedido no aprobado",
    [
      `Hola ${escapeHtml(opts.username)}.`,
      `<strong style="color:#ffffff;">${escapeHtml(opts.tenantName)}</strong> no aprobó tu pedido para sumarte a su equipo.`,
      "Podés crear tu propio comercio, entrar con un código de invitación o pedirle a otro comercio.",
    ],
    { label: "Ir a NODO", href: APP_URL }
  );
  return { to: opts.to, subject, text, html };
}
