/* eslint-disable jsx-a11y/alt-text -- el Image de react-pdf no es un <img>: no tiene alt. */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { QuotePdfModel } from "./quote-pdf-model";

/**
 * El PDF del presupuesto (react-pdf). Cuatro estilos — moderno, clásico,
 * minimalista y destacado — con el color, la letra y el logo del comercio.
 * Solo dibuja: todos los importes llegan ya calculados en `model`.
 */

const FONTS = {
  sans: { regular: "Helvetica", bold: "Helvetica-Bold" },
  serif: { regular: "Times-Roman", bold: "Times-Bold" },
  mono: { regular: "Courier", bold: "Courier-Bold" },
} as const;

const INK = "#14172a";
const MUTED = "#5f667d";
const FAINT = "#9aa0b4";
const LINE = "#e3e6ee";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x4f46e5;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla el color con blanco (amount 0 = color, 1 = blanco). */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Texto blanco o tinta según qué se lee mejor sobre el color. */
export function onColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? INK : "#ffffff";
}

export default function QuotePdfDocument({ model }: { model: QuotePdfModel }) {
  const f = FONTS[model.font] ?? FONTS.sans;
  const accent = model.accent;
  const s = makeStyles(model, f);
  const bold = model.theme === "bold";
  const modern = model.theme === "modern";

  return (
    <Document title={`Presupuesto ${model.code}`} author={model.business.name || "NODO"} creator="NODO" producer="NODO">
      <Page size="A4" style={s.page}>
        {bold && <View fixed style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, backgroundColor: accent }} />}

        {/* ---------- Pie (fijo en cada hoja; va primero para que react-pdf lo dibuje) ---------- */}
        <View fixed style={s.footer}>
          <Text style={s.footerText}>{model.footer || model.business.name}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${model.code} · Página ${pageNumber} de ${totalPages}`} />
        </View>

        {/* ---------- Encabezado ---------- */}
        {modern ? (
          <View style={s.band}>
            <View style={{ flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 1 }}>
              {model.logo && (
                <View style={s.logoBox}>
                  <Image src={model.logo} style={s.logo} />
                </View>
              )}
              <View style={{ flexShrink: 1 }}>
                <Text style={[s.bizName, { color: onColor(accent) }]}>{model.business.name}</Text>
                {model.business.lines.map((l) => (
                  <Text key={l} style={[s.bizLine, { color: onColor(accent), opacity: 0.82 }]}>
                    {l}
                  </Text>
                ))}
              </View>
            </View>
            <View style={{ alignItems: "flex-end", marginLeft: 16 }}>
              <Text style={[s.titleSmall, { color: onColor(accent) }]}>PRESUPUESTO</Text>
              <Text style={[s.code, { color: onColor(accent) }]}>{model.code}</Text>
            </View>
          </View>
        ) : (
          <View style={s.header}>
            <View style={{ flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 1 }}>
              {model.logo && <Image src={model.logo} style={[s.logo, { marginRight: 12 }]} />}
              <View style={{ flexShrink: 1 }}>
                <Text style={s.bizName}>{model.business.name}</Text>
                {model.business.lines.map((l) => (
                  <Text key={l} style={s.bizLine}>
                    {l}
                  </Text>
                ))}
              </View>
            </View>
            <View style={{ alignItems: "flex-end", marginLeft: 16 }}>
              <Text style={s.title}>{model.theme === "minimal" ? "Presupuesto" : "PRESUPUESTO"}</Text>
              <Text style={s.codeDark}>N.º {model.code}</Text>
            </View>
          </View>
        )}
        {model.theme === "classic" && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ height: 2, backgroundColor: accent }} />
            <View style={{ height: 0.75, backgroundColor: accent, marginTop: 2 }} />
          </View>
        )}

        {/* ---------- Cliente y datos ---------- */}
        <View style={s.metaRow}>
          <View style={[s.metaBox, { flexGrow: 1, marginRight: 12 }]}>
            <Text style={s.label}>Para</Text>
            <Text style={s.metaStrong}>{model.client.name || "Cliente"}</Text>
            {model.client.lines.map((l) => (
              <Text key={l} style={s.metaText}>
                {l}
              </Text>
            ))}
          </View>
          <View style={[s.metaBox, { width: 190 }]}>
            <MetaPair s={s} label="Fecha" value={model.date} />
            {model.validUntil && <MetaPair s={s} label="Válido hasta" value={model.validUntil} />}
            <MetaPair s={s} label="Precios" value={model.netPrices ? "Sin IVA (IVA aparte)" : "Finales, con IVA"} />
          </View>
        </View>

        {model.intro && <Text style={s.intro}>{model.intro}</Text>}

        {/* ---------- Productos ---------- */}
        <View style={s.tableHead}>
          {model.showImages && <Text style={[s.th, { width: 40 }]} />}
          <Text style={[s.th, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }]}>Producto</Text>
          <Text style={[s.th, s.num, { width: 40 }]}>Cant.</Text>
          <Text style={[s.th, s.num, { width: 82 }]}>{model.netPrices ? "Unit. s/IVA" : "Unitario"}</Text>
          <Text style={[s.th, s.num, { width: 86 }]}>Subtotal</Text>
        </View>
        {model.lines.map((l, i) => (
          <View key={`${l.name}-${i}`} style={[s.row, modern && i % 2 === 1 ? { backgroundColor: tint(accent, 0.96) } : {}]} wrap={false}>
            {model.showImages && (
              <View style={s.thumbBox}>{l.image ? <Image src={l.image} style={s.thumb} /> : null}</View>
            )}
            <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 10 }}>
              <Text style={s.itemName}>{l.name}</Text>
              {l.detail && <Text style={s.itemDetail}>{l.detail}</Text>}
            </View>
            <Text style={[s.td, s.num, { width: 40 }]}>{l.qty}</Text>
            <Text style={[s.td, s.num, { width: 82 }]}>{l.unit}</Text>
            <Text style={[s.td, s.num, s.tdStrong, { width: 86 }]}>{l.total}</Text>
          </View>
        ))}

        {/* ---------- Totales ---------- */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            {model.totals.map((t) =>
              t.strong ? (
                <View key={t.label} style={s.totalStrongRow}>
                  <Text style={s.totalStrongLabel}>{t.label}</Text>
                  <Text style={s.totalStrongValue}>{t.value}</Text>
                </View>
              ) : (
                <View key={t.label} style={s.totalRow}>
                  <Text style={[s.totalLabel, t.muted ? { color: FAINT } : {}]}>{t.label}</Text>
                  <Text style={s.totalValue}>{t.value}</Text>
                </View>
              )
            )}
          </View>
        </View>
        {model.currencyNote && <Text style={s.note}>{model.currencyNote}</Text>}

        {model.notes && (
          <View style={s.block} wrap={false}>
            <Text style={s.label}>Notas</Text>
            <Text style={s.blockText}>{model.notes}</Text>
          </View>
        )}
        {model.terms && (
          <View style={s.block}>
            <Text style={s.label}>Condiciones</Text>
            <Text style={s.blockText}>{model.terms}</Text>
          </View>
        )}

      </Page>
    </Document>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function MetaPair({ s, label, value }: { s: Styles; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function makeStyles(model: QuotePdfModel, f: { regular: string; bold: string }) {
  const accent = model.accent;
  const theme = model.theme;
  const minimal = theme === "minimal";
  const bold = theme === "bold";
  const classic = theme === "classic";
  return StyleSheet.create({
    page: {
      fontFamily: f.regular,
      fontSize: 9.5,
      color: INK,
      paddingTop: 40,
      paddingBottom: 54,
      paddingLeft: bold ? 46 : 40,
      paddingRight: 40,
      lineHeight: 1.35,
    },
    band: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: accent,
      marginTop: -40,
      marginLeft: -40,
      marginRight: -40,
      paddingHorizontal: 40,
      paddingVertical: 22,
      marginBottom: 20,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: classic ? 10 : minimal ? 28 : 22,
    },
    logoBox: { backgroundColor: "#ffffff", borderRadius: 6, padding: 5, marginRight: 12 },
    logo: { maxWidth: 96, maxHeight: 44, objectFit: "contain" },
    bizName: { fontFamily: f.bold, fontSize: classic ? 15 : 13, marginBottom: 4, lineHeight: 1.15 },
    bizLine: { fontSize: 8, color: MUTED },
    title: {
      fontFamily: f.bold,
      fontSize: bold ? 26 : minimal ? 18 : 16,
      color: bold || classic ? accent : INK,
      lineHeight: 1.15,
      marginBottom: 2,
    },
    titleSmall: { fontFamily: f.bold, fontSize: 9, letterSpacing: 2 },
    code: { fontFamily: f.bold, fontSize: 18, marginTop: 2 },
    codeDark: { fontSize: 10, color: MUTED, marginTop: 3 },
    metaRow: { flexDirection: "row", marginBottom: 14 },
    metaBox: {
      borderWidth: minimal ? 0 : 0.75,
      borderColor: LINE,
      borderRadius: classic ? 0 : 6,
      padding: minimal ? 0 : 10,
      backgroundColor: theme === "modern" ? tint(accent, 0.95) : undefined,
    },
    label: { fontFamily: f.bold, fontSize: 7, color: minimal ? FAINT : accent, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
    metaStrong: { fontFamily: f.bold, fontSize: 11 },
    metaText: { fontSize: 8.5, color: MUTED },
    metaLabel: { fontSize: 8, color: MUTED },
    metaValue: { fontFamily: f.bold, fontSize: 8.5 },
    intro: { fontSize: 9.5, color: INK, marginBottom: 12 },
    tableHead: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 6,
      backgroundColor: theme === "modern" ? tint(accent, 0.88) : bold ? accent : undefined,
      borderBottomWidth: theme === "modern" || bold ? 0 : classic ? 1.2 : 0.75,
      borderBottomColor: classic ? INK : LINE,
      borderRadius: theme === "modern" ? 4 : 0,
    },
    th: {
      fontFamily: f.bold,
      fontSize: 7.5,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: bold ? onColor(accent) : theme === "modern" ? tint(accent, 0) : MUTED,
    },
    num: { textAlign: "right" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 7,
      paddingHorizontal: 6,
      borderBottomWidth: 0.6,
      borderBottomColor: LINE,
    },
    thumbBox: { width: 40, height: 30, alignItems: "flex-start", justifyContent: "center" },
    thumb: { maxWidth: 32, maxHeight: 28, objectFit: "contain" },
    itemName: { fontSize: 9.5 },
    itemDetail: { fontSize: 7.5, color: FAINT, marginTop: 1 },
    td: { fontSize: 9.5 },
    tdStrong: { fontFamily: f.bold },
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
    totals: { width: 250 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
    totalLabel: { fontSize: 9, color: MUTED },
    totalValue: { fontSize: 9.5 },
    totalStrongRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
      paddingVertical: 9,
      paddingHorizontal: 10,
      backgroundColor: minimal || classic ? undefined : accent,
      borderTopWidth: minimal || classic ? 1.2 : 0,
      borderTopColor: classic ? INK : accent,
      borderRadius: minimal || classic ? 0 : 6,
    },
    totalStrongLabel: { fontFamily: f.bold, fontSize: 10, color: minimal || classic ? INK : onColor(accent) },
    totalStrongValue: { fontFamily: f.bold, fontSize: bold ? 16 : 14, color: minimal ? accent : classic ? INK : onColor(accent) },
    note: { fontSize: 7.5, color: FAINT, textAlign: "right", marginTop: 6 },
    block: { marginTop: 16 },
    blockText: { fontSize: 9, color: INK },
    footer: {
      position: "absolute",
      left: bold ? 46 : 40,
      right: 40,
      // react-pdf no dibuja un elemento fijo anclado con `bottom`: se ancla desde arriba (A4 = 841,89 pt de alto).
      top: 806,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 0.6,
      borderTopColor: LINE,
      paddingTop: 6,
    },
    footerText: { fontSize: 7, color: FAINT },
  });
}
