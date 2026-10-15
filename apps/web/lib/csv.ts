/**
 * Celda de texto para un CSV que se abre en Excel. Entre comillas, y si empieza
 * con = + - @ (o tab/enter) se le antepone ' para que Excel no la tome como
 * fórmula: un nombre de producto lo escribe otro (un proveedor, otro local).
 */
export function csvText(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
