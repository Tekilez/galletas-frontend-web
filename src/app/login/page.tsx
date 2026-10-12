"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const doLogin = async () => {
    setErr(""); setLoading(true);
    const allow = (user: { rol: string }) => {
      // Web exclusiva del administrador: los vendedores usan el celular
      if (user.rol !== "admin" && user.rol !== "jefe") {
        api.logout();
        setErr("Esta web es solo para el administrador. Los vendedores ingresan desde el celular.");
        return false;
      }
      router.replace("/dashboard");
      return true;
    };
    try {
      const { user } = await api.login(usuario.trim(), password);
      allow(user);
      return;
    } catch (e: any) {
      setErr(e?.name === "AbortError" ? "El servidor está despertando (puede tomar 50s). Por favor, presiona Ingresar nuevamente." : (e?.message ?? "Usuario o contraseña incorrectos."));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex text-black">
      <div className="hidden lg:flex w-[46%] bg-[#12172B] text-white flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#7C3AED]/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-[#06B6D4]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-lg font-black">K</div>
          <div>
            <p className="font-black text-[16px] tracking-tight leading-none">KADEX</p>
            <p className="text-[10px] font-bold tracking-[0.22em] text-white/50 mt-1">TIENDA · ADMIN</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-[32px] leading-[1.15] font-black tracking-tight">Control total de tu tienda, por vendedor.</h1>
          <ul className="mt-6 space-y-3 text-[13px] font-semibold text-white/70">
            <li>▸ Ventas y devoluciones sincronizadas del celular</li>
            <li>▸ Stock crítico y margen (Precio−Costo)/Costo</li>
          </ul>
        </div>
        <p className="relative text-[11px] text-white/40 font-semibold">Base · kardex-ia.onrender.com</p>
      </div>
      <div className="flex-1 flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-[360px]">
          <h2 className="text-[22px] font-black tracking-tight text-black">Ingresar · Admin</h2>
          <p className="text-[13px] text-black/60 mt-1 mb-6">Solo administrador. Los vendedores usan el celular.</p>
          <label className="text-xs font-extrabold text-black">Usuario</label>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} className="mt-1.5 w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm text-black bg-white placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-600" placeholder="admin" autoComplete="username" />
          <label className="text-xs font-extrabold text-black mt-4 block">Contraseña</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" onKeyDown={(e) => e.key === "Enter" && doLogin()} className="mt-1.5 w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm text-black bg-white placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-600" placeholder="••••••••" autoComplete="current-password" />
          {err && <p className="text-xs text-red-700 font-bold mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
          <button onClick={doLogin} disabled={loading || !usuario || !password} className="mt-5 w-full bg-[#1B1145] hover:bg-[#2A1A66] text-white rounded-xl py-3 text-sm font-extrabold disabled:opacity-40 transition-colors">
            {loading ? "Verificando…" : "Entrar al panel →"}
          </button>
          <p className="text-[11px] text-black/50 font-semibold mt-4">Cuentas de prueba: admin / admin123 · jefe / jefe123</p>
        </div>
      </div>
    </div>
  );
}
