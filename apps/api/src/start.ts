import { spawn, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import { recoveryHttpResponse } from "./prisma/recovery-gate";
import { isPostgresStarting, waitUntil } from "./prisma/postgres-starting";

function run(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve({ code, output });
    };
    const collect = (buf: Buffer) => {
      const text = buf.toString();
      output += text;
      process.stderr.write(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => {
      output += err.message;
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

/**
 * Aplica migraciones. Si Postgres sigue en recovery, espera y reintenta
 * hasta que acepte conexiones. Un error de migración de verdad corta.
 */
export async function migrateWhenReady(): Promise<void> {
  const result = await waitUntil(
    () => run("node_modules/.bin/prisma", ["migrate", "deploy"]),
    (attempt) => attempt.code === 0,
    {
      maxAttempts: Number.POSITIVE_INFINITY,
      retry: (attempt) => isPostgresStarting(attempt.output),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onWait: (attempt, seconds) => {
        console.error(`Postgres todavía no acepta conexiones. Reintento ${attempt} en ${seconds}s.`);
      },
    }
  );
  if (result.code === 0) return;
  if (isPostgresStarting(result.output)) {
    throw new Error("Postgres sigue en recuperación y no llegó a aceptar conexiones.");
  }
  throw new Error(`prisma migrate deploy salió con código ${result.code}`);
}

/**
 * Railway espera `GET /health` en 90s. Si este proceso no escucha hasta que
 * Postgres acepte, el deploy se marca fallido y queda la instancia vieja,
 * que ya perdió la base y responde 500 a todo.
 */
function openRecoveryGate(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }
    const { status, body } = recoveryHttpResponse(req.method, req.url);
    if (status === 204) {
      res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader(
        "access-control-allow-headers",
        req.headers["access-control-request-headers"] ?? "content-type,authorization"
      );
      res.writeHead(status);
      res.end();
      return;
    }
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function forwardSignals(child: ChildProcess) {
  const forward = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const gate = await openRecoveryGate(port);
  console.error(`API en el puerto ${port} mientras Postgres termina de arrancar.`);
  try {
    await migrateWhenReady();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  await closeServer(gate);
  const app = spawn("node", ["dist/main.js"], { stdio: "inherit" });
  forwardSignals(app);
  const code = await new Promise<number>((resolve) => {
    app.on("error", () => resolve(1));
    app.on("close", (exit) => resolve(exit ?? 1));
  });
  process.exit(code);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
