"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { Badge, Card, Empty, PageHead } from "@/components/custom-ui";

function formatHora(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

function formatMinutos(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function VendPage() {
  const [tab, setTab] = useState<"ventas" | "asistencia">("asistencia");
  const [notas, setNotas] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [filtroFecha, setFiltroFecha] = useState<string>("todos");

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.notas(),
      api.vendedores().catch(() => []),
      api.asistencia().catch(() => []),
    ]).then(([nRes, vRes, aRes]) => {
      if (nRes.status === "fulfilled") setNotas(Array.isArray(nRes.value) ? nRes.value : []);
      else setErr(String((nRes as any).reason?.message ?? "Error cargando notas"));
      if (vRes.status === "fulfilled") setVendedores(Array.isArray(vRes.value) ? vRes.value : []);
      if (aRes.status === "fulfilled") setAsistencias(Array.isArray(aRes.value) ? aRes.value : []);
    }).finally(() => setLoading(false));
  }, []);

  // Resumen por vendedor
  const porVendedor = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; usuario: string; rol: string; activo: boolean; notas: any[] }>();

    for (const v of vendedores) {
      m.set(v.id, {
        id: v.id,
        nombre: v.nombre ?? v.usuario,
        usuario: v.usuario ?? "",
        rol: v.rol ?? "vendedor",
        activo: v.activo !== false,
        notas: [],
      });
    }

    for (const n of notas) {
      const vid = n.vendedor_id ?? n.created_by;
      if (vid && m.has(vid)) {
        m.get(vid)!.notas.push(n);
      } else {
        const nombre = String(n.vendedor_nombre ?? "Sin asignar");
        const existing = [...m.values()].find((v) => v.nombre === nombre);
        if (existing) {
          existing.notas.push(n);
        } else {
          const key = `unknown-${nombre}`;
          if (!m.has(key)) m.set(key, { id: key, nombre, usuario: "", rol: "vendedor", activo: true, notas: [] });
          m.get(key)!.notas.push(n);
        }
      }
    }

    return [...m.values()].map((v) => ({
      ...v,
      total: v.notas.reduce((s, n) => s + (Number(n.total) || 0), 0),
      paquetes: v.notas.reduce((s, n) => {
        const items = n.detalles ?? n.items;
        if (Array.isArray(items)) return s + items.reduce((a: number, it: any) => a + (Number(it?.cantidad) || 1), 0);
        if (items && typeof items === "object") return s + Object.values(items).reduce((a: number, x: any) => a + (Number(x) || 0), 0);
        return s;
      }, 0),
    })).sort((a, b) => b.total - a.total);
  }, [notas, vendedores]);

  // Turnos con acciones vinculadas (Ventas durante el turno)
  const turnosConAcciones = useMemo(() => {
    return asistencias.map((a) => {
      const entradaTime = new Date(a.entrada_at).getTime();
      const salidaTime = a.salida_at ? new Date(a.salida_at).getTime() : Date.now();

      // Buscar notas creadas por este usuario en el rango del turno
      const notasTurno = notas.filter((n) => {
        const notaTime = new Date(n.created_at || n.fecha || a.entrada_at).getTime();
        const coincideVendedor =
          (n.vendedor_id && n.vendedor_id === a.vendedor_id) ||
          (n.created_by && n.created_by === a.vendedor_id) ||
          (n.vendedor_nombre && (n.vendedor_nombre === a.nombre || n.vendedor_nombre === a.usuario));

        // Rango con tolerancia de 5 minutos
        const enRango = notaTime >= entradaTime - 5 * 60 * 1000 && notaTime <= salidaTime + 5 * 60 * 1000;
        return coincideVendedor && enRango;
      });

      const totalVendidoTurno = notasTurno.reduce((s, n) => s + (Number(n.total) || 0), 0);
      const paquetesTurno = notasTurno.reduce((s, n) => {
        const items = n.detalles ?? n.items;
        if (Array.isArray(items)) return s + items.reduce((acc: number, it: any) => acc + (Number(it?.cantidad) || 1), 0);
        if (items && typeof items === "object") return s + Object.values(items).reduce((acc: number, x: any) => acc + (Number(x) || 0), 0);
        return s;
      }, 0);

      const mins = Number(a.minutos_trabajados) || (a.salida_at ? Math.max(0, Math.floor((salidaTime - entradaTime) / 60000)) : Math.max(0, Math.floor((Date.now() - entradaTime) / 60000)));

      return {
        ...a,
        minutosCalculados: mins,
        notasTurno,
        totalVendidoTurno,
        paquetesTurno,
      };
    }).filter((t) => {
      if (filtroVendedor !== "todos" && t.usuario !== filtroVendedor && t.vendedor_id !== filtroVendedor) {
        return false;
      }
      if (filtroFecha === "hoy") {
        const hoy = new Date().toISOString().slice(0, 10);
        return t.fecha === hoy;
      }
      return true;
    });
  }, [asistencias, notas, filtroVendedor, filtroFecha]);

  return (
    <div className="space-y-4">
      <PageHead
        title="Vendedores y Control de Asistencia"
        sub="Control de turnos, entradas, salidas y registro de acciones por vendedor en tiempo real."
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setTab("asistencia")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${
            tab === "asistencia"
              ? "bg-[#B45309] text-white shadow-sm"
              : "bg-white text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <span>⏱️</span> Control de Asistencia y Acciones ({turnosConAcciones.length})
        </button>
        <button
          onClick={() => setTab("ventas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${
            tab === "ventas"
              ? "bg-[#B45309] text-white shadow-sm"
              : "bg-white text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <span>💎</span> Ventas Totales por Vendedor ({porVendedor.length})
        </button>
      </div>

      {err && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{err}</p>}
      {loading && <p className="text-sm font-bold text-black">Cargando datos del servidor…</p>}

      {/* TAB ASISTENCIA & ACCIONES */}
      {tab === "asistencia" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600">Filtrar por Vendedor:</span>
              <select
                value={filtroVendedor}
                onChange={(e) => setFiltroVendedor(e.target.value)}
                className="bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-bold text-black outline-none focus:border-[#B45309]"
              >
                <option value="todos">Todos los vendedores</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.usuario || v.id}>
                    {v.nombre} (@{v.usuario})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600">Período:</span>
              <div className="flex bg-zinc-100 p-0.5 rounded-xl">
                <button
                  onClick={() => setFiltroFecha("todos")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${filtroFecha === "todos" ? "bg-white text-black shadow-sm" : "text-zinc-600"}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroFecha("hoy")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${filtroFecha === "hoy" ? "bg-white text-black shadow-sm" : "text-zinc-600"}`}
                >
                  Hoy
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Turnos y Acciones */}
          <div className="grid gap-3">
            {turnosConAcciones.map((t) => {
              const isActivo = t.estado === "activo";
              return (
                <Card key={t.id}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm ${isActivo ? "bg-gradient-to-br from-[#10B981] to-[#059669] animate-pulse" : "bg-gradient-to-br from-[#B45309] to-[#E8A838]"}`}>
                          {t.nombre ? t.nombre.slice(0, 1).toUpperCase() : "V"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-black text-sm">{t.nombre || t.usuario}</p>
                            <span className="text-[11px] font-bold text-zinc-500">@{t.usuario}</span>
                            <Badge tone={isActivo ? "teal" : "zinc"}>
                              {isActivo ? "🟢 En Curso" : "Completado"}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
                            Fecha: <span className="text-black font-bold">{t.fecha}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <div className="bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl text-center">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase">Tiempo Turno</p>
                          <p className="text-sm font-black text-[#B45309]">{formatMinutos(t.minutosCalculados)}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-center">
                          <p className="text-[10px] font-bold text-emerald-700 uppercase">Ventas Turno</p>
                          <p className="text-sm font-black text-emerald-700">{fmtSol(t.totalVendidoTurno)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Horarios de Entrada y Salida */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 bg-zinc-50/80 p-3 rounded-xl border border-zinc-200/80">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500">🟢 HORA DE ENTRADA</p>
                        <p className="text-sm font-black text-emerald-700">{formatHora(t.entrada_at)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500">🔴 HORA DE SALIDA</p>
                        <p className={`text-sm font-black ${isActivo ? "text-amber-600" : "text-red-700"}`}>
                          {isActivo ? "En jornada activa" : formatHora(t.salida_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500">🛍️ PAQUETES VENDIDOS</p>
                        <p className="text-sm font-black text-black">{t.paquetesTurno} paquete(s)</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500">🧾 NOTAS GENERADAS</p>
                        <p className="text-sm font-black text-black">{t.notasTurno.length} nota(s)</p>
                      </div>
                    </div>

                    {/* Desglose de Acciones durante el turno */}
                    <div>
                      <p className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span>📋</span> Acciones registradas durante este turno:
                      </p>
                      {t.notasTurno.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {t.notasTurno.map((n: any) => (
                            <div
                              key={n.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-zinc-200 text-xs hover:border-zinc-300 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-black bg-zinc-100 px-1.5 py-0.5 rounded">
                                  {n.codigo || String(n.id).slice(0, 8)}
                                </span>
                                <span className="font-bold text-zinc-800">
                                  {n.cliente?.nombre ?? "Público general"}
                                </span>
                                {n.cliente?.telefono && (
                                  <span className="text-zinc-500 text-[10px]">· Tel: {n.cliente.telefono}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 font-bold">
                                <span className="text-zinc-500 text-[11px]">{formatHora(n.created_at)}</span>
                                <span className="text-[#B45309] font-black">{fmtSol(Number(n.total) || 0)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 font-semibold italic bg-white p-2.5 rounded-lg border border-dashed border-zinc-200 text-center">
                          No se registraron ventas durante este rango horario.
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {!loading && turnosConAcciones.length === 0 && (
            <Card>
              <Empty
                icon="⏱️"
                title="Sin registros de asistencia"
                hint="Cada vez que un vendedor inicie sesión en la app y cierre su jornada, sus horas y acciones quedarán registradas aquí."
              />
            </Card>
          )}
        </div>
      )}

      {/* TAB VENTAS POR VENDEDOR */}
      {tab === "ventas" && (
        <div className="grid md:grid-cols-2 gap-3">
          {porVendedor.map((v) => (
            <Card key={v.id}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-black ${v.activo ? "bg-gradient-to-br from-[#B45309] to-[#E8A838]" : "bg-zinc-400"}`}>
                    {v.nombre.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-black text-[15px] truncate">{v.nombre}</p>
                    <div className="flex items-center gap-2">
                      {v.usuario && <p className="text-[11px] text-black/55 font-semibold">@{v.usuario}</p>}
                      <Badge tone={v.rol === "admin" ? "violet" : "teal"}>{v.rol}</Badge>
                      {!v.activo && <Badge tone="red">inactivo</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-black tabular-nums">{fmtSol(v.total)}</p>
                    <p className="text-[11px] text-black/55 font-semibold">{v.notas.length} notas · {v.paquetes} paquetes</p>
                  </div>
                </div>
                {v.notas.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {v.notas.slice().reverse().slice(0, 15).map((n) => (
                      <div key={n.id} className="flex justify-between text-[13px] border-t border-zinc-100 py-1.5">
                        <span className="font-bold text-black">{n.codigo ?? String(n.id ?? "").slice(0, 8)} <span className="font-semibold text-black/50">· {n.cliente?.nombre ?? "—"}</span></span>
                        <span className="font-bold text-black tabular-nums">{fmtSol(Number(n.total) || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {v.notas.length === 0 && (
                  <p className="text-[12px] text-black/40 font-semibold text-center py-2">Sin ventas registradas aún</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
