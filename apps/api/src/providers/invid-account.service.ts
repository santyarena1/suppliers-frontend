import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import axios from "axios";
import { applyInvidOrderRates, INVID_PAYMENT_NOTICE, parseAccountStatement, parseInvidPaymentForm, parseOrdersTable } from "./invid-order.parser";
import { parseFileUploadForms } from "./html-table";
import { documentFile } from "./document-file";
import { assertHttpsHost } from "./safe-url";

const SITE_BASE = "https://www.invidcomputers.com";
const LOGIN_URL = `${SITE_BASE}/login.php`;
const INVID_HOSTS = ["www.invidcomputers.com", "invidcomputers.com"];

@Injectable()
export class InvidAccountService {
  private readonly logger = new Logger(InvidAccountService.name);

  private async login(username: string, password: string): Promise<string> {
    try {
      const res = await axios.post(
        LOGIN_URL,
        new URLSearchParams({ login: "S", usuari: username, passwd: password, volver: "" }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 20_000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400 || s === 302,
        }
      );
      const cookie = res.headers["set-cookie"]?.map((c: string) => c.split(";")[0]).join("; ");
      if (!cookie) throw new Error("sin cookie de sesión");
      return cookie;
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo iniciar sesión en el portal de Invid: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private creds(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    return { username, password };
  }

  async getOrders(credentials: Record<string, string>) {
    const { username, password } = this.creds(credentials);
    const cookie = await this.login(username, password);
    const [res, currentRate] = await Promise.all([
      axios.get<string>(`${SITE_BASE}/lista_pedidos_invid.php`, {
        headers: { Cookie: cookie },
        timeout: 20_000,
        responseType: "text",
      }),
      this.fetchCurrentRate(cookie),
    ]);
    const parsed = parseOrdersTable(res.data);
    const paymentForm = parseInvidPaymentForm(res.data);
    if (paymentForm && !paymentForm.notice) paymentForm.notice = INVID_PAYMENT_NOTICE;
    const paymentUploads = parseFileUploadForms(res.data);
    return {
      orders: applyInvidOrderRates(parsed.orders, currentRate),
      currentExchangeRate: currentRate > 0 ? currentRate : undefined,
      paymentForm: paymentForm ?? undefined,
      paymentUploads,
      note: paymentForm || paymentUploads.length > 0
        ? undefined
        : "Si Invid muestra Adjuntar en un pedido, se abre el formulario de comprobantes acá (banco, observaciones y archivos). Si no, el alta se hace desde su portal.",
    };
  }

  /** Cotización viva del portal. Si falla, el listado igual se muestra. */
  private async fetchCurrentRate(cookie: string): Promise<number> {
    try {
      const res = await axios.get<string>(`${SITE_BASE}/ajaxCarrito.php`, {
        headers: { Cookie: cookie },
        params: { funcion: "traerCotizacionOpcionPago", opcion: "67" },
        timeout: 8_000,
        responseType: "text",
      });
      const raw = res.data as unknown;
      const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
        cotizacion?: number | string;
        cotizac?: number | string;
      };
      const n = Number(parsed?.cotizacion ?? parsed?.cotizac);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      this.logger.warn(
        `Invid no devolvió cotización actual: ${err instanceof Error ? err.message : String(err)}`
      );
      return 0;
    }
  }

  async getAccountStatement(credentials: Record<string, string>) {
    const { username, password } = this.creds(credentials);
    const cookie = await this.login(username, password);
    const res = await axios.get<string>(`${SITE_BASE}/lista_ctacte_invid.php`, {
      headers: { Cookie: cookie },
      timeout: 20_000,
      responseType: "text",
    });
    return parseAccountStatement(res.data);
  }

  async getDocument(credentials: Record<string, string>, href: string) {
    const { username, password } = this.creds(credentials);
    if (!href?.trim()) throw new BadRequestException("Falta href");
    const url = assertHttpsHost(href, `${SITE_BASE}/`, INVID_HOSTS);
    const cookie = await this.login(username, password);
    const res = await axios.get<ArrayBuffer>(url.toString(), {
      headers: { Cookie: cookie, Accept: "application/pdf, */*" },
      timeout: 30_000,
      responseType: "arraybuffer",
      validateStatus: (s) => s < 500,
    });
    const buffer = Buffer.from(res.data);
    if (res.status >= 400) {
      throw new BadGatewayException(`Invid documento → ${res.status}`);
    }
    const contentType = String(res.headers["content-type"] || "application/octet-stream").split(";")[0];
    const filename = url.pathname.split("/").pop() || "comprobante-invid";
    return documentFile(buffer, contentType, filename);
  }

  async attachPayment(
    credentials: Record<string, string>,
    files: { field?: string; filename: string; mimetype: string; buffer: Buffer }[],
    extraFields?: Record<string, string>
  ) {
    const { username, password } = this.creds(credentials);
    if (files.length === 0) throw new BadRequestException("Adjuntá al menos un comprobante");
    const cookie = await this.login(username, password);
    const page = await axios.get<string>(`${SITE_BASE}/lista_pedidos_invid.php`, {
      headers: { Cookie: cookie },
      timeout: 20_000,
      responseType: "text",
    });
    let html = page.data;
    const paymentHref = extraFields?.paymentHref?.trim();
    if (paymentHref) {
      try {
        const url = assertHttpsHost(paymentHref, `${SITE_BASE}/`, INVID_HOSTS);
        const popup = await axios.get<string>(url.toString(), {
          headers: { Cookie: cookie },
          timeout: 20_000,
          responseType: "text",
        });
        html = popup.data || html;
      } catch (err) {
        this.logger.warn(
          `No se pudo abrir el popup de comprobantes: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    const form = parseInvidPaymentForm(html) ?? parseInvidPaymentForm(page.data);
    const generic = parseFileUploadForms(page.data)[0];
    if (!form && !generic) {
      throw new NotFoundException(
        "Invid no mostró un formulario para adjuntar comprobante en esta sesión. Hay que hacerlo desde su portal."
      );
    }
    const action = form?.action || generic?.action || "lista_pedidos_invid.php";
    const actionUrl = assertHttpsHost(action, `${SITE_BASE}/`, INVID_HOSTS);
    const fileFields = form?.fileFields?.length ? form.fileFields : [generic?.fileField || "file"];
    const body = new FormData();
    const merged: Record<string, string> = {
      ...(generic?.fields ?? {}),
      ...(form?.fields ?? {}),
      ...(extraFields ?? {}),
    };
    delete merged.paymentHref;
    if (form?.orderField && extraFields?.orderNumber && !merged[form.orderField]) {
      merged[form.orderField] = extraFields.orderNumber;
    }
    if (form?.bankField && extraFields?.bank) merged[form.bankField] = extraFields.bank;
    if (form?.notesField && extraFields?.notes) merged[form.notesField] = extraFields.notes;
    for (const [k, v] of Object.entries(merged)) {
      if (k === "file" || k === "files" || /^file\d+$/i.test(k)) continue;
      body.append(k, v);
    }
    files.slice(0, fileFields.length).forEach((file, i) => {
      const field = file.field && fileFields.includes(file.field) ? file.field : fileFields[i] || fileFields[0];
      body.append(
        field,
        new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }),
        file.filename
      );
    });
    const res = await axios.post<string>(actionUrl.toString(), body, {
      headers: { Cookie: cookie },
      timeout: 45_000,
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    if (res.status >= 400) {
      throw new BadGatewayException(`Invid no aceptó el comprobante (${res.status})`);
    }
    return { ok: true, status: res.status };
  }
}
