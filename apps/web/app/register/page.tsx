"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { ArrowLeft, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import "../(marketing)/landing.css";
import "../login/login.css";

/** Registro: la misma antesala que el login, con el mismo mundo. */
export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.register(username, email, password);
      // Con el flag el login puede confirmar que la cuenta quedó creada; sin él
      // ese mensaje no aparecía nunca.
      router.push("/login?registrado=1");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Error al registrarse. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lnd lgn">
      <DataField className="lgn__field" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <div className="lgn__wrap">
        <Link href="/landing" className="lgn__brand">
          <NodoLogo className="w-7 h-7" />
          <span>
            <NodoWordmark className="h-3.5" />
            <em className="lnd-mono">Buscador mayorista</em>
          </span>
        </Link>

        <div className="lgn__grid">
          <section className="lgn__pitch">
            <h1 className="lnd-display lnd-display--md">Creá tu cuenta y conectá tus proveedores</h1>
            <p className="lgn__lead">
              Con la cuenta creada cargás las credenciales que ya tenés en cada distribuidor. NODO
              no compra por vos: entra con tu usuario, al precio que tenés vos.
            </p>
            <Link href="/landing" className="lgn__back lnd-mono">
              <ArrowLeft className="w-3 h-3" />
              Ver cómo funciona
            </Link>
          </section>

          <section className="lnd-panel lnd-panel--sheer lgn__card">
            <p className="lnd-label">Registro</p>
            <h2 className="lgn__title">Crear cuenta</h2>

            {error && (
              <p className="lgn__msg is-bad">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="lgn__form">
              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Usuario</span>
                <input
                  type="text"
                  className="lnd-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Elegí un usuario"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </label>

              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Email</span>
                <input
                  type="email"
                  className="lnd-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Contraseña</span>
                <input
                  type="password"
                  className="lnd-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>

              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Confirmar contraseña</span>
                <input
                  type="password"
                  className="lnd-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  required
                  autoComplete="new-password"
                />
              </label>

              <button type="submit" disabled={loading} className="lnd-btn lnd-btn--primary lgn__go">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando
                  </>
                ) : (
                  <>
                    Crear cuenta
                    <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
                  </>
                )}
              </button>
            </form>

            <p className="lgn__foot">
              ¿Ya tenés cuenta? <Link href="/login">Ingresá</Link>
            </p>
          </section>
        </div>

        <p className="lgn__legal lnd-mono">© 2026 NODO</p>
      </div>
    </main>
  );
}
