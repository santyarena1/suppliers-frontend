import { airPageShape } from "./air-account.service";

it("forma de una página de Air sin tablas, sin importes", () => {
  const s = airPageShape(`<div id="lista" nrocompro="x"></div><script>$.post("debehaber.php?q=dh&cli=12345", {qd: d})</script><form action="x.php"><input name="qd"></form><span>311,471.04</span>`);
  expect(s).toContain("debehaber.php?q=dh&cli=#");
  expect(s).toContain("$.post");
  expect(s).toContain("nrocompro");
  expect(s).not.toContain("311");
  expect(s).toContain("999,999.99");
});
