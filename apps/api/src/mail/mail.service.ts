import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SmtpTransport = {
  sendMail: (opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

/**
 * Canal de mail de la plataforma. No hay opt-in ni baja: el mail es el
 * domicilio de la cuenta. Resend (HTTP) o SMTP; en desarrollo, si no hay
 * ninguno, el cuerpo se escribe en el log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private smtp: SmtpTransport | null | undefined;

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>("RESEND_API_KEY")?.trim()) || Boolean(this.config.get<string>("SMTP_HOST")?.trim());
  }

  async sendVerificationCode(to: string, username: string, code: string) {
    const subject = "Tu código de NODO";
    const text =
      `Hola ${username},\n\n` +
      `Tu código para confirmar el email es ${code}.\n` +
      `Vale 15 minutos.\n\n` +
      `Si no creaste una cuenta en NODO, ignorá este mensaje.`;
    const html = verificationHtml(username, code);
    await this.send({ to, subject, text, html });
  }

  async send(message: MailMessage) {
    const from = this.config.get<string>("MAIL_FROM")?.trim() || "NODO <noreply@nodo.local>";
    const resendKey = this.config.get<string>("RESEND_API_KEY")?.trim();
    if (resendKey) {
      await this.sendResend(resendKey, from, message);
      return;
    }
    const smtp = await this.smtpTransport();
    if (smtp) {
      await smtp.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
      return;
    }
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new ServiceUnavailableException("El envío de mail no está configurado");
    }
    this.logger.warn(`Mail no configurado. Destino ${message.to} — ${message.subject}\n${message.text}`);
  }

  private async smtpTransport(): Promise<SmtpTransport | null> {
    if (this.smtp !== undefined) return this.smtp;
    const host = this.config.get<string>("SMTP_HOST")?.trim();
    if (!host) {
      this.smtp = null;
      return null;
    }
    try {
      const nodemailer = await import("nodemailer");
      const port = Number(this.config.get("SMTP_PORT") ?? 587);
      const secure = this.config.get("SMTP_SECURE") === "true" || port === 465;
      const user = this.config.get<string>("SMTP_USER")?.trim();
      const pass = this.config.get<string>("SMTP_PASS") ?? "";
      this.smtp = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(user ? { auth: { user, pass } } : {}),
      });
      return this.smtp;
    } catch (err) {
      this.logger.error("No se pudo cargar el transporte SMTP", err instanceof Error ? err.stack : String(err));
      this.smtp = null;
      return null;
    }
  }

  private async sendResend(apiKey: string, from: string, message: MailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.error(`Resend ${res.status}: ${body.slice(0, 400)}`);
      throw new ServiceUnavailableException("No se pudo enviar el mail");
    }
  }
}

function verificationHtml(username: string, code: string): string {
  const safeUser = escapeHtml(username);
  const safeCode = escapeHtml(code);
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#0e1020;color:#e8eaf4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1020;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background:#16182c;border:1px solid #2a2d4a;border-radius:10px;padding:28px 24px;">
          <tr><td style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8b90b3;">NODO</td></tr>
          <tr><td style="padding-top:12px;font-size:20px;font-weight:700;color:#ffffff;">Confirmá tu email</td></tr>
          <tr><td style="padding-top:12px;font-size:14px;line-height:1.55;color:#c5c8dc;">Hola ${safeUser}. Usá este código para confirmar que el mail es tuyo. Ahí te vamos a escribir sobre tu cuenta y sobre NODO.</td></tr>
          <tr><td align="center" style="padding:28px 0 12px;">
            <div style="display:inline-block;letter-spacing:0.35em;font-size:28px;font-weight:700;color:#ffffff;background:#0e1020;border:1px solid #4033fc;border-radius:8px;padding:14px 22px;">${safeCode}</div>
          </td></tr>
          <tr><td style="font-size:12px;color:#8b90b3;">Vale 15 minutos. Si no creaste una cuenta en NODO, ignorá este mensaje.</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
