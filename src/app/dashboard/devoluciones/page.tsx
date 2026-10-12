"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/custom-ui";

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hours}:${mins}`;
  } catch {
    return String(iso);
  }
}

export default function DevolucionesPage() {
  const [list, setList] = useState<any[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal para nueva devolución
  const [showModal, setShowModal] = useState(false);
  const [selectedNotaCodigo, setSelectedNotaCodigo] = useState("");
  const [motivoGeneral, setMotivoGeneral] = useState("Cambio de presentación / sabor");
  const [itemsDevolver, setItemsDevolver] = useState<{ [variante_id: string]: { cant: number; motivo: string; max: number; precio: number; nombre: string } }>({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErr("");
    try {
      const [dRes, nRes, vRes, pRes] = await Promise.allSettled([
        api.devoluciones(),
        api.notas(),
        api.variantes(),
        api.productos(),
      ]);

      if (dRes.status === "fulfilled" && Array.isArray(dRes.value)) setList(dRes.value);
      else if (dRes.status === "rejected") setErr(`Error devoluciones: ${(dRes as any).reason?.message}`);

      if (nRes.status === "fulfilled" && Array.isArray(nRes.value)) setNotas(nRes.value);
      if (vRes.status === "fulfilled" && Array.isArray(vRes.value)) setVariantes(vRes.value);
      if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) setProductos(pRes.value);
    } catch (e: any) {
      setErr(e.message || "Error al cargar devoluciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getVariantName = (vid: string) => {
    const v = variantes.find((vx) => vx.id === vid || vx.sku === vid);
    if (!v) return `Galleta #${String(vid).slice(0, 8)}`;
    const p = productos.find((px) => px.id === v.producto_id);
    return `${p?.nombre ?? v.producto_nombre ?? "Galleta"} (${v.talla}/${v.color}) — ${v.sku}`;
  };

  // Cuando se selecciona una nota en el modal, cargar sus galletas
  const handleSelectNota = (notaCod: string) => {
    setSelectedNotaCodigo(notaCod);
    const nota = notas.find((n) => (n.codigo ?? n.codigo_barras ?? n.id) === notaCod);
    if (!nota) return;

    const items = nota.detalles ?? nota.items ?? [];
    const initItems: any = {};
    for (const it of items) {
      const vid = it.variante_id ?? it.id;
      const cantMax = Number(it.cantidad) || 1;
      const precio = Number(it.precio_unitario ?? it.subtotal ?? it.precio ?? 0);
      initItems[vid] = {
        cant: 1, // Por defecto devolver 1
        motivo: "Presentación no adecuada",
        max: cantMax,
        precio,
        nombre: getVariantName(vid),
      };
    }
    setItemsDevolver(initItems);
  };

  const handleCreateDevolucion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNotaCodigo) {
      alert("Selecciona la nota de venta de origen.");
      return;
    }

    const payloadItems = Object.entries(itemsDevolver)
      .filter(([_, data]) => data.cant > 0)
      .map(([vid, data]) => ({
        variante_id: vid,
        cantidad: data.cant,
        motivo: data.motivo || motivoGeneral,
      }));

    if (payloadItems.length === 0) {
      alert("Selecciona al menos un paquete para devolver.");
      return;
    }

    setSaving(true);
    try {
      await api.crearDevolucion({
        nota_codigo: selectedNotaCodigo,
        items: payloadItems,
        motivo_general: motivoGeneral,
      });

      setShowModal(false);
      setSelectedNotaCodigo("");
      setItemsDevolver({});
      await loadData();
      alert("✅ ¡Devolución registrada exitosamente! El stock fue repuesto en el inventario.");
    } catch (e: any) {
      alert(`Error al registrar devolución: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredList = useMemo(() => {
    const arr = Array.isArray(list) ? list : [];
    if (!q) return arr.slice().reverse();
    const query = q.toLowerCase();
    return arr
      .filter((d) => {
        const text = `${d.codigo || ""} ${d.nota_codigo || ""} ${d.motivo || ""} ${d.cliente?.nombre || ""}`.toLowerCase();
        return text.includes(query);
      })
      .reverse();
  }, [list, q]);

  const totalDevuelto = useMemo(
    () => filteredList.reduce((s, d) => s + (Number(d.total_devuelto ?? d.totalDevuelto) || 0), 0),
    [filteredList]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHead
          title="Gestión de Devoluciones"
          sub={`${filteredList.length} devoluciones registradas · ${fmtSol(totalDevuelto)} reembolsado`}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            className="font-bold border-zinc-300"
          >
            🔄 Actualizar
          </Button>
          <Button
            onClick={() => {
              if (notas.length > 0) handleSelectNota(notas[notas.length - 1].codigo ?? notas[notas.length - 1].id);
              setShowModal(true);
            }}
            className="font-bold bg-primary text-white shadow-sm hover:bg-primary/90"
          >
            ↩ Registrar Nueva Devolución
          </Button>
        </div>
      </div>

      {err && <div className="p-4 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl">{err}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Total Devuelto
            </CardDescription>
            <CardTitle className="text-2xl font-black text-rose-600">{fmtSol(totalDevuelto)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{filteredList.length} notas de crédito/devolución</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Paquetes Reintegrados a Stock
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600">
              {filteredList.reduce((s, d) => s + (Array.isArray(d.items) ? d.items.reduce((acc: number, it: any) => acc + (Number(it.cantidad) || 1), 0) : 1), 0)} uds.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Repuestas automáticamente en Kardex</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Motivo Más Frecuente
            </CardDescription>
            <CardTitle className="text-base font-bold text-zinc-900 line-clamp-1">
              Cambio de presentación / sabor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Atención y fidelización de clientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar por código de devolución (DV-...), boleta origen (NV-...), cliente o motivo…"
            className="bg-white border-zinc-300 font-medium"
          />
        </div>
      </div>

      {/* Tabla de Devoluciones */}
      <Card className="shadow-sm border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-black/50">
                <th className="px-5 py-3.5">Código Devolución</th>
                <th className="px-3 py-3.5">Nota Origen</th>
                <th className="px-3 py-3.5">Fecha</th>
                <th className="px-3 py-3.5">Cliente</th>
                <th className="px-3 py-3.5">Motivo</th>
                <th className="px-3 py-3.5 text-right">Monto Reembolsado</th>
                <th className="px-5 py-3.5 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredList.map((d, i) => {
                const code = String(d.codigo ?? `DV-${i}`);
                const isExpanded = expandedId === code;
                const items = Array.isArray(d.items) ? d.items : [];

                return (
                  <>
                    <tr key={code} className={`hover:bg-zinc-50/70 transition-colors ${isExpanded ? "bg-zinc-50/50" : ""}`}>
                      <td className="px-5 py-3 font-mono text-[12px] font-black text-rose-700">{code}</td>
                      <td className="px-3 py-3 font-mono text-[12px] font-bold text-zinc-900">
                        {d.nota_codigo ?? d.notaCodigo ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-zinc-800 text-[13px] tabular-nums" suppressHydrationWarning>
                        {formatDate(d.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-bold text-zinc-900 text-[13px]">{d.cliente?.nombre ?? "Público General"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 font-bold border-amber-200 text-xs">
                          {d.motivo ?? "Cambio / Devolución"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right font-black text-rose-600 tabular-nums text-base">
                        {fmtSol(Number(d.total_devuelto ?? d.totalDevuelto) || 0)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : code)}
                          className="text-xs font-bold h-7 px-2.5"
                        >
                          {isExpanded ? "▲ Ocultar" : "▼ Ver Galletas"}
                        </Button>
                      </td>
                    </tr>

                    {/* Fila expandida con el desglose de galletas devueltas */}
                    {isExpanded && (
                      <tr key={`${code}-expanded`} className="bg-zinc-50/90 border-b border-zinc-200">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="max-w-2xl bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-2.5">
                            <p className="text-xs font-black uppercase tracking-wider text-rose-700">
                              Galletas Devueltas y Reingresadas a Almacén:
                            </p>
                            <div className="divide-y divide-zinc-100">
                              {items.map((it: any, idx: number) => {
                                const vid = it.variante_id ?? it.id;
                                const cant = Number(it.cantidad) || 1;
                                const v = variantes.find((vx) => vx.id === vid || vx.sku === vid);
                                const currentPrice = Number(v?.precio_venta) || 0;
                                const refundedPrice = Number(it.precio_unitario) || 0;
                                const refundedTotal = refundedPrice * cant;
                                const originalTotal = currentPrice * cant;
                                const hasDiscount = currentPrice > 0 && refundedPrice > 0 && currentPrice > refundedPrice;

                                return (
                                  <div key={idx} className="flex justify-between items-center py-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-rose-600 text-white font-bold">{cant}x</Badge>
                                      <div>
                                        <span className="font-bold text-zinc-900">{getVariantName(vid)}</span>
                                        {it.motivo && (
                                          <span className="block text-[11px] text-zinc-500">Motivo: {it.motivo}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-bold text-zinc-700 block">
                                        {refundedTotal > 0 ? fmtSol(refundedTotal) : "Stock Repuesto"}
                                      </span>
                                      {hasDiscount && (
                                        <span className="text-[10px] text-zinc-500 block">
                                          Original: <span className="line-through">{fmtSol(originalTotal)}</span> 
                                          <span className="text-rose-500 font-medium ml-1">
                                            (-{Math.round(((currentPrice - refundedPrice) / currentPrice) * 100)}%)
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {filteredList.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <p className="text-3xl mb-2">↩</p>
                    <p className="font-bold text-base">No hay devoluciones registradas</p>
                    <p className="text-xs mt-1">Puedes registrar una devolución seleccionando una nota de venta.</p>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 font-semibold text-black/60">
                    Cargando devoluciones del sistema…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL: REGISTRAR DEVOLUCIÓN */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-zinc-200 my-8">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-200">
              <div>
                <h2 className="text-lg font-black text-zinc-900">Registrar Devolución de Galleta</h2>
                <p className="text-xs text-muted-foreground">Repone stock en almacén y registra el reembolso.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 font-bold flex items-center justify-center text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDevolucion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black uppercase mb-1.5">
                  Seleccionar Nota de Venta de Origen *
                </label>
                <select
                  required
                  value={selectedNotaCodigo}
                  onChange={(e) => handleSelectNota(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Selecciona una nota de venta --</option>
                  {notas.slice().reverse().map((n) => {
                    const code = n.codigo ?? n.codigo_barras ?? n.id;
                    const cliente = n.cliente?.nombre ?? "Público General";
                    return (
                      <option key={code} value={code}>
                        {code} · {cliente} · Total: {fmtSol(Number(n.total) || 0)}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-black uppercase mb-1.5">
                  Motivo General de Devolución
                </label>
                <Input
                  value={motivoGeneral}
                  onChange={(e) => setMotivoGeneral(e.target.value)}
                  placeholder="Ej. Cambio de presentación, paquete con falla, desistimiento..."
                  className="text-xs font-medium"
                />
              </div>

              {/* Paquetes a devolver */}
              {selectedNotaCodigo && Object.keys(itemsDevolver).length > 0 && (
                <div className="pt-3 border-t border-zinc-200 space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-700">
                    Selecciona las galletas y cantidades a devolver:
                  </p>

                  <div className="space-y-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200 max-h-[220px] overflow-y-auto">
                    {Object.entries(itemsDevolver).map(([vid, it]) => (
                      <div key={vid} className="bg-white p-3 rounded-lg border border-zinc-200 text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-zinc-900">{it.nombre}</span>
                          <span className="font-black text-rose-600">{fmtSol(it.precio)} c/u</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-500 mb-0.5">
                              Cantidad a devolver (Max: {it.max})
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max={it.max}
                              value={it.cant}
                              onChange={(e) => {
                                const val = Math.min(it.max, Math.max(0, Number(e.target.value)));
                                setItemsDevolver((prev) => ({
                                  ...prev,
                                  [vid]: { ...prev[vid], cant: val },
                                }));
                              }}
                              className="h-8 text-xs font-bold text-center"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-500 mb-0.5">Motivo específico</label>
                            <Input
                              value={it.motivo}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItemsDevolver((prev) => ({
                                  ...prev,
                                  [vid]: { ...prev[vid], motivo: val },
                                }));
                              }}
                              placeholder="Ej. Presentación chica"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !selectedNotaCodigo} className="font-bold bg-rose-600 hover:bg-rose-700 text-white">
                  {saving ? "Procesando devolución…" : "Procesar Devolución"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
