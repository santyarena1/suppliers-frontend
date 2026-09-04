import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { CartModule } from "./cart/cart.module";
import { OrdersModule } from "./orders/orders.module";
import { HealthModule } from "./health/health.module";
import { ProvidersModule } from "./providers/providers.module";
import { AdminModule } from "./admin/admin.module";
import { TenantsModule } from "./tenants/tenants.module";
import { ChatModule } from "./chat/chat.module";
import { RetailModule } from "./retail/retail.module";
import { AssetsModule } from "./assets/assets.module";
import { ImagesModule } from "./images/images.module";
import { AdsModule } from "./ads/ads.module";
import { BrandsModule } from "./brands/brands.module";
import { TgsModule } from "./tgs/tgs.module";
import { NewsModule } from "./news/news.module";
import { ListImportModule } from "./list-import/list-import.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get("THROTTLE_TTL") ?? 60) * 1000,
            limit: Number(config.get("THROTTLE_LIMIT") ?? 100),
          },
        ],
      }),
    }),
    PrismaModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    CredentialsModule,
    CartModule,
    OrdersModule,
    HealthModule,
    ProvidersModule,
    AdminModule,
    TenantsModule,
    ChatModule,
    RetailModule,
    AssetsModule,
    ImagesModule,
    AdsModule,
    BrandsModule,
    TgsModule,
    NewsModule,
    ListImportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
