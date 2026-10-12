"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { exportToExcel } from "@/lib/excel";
import { exportToPdf, exportBarcodeLabelsPdf } from "@/lib/pdf";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/custom-ui";

function stockTone(v: any): { dot: string; label: string; bg: string; text: string; status: "agotado" | "critico" | "bajo" | "ok"; rowBg: string } {
  const s = Number(v.stock_actual) || 0;
  const m = Number(v.stock_minimo ?? 5);
  if (s <= 0) return { dot: "bg-rose-500", label: `Agotado (0)`, bg: "bg-rose-50 border-rose-200", text: "text-rose-700", status: "agotado", rowBg: "bg-rose-50/50 hover:bg-rose-100/70" };
  if (s <= m) return { dot: "bg-red-500", label: `Crítico (${s}/${m})`, bg: "bg-red-50 border-red-200", text: "text-red-700", status: "critico", rowBg: "bg-red-50/50 hover:bg-red-100/70" };
  if (s <= m + 3) return { dot: "bg-amber-500", label: `Bajo (${s})`, bg: "bg-amber-50 border-amber-200", text: "text-amber-700", status: "bajo", rowBg: "bg-amber-50/50 hover:bg-amber-100/70" };
  return { dot: "bg-emerald-500", label: `Óptimo (${s})`, bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", status: "ok", rowBg: "bg-emerald-50/50 hover:bg-emerald-100/70" };
}

interface BulkRow {
  tempId: string;
  nombre: string;
  categoria: string;
  talla: string;
  color: string;
  stock: number;
  minStock: number;
  costo: number;
  venta: number;
  sku: string;
}

export default function InventarioPage() {
  const [vars, setVars] = useState<any[]>([]);
  const [prods, setProds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Filters & Search
  const [q, setQ] = useState("");
  const [catFiltro, setCatFiltro] = useState<string>("todas");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [orden, setOrden] = useState<"nombre" | "stock_desc" | "stock_asc" | "precio_desc">("stock_desc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<string>("");

  // Multi-product expandable rows state
  const [modalMode, setModalMode] = useState<"lote" | "individual">("lote");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    {
      tempId: "row-1",
      nombre: "",
      categoria: "clasicas",
      talla: "PAQ12",
      color: "CHOCOCHIPS",
      stock: 10,
      minStock: 5,
      costo: 25,
      venta: 35,
      sku: "",
    },
  ]);

  // Single Product Form State (fallback)
  const [prodNombre, setProdNombre] = useState("");
  const [prodCat, setProdCat] = useState("clasicas");
  const [prodDesc, setProdDesc] = useState("");
  const [prodMargen, setProdMargen] = useState(40);
  const [initSku, setInitSku] = useState("");
  const [initTalla, setInitTalla] = useState("PAQ12");
  const [initColor, setInitColor] = useState("CHOCOCHIPS");
  const [initStock, setInitStock] = useState(10);
  const [initMinStock, setInitMinStock] = useState(5);
  const [initCosto, setInitCosto] = useState(25);
  const [initVenta, setInitVenta] = useState(35);

  // New Variant Only Form State
  const [varProdId, setVarProdId] = useState("");
  const [varSku, setVarSku] = useState("");
  const [varTalla, setVarTalla] = useState("PAQ12");
  const [varColor, setVarColor] = useState("VAINILLA");
  const [varStock, setVarStock] = useState(10);
  const [varMinStock, setVarMinStock] = useState(5);
  const [varCosto, setVarCosto] = useState(25);
  const [varVenta, setVarVenta] = useState(35);

  const loadData = async () => {
    setLoading(true);
    setErr("");
    try {
      const [pRes, vRes] = await Promise.allSettled([api.productos(), api.variantes()]);
      if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) setProds(pRes.value);
      if (vRes.status === "fulfilled" && Array.isArray(vRes.value)) setVars(vRes.value);
    } catch (e: any) {
      setErr(e.message || "Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const nameOf = (pid: string) => {
    return prods.find((p) => p.id === pid)?.nombre ?? "Producto sin nombre";
  };

  const catOf = (pid: string) => {
    return prods.find((p) => p.id === pid)?.categoria ?? "General";
  };

  // Categories list
  const categorias = useMemo(() => {
    const set = new Set<string>();
    prods.forEach((p) => {
      if (p.categoria) set.add(p.categoria);
    });
    return ["todas", ...Array.from(set)];
  }, [prods]);

  // Key metrics
  const stockTotal = useMemo(() => vars.reduce((s, v) => s + (Number(v.stock_actual) || 0), 0), [vars]);
  const valorCostoTotal = useMemo(() => vars.reduce((s, v) => s + (Number(v.stock_actual) || 0) * (Number(v.precio_costo) || 0), 0), [vars]);
  const valorVentaTotal = useMemo(() => vars.reduce((s, v) => s + (Number(v.stock_actual) || 0) * (Number(v.precio_venta) || 0), 0), [vars]);
  const criticosCount = useMemo(() => vars.filter((v) => Number(v.stock_actual) <= Number(v.stock_minimo ?? 5)).length, [vars]);

  // Filtered list
  const filteredVars = useMemo(() => {
    return vars
      .filter((v) => {
        const pName = nameOf(v.producto_id);
        const pCat = catOf(v.producto_id);
        const st = stockTone(v);

        // Category filter
        if (catFiltro !== "todas" && pCat.toLowerCase() !== catFiltro.toLowerCase()) {
          return false;
        }

        // Status filter
        if (estadoFiltro !== "todos") {
          if (estadoFiltro === "criticos" && (st.status !== "critico" && st.status !== "agotado")) return false;
          if (estadoFiltro === "agotado" && st.status !== "agotado") return false;
          if (estadoFiltro === "bajo" && st.status !== "bajo") return false;
          if (estadoFiltro === "ok" && st.status !== "ok") return false;
        }

        // Text query
        if (!q) return true;
        const searchPool = `${v.sku} ${pName} ${pCat} ${v.talla} ${v.color}`.toLowerCase();
        return searchPool.includes(q.toLowerCase());
      })
      .sort((a, b) => {
        if (orden === "stock_desc") return (Number(b.stock_actual) || 0) - (Number(a.stock_actual) || 0);
        if (orden === "stock_asc") return (Number(a.stock_actual) || 0) - (Number(b.stock_actual) || 0);
        if (orden === "precio_desc") return (Number(b.precio_venta) || 0) - (Number(a.precio_venta) || 0);
        if (orden === "nombre") return nameOf(a.producto_id).localeCompare(nameOf(b.producto_id));
        return 0;
      });
  }, [vars, prods, q, catFiltro, estadoFiltro, orden]);

  // Bulk rows management functions
  const addBulkRow = () => {
    const last = bulkRows[bulkRows.length - 1];
    setBulkRows((prev) => [
      ...prev,
      {
        tempId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        nombre: last ? last.nombre : "",
        categoria: last ? last.categoria : "clasicas",
        talla: "PAQ12",
        color: last ? last.color : "CHOCOCHIPS",
        stock: last ? last.stock : 10,
        minStock: last ? last.minStock : 5,
        costo: last ? last.costo : 25,
        venta: last ? last.venta : 35,
        sku: "",
      },
    ]);
  };

  const duplicateBulkRow = (index: number) => {
    const target = bulkRows[index];
    if (!target) return;
    const newRow: BulkRow = {
      ...target,
      tempId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sku: "",
    };
    setBulkRows((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, newRow);
      return copy;
    });
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length <= 1) {
      alert("Debe haber al menos un producto en la lista.");
      return;
    }
    setBulkRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBulkRow = (index: number, field: keyof BulkRow, val: any) => {
    setBulkRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Submit Bulk Products
  const handleCreateBulkProducts = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = bulkRows.filter((r) => r.nombre.trim().length > 0);
    if (validRows.length === 0) {
      alert("Por favor ingresa el nombre de al menos un producto.");
      return;
    }

    setSaving(true);
    setSaveProgress(`Iniciando guardado de ${validRows.length} productos…`);

    try {
      let count = 0;
      for (const row of validRows) {
        count++;
        setSaveProgress(`Guardando ${count} de ${validRows.length}: ${row.nombre}…`);

        // Check if product with this exact name and category already exists in catalogue
        let prodId = prods.find((p) => p.nombre.toLowerCase().trim() === row.nombre.toLowerCase().trim())?.id;
        
        if (!prodId) {
          const prodRes = await api.crearProducto({
            nombre: row.nombre.trim(),
            categoria: row.categoria.trim() || "Galletas",
            margen_ganancia: row.costo > 0 ? Number((((row.venta - row.costo) / row.costo) * 100).toFixed(0)) : 40,
            activo: true,
          });
          prodId = prodRes?.id;
        }

        if (prodId) {
          const genSku = row.sku.trim() || `${(row.categoria || "PRD").slice(0, 3).toUpperCase()}-${row.talla.toUpperCase()}-${row.color.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
          await api.crearVariante({
            producto_id: prodId,
            sku: genSku,
            talla: row.talla.trim() || "PAQ12",
            color: row.color.trim() || "Único",
            stock_actual: Number(row.stock) || 0,
            stock_minimo: Number(row.minStock) || 5,
            precio_costo: Number(row.costo) || 0,
            precio_venta: Number(row.venta) || 0,
          });
        }
      }

      setShowProductModal(false);
      setBulkRows([
        {
          tempId: "row-1",
          nombre: "",
          categoria: "clasicas",
          talla: "PAQ12",
          color: "CHOCOCHIPS",
          stock: 10,
          minStock: 5,
          costo: 25,
          venta: 35,
          sku: "",
        },
      ]);
      await loadData();
      alert(`✅ ¡Se crearon con éxito ${validRows.length} galletas en el Kardex!`);
    } catch (err: any) {
      alert(`Error al guardar productos: ${err.message}`);
    } finally {
      setSaving(false);
      setSaveProgress("");
    }
  };

  // Create single product + first variant handler
  const handleCreateSingleProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodNombre.trim()) {
      alert("Ingresa el nombre del producto.");
      return;
    }
    setSaving(true);
    try {
      const prodRes = await api.crearProducto({
        nombre: prodNombre.trim(),
        categoria: prodCat.trim(),
        descripcion: prodDesc.trim() || undefined,
        margen_ganancia: Number(prodMargen) || 40,
        activo: true,
      });

      const prodId = prodRes?.id;
      if (prodId) {
        const genSku = initSku.trim() || `${prodCat.slice(0, 3).toUpperCase()}-${initTalla}-${initColor.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        await api.crearVariante({
          producto_id: prodId,
          sku: genSku,
          talla: initTalla.trim(),
          color: initColor.trim(),
          stock_actual: Number(initStock) || 0,
          stock_minimo: Number(initMinStock) || 5,
          precio_costo: Number(initCosto) || 0,
          precio_venta: Number(initVenta) || 0,
        });
      }

      setShowProductModal(false);
      setProdNombre("");
      setProdDesc("");
      setInitSku("");
      await loadData();
    } catch (err: any) {
      alert(`Error al crear producto: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Create single variant handler
  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = varProdId || selectedProductForVariant;
    if (!pid) {
      alert("Selecciona el producto padre.");
      return;
    }
    setSaving(true);
    try {
      const genSku = varSku.trim() || `VAR-${varTalla}-${varColor.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      await api.crearVariante({
        producto_id: pid,
        sku: genSku,
        talla: varTalla.trim(),
        color: varColor.trim(),
        stock_actual: Number(varStock) || 0,
        stock_minimo: Number(varMinStock) || 5,
        precio_costo: Number(varCosto) || 0,
        precio_venta: Number(varVenta) || 0,
      });

      setShowVariantModal(false);
      setVarSku("");
      await loadData();
    } catch (err: any) {
      alert(`Error al agregar variante: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    const headers = [
      "SKU",
      "Producto",
      "Categoría",
      "Presentación",
      "Color",
      "Stock Actual",
      "Stock Mínimo",
      "Estado Stock",
      "Precio Costo (S/)",
      "Precio Venta (S/)",
      "Margen (%)",
      "Valor Inventario Costo (S/)",
      "Valor Inventario Venta (S/)",
    ];

    const rows = filteredVars.map((v) => {
      const st = stockTone(v);
      const pc = Number(v.precio_costo) || 0;
      const pv = Number(v.precio_venta) || 0;
      const stock = Number(v.stock_actual) || 0;
      const mg = pc > 0 ? (((pv - pc) / pc) * 100).toFixed(1) : "0";

      return [
        v.sku,
        nameOf(v.producto_id),
        catOf(v.producto_id),
        v.talla,
        v.color,
        stock,
        v.stock_minimo ?? 5,
        st.label,
        pc.toFixed(2),
        pv.toFixed(2),
        `${mg}%`,
        (stock * pc).toFixed(2),
        (stock * pv).toFixed(2),
      ];
    });

    exportToExcel(`Inventario_Kardex_${new Date().toISOString().slice(0, 10)}`, "Inventario", headers, rows);
  };

  const handleExportPdf = () => {
    const headers = ["SKU", "Producto", "Presentación", "Sabor", "Stock", "Estado", "P. Costo", "P. Venta", "Margen"];
    const rows = filteredVars.map((v) => {
      const st = stockTone(v);
      const pc = Number(v.precio_costo) || 0;
      const pv = Number(v.precio_venta) || 0;
      const mg = pc > 0 ? (((pv - pc) / pc) * 100).toFixed(0) : "0";
      return [
        v.sku,
        nameOf(v.producto_id),
        v.talla,
        v.color,
        `${v.stock_actual} uds`,
        st.label,
        fmtSol(pc),
        fmtSol(pv),
        `${mg}%`,
      ];
    });

    exportToPdf({
      title: "Catálogo de Inventario y Kardex",
      subtitle: `${filteredVars.length} paquetes registrados en almacén`,
      filename: `Inventario_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      summaryBoxes: [
        { label: "Paquetes Totales", value: `${stockTotal} uds.` },
        { label: "Valor a Costo", value: fmtSol(valorCostoTotal) },
        { label: "Valor Esperado Venta", value: fmtSol(valorVentaTotal) },
        { label: "Variantes Críticas", value: `${criticosCount} en riesgo` },
      ],
    });
  };

  const handleExportBarcodeLabels = () => {
    const listToPrint = selectedRows.size > 0 
      ? filteredVars.filter(v => selectedRows.has(v.id)) 
      : filteredVars;

    const dataToExport = listToPrint.map((v) => ({
      sku: v.sku,
      nombre: `${nameOf(v.producto_id)} (${v.talla}/${v.color})`,
      precio: Number(v.precio_venta) || 0,
    }));
    exportBarcodeLabelsPdf(dataToExport);
  };

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHead
          title="Inventario y Kardex"
          sub={`${vars.length} variantes registradas · ${stockTotal} paquetes en almacén`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf} className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            📄 Descargar PDF
          </Button>
          <Button variant="outline" onClick={handleExportBarcodeLabels} className="font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            🏷️ Imprimir Etiquetas
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="font-bold border-zinc-300">
            📊 Descargar Excel (.xlsx)
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (prods.length > 0) setVarProdId(prods[0].id);
              setShowVariantModal(true);
            }}
            className="font-bold"
          >
            ➕ Nueva Variante
          </Button>
          <Button
            onClick={() => {
              setModalMode("lote");
              setShowProductModal(true);
            }}
            className="bg-primary text-primary-foreground font-bold shadow hover:bg-primary/90"
          >
            ✨ Registrar Galletas (Formulario Expandible)
          </Button>
        </div>
      </div>

      {err && <div className="p-4 text-sm text-red-800 rounded-xl bg-red-50 border border-red-200">{err}</div>}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Paquetes Totales
            </CardDescription>
            <CardTitle className="text-2xl font-black">{stockTotal} uds.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{prods.length} modelos en catálogo</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Valor a Precio Costo
            </CardDescription>
            <CardTitle className="text-2xl font-black text-zinc-800">{fmtSol(valorCostoTotal)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Inversión actual en almacén</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-black/50">
              Valor Esperado de Venta
            </CardDescription>
            <CardTitle className="text-2xl font-black text-primary">{fmtSol(valorVentaTotal)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-emerald-600 font-bold">
              +{fmtSol(valorVentaTotal - valorCostoTotal)} ganancia proyectada
            </p>
          </CardContent>
        </Card>

        <Card
          className={`shadow-sm border-zinc-200 cursor-pointer transition-all ${
            estadoFiltro === "criticos" ? "ring-2 ring-rose-500 bg-rose-50/50" : ""
          }`}
          onClick={() => setEstadoFiltro(estadoFiltro === "criticos" ? "todos" : "criticos")}
        >
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Stock Crítico / Agotado
            </CardDescription>
            <CardTitle className="text-2xl font-black text-rose-600">{criticosCount} variantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-rose-600/80 font-bold">
              {estadoFiltro === "criticos" ? "✓ Filtrando solo críticos" : "Toca para filtrar urgentes"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modern Filter Controls Bar */}
      <Card className="p-4 border-zinc-200 shadow-sm bg-white space-y-4">
        {/* Top Search & Display Controls */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Buscar por nombre de galleta, SKU, presentación, sabor o categoría…"
              className="bg-zinc-50 border-zinc-300 h-10 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as any)}
              className="h-10 px-3 rounded-md border border-zinc-300 bg-zinc-50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="stock_desc">Ordenar: Mayor Stock</option>
              <option value="stock_asc">Ordenar: Menor Stock</option>
              <option value="precio_desc">Ordenar: Mayor Precio</option>
              <option value="nombre">Ordenar: Nombre A-Z</option>
            </select>

            <div className="flex rounded-lg border border-zinc-300 p-0.5 bg-zinc-100">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${
                  viewMode === "table" ? "bg-white text-black shadow-sm" : "text-black/50 hover:text-black"
                }`}
              >
                Tabla
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${
                  viewMode === "grid" ? "bg-white text-black shadow-sm" : "text-black/50 hover:text-black"
                }`}
              >
                Tarjetas
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills & Status Filter */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center pt-2 border-t border-zinc-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold text-black/50 mr-1 uppercase">Categoría:</span>
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFiltro(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  catFiltro.toLowerCase() === cat.toLowerCase()
                    ? "bg-primary text-primary-foreground font-black"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200"
                }`}
              >
                {cat === "todas" ? "Todas" : cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold text-black/50 mr-1 uppercase">Estado:</span>
            {[
              { id: "todos", label: "Todos" },
              { id: "criticos", label: "Críticos (<= min)" },
              { id: "bajo", label: "Bajo Stock" },
              { id: "ok", label: "Óptimo" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setEstadoFiltro(st.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  estadoFiltro === st.id
                    ? "bg-zinc-900 text-white font-extrabold"
                    : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Content: Table View or Grid Cards View */}
      {viewMode === "table" ? (
        <Card className="shadow-sm border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-black/50">
                  <th className="px-3 py-3.5">
                    <input 
                      type="checkbox" 
                      className="rounded border-zinc-300 accent-primary w-4 h-4"
                      checked={filteredVars.length > 0 && selectedRows.size === filteredVars.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRows(new Set(filteredVars.map(v => v.id)));
                        } else {
                          setSelectedRows(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-3.5">SKU / Código</th>
                  <th className="px-3 py-3.5">Producto</th>
                  <th className="px-3 py-3.5">Categoría</th>
                  <th className="px-3 py-3.5">Presentación / Sabor</th>
                  <th className="px-3 py-3.5">Estado Stock</th>
                  <th className="px-3 py-3.5 text-right">P. Costo</th>
                  <th className="px-3 py-3.5 text-right">P. Venta</th>
                  <th className="px-3 py-3.5 text-right">Margen</th>
                  <th className="px-5 py-3.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredVars.map((v) => {
                  const st = stockTone(v);
                  const pc = Number(v.precio_costo) || 0;
                  const pv = Number(v.precio_venta) || 0;
                  const mg = pc > 0 ? ((pv - pc) / pc) * 100 : 0;
                  const prodName = nameOf(v.producto_id);

                  return (
                    <tr key={v.id} className={`${st.rowBg} transition-colors border-b border-white`}>
                      <td className="px-3 py-3">
                        <input 
                          type="checkbox" 
                          className="rounded border-zinc-300 accent-primary w-4 h-4 cursor-pointer"
                          checked={selectedRows.has(v.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRows);
                            if (e.target.checked) newSet.add(v.id);
                            else newSet.delete(v.id);
                            setSelectedRows(newSet);
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] font-bold text-black">{v.sku}</td>
                      <td className="px-3 py-3">
                        <p className="font-bold text-black text-[13px]">{prodName}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="bg-zinc-50 text-zinc-700 font-bold border-zinc-200">
                          {catOf(v.producto_id)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-zinc-800">
                        <span className="font-bold text-black">{v.talla}</span> / {v.color}
                      </td>
                      <td className="px-3 py-3">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${st.bg} ${st.text}`}>
                          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-700 tabular-nums">{fmtSol(pc)}</td>
                      <td className="px-3 py-3 text-right font-black text-black tabular-nums">{fmtSol(pv)}</td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {mg.toFixed(0)}%
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedProductForVariant(v.producto_id);
                            setVarProdId(v.producto_id);
                            setVarCosto(pc);
                            setVarVenta(pv);
                            setShowVariantModal(true);
                          }}
                          className="text-xs font-bold h-7 px-2"
                        >
                          + Variante
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {filteredVars.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      <p className="text-3xl mb-2">📦</p>
                      <p className="font-bold text-base">No se encontraron galletas con esos filtros</p>
                      <p className="text-xs mt-1">Prueba limpiando la búsqueda o cambiando de categoría.</p>
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-8 font-semibold text-black/60">
                      Cargando inventario desde el Kardex…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Grid Mode Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredVars.map((v) => {
            const st = stockTone(v);
            const pc = Number(v.precio_costo) || 0;
            const pv = Number(v.precio_venta) || 0;
            const mg = pc > 0 ? ((pv - pc) / pc) * 100 : 0;
            const prodName = nameOf(v.producto_id);

            return (
              <Card key={v.id} className="shadow-sm border-zinc-200 bg-white flex flex-col justify-between overflow-hidden">
                <CardHeader className="p-4 pb-2 relative">
                  <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
                    <input 
                      type="checkbox" 
                      className="rounded border-zinc-300 accent-primary w-4 h-4 cursor-pointer"
                      checked={selectedRows.has(v.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedRows);
                        if (e.target.checked) newSet.add(v.id);
                        else newSet.delete(v.id);
                        setSelectedRows(newSet);
                      }}
                    />
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </div>
                  </div>
                  <div className="flex justify-between items-start gap-2 mb-1 pr-16">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold border-zinc-200">
                      {catOf(v.producto_id)}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-bold line-clamp-1">{prodName}</CardTitle>
                  <CardDescription className="text-xs font-mono font-bold text-black/60">{v.sku}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-100 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-black/50 font-medium">Presentación:</span>{" "}
                      <strong className="text-black font-black">{v.talla}</strong>
                    </div>
                    <div>
                      <span className="text-black/50 font-medium">Color:</span>{" "}
                      <strong className="text-black font-bold">{v.color}</strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-end pt-1">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-black/45">Precio Venta</p>
                      <p className="text-lg font-black text-black">{fmtSol(pv)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold text-black/45">Margen</p>
                      <p className="text-sm font-bold text-emerald-600">+{mg.toFixed(0)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Formulario Expandible para Registro de Productos (Lote / Múltiples) */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-zinc-200 my-6 max-h-[92vh] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-zinc-200 shrink-0">
              <div>
                <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2">
                  <span>✨ Registro de Productos al Catálogo</span>
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 font-bold border-purple-200">
                    {modalMode === "lote" ? `${bulkRows.length} en lote` : "Individual"}
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Añade múltiples galletas a la vez expandiendo las filas del formulario sin digitalizar uno por uno.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-zinc-300 p-0.5 bg-zinc-100 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setModalMode("lote")}
                    className={`px-3 py-1 rounded-md transition-all ${
                      modalMode === "lote" ? "bg-white text-zinc-900 shadow-sm font-black" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    📦 En Lote (Expandible)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalMode("individual")}
                    className={`px-3 py-1 rounded-md transition-all ${
                      modalMode === "individual" ? "bg-white text-zinc-900 shadow-sm font-black" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    📝 Individual
                  </button>
                </div>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 font-bold flex items-center justify-center text-zinc-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* MODO FORMULARIO EXPANDIBLE EN LOTE */}
            {modalMode === "lote" ? (
              <form onSubmit={handleCreateBulkProducts} className="flex-1 overflow-hidden flex flex-col pt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Galletas a digitalizar ({bulkRows.length} filas):
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addBulkRow}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-8 text-xs"
                  >
                    ➕ Añadir otra fila / paquete
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-xl bg-zinc-50/50 p-2 space-y-3 pr-1">
                  {bulkRows.map((row, idx) => (
                    <div
                      key={row.tempId}
                      className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-sm relative group space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-zinc-700">Paquete #{idx + 1}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateBulkRow(idx)}
                            className="h-7 px-2 text-xs font-bold text-purple-700 hover:bg-purple-50"
                            title="Duplicar esta fila (para crear otra presentación o sabor rápido)"
                          >
                            📋 Duplicar
                          </Button>
                          {bulkRows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBulkRow(idx)}
                              className="h-7 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                              title="Eliminar fila"
                            >
                              🗑️ Quitar
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            Nombre de la Galleta *
                          </label>
                          <Input
                            required
                            placeholder="Ej. Galleta Chocochips"
                            value={row.nombre}
                            onChange={(e) => updateBulkRow(idx, "nombre", e.target.value)}
                            className="h-9 font-bold text-xs"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            Categoría
                          </label>
                          <Input
                            placeholder="Clasicas, Saludables…"
                            value={row.categoria}
                            onChange={(e) => updateBulkRow(idx, "categoria", e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            Presentación
                          </label>
                          <Input
                            placeholder="PAQ12, CAJA24"
                            value={row.talla}
                            onChange={(e) => updateBulkRow(idx, "talla", e.target.value)}
                            className="h-9 text-xs font-bold text-center"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            Sabor
                          </label>
                          <Input
                            placeholder="CHOCOCHIPS, VAINILLA…"
                            value={row.color}
                            onChange={(e) => updateBulkRow(idx, "color", e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            Stock
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={row.stock}
                            onChange={(e) => updateBulkRow(idx, "stock", Number(e.target.value))}
                            className="h-9 text-xs text-center font-bold"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            P. Costo
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.costo}
                            onChange={(e) => {
                              const c = Number(e.target.value);
                              updateBulkRow(idx, "costo", c);
                              if (row.venta <= c) {
                                updateBulkRow(idx, "venta", Number((c * 1.4).toFixed(2)));
                              }
                            }}
                            className="h-9 text-xs text-right"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                            P. Venta
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.venta}
                            onChange={(e) => updateBulkRow(idx, "venta", Number(e.target.value))}
                            className="h-9 text-xs text-right font-black text-primary"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer and Submit */}
                <div className="pt-4 mt-2 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addBulkRow}
                      className="font-bold text-xs"
                    >
                      ➕ Agregar otro paquete (+1)
                    </Button>
                    <span className="text-xs text-zinc-500 font-medium">
                      Total paquetes a ingresar: <strong>{bulkRows.reduce((s, r) => s + (Number(r.stock) || 0), 0)} unidades</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {saveProgress && (
                      <span className="text-xs font-bold text-purple-700 animate-pulse">
                        {saveProgress}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowProductModal(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-primary text-white font-black px-5 shadow-md hover:bg-primary/90"
                    >
                      {saving ? "Guardando lote en Kardex…" : `Guardar Todas las Galletas (${bulkRows.length})`}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              /* MODO INDIVIDUAL */
              <form onSubmit={handleCreateSingleProduct} className="space-y-4 pt-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-black uppercase mb-1.5">
                      Nombre del Producto / Galleta *
                    </label>
                    <Input
                      required
                      placeholder="Ej. Galleta Chocochips con chispas"
                      value={prodNombre}
                      onChange={(e) => setProdNombre(e.target.value)}
                      className="font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-black uppercase mb-1.5">Categoría *</label>
                    <Input
                      required
                      placeholder="Ej. Clasicas, Rellenas, Saludables…"
                      value={prodCat}
                      onChange={(e) => setProdCat(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-black uppercase mb-1.5">
                      Margen Ganancia Sugerido (%)
                    </label>
                    <Input
                      type="number"
                      value={prodMargen}
                      onChange={(e) => setProdMargen(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">Descripción (Opcional)</label>
                  <Input
                      placeholder="Sabor, receta, relleno…"
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                  />
                </div>

                <div className="pt-3 border-t border-zinc-200">
                  <p className="text-xs font-black uppercase tracking-wider text-primary mb-2">
                    Variante Inicial (Presentación, Sabor, Stock y Precios)
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">Presentación</label>
                      <Input
                        placeholder="PAQ12, CAJA24…"
                        required
                        value={initTalla}
                        onChange={(e) => setInitTalla(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">Sabor</label>
                      <Input
                        placeholder="CHOCOCHIPS, VAINILLA…"
                        required
                        value={initColor}
                        onChange={(e) => setInitColor(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">Stock Inicial</label>
                      <Input
                        type="number"
                        min="0"
                        value={initStock}
                        onChange={(e) => setInitStock(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">Stock Mínimo</label>
                      <Input
                        type="number"
                        min="0"
                        value={initMinStock}
                        onChange={(e) => setInitMinStock(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">P. Costo (S/)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={initCosto}
                        onChange={(e) => {
                          const c = Number(e.target.value);
                          setInitCosto(c);
                          setInitVenta(Number((c * (1 + prodMargen / 100)).toFixed(2)));
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-black/70 mb-1">P. Venta (S/)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={initVenta}
                        onChange={(e) => setInitVenta(Number(e.target.value))}
                        className="font-bold text-primary"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[11px] font-bold text-black/70 mb-1">SKU (Opcional)</label>
                      <Input
                        placeholder="Auto si se omite"
                        value={initSku}
                        onChange={(e) => setInitSku(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 shrink-0">
                  <Button type="button" variant="outline" onClick={() => setShowProductModal(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving} className="font-bold">
                    {saving ? "Creando en Kardex…" : "Crear Producto y Variante"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Agregar Variante a Producto Existente */}
      {showVariantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-200">
              <div>
                <h2 className="text-lg font-black text-black">Agregar Variante</h2>
                <p className="text-xs text-muted-foreground">Nueva presentación o sabor a un modelo existente.</p>
              </div>
              <button
                onClick={() => setShowVariantModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 font-bold flex items-center justify-center text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVariant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black uppercase mb-1.5">Producto Padre *</label>
                <select
                  required
                  value={varProdId || selectedProductForVariant}
                  onChange={(e) => {
                    setVarProdId(e.target.value);
                    setSelectedProductForVariant(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {prods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.categoria})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">Presentación *</label>
                  <Input
                    required
                    placeholder="PAQ12, CAJA24…"
                    value={varTalla}
                    onChange={(e) => setVarTalla(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">Sabor *</label>
                  <Input
                    required
                    placeholder="CHOCOCHIPS, VAINILLA…"
                    value={varColor}
                    onChange={(e) => setVarColor(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">Stock Inicial</label>
                  <Input
                    type="number"
                    min="0"
                    value={varStock}
                    onChange={(e) => setVarStock(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">Stock Mínimo</label>
                  <Input
                    type="number"
                    min="0"
                    value={varMinStock}
                    onChange={(e) => setVarMinStock(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">P. Costo (S/)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={varCosto}
                    onChange={(e) => setVarCosto(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black uppercase mb-1.5">P. Venta (S/)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={varVenta}
                    onChange={(e) => setVarVenta(Number(e.target.value))}
                    className="font-bold text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-black uppercase mb-1.5">SKU (Opcional)</label>
                <Input
                  placeholder="Auto-generado si se deja vacío"
                  value={varSku}
                  onChange={(e) => setVarSku(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" variant="outline" onClick={() => setShowVariantModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="font-bold">
                  {saving ? "Guardando…" : "Guardar Variante"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
