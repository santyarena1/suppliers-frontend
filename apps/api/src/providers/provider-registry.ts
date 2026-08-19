import { Injectable } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import type { ProviderAdapter } from "./types";
import { ElitAdapter } from "./adapters/elit.adapter";
import { InvidAdapter } from "./adapters/invid.adapter";
import { AirAdapter } from "./adapters/air.adapter";
import { GrupoNucleoAdapter } from "./adapters/grupo-nucleo.adapter";
import { NewBytesAdapter } from "./adapters/new-bytes.adapter";

@Injectable()
export class ProviderRegistry {
  private readonly adapters: Partial<Record<Provider, ProviderAdapter>>;

  constructor(
    elit: ElitAdapter,
    invid: InvidAdapter,
    air: AirAdapter,
    grupoNucleo: GrupoNucleoAdapter,
    newBytes: NewBytesAdapter
  ) {
    this.adapters = {
      ELIT: elit,
      INVID: invid,
      AIR: air,
      GRUPO_NUCLEO: grupoNucleo,
      NEW_BYTES: newBytes,
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
