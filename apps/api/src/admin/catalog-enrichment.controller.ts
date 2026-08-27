import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import {
  AiProductHintQueryDto,
  ApplyCatalogSuggestionDto,
  AssignProductDto,
  CreateCatalogTermDto,
  IncompleteQueryDto,
  LinkCatalogRawsDto,
  MoveCatalogProductsDto,
  PreviewRawQueryDto,
  RawValuesQueryDto,
  SaveOpenAiKeyDto,
  ToggleRawVisibilityDto,
  UpdateCatalogTermDto,
  UpsertCatalogAliasDto,
  UpsertCatalogIdentityDto,
} from "./dto/catalog-enrichment.dto";
import { CATALOG_ALIAS_KINDS } from "../catalog/catalog-enrichment";

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/catalog-enrichment")
export class CatalogEnrichmentController {
  constructor(private readonly catalog: CatalogEnrichmentService) {}

  @Get("overview")
  overview() {
    return this.catalog.overview();
  }

  @Put("openai")
  saveOpenAi(@Body() dto: SaveOpenAiKeyDto) {
    return this.catalog.saveOpenAiKey(dto.apiKey);
  }

  @Delete("openai")
  clearOpenAi() {
    return this.catalog.clearOpenAiKey();
  }

  @Get("board")
  board(@Query("kind") kind: string) {
    const k = (CATALOG_ALIAS_KINDS as readonly string[]).includes(kind) ? kind : "CATEGORY";
    return this.catalog.getBoard(k as (typeof CATALOG_ALIAS_KINDS)[number]);
  }

  @Get("terms")
  terms(@Query("kind") kind?: string) {
    const k =
      kind && (CATALOG_ALIAS_KINDS as readonly string[]).includes(kind)
        ? (kind as (typeof CATALOG_ALIAS_KINDS)[number])
        : undefined;
    return this.catalog.listTerms(k);
  }

  @Post("terms")
  createTerm(@Body() dto: CreateCatalogTermDto) {
    return this.catalog.createTerm(dto);
  }

  @Patch("terms/:id")
  updateTerm(@Param("id") id: string, @Body() dto: UpdateCatalogTermDto) {
    return this.catalog.updateTerm(id, dto);
  }

  @Delete("terms/:id")
  deleteTerm(@Param("id") id: string, @Query("force") force?: string) {
    return this.catalog.deleteTerm(id, force === "1" || force === "true");
  }

  @Post("link")
  link(@Body() dto: LinkCatalogRawsDto) {
    return this.catalog.linkRaws(dto);
  }

  @Post("move")
  move(@Body() dto: MoveCatalogProductsDto) {
    return this.catalog.moveProducts(dto);
  }

  @Post("visibility")
  visibility(@Body() dto: ToggleRawVisibilityDto) {
    return this.catalog.toggleRawVisibility(dto);
  }

  @Get("incomplete")
  incomplete(@Query() query: IncompleteQueryDto) {
    return this.catalog.listIncomplete(query);
  }

  @Post("products/assign")
  assignProduct(@Body() dto: AssignProductDto) {
    return this.catalog.assignProduct(dto);
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

  @Post("ai/suggest-merges")
  aiSuggestMerges(
    @Query("kind") kind?: string,
    @Query("offset") offset?: string,
    @Body() body?: { excludeKeys?: string[] }
  ) {
    const k =
      kind && (CATALOG_ALIAS_KINDS as readonly string[]).includes(kind)
        ? (kind as (typeof CATALOG_ALIAS_KINDS)[number])
        : "CATEGORY";
    return this.catalog.aiSuggestMerges(k, {
      excludeKeys: body?.excludeKeys,
      offset: offset ? Number(offset) : 0,
    });
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
