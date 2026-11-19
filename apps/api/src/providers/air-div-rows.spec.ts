import { airBalanceFromRows, parseAirDivRows } from "./air-div-rows";

// Armado como lo muestra el diagnóstico de producción (19/11): filas div.row, títulos div.row.h_row,
// importes US. Dos variantes: con celdas vacías (por posición) y sin ellas (por forma).
const debeHaberConVacias = `
<div class="main_table debe_haber">
  <div class="row h_row"><div>Comprobante</div><div>Fecha</div><div>Debe</div><div>Haber</div><div>Saldo</div><div>Ops.</div></div>
  <div class="row"><div>TRANSPORTE</div><div>01/08/2026</div><div>10000.00</div><div>10000.00</div><div>-1,250.00</div><div></div></div>
  <div class="row"><div><a href="#">FVA000100012345</a></div><div>03/11/2026</div><div>311,471.04</div><div></div><div>310,221.04</div><div><a href="#"><img src="pdf.png"></a></div></div>
  <div class="row"><div>REX000100000077</div><div>05/11/2026</div><div></div><div>310,221.04</div><div>0.00</div><div></div></div>
  <div class="row"><div>FVA000100012399</div><div>15/11/2026</div><div>1,204,500.10</div><div></div><div>1,204,500.10</div><div></div></div>
</div>
<div class="aux_table re_table oculto"><div class="row_re"><label>Items del comprobante:</label></div></div>`;

const debeHaberSinVacias = `
<div class="main_table debe_haber">
  <div class="row h_row"><label>Comprobante</label><label>Fecha</label><label>Debe</label><label>Haber</label><label>Saldo</label><label>Ops.</label></div>
  <div class="row"><label>FVA000100012345</label><label>03/11/2026</label><label>311,471.04</label><label>311,471.04</label></div>
  <div class="row"><label>REX000100000077</label><label>05/11/2026</label><label>312,721.04</label><label>-1,250.00</label></div>
</div>`;

const pendientes = `
<div class="main_table cpt_pend">
  <div class="row h_row"><div>Fecha</div><div>Comprobante</div><div>Vence</div><div>Vendedor</div><div>Importe</div><div>Saldo</div><div>Acumula</div><div>Opc.</div><div>Sel.</div></div>
  <div class="row _veritems" nrocompro="REX000100000077"><div>05/11/2026</div><div>REX000100000077</div><div>05/11/2026</div><div></div><div>-12,500.00</div><div>-1,250,000.00</div><div>-12,500.00</div><div>--</div><div><input type="checkbox"></div></div>
</div>`;

describe("cuenta de Air sin tablas", () => {
  it("Debe/Haber por posición, con celdas vacías; el saldo es el acumulado de la última fila", () => {
    const rows = parseAirDivRows(debeHaberConVacias);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual({ Comprobante: "FVA000100012345", Fecha: "03/11/2026", Debe: "311,471.04", Saldo: "310,221.04", _code: "FVA000100012345" });
    expect(rows[2]).toMatchObject({ Comprobante: "REX000100000077", Haber: "310,221.04", Saldo: "0.00" });
    expect(airBalanceFromRows(rows)).toBe(1204500.1);
  });

  it("Debe/Haber sin celdas vacías: reconoce cada dato por su forma (los recibos van al haber)", () => {
    const rows = parseAirDivRows(debeHaberSinVacias);
    expect(rows[0]).toMatchObject({ Comprobante: "FVA000100012345", Fecha: "03/11/2026", Debe: "311,471.04", Saldo: "311,471.04" });
    expect(rows[1]).toMatchObject({ Comprobante: "REX000100000077", Haber: "312,721.04", Saldo: "-1,250.00" });
    expect(airBalanceFromRows(rows)).toBe(-1250);
  });

  it("Pendientes: comprobantes con saldo", () => {
    const rows = parseAirDivRows(pendientes);
    expect(rows).toEqual([
      { Fecha: "05/11/2026", Comprobante: "REX000100000077", Vence: "05/11/2026", Importe: "-12,500.00", Saldo: "-1,250,000.00", Acumula: "-12,500.00", _code: "REX000100000077" },
    ]);
  });
});
