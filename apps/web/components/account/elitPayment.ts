import { elitAccountApi, uploadAuthedFile } from "@/lib/api";

export function pickElitOpId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const nested = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
  const id = nested.id ?? nested._id ?? rec.id ?? rec._id;
  return id != null && String(id).trim() ? String(id) : undefined;
}

export function elitOpValidations(validations: unknown): {
  date: boolean;
  amount: boolean;
  number: boolean;
} {
  if (!validations || typeof validations !== "object") {
    return { date: false, amount: false, number: false };
  }
  const rec = validations as Record<string, unknown>;
  return {
    date: rec.date === true,
    amount: rec.amount === true,
    number: rec.number === true,
  };
}

/** Crea la operación, adjunta el archivo y cierra el informe — el equivalente a Enviar en Elit. */
export async function submitElitPaymentReport(input: {
  type?: string;
  bank?: number;
  bankName?: string;
  operationName?: string;
  date?: string;
  amount?: number;
  number?: string;
  file: File;
}): Promise<{ id: string }> {
  const created = await elitAccountApi.createOperation({
    type: input.type,
    bank: input.bank,
    bankName: input.bankName,
    operationName: input.operationName,
    date: input.date,
    amount: input.amount,
    number: input.number,
  });
  let id = pickElitOpId(created.data);
  if (!id) {
    const list = await elitAccountApi.payments();
    id = pickElitOpId(list.data.active);
  }
  if (!id) {
    throw new Error("Elit creó la operación pero no devolvió un id. Revisá Informes de pago en su sitio.");
  }
  try {
    await uploadAuthedFile(`/providers/ELIT/payments/operation/${encodeURIComponent(id)}/attach`, input.file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo adjuntar";
    throw new Error(`La operación ${id} quedó abierta en Elit, pero no se adjuntó el archivo: ${msg}`);
  }
  try {
    await elitAccountApi.finishPayment();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cerrar";
    throw new Error(`El comprobante se adjuntó a ${id}, pero Elit no cerró el informe: ${msg}`);
  }
  return { id };
}
