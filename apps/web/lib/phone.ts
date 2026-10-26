/**
 * Número para wa.me a partir de un teléfono escrito como venga. Sin código de
 * país se asume Argentina: "011 15-5555-1234", "11 5555-1234", "+54 11 5555 1234",
 * "(0351) 15 555-1234" → 549 + característica + número. Un número de otro país
 * tiene que venir con "+" o "00". Null si no alcanza para saber a quién escribir.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international && !digits.startsWith("54")) return digits.length >= 8 && digits.length <= 15 ? digits : null;

  let national = digits;
  if (international || (digits.startsWith("54") && digits.length >= 12)) {
    national = digits.slice(2);
    if (national.startsWith("9")) national = national.slice(1);
  }
  national = national.replace(/^0/, "");
  if (national.length === 11 && national.startsWith("9")) national = national.slice(1);
  // Con el 15 de celular: característica (2, 3 o 4 cifras) + 15 + número = 12 cifras.
  if (national.length === 12) {
    for (const area of [2, 3, 4]) {
      if (area === 2 && !national.startsWith("11")) continue;
      if (national.slice(area, area + 2) === "15") {
        national = national.slice(0, area) + national.slice(area + 2);
        break;
      }
    }
  }
  // Un número argentino completo tiene 10 cifras y la característica empieza con 11, 2 o 3.
  if (national.length !== 10 || !/^(11|2|3)/.test(national)) return null;
  return `549${national}`;
}
