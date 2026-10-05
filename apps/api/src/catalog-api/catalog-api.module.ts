import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { isServerRuntime } from "./core/runtime";
import { CryptoModule } from "../common/crypto/crypto.module";
import { ProvidersModule } from "../providers/providers.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ApiClientResolver } from "./auth/api-client-resolver.service";
import { ApiKeyGuard } from "./auth/api-key.guard";
import { ApiUsageService } from "./auth/api-usage.service";
import { CatalogApiCleanupService } from "./catalog-api-cleanup.service";
import { ChangeTrackerService } from "./changes/change-tracker.service";
import { ChangesFeedService } from "./changes/changes-feed.service";
import { CatalogInfoService } from "./core/catalog-info.service";
import { CatalogQueryService } from "./core/catalog-query.service";
import { CatalogSnapshotService } from "./core/catalog-snapshot.service";
import { FxService } from "./core/fx.service";
import { ExportService } from "./export/export.service";
import { CatalogApiManageController } from "./manage/catalog-api-manage.controller";
import { CatalogApiManageService } from "./manage/catalog-api-manage.service";
import { OpenApiController } from "./v1/openapi.controller";
import { V1CatalogController } from "./v1/v1-catalog.controller";
import { V1ExceptionFilter } from "./v1/v1-exception.filter";
import { V1FeedsController, V1SyncController } from "./v1/v1-sync.controller";
import { V1UsageInterceptor } from "./v1/v1-usage.interceptor";
import { V1WebhooksController } from "./v1/v1-webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";

const SERVICES = [
  ApiClientResolver,
  ApiKeyGuard,
  ApiUsageService,
  V1ExceptionFilter,
  V1UsageInterceptor,
  FxService,
  CatalogSnapshotService,
  CatalogQueryService,
  CatalogInfoService,
  ChangeTrackerService,
  ChangesFeedService,
  ExportService,
  WebhooksService,
  CatalogApiCleanupService,
];

/**
 * API pública de catálogo (/v1). Solo sus controllers entran en el documento
 * OpenAPI (main.ts). Diseño: docs/PLAN_API_CATALOGO.md.
 */
@Module({
  imports: [ProvidersModule, TenantsModule, CatalogModule, CryptoModule],
  controllers: [V1CatalogController, V1SyncController, V1FeedsController, V1WebhooksController, OpenApiController],
  providers: SERVICES,
  exports: SERVICES,
})
export class CatalogApiModule implements OnModuleInit {
  /** Sin pepper en producción las keys no se pueden crear ni validar: se avisa fuerte al arrancar. */
  onModuleInit() {
    const pepper = process.env.API_KEY_PEPPER?.trim() ?? "";
    if (isServerRuntime() && pepper.length < 32) {
      new Logger("CatalogApi").error("Falta API_KEY_PEPPER (mín. 32 caracteres): la API de catálogo responde internal_error hasta configurarla");
    }
  }
}

/** Configuración → API de catálogo (sesión del comercio). Fuera del documento OpenAPI. */
@Module({
  imports: [CatalogApiModule, SubscriptionsModule, TenantsModule],
  controllers: [CatalogApiManageController],
  providers: [CatalogApiManageService],
})
export class CatalogApiManageModule {}
