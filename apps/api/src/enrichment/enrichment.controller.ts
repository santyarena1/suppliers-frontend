import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { BulkDecideDto, DecideDto, ListMastersQueryDto, MergeDto, PROPOSAL_FIELD_VALUES, SplitDto, StartRunDto } from "./dto/enrichment.dto";
import { GroupingService } from "./grouping.service";
import { MastersService } from "./masters.service";
import { RunsService } from "./runs.service";
import { ALL_SCHEMAS } from "./schemas";
import { TAXONOMY } from "./taxonomy";

/**
 * Módulo de superadmin "Productos enriquecidos" (docs/PLAN_ENRIQUECIMIENTO.md).
 * Todo queda como propuesta: nada de esto cambia lo que ven los comercios.
 */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/enrichment")
export class EnrichmentController {
  constructor(
    private readonly masters: MastersService,
    private readonly grouping: GroupingService,
    private readonly runs: RunsService
  ) {}

  @Get("overview")
  overview() {
    return this.masters.overview();
  }

  @Get("taxonomy")
  taxonomy() {
    return {
      categories: TAXONOMY.map((c) => ({ key: c.key, label: c.label })),
      schemas: ALL_SCHEMAS.map((s) => ({ categoryKey: s.categoryKey, version: s.version, attributes: s.attributes.map(({ aliases: _a, ...a }) => a) })),
    };
  }

  @Post("regroup")
  regroup() {
    return this.grouping.regroup();
  }

  @Get("masters")
  list(@Query() query: ListMastersQueryDto) {
    return this.masters.list(query);
  }

  @Get("masters/:id")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.masters.detail(id);
  }

  @Get("masters/:id/apply-preview")
  applyPreview(@Param("id", ParseUUIDPipe) id: string) {
    return this.masters.applyPreview(id);
  }

  @Post("masters/:id/enrich")
  async enrichOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() me: JwtPayload) {
    const run = await this.runs.runOne(id, me.sub);
    return { run, detail: await this.masters.detail(id) };
  }

  @Post("masters/:id/proposals/:field/decision")
  decide(@Param("id", ParseUUIDPipe) id: string, @Param("field") field: string, @Body() dto: DecideDto, @CurrentUser() me: JwtPayload) {
    if (!(PROPOSAL_FIELD_VALUES as readonly string[]).includes(field)) throw new BadRequestException("Campo inválido");
    return this.masters.decide(id, field, dto.decision, me.sub);
  }

  @Post("proposals/bulk-decision")
  bulkDecide(@Body() dto: BulkDecideDto, @CurrentUser() me: JwtPayload) {
    return this.masters.bulkDecide(dto, me.sub);
  }

  @Post("masters/:id/split")
  split(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SplitDto) {
    return this.masters.split(id, dto.members);
  }

  @Post("masters/merge")
  merge(@Body() dto: MergeDto) {
    return this.masters.merge(dto.targetId, dto.sourceIds);
  }

  @Get("runs")
  listRuns() {
    return this.runs.list();
  }

  @Post("runs")
  startRun(@Body() dto: StartRunDto, @CurrentUser() me: JwtPayload) {
    return this.runs.start(dto, me.sub);
  }

  @Get("runs/:id")
  getRun(@Param("id", ParseUUIDPipe) id: string) {
    return this.runs.get(id);
  }

  @Post("runs/:id/cancel")
  cancelRun(@Param("id", ParseUUIDPipe) id: string) {
    return this.runs.cancel(id);
  }
}
