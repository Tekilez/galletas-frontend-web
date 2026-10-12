"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, AuthUser } from "@/lib/api";

const sections: { label: string; items: { href: string; label: string; icon: string; badge?: string }[] }[] = [
  {
    label: "Ventas y Devoluciones",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "◧" },
      { href: "/dashboard/ventas", label: "Ventas", icon: "🧾" },
      { href: "/dashboard/devoluciones", label: "Devoluciones", icon: "↩" },
    ],
  },
  {
    label: "Productos y Servicios",
    items: [{ href: "/dashboard/inventario", label: "Inventario", icon: "📦" }],
  },
  {
    label: "Contabilidad",
    items: [{ href: "/dashboard/contabilidad", label: "Finanzas y Costos", icon: "📊" }],
  },
  {
    label: "Clientes y Vendedores",
    items: [
      { href: "/dashboard/clientes", label: "Clientes", icon: "👤" },
      { href: "/dashboard/vendedores", label: "Vendedores", icon: "💎" },
    ],
  },
  {
    label: "Configuración",
    items: [
      { href: "/dashboard/config", label: "Configuración", icon: "⚙️" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = api.getUser();
    if (!u) router.replace("/login");
    else setUser(u);
  }, [router]);

  if (!mounted || !user) return <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center text-sm font-bold text-black/50">Verificando sesión...</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F5] flex text-black">
      <aside className="w-[248px] shrink-0 bg-[#12172B] text-white flex flex-col sticky top-0 h-screen print:hidden">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-lg font-black">K</div>
            <div>
              <p className="font-black text-[15px] tracking-tight leading-none">KADEX</p>
              <p className="text-[10px] font-bold tracking-[0.22em] text-white/50 mt-1">TIENDA · ADMIN</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-5 overflow-y-auto">
          {sections.map((s) => (
            <div key={s.label}>
              <p className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.18em] text-white/35">{s.label.toUpperCase()}</p>
              <div className="space-y-0.5">
                {s.items.map((it) => {
                  const active = path === it.href;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${active ? "bg-white/[0.08] font-extrabold text-white" : "text-white/65 hover:text-white hover:bg-white/[0.05] font-semibold"}`}
                    >
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-gradient-to-b from-[#7C3AED] to-[#06B6D4]" />}
                      <span className="w-5 text-center text-[13px]">{it.icon}</span>
                      <span className="flex-1">{it.label}</span>
                      {it.badge && <span className="bg-[#7C3AED]/20 text-[#A78BFA] text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">{it.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 pb-0">
          <button className="w-full flex items-center justify-center gap-2 bg-[#4285F4] hover:bg-[#3367D6] text-white font-bold text-[13px] py-2.5 rounded-xl transition-colors">
            <span>🎧</span> Contactar Soporte
          </button>
        </div>
        <div className="p-3">
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-sm font-black">
              {(user?.nombre ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold truncate">{user?.nombre ?? "…"}</p>
              <p className="text-[11px] text-white/50">@{user?.usuario ?? ""}</p>
            </div>
            <button
              title="Cerrar sesión"
              onClick={() => { api.logout(); router.replace("/login"); }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-red-600 text-sm transition-colors"
            >⏻</button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-6 py-6 max-w-[1120px] w-full mx-auto bg-[#F4F4F5] text-black">{children}</main>
    </div>
  );
}
