"use client";
import { useEffect, useState } from "react";
import { api, AuthUser } from "@/lib/api";
import { Card, PageHead, SectionTitle } from "@/components/custom-ui";

export default function ConfigPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  
  // Datos locales para el MVP
  const [empresa, setEmpresa] = useState("KADEX Tienda");
  const [ruc, setRuc] = useState("20123456789");
  
  useEffect(() => {
    setUser(api.getUser());
    const savedEmpresa = localStorage.getItem("kardex_empresa");
    const savedRuc = localStorage.getItem("kardex_ruc");
    if (savedEmpresa) setEmpresa(savedEmpresa);
    if (savedRuc) setRuc(savedRuc);
  }, []);

  const saveEmpresaData = () => {
    localStorage.setItem("kardex_empresa", empresa);
    localStorage.setItem("kardex_ruc", ruc);
    alert("Datos de la empresa guardados correctamente.");
  };

  return (
    <div>
      <PageHead title="Configuración" sub="Ajustes de tu cuenta y datos de la empresa." />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Perfil del Usuario */}
        <Card>
          <SectionTitle title="Tu Cuenta" sub="Información de la sesión actual." />
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-violet-500/20">
                {(user?.nombre ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-black text-black">{user?.nombre ?? "Cargando..."}</p>
                <p className="text-[13px] font-bold text-black/50">@{user?.usuario}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100">
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-black/40">Rol del Sistema</label>
                <p className="text-[14px] font-bold text-black capitalize">{user?.rol ?? "—"}</p>
              </div>
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-black/40">ID de Sesión</label>
                <p className="text-[12px] font-mono text-black/60 truncate" title={user?.id}>{user?.id ?? "—"}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Datos de la Empresa (Para los PDFs futuros) */}
        <Card>
          <SectionTitle title="Datos del Negocio" sub="Se usarán para los membretes de los reportes PDF." />
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-[13px] font-extrabold text-black mb-1.5">Nombre de la Empresa / Tienda</label>
              <input 
                type="text" 
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="w-full border border-zinc-200 bg-zinc-50 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-black focus:border-[#7C3AED] focus:bg-white focus:outline-none transition-colors"
                placeholder="Ej. Comercial Kadex"
              />
            </div>
            <div>
              <label className="block text-[13px] font-extrabold text-black mb-1.5">RUC / Documento Comercial</label>
              <input 
                type="text" 
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                className="w-full border border-zinc-200 bg-zinc-50 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-black focus:border-[#7C3AED] focus:bg-white focus:outline-none transition-colors"
                placeholder="Ej. 20123456789"
              />
            </div>
            <button 
              onClick={saveEmpresaData}
              className="px-4 py-2 bg-[#1B1145] hover:bg-[#2A1A66] text-white text-[13px] font-bold rounded-xl transition-colors"
            >
              Guardar Datos
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
