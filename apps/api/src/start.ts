import { spawn } from "child_process";
import { isPostgresStarting, waitUntil } from "./prisma/postgres-starting";

function run(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (buf: Buffer) => {
      const text = buf.toString();
      output += text;
      process.stderr.write(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

/** Aplica migraciones. Si Postgres sigue en recovery, espera y reintenta. */
export async function migrateWhenReady(): Promise<void> {
  const result = await waitUntil(
    () => run("node_modules/.bin/prisma", ["migrate", "deploy"]),
    (attempt) => attempt.code === 0,
    {
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

async function main() {
  await migrateWhenReady();
  const app = spawn("node", ["dist/main.js"], { stdio: "inherit" });
  const code = await new Promise<number>((resolve) => {
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
