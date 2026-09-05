/* eslint-disable no-console */
// Prueba en vivo (anónima) contra newtree.com.ar. No corre en jest; ejecutar a mano:
//   npx ts-node -T src/providers/new-tree-live.smoke.ts
import { NewTreeWebClient } from "./new-tree-web-client";
import { detailPath, listingPath, mapListingItem, parseCategoryNav, parseDetail, parseListing, parseMaxPage } from "./new-tree-catalog.parser";
import { parseCalculate } from "./new-tree-order.service";

async function main() {
  const client = await NewTreeWebClient.connect();
  console.log("webSiteId", client.session.webSiteId.slice(0, 8) + "…");
  const home = await client.getHtml("/HOME/newtree.aspx");
  const cats = parseCategoryNav(home);
  console.log("categorías", cats.length, cats.slice(0, 3));
  const first = cats.find((c) => c.scatId === "89") ?? cats[0];
  const html = await client.getHtml(listingPath(first, 1));
  const items = parseListing(html);
  console.log("listado", first.name, "items", items.length, "maxPage", parseMaxPage(html));
  console.log("primero", mapListingItem(items[0], first));
  const detail = parseDetail(await client.getHtml(detailPath("20227")));
  console.log("detalle 20227", { ...detail, longDescription: detail.longDescription?.slice(0, 120) });
  const calc = parseCalculate(await client.pageMethod("wsNRW_Calculate", { guidWS_Id: client.session.webSiteId, intFastCalculate: 1 }));
  console.log("calculate anónimo", calc);
  const global = await client.getHtml(listingPath(null, 1));
  console.log("global maxPage", parseMaxPage(global), "items", parseListing(global).length);
}

main().catch((err) => {
  console.error("smoke falló", err instanceof Error ? err.message : err);
  process.exit(1);
});
