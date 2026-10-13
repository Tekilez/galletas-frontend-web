"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHead } from "@/components/custom-ui";

type Msg = { rol: "yo" | "ia"; texto: string; datos?: any };

const SUGERENCIAS = ["¿cuántas chocochips PAQ12 hay?", "stock crítico", "¿cuál es la más vendida?", "ventas de hoy"];

export default function IAPage() {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{ rol: "ia", texto: "Soy Galleta IA 🍪. Solo respondo con datos reales del inventario: stock, ventas de hoy, más vendidos y margen." }]);
  const [loading, setLoading] = useState(false);

  const ask = async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || loading) return;
    setMsgs((m) => [...m, { rol: "yo", texto: p }]);
    setQ(""); setLoading(true);
    try {
      const r: any = await api.chat(p);
      setMsgs((m) => [...m, { rol: "ia", texto: r.respuesta ?? "Sin respuesta.", datos: r.datos }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { rol: "ia", texto: `Error: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <PageHead title="IA Gemini" sub="Indicadores de gestión con datos reales. Nada de promociones." />
      <Card>
        <div className="p-5 space-y-3 min-h-[320px] max-h-[52vh] overflow-y-auto">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.rol === "yo" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${m.rol === "yo" ? "bg-[#7C4A21] text-white font-semibold rounded-br-md" : "bg-zinc-100 text-black font-medium rounded-bl-md"}`}>
                <p>{m.texto}</p>
                {m.datos && <pre className="mt-2 text-[11px] bg-black/[0.06] rounded-lg p-2 overflow-auto">{JSON.stringify(m.datos, null, 2)}</pre>}
              </div>
            </div>
          ))}
          {loading && <p className="text-xs font-bold text-black">Gemini consultando inventario…</p>}
        </div>
        <div className="px-5 pb-2 flex gap-2 flex-wrap">
          {SUGERENCIAS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="text-[11px] font-bold text-black border border-zinc-300 rounded-full px-3 py-1.5 hover:bg-zinc-100">{s}</button>
          ))}
        </div>
        <div className="p-4 flex gap-2 border-t border-zinc-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Pregunta por stock, ventas, margen…" className="flex-1 border border-zinc-300 rounded-xl px-3 py-2.5 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700" />
          <button onClick={() => ask(q)} disabled={loading} className="px-4 rounded-xl text-sm font-extrabold text-white bg-[#7C4A21] hover:bg-[#5C2E0F] disabled:opacity-50">➤</button>
        </div>
      </Card>
      <p className="text-[11px] text-black/55 mt-2 font-semibold">Responde solo con inventario_context del backend (system prompt restringido, temperature 0.1).</p>
    </div>
  );
}
