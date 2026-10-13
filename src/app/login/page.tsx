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
      <div className="hidden lg:flex w-[46%] bg-[#3B2314] text-[#FFFBEB] flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#E8A838]/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-[#B45309]/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#E8A838] to-[#8B4513] flex items-center justify-center text-xl font-black">🍪</div>
          <div>
            <p className="font-black text-[16px] tracking-tight leading-none">LA GALLETERÍA</p>
            <p className="text-[10px] font-bold tracking-[0.22em] text-[#FFD9A0]/70 mt-1">TIENDA · GALLETAS</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-[32px] leading-[1.15] font-black tracking-tight">Horneamos control, vendemos felicidad. 🍪</h1>
          <ul className="mt-6 space-y-3 text-[13px] font-semibold text-[#FFD9A0]/80">
            <li>▸ Ventas y devoluciones sincronizadas del celular</li>
            <li>▸ Stock crítico y margen (Precio−Costo)/Costo</li>
            <li>▸ Tus galletas favoritas siempre en vitrina</li>
          </ul>
        </div>
        <p className="relative text-[11px] text-white/40 font-semibold">Base · galletas-backend-erp.onrender.com</p>
      </div>
      <div className="flex-1 flex items-center justify-center bg-[#FFFBEB] p-6">
        <div className="w-full max-w-[360px]">
          <h2 className="text-[22px] font-black tracking-tight text-black">Ingresar · Admin</h2>
          <p className="text-[13px] text-black/60 mt-1 mb-6">Solo administrador. Los vendedores usan el celular.</p>
          <label className="text-xs font-extrabold text-black">Usuario</label>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} className="mt-1.5 w-full border border-[#E5C07B] rounded-xl px-3.5 py-2.5 text-sm text-[#3B2314] bg-white placeholder:text-[#3B2314]/35 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700" placeholder="admin" autoComplete="username" />
          <label className="text-xs font-extrabold text-black mt-4 block">Contraseña</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" onKeyDown={(e) => e.key === "Enter" && doLogin()} className="mt-1.5 w-full border border-[#E5C07B] rounded-xl px-3.5 py-2.5 text-sm text-[#3B2314] bg-white placeholder:text-[#3B2314]/35 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700" placeholder="••••••••" autoComplete="current-password" />
          {err && <p className="text-xs text-red-700 font-bold mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
          <button onClick={doLogin} disabled={loading || !usuario || !password} className="mt-5 w-full bg-[#7C4A21] hover:bg-[#5C2E0F] text-[#FFFBEB] rounded-xl py-3 text-sm font-extrabold disabled:opacity-40 transition-colors">
            {loading ? "Verificando…" : "Entrar al panel →"}
          </button>
          <p className="text-[11px] text-black/50 font-semibold mt-4">Cuentas de prueba: admin / admin123 · jefe / jefe123</p>
        </div>
      </div>
    </div>
  );
}
