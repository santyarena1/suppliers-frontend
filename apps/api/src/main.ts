import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { AppModule } from "./app.module";
import { CatalogApiModule } from "./catalog-api/catalog-api.module";
import { buildOpenApiDocument, OpenApiHolder } from "./catalog-api/v1/openapi";
import { RequestMetricsService } from "./monitoring/request-metrics.service";

/**
 * Los deploys de preview de Vercel tienen dominio dinámico, así que una entrada de
 * CORS_ORIGIN puede traer un comodín (`https://*.vercel.app`). El comodín cubre una
 * sola etiqueta de dominio; sin comodín la comparación es exacta.
 */
function toOriginMatcher(pattern: string): (origin: string) => boolean {
  if (!pattern.includes("*")) return (origin) => origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^./]+");
  const regex = new RegExp(`^${escaped}$`);
  return (origin) => regex.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const config = app.get(ConfigService);

  // Cada respuesta se cuenta por ruta y código para "Salud del sistema".
  const metrics = app.get(RequestMetricsService);
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onResponse", (req, reply, done) => {
    if (req.method !== "OPTIONS") {
      const route = (req as { routeOptions?: { url?: string } }).routeOptions?.url || "(sin ruta)";
      metrics.record(req.method, route, reply.statusCode, reply.elapsedTime);
    }
    done();
  });

  await app.register(helmet as any, {
    // Permite <img> desde el frontend (otro origen) hacia /assets/* y /uploads/*
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(multipart as any, { limits: { fileSize: 20 * 1024 * 1024 } });

  // Legacy: assets viejos en disco. Los uploads nuevos van a Postgres (`/assets/:id`).
  const uploadsRoot = join(process.cwd(), "uploads");
  if (!existsSync(uploadsRoot)) mkdirSync(uploadsRoot, { recursive: true });
  await app.register(fastifyStatic as any, {
    root: uploadsRoot,
    prefix: "/uploads/",
    decorateReply: false,
  });

  const allowedOrigins = (config.get<string>("CORS_ORIGIN") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(toOriginMatcher);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      // Sin cabecera Origin no hay navegador de por medio (curl, health checks).
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.some((matches) => matches(origin)));
    },
    credentials: true,
    // La referencia interactiva de la API de catálogo (nodohub.app/developers) lee estos headers.
    exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
    // El navegador recuerda el permiso 10 minutos en vez de preguntar antes de
    // cada pedido (la mitad del tráfico eran estos OPTIONS).
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Documento OpenAPI de la API de catálogo (solo /v1), servido en GET /v1/openapi.json.
  OpenApiHolder.set(buildOpenApiDocument(app, [CatalogApiModule]));

  const port = Number(config.get("PORT") ?? 8080);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
