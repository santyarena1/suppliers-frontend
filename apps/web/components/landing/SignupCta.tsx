"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { Button, ICON_STROKE, Reveal, Shell } from "./ui";

export default function SignupCta() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.register(username.trim(), email.trim(), password);
      router.push("/login?registrado=1");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(" · ") : msg || "No se pudo crear la cuenta. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="cuenta" className="relative py-24 sm:py-36">
      <Shell>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-12 lg:gap-16 items-start">
          <Reveal>
            <h2 className="lnd-display lnd-display--lg">
              Empezá con
              <br />
              tu primera lista
            </h2>
            <p className="lnd-body mt-6">
              Creás la cuenta, conectás un distribuidor y ya tenés su catálogo buscable. No hace
              falta cargar todos el primer día: con uno solo ya se nota la diferencia contra abrir
              su portal cada vez.
            </p>

            <hr className="lnd-rule my-8" />

            <p className="lnd-body text-[0.85rem]">
              <span className="text-[var(--fg)]">¿Sos distribuidor o marca?</span> Creás la cuenta
              igual que un comercio y desde NODO te habilitamos el espacio que corresponde, con tu
              catálogo o tu panel de marca.
            </p>

            <p className="lnd-note mt-6 leading-relaxed">
              ¿Ya tenés cuenta?{" "}
              <Link href="/login" className="underline underline-offset-4" style={{ color: "var(--mist)" }}>
                Entrar
              </Link>
            </p>
          </Reveal>

          <Reveal delay={90}>
            <form onSubmit={onSubmit} className="lnd-panel p-6 sm:p-8">
              {error && (
                <div
                  className="flex items-start gap-2.5 text-[0.82rem] rounded px-3.5 py-3 mb-6"
                  style={{
                    background: "rgb(255 106 61 / 0.1)",
                    border: "1px solid rgb(255 106 61 / 0.35)",
                    color: "var(--ember)",
                  }}
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" strokeWidth={ICON_STROKE} />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="lnd-user" className="lnd-label block mb-2">
                    Usuario
                  </label>
                  <input
                    id="lnd-user"
                    className="lnd-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Con el que vas a entrar"
                    autoComplete="username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="lnd-mail" className="lnd-label block mb-2">
                    Mail
                  </label>
                  <input
                    id="lnd-mail"
                    type="email"
                    className="lnd-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@comercio.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lnd-pass" className="lnd-label block mb-2">
                      Contraseña
                    </label>
                    <input
                      id="lnd-pass"
                      type="password"
                      className="lnd-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="lnd-pass2" className="lnd-label block mb-2">
                      Repetir
                    </label>
                    <input
                      id="lnd-pass2"
                      type="password"
                      className="lnd-input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="La misma"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="mt-7 flex items-center gap-4">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creando" : "Crear mi cuenta"}
                </Button>
                {loading && (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    strokeWidth={ICON_STROKE}
                    style={{ color: "var(--lilac)" }}
                  />
                )}
              </div>

              <p className="lnd-note mt-6 leading-relaxed">
                Sin tarjeta para empezar. Los distribuidores los conectás vos, cuando quieras.
              </p>
            </form>
          </Reveal>
        </div>
      </Shell>
    </section>
  );
}
