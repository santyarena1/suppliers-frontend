import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import {
  AiProductHintQueryDto,
  ApplyCatalogSuggestionDto,
  PreviewRawQueryDto,
  RawValuesQueryDto,
  UpsertCatalogAliasDto,
  UpsertCatalogIdentityDto,
} from "./dto/catalog-enrichment.dto";

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/catalog-enrichment")
export class CatalogEnrichmentController {
  constructor(private readonly catalog: CatalogEnrichmentService) {}

  @Get("overview")
  overview() {
    return this.catalog.overview();
  }

  @Get("raw-values")
  rawValues(@Query() query: RawValuesQueryDto) {
    return this.catalog.listRawValues(query);
  }

  @Get("aliases")
  aliases(@Query("kind") kind?: string, @Query("provider") provider?: string) {
    return this.catalog.listAliases(kind as never, provider);
  }

  @Post("aliases")
  upsertAlias(@Body() dto: UpsertCatalogAliasDto) {
    return this.catalog.upsertAliasGroup(dto);
  }

  @Delete("aliases/:id")
  deleteAlias(@Param("id") id: string) {
    return this.catalog.deleteAlias(id);
  }

  @Get("identities")
  identities(@Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.catalog.listIdentities(limit ? Number(limit) : 100, offset ? Number(offset) : 0);
  }

  @Post("identities")
  upsertIdentity(@Body() dto: UpsertCatalogIdentityDto) {
    return this.catalog.upsertIdentity(dto);
  }

  @Delete("identities/:id")
  deleteIdentity(@Param("id") id: string) {
    return this.catalog.deleteIdentity(id);
  }

  @Get("suggestions")
  suggestions(@Query("provider") provider?: string) {
    return this.catalog.getSuggestions(provider);
  }

  @Post("suggestions/apply")
  applySuggestion(@Body() dto: ApplyCatalogSuggestionDto) {
    return this.catalog.applySuggestion(dto);
  }

  @Post("ai/category-clusters")
  aiCategoryClusters(@Query("provider") provider?: string) {
    return this.catalog.aiCategoryClusters(provider);
  }

  @Get("ai/product-hint")
  aiProductHint(@Query() query: AiProductHintQueryDto) {
    return this.catalog.aiProductHint(query.provider, query.externalId);
  }

  @Get("preview")
  preview(@Query() query: PreviewRawQueryDto) {
    return this.catalog.previewProducts({
      kind: query.kind,
      provider: query.provider ?? null,
      rawKey: query.rawKey,
      limit: query.limit,
    });
  }
}
