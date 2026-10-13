"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api, fmtSol } from "@/lib/api";
import { exportToExcel } from "@/lib/excel";
import { exportToPdf } from "@/lib/pdf";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/custom-ui";

interface PurchaseItemRow {
  id: string;
  variante_id?: string;
  isNew: boolean;
  nombre: string;
  categoria: string;
  talla: string;
  color: string;
  cantidad: number;
  precio_costo: number;
  precio_venta: number;
  sku?: string;
}

export default function ComprasPage() {
  const [compras, setCompras] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filtroFecha, setFiltroFecha] = useState<"todas" | "hoy" | "mes">("todas");

  // Multi-item purchase modal state
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [nroDoc, setNroDoc] = useState("");
  const [motivo, setMotivo] = useState("Compra de mercadería a proveedor");

  // Items list in the active purchase invoice
  const [items, setItems] = useState<PurchaseItemRow[]>([]);

  // AI OCR state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    setErr("");
    try {
      const [txRes, varRes, prodRes] = await Promise.allSettled([
        api.transacciones("entrada"),
        api.variantes(),
        api.productos(),
      ]);

      if (txRes.status === "fulfilled" && Array.isArray(txRes.value)) setCompras(txRes.value);
      if (varRes.status === "fulfilled" && Array.isArray(varRes.value)) setVariantes(varRes.value);
      if (prodRes.status === "fulfilled" && Array.isArray(prodRes.value)) setProductos(prodRes.value);
    } catch (e: any) {
      setErr(e.message || "Error al cargar compras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getVariantLabel = (vid: string) => {
    const v = variantes.find((vx) => vx.id === vid);
    if (!v) return vid;
    const p = productos.find((px) => px.id === v.producto_id);
    const prodName = p?.nombre ?? v.producto_nombre ?? "Galleta";
    return `${prodName} · ${v.sku} (${v.talla} / ${v.color})`;
  };

  const openNewPurchaseModal = () => {
    setProveedor("");
    setNroDoc("");
    setMotivo("Compra mayorista / Reposición");
    setItems([
      {
        id: "item-1",
        isNew: false,
        nombre: "",
        categoria: "clasicas",
        talla: "PAQ12",
        color: "CHOCOCHIPS",
        cantidad: 10,
        precio_costo: 15,
        precio_venta: 21.75,
      },
    ]);
    setShowModal(true);
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        isNew: false,
        nombre: "",
        categoria: "clasicas",
        talla: "PAQ12",
        color: "CHOCOCHIPS",
        cantidad: 6,
        precio_costo: 15,
        precio_venta: 21.75,
      },
    ]);
  };

  const updateItemRow = (id: string, patch: Partial<PurchaseItemRow>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) {
      alert("La compra debe contener al menos 1 paquete.");
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // AI OCR File Scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiLoading(true);
    try {
      const res = await api.scanReceipt(file);
      if (res.proveedor) setProveedor(res.proveedor);
      if (res.fecha_boleta) setNroDoc((prev) => prev || `BOL-${res.fecha_boleta}`);

      if (Array.isArray(res.items) && res.items.length > 0) {
        const parsedRows: PurchaseItemRow[] = res.items.map((it: any, idx: number) => {
          const pc = Number(it.precio_costo) || 25;
          return {
            id: `ai-item-${idx}-${Date.now()}`,
            isNew: true,
            nombre: it.nombre_general || "Galleta Importada",
            categoria: "clasicas",
            talla: it.talla || "PAQ12",
            color: it.color || "CHOCOCHIPS",
            cantidad: Number(it.cantidad) || 1,
            precio_costo: pc,
            precio_venta: Number((pc * 1.4).toFixed(2)),
            sku: it.sku_sugerido || undefined,
          };
        });
        setItems(parsedRows);
        setShowAiModal(false);
        setShowModal(true);
      } else {
        alert("La IA procesó el archivo pero no encontró líneas de items estructuradas.");
      }
    } catch (err: any) {
      alert(`Error en el análisis OCR: ${err.message}`);
    } finally {
      setAiLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // AI Text Parser
  const handleParseAiText = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const chatRes = await api.parseReceiptText(aiText);
      const rawAns = chatRes?.respuesta || "";
      const jsonMatch = rawAns.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.proveedor) setProveedor(parsed.proveedor);
        if (parsed.nro_doc) setNroDoc(parsed.nro_doc);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const parsedRows: PurchaseItemRow[] = parsed.items.map((it: any, idx: number) => {
            const pc = Number(it.precio_costo) || 25;
            return {
              id: `ai-text-${idx}-${Date.now()}`,
              isNew: true,
            nombre: it.nombre || "Galleta",
            categoria: it.categoria || "clasicas",
            talla: it.talla || "PAQ12",
            color: it.color || "CHOCOCHIPS",
              cantidad: Number(it.cantidad) || 1,
              precio_costo: pc,
              precio_venta: Number(it.precio_venta_sugerido) || Number((pc * 1.4).toFixed(2)),
            };
          });
          setItems(parsedRows);
          setShowAiModal(false);
          setShowModal(true);
          setAiText("");
          return;
        }
      }
      alert("No se pudo extraer el formato de boleta automáticamente. Revisa el texto.");
    } catch (e: any) {
      alert(`Error al procesar texto con IA: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Save the entire multi-item purchase
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.variante_id && !it.nombre.trim()) {
        alert(`La fila #${i + 1} no tiene galleta seleccionada ni nombre asignado.`);
        return;
      }
      if (it.cantidad <= 0) {
        alert(`La fila #${i + 1} debe tener una cantidad mayor a 0.`);
        return;
      }
    }

    setSaving(true);
    try {
      const ref = [proveedor ? `Prov: ${proveedor}` : "", nroDoc ? `Doc: ${nroDoc}` : ""]
        .filter(Boolean)
        .join(" | ") || "Compra Mayorista";

      for (const it of items) {
        let targetVarId = it.variante_id;
        let currentStock = 0;

        // If it's a new product/variant, create it first in Kardex
        if (!targetVarId || it.isNew) {
          // Check if product exists with this name
          let prodObj = productos.find((p) => p.nombre?.toLowerCase() === it.nombre.trim().toLowerCase());
          if (!prodObj) {
            prodObj = await api.crearProducto({
              nombre: it.nombre.trim(),
              categoria: it.categoria || "clasicas",
              activo: true,
            });
          }

          const genSku =
            it.sku ||
            `${(it.categoria || "PRD").slice(0, 3).toUpperCase()}-${it.talla}-${it.color
              .slice(0, 3)
              .toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

          const newVar = await api.crearVariante({
            producto_id: prodObj.id,
            sku: genSku,
            talla: it.talla,
            color: it.color,
            stock_actual: 0,
            stock_minimo: 5,
            precio_costo: it.precio_costo,
            precio_venta: it.precio_venta,
          });

          targetVarId = newVar.id;
          currentStock = 0;
        } else {
          const existingVar = variantes.find((v) => v.id === targetVarId);
          currentStock = Number(existingVar?.stock_actual) || 0;
        }

        if (!targetVarId) continue;

        // Register Kardex stock entry transaction
        await api.crearTransaccion({
          variante_id: targetVarId,
          tipo: "entrada",
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_costo),
          stock_anterior: currentStock,
          stock_nuevo: currentStock + Number(it.cantidad),
          motivo: motivo || "Compra / Reposición",
          referencia: ref,
        });
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Error al guardar compra: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const list = useMemo(() => {
    const now = new Date();
    return compras
      .filter((c) => {
        if (!c.created_at) return true;
        const d = new Date(c.created_at);
        if (filtroFecha === "hoy") {
          if (
            d.getDate() !== now.getDate() ||
            d.getMonth() !== now.getMonth() ||
            d.getFullYear() !== now.getFullYear()
          )
            return false;
        } else if (filtroFecha === "mes") {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }

        if (!q) return true;
        const searchStr = `${c.referencia || ""} ${c.motivo || ""} ${c.variante_id || ""} ${getVariantLabel(
          c.variante_id
        )}`.toLowerCase();
        return searchStr.includes(q.toLowerCase());
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [compras, q, filtroFecha, variantes, productos]);

  const totalInvertido = useMemo(
    () => list.reduce((acc, c) => acc + (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0), 0),
    [list]
  );
  const totalPaquetes = useMemo(() => list.reduce((acc, c) => acc + (Number(c.cantidad) || 0), 0), [list]);

  const handleExportExcel = () => {
    const headers = [
      "ID Movimiento",
      "Fecha y Hora",
      "Galleta / SKU",
      "Cantidad (Uds)",
      "Costo Unitario (S/)",
      "Total Invertido (S/)",
      "Stock Anterior",
      "Stock Resultante",
      "Proveedor / Factura",
      "Motivo",
    ];

    const rows = list.map((c) => {
      const fecha = c.created_at ? new Date(c.created_at).toLocaleString("es-PE") : "—";
      const itemLabel = getVariantLabel(c.variante_id);
      const cant = Number(c.cantidad) || 0;
      const pu = Number(c.precio_unitario) || 0;
      const total = cant * pu;

      return [
        c.id,
        fecha,
        itemLabel,
        cant,
        pu.toFixed(2),
        total.toFixed(2),
        c.stock_anterior ?? "—",
        c.stock_nuevo ?? "—",
        c.referencia ?? "—",
        c.motivo ?? "—",
      ];
    });

    exportToExcel(`Compras_Kardex_${new Date().toISOString().slice(0, 10)}`, "Compras", headers, rows);
  };

  const handleExportPdf = () => {
    const headers = ["Fecha", "Galleta / Modelo", "Cantidad", "Costo Unit.", "Total (S/)", "Stock Ant. -> Nvo.", "Proveedor / Factura"];
    const rows = list.map((c) => {
      const fecha = c.created_at
        ? new Date(c.created_at).toLocaleString("es-PE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      const cant = Number(c.cantidad) || 0;
      const pu = Number(c.precio_unitario) || 0;
      return [
        fecha,
        getVariantLabel(c.variante_id),
        `${cant} uds`,
        fmtSol(pu),
        fmtSol(cant * pu),
        `${c.stock_anterior ?? 0} -> ${c.stock_nuevo ?? 0}`,
        c.referencia || c.motivo || "—",
      ];
    });

    exportToPdf({
      title: "Historial de Compras y Abastecimiento",
      subtitle: `${list.length} movimientos de compra registrados`,
      filename: `Compras_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      summaryBoxes: [
        { label: "Total Invertido", value: fmtSol(totalInvertido) },
        { label: "Paquetes Ingresados", value: `${totalPaquetes} uds.` },
        { label: "Movimientos", value: `${list.length} registros` },
      ],
      showSignatures: true,
    });
  };

  const modalTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.cantidad) || 0) * (Number(it.precio_costo) || 0), 0),
    [items]
  );
  const modalPaquetes = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0),
    [items]
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHead
          title="Compras y Abastecimiento"
          sub="Ingreso de mercadería por boleta/factura con múltiples galletas e IA OCR."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf} className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            📄 Descargar PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="font-bold border-zinc-300">
            📊 Descargar Excel (.xlsx)
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowAiModal(true)}
            className="font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
          >
            ✨ Escanear con IA
          </Button>
          <Button
            onClick={openNewPurchaseModal}
            className="bg-primary text-primary-foreground font-bold shadow hover:bg-primary/90"
          >
            ➕ Registrar Boleta de Compra
          </Button>
        </div>
      </div>

      {err && <div className="p-4 text-sm text-red-800 rounded-xl bg-red-50 border border-red-200">{err}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Total Invertido en Compras
            </CardDescription>
            <CardTitle className="text-2xl font-black text-black">{fmtSol(totalInvertido)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Gastos de mercadería en el período seleccionado</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Paquetes Ingresados
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-700">{totalPaquetes} uds.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Unidades añadidas al Kardex</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Entradas Registradas
            </CardDescription>
            <CardTitle className="text-2xl font-black text-black">{list.length} movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Líneas de abastecimiento guardadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar por galleta, proveedor, factura o referencia…"
            className="bg-white border-zinc-300 font-medium"
          />
        </div>
        <div className="flex gap-2">
          {(["todas", "hoy", "mes"] as const).map((f) => (
            <Button
              key={f}
              variant={filtroFecha === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroFecha(f)}
              className="font-bold capitalize"
            >
              {f === "todas" ? "Todas" : f === "hoy" ? "Hoy" : "Este Mes"}
            </Button>
          ))}
        </div>
      </div>

      {/* Purchases Table */}
      <Card className="shadow-sm border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-black/50">
                <th className="px-5 py-3.5">Fecha</th>
                <th className="px-3 py-3.5">Galleta / Modelo</th>
                <th className="px-3 py-3.5 text-center">Cantidad</th>
                <th className="px-3 py-3.5 text-right">Costo Unit.</th>
                <th className="px-3 py-3.5 text-right">Total</th>
                <th className="px-3 py-3.5">Stock Anterior ➔ Nuevo</th>
                <th className="px-5 py-3.5">Proveedor / Factura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((c, i) => {
                const pu = Number(c.precio_unitario) || 0;
                const qty = Number(c.cantidad) || 0;
                const tot = pu * qty;
                return (
                  <tr key={c.id || i} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="px-5 py-3 text-xs text-black/70 font-semibold tabular-nums">
                      {c.created_at
                        ? new Date(c.created_at).toLocaleString("es-PE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-black text-[13px]">{getVariantLabel(c.variante_id)}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-bold border-emerald-200">
                        +{qty} uds
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-black tabular-nums">{fmtSol(pu)}</td>
                    <td className="px-3 py-3 text-right font-black text-black tabular-nums">{fmtSol(tot)}</td>
                    <td className="px-3 py-3 text-xs text-black/70 font-mono">
                      {c.stock_anterior ?? "?"} ➔{" "}
                      <span className="font-bold text-emerald-700">{c.stock_nuevo ?? "?"}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-black/80 font-medium">
                      {c.referencia || c.motivo || "—"}
                    </td>
                  </tr>
                );
              })}

              {list.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <p className="text-3xl mb-2">🛒</p>
                    <p className="font-bold text-base">No hay compras registradas</p>
                    <p className="text-xs mt-1">Registra una boleta o escanéala con IA arriba.</p>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 font-semibold text-black/60">
                    Cargando compras desde el Kardex…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL: Multi-Item Purchase Order Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl border border-zinc-200 my-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-200">
              <div>
                <h2 className="text-xl font-black text-black">Registrar Boleta / Factura de Compra</h2>
                <p className="text-xs text-muted-foreground">
                  Ingresa todas las galletas de la boleta a la vez. El stock de cada una se sumará en el Kardex.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 font-bold flex items-center justify-center text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-4">
              {/* Supplier & Header Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-black/70 mb-1">
                    Proveedor *
                  </label>
                  <Input
                    required
                    placeholder="Ej. Molino Galletar SAC"
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    className="bg-white h-9 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-black/70 mb-1">
                    N° Factura / Boleta
                  </label>
                  <Input
                    placeholder="Ej. B002-00481"
                    value={nroDoc}
                    onChange={(e) => setNroDoc(e.target.value)}
                    className="bg-white h-9 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-black/70 mb-1">Motivo</label>
                  <Input
                    placeholder="Ej. Reposición semanal"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="bg-white h-9 text-xs"
                  />
                </div>
              </div>

              {/* Items List Header */}
              <div className="flex justify-between items-center pt-2">
                <p className="text-xs font-black uppercase tracking-wider text-black">
                  Galletas de la Boleta ({items.length} líneas · {modalPaquetes} paquetes)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItemRow}
                  className="font-bold text-xs h-8 border-primary text-primary hover:bg-primary/10"
                >
                  ➕ Agregar otra galleta
                </Button>
              </div>

              {/* Items Rows */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {items.map((row, idx) => (
                  <div
                    key={row.id}
                    className="p-3 bg-white rounded-xl border border-zinc-200 shadow-sm space-y-2 relative group"
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
                      <span className="text-xs font-black text-black">Paquete #{idx + 1}</span>
                      <div className="flex items-center gap-2">
                        {row.isNew ? (
                          <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700">
                            ✨ Nueva galleta (se creará al guardar)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-zinc-600">
                            Galleta existente
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItemRow(row.id)}
                          className="text-xs text-red-600 font-bold hover:bg-red-50 rounded px-1.5 py-0.5"
                          title="Eliminar fila"
                        >
                          ✕ Quitar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      {/* Search / Select / Name */}
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">
                          Nombre de Galleta o Modelo *
                        </label>
                        <div className="space-y-1">
                          <Input
                            placeholder="Escribe el nombre del producto…"
                            value={row.nombre}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Check if matches an existing product
                              const matched = productos.find((p) => p.nombre.toLowerCase() === val.toLowerCase());
                              if (matched) {
                                updateItemRow(row.id, {
                                  nombre: matched.nombre,
                                  categoria: matched.categoria || "clasicas",
                                  isNew: false,
                                });
                              } else {
                                updateItemRow(row.id, {
                                  nombre: val,
                                  isNew: true,
                                  variante_id: undefined,
                                });
                              }
                            }}
                            className="h-8 text-xs font-bold"
                          />

                          {/* Quick selection dropdown helper */}
                          <select
                            value={row.variante_id || ""}
                            onChange={(e) => {
                              const vid = e.target.value;
                              if (!vid) return;
                              const v = variantes.find((vx) => vx.id === vid);
                              if (v) {
                                const p = productos.find((px) => px.id === v.producto_id);
                                updateItemRow(row.id, {
                                  variante_id: v.id,
                                  isNew: false,
                                  nombre: p?.nombre ?? v.producto_nombre ?? "Galleta",
                                  categoria: p?.categoria ?? "clasicas",
                                  talla: v.talla,
                                  color: v.color,
                                  precio_costo: Number(v.precio_costo) || 25,
                                  precio_venta: Number(v.precio_venta) || 39,
                                });
                              }
                            }}
                            className="w-full h-6 text-[10px] font-semibold bg-zinc-50 border border-zinc-200 rounded px-1.5 text-zinc-700"
                          >
                            <option value="">-- O seleccionar galleta existente del catálogo --</option>
                            {variantes.map((v) => (
                              <option key={v.id} value={v.id}>
                                {getVariantLabel(v.id)} · Stock: {v.stock_actual}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Presentación */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">Presentación</label>
                        <Input
                          required
                          value={row.talla}
                          onChange={(e) => updateItemRow(row.id, { talla: e.target.value })}
                          className="h-8 text-xs font-bold text-center"
                        />
                      </div>

                      {/* Sabor */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">Sabor</label>
                        <Input
                          required
                          value={row.color}
                          onChange={(e) => updateItemRow(row.id, { color: e.target.value })}
                          className="h-8 text-xs font-bold"
                        />
                      </div>

                      {/* Cantidad */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">Cant.</label>
                        <Input
                          type="number"
                          min="1"
                          required
                          value={row.cantidad}
                          onChange={(e) => updateItemRow(row.id, { cantidad: Number(e.target.value) })}
                          className="h-8 text-xs font-black text-center"
                        />
                      </div>

                      {/* P. Costo */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">Costo</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={row.precio_costo}
                          onChange={(e) => updateItemRow(row.id, { precio_costo: Number(e.target.value) })}
                          className="h-8 text-xs font-bold text-right"
                        />
                      </div>

                      {/* P. Venta */}
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-extrabold uppercase text-black/60 mb-0.5">P. Venta</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={row.precio_venta}
                          onChange={(e) => updateItemRow(row.id, { precio_venta: Number(e.target.value) })}
                          className="h-8 text-xs font-bold text-right text-primary"
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="sm:col-span-1 text-right">
                        <p className="text-[10px] uppercase font-bold text-black/40">Subtotal</p>
                        <p className="text-xs font-black text-black tabular-nums">
                          {fmtSol(row.cantidad * row.precio_costo)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Summary Footer */}
              <div className="p-4 bg-zinc-900 text-white rounded-xl flex flex-col sm:flex-row justify-between items-center gap-2">
                <div>
                  <p className="text-xs font-medium text-white/70">Resumen de la Boleta de Compra:</p>
                  <p className="text-sm font-bold">
                    {items.length} modelos de galletas · {modalPaquetes} unidades en total
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/70 font-semibold uppercase">Inversión Total Boleta:</p>
                  <p className="text-2xl font-black text-emerald-400">{fmtSol(modalTotal)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-200">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="font-bold bg-primary text-primary-foreground">
                  {saving
                    ? "Guardando en Kardex…"
                    : `Guardar Boleta de ${items.length} ${items.length === 1 ? "Galleta" : "Galletas"}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AI / OCR Scanner */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <div>
                  <h2 className="text-lg font-black text-black">Escanear Boleta con IA Gemini</h2>
                  <p className="text-xs text-muted-foreground">Digitaliza automáticamente proveedores y galletas.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 font-bold flex items-center justify-center text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Option 1: File Upload */}
              <div className="border-2 border-dashed border-amber-300 bg-amber-50/50 rounded-xl p-5 text-center space-y-2">
                <p className="text-2xl">📸</p>
                <p className="text-sm font-black text-amber-950">Subir foto o PDF de la boleta de compra</p>
                <p className="text-xs text-amber-800">
                  La IA leerá los items, cantidades y costos unitarios automáticamente.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="boleta-file-input"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={aiLoading}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {aiLoading ? "Procesando con OCR e IA…" : "Seleccionar Foto o PDF"}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-black/40 uppercase font-bold">
                <div className="flex-1 border-t border-zinc-200" />
                <span>O pegar texto / mensaje</span>
                <div className="flex-1 border-t border-zinc-200" />
              </div>

              {/* Option 2: Text paste */}
              <div>
                <label className="block text-xs font-bold text-black uppercase mb-1">
                  Pegar detalle de la boleta o cotización
                </label>
                <textarea
                  rows={4}
                  placeholder="Ej: Boleta Molino Galletar 24/09: 12 chocochips PAQ12 a 15 soles, 8 avena BOLSA500G a 13 soles..."
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  className="w-full p-3 rounded-lg border border-zinc-300 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    type="button"
                    onClick={handleParseAiText}
                    disabled={aiLoading || !aiText.trim()}
                    className="font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {aiLoading ? "Analizando texto…" : "Analizar y Rellenar Boleta"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
