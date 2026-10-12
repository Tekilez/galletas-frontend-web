"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHead, Empty, Search } from "@/components/custom-ui";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    api.clientes()
      .then((c) => setClientes(Array.isArray(c) ? c : []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const list = clientes.filter(c => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (c.nombre?.toLowerCase().includes(term) || 
            c.dni?.toLowerCase().includes(term) || 
            c.telefono?.toLowerCase().includes(term));
  });

  return (
    <div>
      <PageHead title="Clientes" sub={`${clientes.length} registrados en total.`} />
      {err && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">{err}</p>}
      
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <Search value={q} onChange={setQ} placeholder="Buscar por nombre, DNI o teléfono…" />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-black/45 border-b border-zinc-200">
                <th className="px-5 py-3 font-extrabold">Nombre</th>
                <th className="px-3 py-3 font-extrabold">DNI / Documento</th>
                <th className="px-3 py-3 font-extrabold">Teléfono</th>
                <th className="px-3 py-3 font-extrabold">Fecha de Registro</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50/70">
                  <td className="px-5 py-3 font-bold text-[13px] text-black">{c.nombre}</td>
                  <td className="px-3 py-3 text-black text-[13px]">{c.dni || "—"}</td>
                  <td className="px-3 py-3 text-black text-[13px]">{c.telefono || "—"}</td>
                  <td className="px-3 py-3 text-black/55 text-[12px]">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && list.length === 0 && (
          <Empty icon="👤" title="No hay clientes" hint="Agrega clientes al momento de hacer una venta desde la app móvil." />
        )}
        {loading && <p className="text-sm font-bold text-black p-5">Cargando clientes…</p>}
      </Card>
    </div>
  );
}
