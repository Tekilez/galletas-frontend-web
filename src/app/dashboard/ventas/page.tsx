"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { exportToExcel } from "@/lib/excel";
import { exportToPdf } from "@/lib/pdf";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/custom-ui";

function countItems(items: any): number {
  if (Array.isArray(items)) return items.reduce((s, it) => s + (Number(it?.cantidad) || 1), 0);
  if (items && typeof items === "object") return Object.values(items).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  return 0;
}

export default function VentasPage() {
  const [notas, setNotas] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "hoy" | "semana" | "con_descuento">("todas");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setErr("");
    Promise.allSettled([api.notas(), api.variantes(), api.productos()])
      .then(([nRes, vRes, pRes]) => {
        if (nRes.status === "fulfilled" && Array.isArray(nRes.value)) setNotas(nRes.value);
        else if (nRes.status === "rejected") setErr((nRes as any).reason?.message ?? "Error cargando notas");

        if (vRes.status === "fulfilled" && Array.isArray(vRes.value)) setVariantes(vRes.value);
        if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) setProductos(pRes.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const getVariantDisplay = (item: any) => {
    const vid = item.variante_id ?? item.id;
    const v = variantes.find((vx) => vx.id === vid);
    if (v) {
      const p = productos.find((px) => px.id === v.producto_id);
      const name = p?.nombre ?? v.producto_nombre ?? "Galleta";
      return `${name} (${v.talla}/${v.color}) — SKU: ${v.sku}`;
    }
    if (item.sku) return `${item.sku} (${item.talla ?? "?"}/${item.color ?? "?"})`;
    return `ID: ${String(vid ?? "").slice(0, 13)}…`;
  };

  // Helper to compute discount information for a sale note
  const getNotaDiscountInfo = (n: any) => {
    const totalCobrado = Number(n.total) || 0;
    const detalle = Array.isArray(n.items) ? n.items : n.detalles ?? [];
    
    let subtotalLista = 0;
    let tieneDescuentoExplicito = false;

    const itemsCalculados = detalle.map((it: any) => {
      const qty = Number(it.cantidad) || 1;
      const vid = it.variante_id ?? it.id;
      const v = variantes.find((vx) => vx.id === vid);
      
      const precioUnitCobrado = Number(it.precio_unitario ?? it.subtotal ?? it.precio ?? (totalCobrado / (countItems(detalle) || 1)));
      const precioListaUnit = Number(v?.precio_venta ?? it.precio_lista ?? it.precio_regular ?? precioUnitCobrado);
      
      const subtotalListaItem = precioListaUnit * qty;
      const subtotalCobradoItem = precioUnitCobrado * qty;
      
      let descItemMonto = Math.max(0, subtotalListaItem - subtotalCobradoItem);
      let descItemPct = 0;

      if (it.descuento_pct || it.descuento_porcentaje) {
        descItemPct = Number(it.descuento_pct || it.descuento_porcentaje);
        descItemMonto = subtotalListaItem * (descItemPct / 100);
        tieneDescuentoExplicito = true;
      } else if (it.descuento || it.descuento_monto) {
        descItemMonto = Number(it.descuento || it.descuento_monto);
        descItemPct = subtotalListaItem > 0 ? (descItemMonto / subtotalListaItem) * 100 : 0;
        tieneDescuentoExplicito = true;
      } else if (descItemMonto > 0.05) {
        descItemPct = (descItemMonto / subtotalListaItem) * 100;
        tieneDescuentoExplicito = true;
      }

      subtotalLista += subtotalListaItem;

      return {
        ...it,
        qty,
        precioListaUnit,
        precioUnitCobrado,
        subtotalListaItem,
        subtotalCobradoItem,
        descItemMonto,
        descItemPct,
        tieneDescuento: descItemMonto > 0.05,
      };
    });

    let descuentoTotal = Math.max(0, subtotalLista - totalCobrado);
    
    // Check note-level explicit discount (including backend `descuentos` field)
    if (typeof n.descuentos === "number" && n.descuentos > 0) {
      descuentoTotal = Math.max(descuentoTotal, Number(n.descuentos));
      tieneDescuentoExplicito = true;
    } else if (n.descuento_monto || n.descuento) {
      descuentoTotal = Math.max(descuentoTotal, Number(n.descuento_monto || n.descuento));
      tieneDescuentoExplicito = true;
    } else if (n.descuento_pct || n.descuento_porcentaje || n.descuentoPct) {
      const pct = Number(n.descuento_pct || n.descuento_porcentaje || n.descuentoPct);
      if (pct > 0) {
        descuentoTotal = Math.max(descuentoTotal, (subtotalLista * pct) / 100);
        tieneDescuentoExplicito = true;
      }
    }

    const tieneDescuento = descuentoTotal > 0.05 || tieneDescuentoExplicito;
    const porcentajeDescuento = subtotalLista > 0 ? (descuentoTotal / subtotalLista) * 100 : 0;

    return {
      subtotalLista: subtotalLista > totalCobrado ? subtotalLista : totalCobrado + descuentoTotal,
      totalCobrado,
      descuentoTotal,
      porcentajeDescuento,
      tieneDescuento,
      itemsCalculados,
    };
  };

  const list = useMemo(() => {
    const now = new Date();
    return notas
      .filter((n) => {
        const disc = getNotaDiscountInfo(n);
        if (filtro === "con_descuento" && !disc.tieneDescuento) return false;

        if (!n.created_at) return true;
        const x = new Date(n.created_at);
        if (filtro === "hoy") {
          if (
            x.getFullYear() !== now.getFullYear() ||
            x.getMonth() !== now.getMonth() ||
            x.getDate() !== now.getDate()
          )
            return false;
        } else if (filtro === "semana") {
          const diffDays = Math.ceil(Math.abs(now.getTime() - x.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) return false;
        }
        if (!q) return true;
        const searchPool = `${n.codigo || ""} ${n.codigo_barras || ""} ${n.cliente?.nombre || ""} ${
          n.cliente?.dni || ""
        } ${n.vendedor_nombre || ""}`.toLowerCase();
        return searchPool.includes(q.toLowerCase());
      })
      .slice()
      .reverse();
  }, [notas, q, filtro, variantes]);

  const total = useMemo(() => list.reduce((s, n) => s + (Number(n.total) || 0), 0), [list]);
  const totalPaquetes = useMemo(() => list.reduce((s, n) => s + countItems(n.detalles ?? n.items), 0), [list]);
  const totalDescuentos = useMemo(() => list.reduce((s, n) => s + getNotaDiscountInfo(n).descuentoTotal, 0), [list, variantes]);
  const notasConDescuento = useMemo(() => list.filter((n) => getNotaDiscountInfo(n).tieneDescuento).length, [list, variantes]);

  const handleExportExcel = () => {
    const headers = [
      "Código de Venta",
      "Fecha",
      "Cliente",
      "DNI / Contacto",
      "Vendedora",
        "Total Paquetes",
      "Subtotal Lista (S/)",
      "Descuento (S/)",
      "Total Cobrado (S/)",
      "Detalle de Productos",
    ];

    const rows = list.map((n) => {
      const fecha = n.created_at ? new Date(n.created_at).toLocaleString("es-PE") : "—";
      const detalle = Array.isArray(n.items) ? n.items : n.detalles ?? [];
      const disc = getNotaDiscountInfo(n);
      const desc = detalle.map((it: any) => `${getVariantDisplay(it)} x${it.cantidad ?? 1}`).join(" | ");

      return [
        n.codigo ?? n.codigo_barras ?? n.id,
        fecha,
        n.cliente?.nombre ?? "Público General",
        [n.cliente?.dni, n.cliente?.telefono].filter(Boolean).join(" · ") || "—",
        n.vendedor_nombre ?? "—",
        countItems(detalle),
        disc.subtotalLista.toFixed(2),
        disc.descuentoTotal.toFixed(2),
        (Number(n.total) || 0).toFixed(2),
        desc || "—",
      ];
    });

    exportToExcel(`Ventas_Kardex_${new Date().toISOString().slice(0, 10)}`, "Ventas", headers, rows);
  };

  const handleExportPdf = () => {
    const headers = ["Código", "Fecha", "Cliente", "Vendedora", "Paquetes", "P. Lista", "Descuento", "Total Cobrado"];
    const rows = list.map((n) => {
      const fecha = n.created_at ? new Date(n.created_at).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
      const detalle = Array.isArray(n.items) ? n.items : n.detalles ?? [];
      const disc = getNotaDiscountInfo(n);
      return [
        n.codigo ?? n.codigo_barras ?? n.id,
        fecha,
        n.cliente?.nombre ?? "Público General",
        n.vendedor_nombre ?? "—",
        `${countItems(detalle)} uds`,
        fmtSol(disc.subtotalLista),
        disc.tieneDescuento ? `-${fmtSol(disc.descuentoTotal)}` : "—",
        fmtSol(Number(n.total) || 0),
      ];
    });

    exportToPdf({
      title: "Registro de Ventas y Descuentos",
      subtitle: `${list.length} notas emitidas · ${totalPaquetes} paquetes · ${notasConDescuento} con descuento`,
      filename: `Ventas_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      summaryBoxes: [
        { label: "Ventas Totales", value: fmtSol(total) },
        { label: "Descuentos Otorgados", value: fmtSol(totalDescuentos) },
        { label: "Paquetes Vendidos", value: `${totalPaquetes} uds.` },
        { label: "Notas Emitidas", value: `${list.length} notas` },
      ],
      showSignatures: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHead
          title="Registro de Ventas"
          sub={loading ? "Cargando ventas…" : `${list.length} notas de venta · ${totalPaquetes} paquetes · ${fmtSol(total)} recaudado`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf} className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            📄 Descargar PDF
          </Button>
          <Button onClick={handleExportExcel} className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow">
            📊 Descargar Excel (.xlsx)
          </Button>
        </div>
      </div>

      {err && <div className="p-4 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl">{err}</div>}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Total Recaudado
            </CardDescription>
            <CardTitle className="text-2xl font-black text-zinc-900">{fmtSol(total)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{list.length} operaciones realizadas</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-rose-200 bg-rose-50/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Total Descuentos Otorgados
            </CardDescription>
            <CardTitle className="text-2xl font-black text-rose-600">{fmtSol(totalDescuentos)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-bold text-rose-700/80">{notasConDescuento} ventas con rebaja / descuento</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Paquetes Vendidos
            </CardDescription>
            <CardTitle className="text-2xl font-black text-primary">{totalPaquetes} uds.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Volumen de salida de almacén</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Ticket Promedio
            </CardDescription>
            <CardTitle className="text-2xl font-black text-zinc-800">
              {list.length > 0 ? fmtSol(total / list.length) : "S/ 0.00"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Por comprobante emitido</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar por código de boleta, cliente, DNI, vendedora…"
            className="bg-white border-zinc-300 font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "todas", label: "Todas" },
              { id: "hoy", label: "Hoy" },
              { id: "semana", label: "Últimos 7 días" },
              { id: "con_descuento", label: "🏷️ Solo con Descuento" },
            ] as const
          ).map((f) => (
            <Button
              key={f.id}
              variant={filtro === f.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro(f.id)}
              className="font-bold text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Sales List Table */}
      <Card className="shadow-sm border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[840px]">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-black/50">
                <th className="px-5 py-3.5">Código</th>
                <th className="px-3 py-3.5">Fecha</th>
                <th className="px-3 py-3.5">Cliente</th>
                <th className="px-3 py-3.5">Vendedora</th>
                <th className="px-3 py-3.5 text-right">Paquetes</th>
                <th className="px-3 py-3.5 text-right">Precio Lista / Descuento</th>
                <th className="px-3 py-3.5 text-right">Total Cobrado</th>
                <th className="px-5 py-3.5 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((n, i) => {
                const code = String(n.codigo ?? n.codigo_barras ?? n.id ?? `nota-${i}`);
                const rowId = n.id ?? code;
                const isOpen = open === rowId;
                const detalle = Array.isArray(n.items) ? n.items : n.detalles ?? [];
                const disc = getNotaDiscountInfo(n);

                return (
                  <tr key={rowId} className="group">
                    <td colSpan={8} className="p-0">
                      <table className="w-full">
                        <tbody>
                          <tr className={`hover:bg-zinc-50/70 transition-colors ${isOpen ? "bg-zinc-50/50" : ""}`}>
                            <td className="px-5 py-3 font-mono text-[12px] font-bold text-black">{code}</td>
                            <td className="px-3 py-3 text-black text-[13px] tabular-nums">
                              {n.created_at
                                ? new Date(n.created_at).toLocaleString("es-PE", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-bold text-black text-[13px]">{n.cliente?.nombre ?? "Público General"}</p>
                              {(n.cliente?.dni || n.cliente?.telefono) && (
                                <p className="text-[11px] text-black/55">
                                  {[n.cliente?.dni, n.cliente?.telefono].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {n.vendedor_nombre ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 font-bold border-amber-200">
                                  {n.vendedor_nombre}
                                </Badge>
                              ) : (
                                <span className="text-[12px] text-black/40">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-black tabular-nums">
                              {countItems(detalle.length ? detalle : n.items)}
                            </td>

                            {/* Descuento Display */}
                            <td className="px-3 py-3 text-right tabular-nums">
                              {disc.tieneDescuento ? (
                                <div>
                                  <span className="text-xs text-zinc-400 line-through mr-1.5">
                                    {fmtSol(disc.subtotalLista)}
                                  </span>
                                  <Badge className="bg-rose-100 text-rose-700 border-rose-200 font-black text-[10px] px-1.5 py-0.5">
                                    -{fmtSol(disc.descuentoTotal)} ({disc.porcentajeDescuento.toFixed(0)}%)
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-500 font-medium">Sin descuento</span>
                              )}
                            </td>

                            {/* Total Cobrado */}
                            <td className="px-3 py-3 text-right font-black text-black tabular-nums text-base">
                              {fmtSol(disc.totalCobrado)}
                            </td>

                            <td className="px-5 py-3 text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOpen(isOpen ? null : rowId)}
                                className="text-xs font-bold h-7 px-2.5"
                              >
                                {isOpen ? "▲ Ocultar" : "▼ Ver Paquetes"}
                              </Button>
                            </td>
                          </tr>

                          {/* Expanded row with items and discount details */}
                          {isOpen && (
                            <tr className="bg-zinc-50/90 border-b border-zinc-200">
                              <td colSpan={8} className="px-6 py-4">
                                <div className="max-w-3xl bg-white p-4 rounded-xl border border-zinc-200 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                                    <p className="text-xs font-black uppercase tracking-wider text-primary">
                                      Desglose de Paquetes y Descuentos ({disc.itemsCalculados.length} ítems):
                                    </p>
                                    {disc.tieneDescuento && (
                                      <Badge className="bg-rose-500 text-white font-bold text-xs">
                                        🏷️ Venta con Descuento Aplicado
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="space-y-2">
                                    {disc.itemsCalculados.map((it: any, j: number) => (
                                      <div key={j} className="flex justify-between items-center text-xs py-1.5 border-b last:border-0">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary" className="font-bold">
                                            {it.qty}x
                                          </Badge>
                                          <div>
                                            <span className="font-bold text-zinc-900">{getVariantDisplay(it)}</span>
                                            {it.tieneDescuento && (
                                              <span className="block text-[11px] text-rose-600 font-semibold">
                                                Rebaja aplicada: -{fmtSol(it.descItemMonto)} ({it.descItemPct.toFixed(0)}% desc.)
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="text-right">
                                          {it.tieneDescuento ? (
                                            <div>
                                              <span className="text-[11px] text-zinc-400 line-through block">
                                                {fmtSol(it.subtotalListaItem)}
                                              </span>
                                              <span className="font-black text-black tabular-nums text-xs">
                                                {fmtSol(it.subtotalCobradoItem)}
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="font-bold text-black tabular-nums">{fmtSol(it.subtotalCobradoItem)}</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Resumen financiero de la nota y acciones */}
                                  <div className="pt-2 border-t border-zinc-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-zinc-50 p-3 rounded-lg text-xs">
                                    <div className="flex items-center gap-3">
                                      <span className="text-zinc-600">Vendido por: <strong>{n.vendedor_nombre ?? "Mostrador Central"}</strong></span>
                                      <a
                                        href={`/dashboard/devoluciones`}
                                        className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-md text-[11px] transition-colors"
                                      >
                                        ↩ Procesar Devolución
                                      </a>
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                      {disc.tieneDescuento && (
                                        <>
                                          <div>
                                            <span className="text-zinc-500 block text-[10px] uppercase font-bold">Precio Lista</span>
                                            <span className="font-semibold text-zinc-700">{fmtSol(disc.subtotalLista)}</span>
                                          </div>
                                          <div>
                                            <span className="text-rose-600 block text-[10px] uppercase font-bold">Descuento Total</span>
                                            <span className="font-black text-rose-600">-{fmtSol(disc.descuentoTotal)}</span>
                                          </div>
                                        </>
                                      )}
                                      <div>
                                        <span className="text-zinc-900 block text-[10px] uppercase font-bold">Total Cobrado</span>
                                        <span className="font-black text-zinc-900 text-sm">{fmtSol(disc.totalCobrado)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              })}

              {list.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <p className="text-3xl mb-2">🧾</p>
                    <p className="font-bold text-base">No hay notas de venta registradas</p>
                    <p className="text-xs mt-1">Las ventas sincronizadas desde el POS aparecerán aquí.</p>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 font-semibold text-black/60">
                    Cargando ventas del sistema…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
