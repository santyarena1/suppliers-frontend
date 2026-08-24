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

  await app.register(helmet as any, {
    // Permite <img> desde el frontend (otro origen) hacia /uploads/*
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(multipart as any, { limits: { fileSize: 20 * 1024 * 1024 } });

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
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const port = Number(config.get("PORT") ?? 8080);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
