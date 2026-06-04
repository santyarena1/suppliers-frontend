"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clearSession, getUser, isAdmin } from "@/lib/auth";
import { Search, Key, Users, LogOut, ShoppingBag } from "lucide-react";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = getUser();

  function logout() {
    clearSession();
    router.push("/login");
  }

  const links = [
    { href: "/search", label: "Buscar", icon: Search },
    { href: "/credentials", label: "Credenciales", icon: Key },
    ...(isAdmin() ? [{ href: "/admin", label: "Usuarios", icon: Users }] : []),
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/search" className="flex items-center gap-2 text-white font-bold text-lg">
          <ShoppingBag className="w-5 h-5 text-blue-400" />
          <span>Mayoristas</span>
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {user?.username}
            {user?.role === "ROLE_ADMIN" && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                Admin
              </span>
            )}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
