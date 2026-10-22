import { Injectable } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import type { ProviderAdapter } from "./types";
import { ElitAdapter } from "./adapters/elit.adapter";
import { InvidAdapter } from "./adapters/invid.adapter";
import { AirAdapter } from "./adapters/air.adapter";
import { GrupoNucleoAdapter } from "./adapters/grupo-nucleo.adapter";
import { NewBytesAdapter } from "./adapters/new-bytes.adapter";
import { CevenAdapter } from "./adapters/ceven.adapter";
import { DiapstoreAdapter } from "./adapters/diapstore.adapter";
import { NewTreeAdapter } from "./adapters/new-tree.adapter";
import { SolutionBoxAdapter } from "./adapters/solution-box.adapter";
import { DistecnaAdapter } from "./adapters/distecna.adapter";
import { PolytechAdapter } from "./adapters/polytech.adapter";
import { MasnetAdapter } from "./adapters/masnet.adapter";
import { MicroglobalAdapter } from "./adapters/microglobal.adapter";
import { PcArtsAdapter } from "./adapters/pc-arts.adapter";

@Injectable()
export class ProviderRegistry {
  private readonly adapters: Partial<Record<Provider, ProviderAdapter>>;

  constructor(
    elit: ElitAdapter,
    invid: InvidAdapter,
    air: AirAdapter,
    grupoNucleo: GrupoNucleoAdapter,
    newBytes: NewBytesAdapter,
    ceven: CevenAdapter,
    diapstore: DiapstoreAdapter,
    newTree: NewTreeAdapter,
    solutionBox: SolutionBoxAdapter,
    distecna: DistecnaAdapter,
    polytech: PolytechAdapter,
    masnet: MasnetAdapter,
    microglobal: MicroglobalAdapter,
    pcArts: PcArtsAdapter
  ) {
    this.adapters = {
      ELIT: elit,
      INVID: invid,
      AIR: air,
      GRUPO_NUCLEO: grupoNucleo,
      NEW_BYTES: newBytes,
      CEVEN: ceven,
      DIAPSTORE: diapstore,
      NEW_TREE: newTree,
      SOLUTION_BOX: solutionBox,
      DISTECNA: distecna,
      POLYTECH: polytech,
      MASNET: masnet,
      MICROGLOBAL: microglobal,
      PC_ARTS: pcArts,
    };
  }

  get(provider: Provider): ProviderAdapter | undefined {
    return this.adapters[provider];
  }

  /** Proveedores con integración real implementada (el resto todavía no). */
  get implemented(): Provider[] {
    return Object.keys(this.adapters) as Provider[];
  }
}
