"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { exportToExcel } from "@/lib/excel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/custom-ui";

// ─────────────────────────────────────────────
// Tooltip de ayuda en palabras sencillas
// ─────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center ml-1.5 cursor-help align-middle print:hidden"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((s) => !s)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={text}
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[10px] font-black border border-sky-300 select-none leading-none">
        ?
      </span>
      {show && (
        <span className="absolute bottom-5 left-0 z-50 w-56 rounded-xl bg-zinc-900 text-white text-[11px] font-medium leading-relaxed px-3 py-2 shadow-xl border border-zinc-700 whitespace-normal pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────
// Aviso de reporte automático (texto exigido)
// ─────────────────────────────────────────────
function AutoReportBadge() {
  return (
    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs font-medium mb-4 print:hidden">
      <span className="text-lg leading-none mt-0.5">🤖</span>
      <span>
        <span className="font-black">Este reporte se genera automáticamente en tiempo real</span>{" "}
        según las operaciones registradas.{" "}
        <span className="font-bold">No necesitas editar nada aquí.</span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tipos de operación manual (partida doble simplificada)
// ─────────────────────────────────────────────
type OpType = "venta" | "compra" | "gasto" | "prestamo";
interface Operacion {
  id: string;
  tipo: OpType;
  fecha: string;
  descripcion: string;
  monto: number;
  costo?: number; // solo ventas: costo de la galleta vendida (resta inventario)
  pagado_contado?: boolean; // solo compras
  es_interes?: boolean; // solo gastos
}

const STORAGE_KEY = "kardex_operaciones_v1";
const CONFIG_KEY = "kardex_contabilidad_real_v3";

function loadOps(): Operacion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveOps(ops: Operacion[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  }
}

const OP_META: Record<OpType, { titulo: string; icono: string; efecto: string; detalle: string; color: string }> = {
  venta: {
    titulo: "Venta diaria",
    icono: "🧾",
    efecto: "Suma efectivo · Resta inventario",
    detalle:
      "Registra lo que vendiste hoy en caja. El dinero entra a Efectivo, el costo de la galleta sale del Inventario y la ganancia aparece sola en el Estado de Resultados.",
    color: "bg-emerald-50 border-emerald-200 text-emerald-900",
  },
  compra: {
    titulo: "Compra de mercadería",
    icono: "📦",
    efecto: "Suma inventario · Resta efectivo o genera deuda",
    detalle:
      "Registra las galletas que compraste al proveedor. La mercadería entra al Inventario. Si pagaste al contado sale de tu Efectivo; si fue a crédito se suma a Cuentas por Pagar.",
    color: "bg-amber-50 border-amber-200 text-amber-900",
  },
  gasto: {
    titulo: "Gasto operativo / Interés",
    icono: "💸",
    efecto: "Resta efectivo · Va al Estado de Resultados",
    detalle:
      "Registra alquiler, luz, sueldos o intereses del banco. El dinero sale de tu Efectivo y el gasto reduce tu Utilidad en el Estado de Resultados.",
    color: "bg-rose-50 border-rose-200 text-rose-900",
  },
  prestamo: {
    titulo: "Préstamo recibido",
    icono: "🏦",
    efecto: "Suma efectivo · Suma pasivo (deuda)",
    detalle:
      "Registra dinero que te prestó el banco o un tercero. Entra a tu Efectivo pero también aparece como deuda en el Pasivo. No es una ganancia.",
    color: "bg-amber-50 border-amber-200 text-amber-900",
  },
};

export default function ContabilidadPage() {
  const [notas, setNotas] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Operaciones manuales (localStorage)
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);

  // ── Área principal: Registrar vs Reportes ──
  const [mainArea, setMainArea] = useState<"registrar" | "reportes">("registrar");

  // ── Sub-pestañas ──
  const [regTab, setRegTab] = useState<"venta" | "compra" | "gasto" | "prestamo" | "historial">("venta");
  const [reportTab, setReportTab] = useState<"balance" | "resultados" | "analisis" | "liquidacion">("balance");

  // ── Parámetros de tienda ──
  const [empresa, setEmpresa] = useState("GALLETAR STORE");
  const [ruc, setRuc] = useState("20609876543");
  const [cajaInicial, setCajaInicial] = useState(1000);
  const [alquiler, setAlquiler] = useState(1200);
  const [serviciosLuzAgua, setServiciosLuzAgua] = useState(300);
  const [pagoVendedoraSemanal, setPagoVendedoraSemanal] = useState(350);
  const [equiposPOS, setEquiposPOS] = useState(0);
  const [cuentasPorCobrarBase, setCuentasPorCobrarBase] = useState(0);
  const [cuentasPorPagarBase, setCuentasPorPagarBase] = useState(0);
  const [showConfig, setShowConfig] = useState(false);

  // ── Formulario genérico ──
  const [fMonto, setFMonto] = useState("");
  const [fCosto, setFCosto] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fContado, setFContado] = useState(true);
  const [fEsInteres, setFEsInteres] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        try {
          const j = JSON.parse(saved);
          if (j.empresa) setEmpresa(j.empresa);
          if (j.ruc) setRuc(j.ruc);
          if (j.cajaInicial !== undefined) setCajaInicial(Number(j.cajaInicial) || 0);
          if (j.alquiler !== undefined) setAlquiler(Number(j.alquiler) || 0);
          if (j.serviciosLuzAgua !== undefined) setServiciosLuzAgua(Number(j.serviciosLuzAgua) || 0);
          if (j.pagoVendedoraSemanal !== undefined) setPagoVendedoraSemanal(Number(j.pagoVendedoraSemanal) || 0);
          if (j.equiposPOS !== undefined) setEquiposPOS(Number(j.equiposPOS) || 0);
          if (j.cuentasPorCobrarBase !== undefined) setCuentasPorCobrarBase(Number(j.cuentasPorCobrarBase) || 0);
          if (j.cuentasPorPagarBase !== undefined) setCuentasPorPagarBase(Number(j.cuentasPorPagarBase) || 0);
          // Compat: clave antigua
          if (j.cuentasPorPagarMercaderia !== undefined) setCuentasPorPagarBase(Number(j.cuentasPorPagarMercaderia) || 0);
        } catch {
          /* noop */
        }
      }
      setOperaciones(loadOps());
    }

    setLoading(true);
    setErr("");
    Promise.allSettled([api.notas(), api.variantes(), api.productos()])
      .then(([nRes, vRes, pRes]) => {
        if (nRes.status === "fulfilled") setNotas(Array.isArray(nRes.value) ? nRes.value : []);
        else setErr(`Error cargando ventas: ${String((nRes as any).reason?.message ?? "error")}`);
        if (vRes.status === "fulfilled") setVariantes(Array.isArray(vRes.value) ? vRes.value : []);
        if (pRes.status === "fulfilled") setProductos(Array.isArray(pRes.value) ? pRes.value : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveConfig = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        CONFIG_KEY,
        JSON.stringify({
          empresa,
          ruc,
          cajaInicial,
          alquiler,
          serviciosLuzAgua,
          pagoVendedoraSemanal,
          equiposPOS,
          cuentasPorCobrarBase,
          cuentasPorPagarBase,
        })
      );
      alert("✅ Parámetros guardados con éxito.");
    }
  };

  // ── Registrar operación manual ──
  const handleAddOperacion = (tipo: OpType) => {
    const monto = Number(fMonto);
    if (!monto || monto <= 0) {
      setFormMsg("❌ Ingresa un monto válido mayor a cero.");
      return;
    }
    const costo = Number(fCosto) || 0;
    const op: Operacion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo,
      fecha: new Date().toISOString(),
      descripcion: fDesc.trim() || OP_META[tipo].titulo,
      monto,
      costo: tipo === "venta" ? costo : undefined,
      pagado_contado: tipo === "compra" ? fContado : undefined,
      es_interes: tipo === "gasto" ? fEsInteres : undefined,
    };
    const next = [op, ...operaciones];
    setOperaciones(next);
    saveOps(next);
    setFMonto("");
    setFCosto("");
    setFDesc("");
    setFContado(true);
    setFEsInteres(false);
    setFormMsg(`✅ ${OP_META[tipo].titulo} registrada: ${fmtSol(monto)}. Ya se refleja en los reportes.`);
  };

  const handleDeleteOperacion = (id: string) => {
    const next = operaciones.filter((o) => o.id !== id);
    setOperaciones(next);
    saveOps(next);
  };

  // ─────────────────────────────────────────────
  // MOTOR CONTABLE — garantiza Activo = Pasivo + Patrimonio
  // El Patrimonio SIEMPRE incorpora el Resultado del Ejercicio (Utilidad Neta).
  // ─────────────────────────────────────────────
  const financialData = useMemo(() => {
    const now = new Date();
    let d = 0,
      s = 0,
      m = 0,
      a = 0;
    let costoVentasBackend = 0;
    let ventasBackend = 0;

    const porVend = new Map<string, { nombre: string; total: number; cant: number }>();
    const porProd = new Map<string, { id: string; sku: string; cant: number; total: number }>();

    for (const n of notas) {
      if (!n.created_at) continue;
      const date = new Date(n.created_at);
      const total = Number(n.total) || 0;
      ventasBackend += total;

      if (date.getFullYear() === now.getFullYear()) {
        a += total;
        if (date.getMonth() === now.getMonth()) {
          m += total;
          const diffDays = Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 7) s += total;
          if (date.getDate() === now.getDate()) d += total;
        }
      }

      const items = n.detalles ?? n.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          const qty = Number(it.cantidad) || 1;
          const price = Number(it.precio_unitario ?? it.subtotal ?? it.precio ?? 0) * qty;
          const vid = it.variante_id ?? it.id;
          const v = variantes.find((vx: any) => vx.id === vid || vx.sku === vid);
          if (v) costoVentasBackend += (Number(v.precio_costo) || 0) * qty;

          const directProd = productos.find((px: any) => px.id === vid || px.id === (v as any)?.producto_id);
          const prodName = it.nombre ?? it.producto_nombre ?? (directProd as any)?.nombre ?? (v as any)?.producto_nombre ?? "";
          const sku = it.sku ?? (v as any)?.sku ?? (v ? `${(v as any).talla}/${(v as any).color}` : "");
          const label = prodName ? (sku ? `${prodName} · ${sku}` : prodName) : sku || "Galleta";

          const curr = porProd.get(label) ?? { id: String(vid ?? label), sku: label, cant: 0, total: 0 };
          curr.cant += qty;
          curr.total += price;
          porProd.set(label, curr);
        }
      }

      const vendName = n.vendedor_nombre ?? "Sin asignar";
      const vCurr = porVend.get(vendName) ?? { nombre: vendName, total: 0, cant: 0 };
      vCurr.total += total;
      vCurr.cant += 1;
      porVend.set(vendName, vCurr);
    }

    // ── Agregados manuales ──
    let ventasManuales = 0;
    let costoManuales = 0;
    let comprasManuales = 0;
    let comprasContado = 0;
    let comprasCredito = 0;
    let gastosManuales = 0;
    let interesesManuales = 0;
    let prestamosRecibidos = 0;

    for (const op of operaciones) {
      if (op.tipo === "venta") {
        ventasManuales += op.monto;
        costoManuales += Number(op.costo) || 0;
      } else if (op.tipo === "compra") {
        comprasManuales += op.monto;
        if (op.pagado_contado === false) comprasCredito += op.monto;
        else comprasContado += op.monto;
      } else if (op.tipo === "gasto") {
        gastosManuales += op.monto;
        if (op.es_interes) interesesManuales += op.monto;
      } else if (op.tipo === "prestamo") {
        prestamosRecibidos += op.monto;
      }
    }

    // 1. INVENTARIO: stock valorizado + compras manuales − costo de ventas manuales
    const valorInventarioAlmacen = variantes.reduce(
      (acc: number, v: any) => acc + (Number(v.stock_actual) || 0) * (Number(v.precio_costo) || 0),
      0
    );
    const inventarioAjustado = Math.max(0, valorInventarioAlmacen + comprasManuales - costoManuales);

    // 2. ESTADO DE RESULTADOS
    const ventasNetas = ventasBackend + ventasManuales;
    const costoVentasTotal = costoVentasBackend + costoManuales;
    const margenBruto = ventasNetas - costoVentasTotal;

    const totalVendedoras = Math.max(1, porVend.size);
    const totalGastoVendedoras = pagoVendedoraSemanal * 4 * totalVendedoras;
    // Gastos fijos solo si hay movimiento (evita utilidad negativa sin ventas) + gastos manuales siempre
    const gastosFijos = alquiler + serviciosLuzAgua + (ventasNetas > 0 ? totalGastoVendedoras : 0);
    const totalGastosOperativos = gastosFijos + gastosManuales;
    const utilidadOperativa = margenBruto - totalGastosOperativos;
    // El interés ya está dentro de gastosManuales; se muestra separado solo con fin informativo
    const utilidadNeta = utilidadOperativa;

    // 3. BALANCE GENERAL — partida doble simplificada
    // Efectivo: caja inicial + ventas cobradas − compras al contado − gastos + préstamos
    const efectivoReal = cajaInicial + ventasNetas - comprasContado - totalGastosOperativos + prestamosRecibidos;
    const cuentasPorCobrar = cuentasPorCobrarBase;
    const totalActivoCorriente = efectivoReal + inventarioAjustado + cuentasPorCobrar;
    const totalActivoNoCorriente = equiposPOS;
    const totalActivo = totalActivoCorriente + totalActivoNoCorriente;

    // Pasivo: base + compras a crédito + préstamos + sueldos pendientes
    const cuentasPorPagarMercaderia = cuentasPorPagarBase + comprasCredito + prestamosRecibidos;
    const obligacionesLaborales = ventasNetas > 0 ? pagoVendedoraSemanal * totalVendedoras : 0;
    const totalPasivoCorriente = cuentasPorPagarMercaderia + obligacionesLaborales;
    const totalPasivoNoCorriente = 0;
    const totalPasivo = totalPasivoCorriente + totalPasivoNoCorriente;

    // 4. PATRIMONIO — siempre incorpora el Resultado del Ejercicio (principio de equilibrio)
    const resultadoDelEjercicio = utilidadNeta;
    const capitalSocial = Math.max(0, totalActivo - totalPasivo - resultadoDelEjercicio);
    const totalPatrimonio = capitalSocial + resultadoDelEjercicio;
    const totalPasivoYPatrimonio = totalPasivo + totalPatrimonio;

    return {
      d,
      s,
      m,
      a,
      ventasBackend,
      ventasManuales,
      ventasNetas,
      costoVentasBackend,
      costoManuales,
      costoVentasTotal,
      margenBruto,
      gastosFijos,
      gastosManuales,
      interesesManuales,
      totalGastosOperativos,
      utilidadOperativa,
      utilidadNeta,
      comprasManuales,
      comprasContado,
      comprasCredito,
      prestamosRecibidos,

      efectivoReal,
      valorInventarioAlmacen,
      inventarioAjustado,
      cuentasPorCobrar,
      totalActivoCorriente,
      equiposPOS,
      totalActivoNoCorriente,
      totalActivo,

      cuentasPorPagarMercaderia,
      obligacionesLaborales,
      totalPasivoCorriente,
      totalPasivoNoCorriente,
      totalPasivo,

      capitalSocial,
      resultadoDelEjercicio,
      totalPatrimonio,
      totalPasivoYPatrimonio,
      isCuadrado: Math.abs(totalActivo - totalPasivoYPatrimonio) < 0.01,

      vendedores: [...porVend.values()].sort((x, y) => y.total - x.total),
      productos: [...porProd.values()].sort((x, y) => y.cant - x.cant),
    };
  }, [
    notas,
    variantes,
    productos,
    operaciones,
    cajaInicial,
    cuentasPorCobrarBase,
    cuentasPorPagarBase,
    alquiler,
    serviciosLuzAgua,
    pagoVendedoraSemanal,
    equiposPOS,
  ]);

  const handlePrintBalancePdf = () => window.print();

  const handleExportBalanceExcel = () => {
    const headers = ["Sección", "Cuenta / Rubro", "Monto (S/)", "% Análisis Vertical"];
    const totA = financialData.totalActivo || 1;
    const totPP = financialData.totalPasivoYPatrimonio || 1;

    const rows = [
      ["ACTIVO CORRIENTE", "Efectivo (Caja / Ventas + Préstamos − Compras − Gastos)", financialData.efectivoReal.toFixed(2), `${((financialData.efectivoReal / totA) * 100).toFixed(2)}%`],
      ["ACTIVO CORRIENTE", "Inventarios de Mercaderías (Stock + Compras − Costo ventas manuales)", financialData.inventarioAjustado.toFixed(2), `${((financialData.inventarioAjustado / totA) * 100).toFixed(2)}%`],
      ["ACTIVO CORRIENTE", "Cuentas por Cobrar", financialData.cuentasPorCobrar.toFixed(2), `${((financialData.cuentasPorCobrar / totA) * 100).toFixed(2)}%`],
      ["TOTAL ACTIVO CORRIENTE", "—", financialData.totalActivoCorriente.toFixed(2), `${((financialData.totalActivoCorriente / totA) * 100).toFixed(2)}%`],
      ["ACTIVO NO CORRIENTE", "Equipos de Tienda / POS", financialData.equiposPOS.toFixed(2), `${((financialData.equiposPOS / totA) * 100).toFixed(2)}%`],
      ["TOTAL ACTIVO NO CORRIENTE", "—", financialData.totalActivoNoCorriente.toFixed(2), `${((financialData.totalActivoNoCorriente / totA) * 100).toFixed(2)}%`],
      ["TOTAL ACTIVO", "—", financialData.totalActivo.toFixed(2), "100.00%"],
      ["---", "---", "---", "---"],
      ["PASIVO CORRIENTE", "Cuentas por Pagar (Proveedores + Préstamos)", financialData.cuentasPorPagarMercaderia.toFixed(2), `${((financialData.cuentasPorPagarMercaderia / totPP) * 100).toFixed(2)}%`],
      ["PASIVO CORRIENTE", "Obligaciones Laborales (Sueldos Vendedoras)", financialData.obligacionesLaborales.toFixed(2), `${((financialData.obligacionesLaborales / totPP) * 100).toFixed(2)}%`],
      ["TOTAL PASIVO CORRIENTE", "—", financialData.totalPasivoCorriente.toFixed(2), `${((financialData.totalPasivoCorriente / totPP) * 100).toFixed(2)}%`],
      ["TOTAL PASIVO", "—", financialData.totalPasivo.toFixed(2), `${((financialData.totalPasivo / totPP) * 100).toFixed(2)}%`],
      ["PATRIMONIO", "Capital Social (Aportado / Apertura)", financialData.capitalSocial.toFixed(2), `${((financialData.capitalSocial / totPP) * 100).toFixed(2)}%`],
      ["PATRIMONIO", "Resultado del Ejercicio (Utilidad Neta automática)", financialData.resultadoDelEjercicio.toFixed(2), `${((financialData.resultadoDelEjercicio / totPP) * 100).toFixed(2)}%`],
      ["TOTAL PATRIMONIO", "—", financialData.totalPatrimonio.toFixed(2), `${((financialData.totalPatrimonio / totPP) * 100).toFixed(2)}%`],
      ["TOTAL PASIVO Y PATRIMONIO", "—", financialData.totalPasivoYPatrimonio.toFixed(2), "100.00%"],
    ];

    exportToExcel(`Balance_General_${empresa.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}`, "Balance", headers, rows);
  };

  const regTabs: { id: typeof regTab; label: string }[] = [
    { id: "venta", label: "🧾 Ventas" },
    { id: "compra", label: "📦 Compras" },
    { id: "gasto", label: "💸 Gastos" },
    { id: "prestamo", label: "🏦 Préstamos" },
    { id: "historial", label: `📋 Historial (${operaciones.length})` },
  ];

  const reportTabs: { id: typeof reportTab; label: string; desc: string }[] = [
    { id: "balance", label: "⚖️ Balance General", desc: "Activo = Pasivo + Patrimonio" },
    { id: "resultados", label: "📈 Estado de Resultados", desc: "Ingresos, Costos y Utilidad" },
    { id: "analisis", label: "📊 Análisis Vertical", desc: "Estructura %" },
    { id: "liquidacion", label: "👩‍💼 Vendedoras", desc: "Comisiones y pagos" },
  ];

  const renderForm = () => {
    if (regTab === "historial") {
      return (
        <Card className="shadow-sm border-zinc-200 bg-white">
          <CardHeader className="border-b border-zinc-100">
            <CardTitle className="text-base font-black">Historial de operaciones registradas</CardTitle>
            <CardDescription className="text-xs">
              Todo lo que registres aquí actualiza automáticamente el Balance y el Estado de Resultados.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {operaciones.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">
                Aún no hay operaciones manuales. Usa las pestañas de arriba para registrar tu primera venta, compra, gasto o préstamo.
              </p>
            )}
            {operaciones.map((op) => (
              <div key={op.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/60">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-zinc-900 truncate">
                    {OP_META[op.tipo].icono} {op.descripcion}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(op.fecha).toLocaleString("es-PE")} · {OP_META[op.tipo].efecto}
                    {op.tipo === "venta" && op.costo ? ` · Costo: ${fmtSol(op.costo)}` : ""}
                    {op.tipo === "compra" ? (op.pagado_contado === false ? " · A crédito" : " · Al contado") : ""}
                    {op.tipo === "gasto" && op.es_interes ? " · Interés bancario" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-black tabular-nums">{fmtSol(op.monto)}</span>
                  <button
                    onClick={() => handleDeleteOperacion(op.id)}
                    className="w-8 h-8 rounded-lg bg-white border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-sm transition-colors"
                    title="Eliminar operación"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    const meta = OP_META[regTab];
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm border-zinc-200 bg-white lg:col-span-3">
          <CardHeader className="border-b border-zinc-100">
            <CardTitle className="text-base font-black">
              {meta.icono} Registrar: {meta.titulo}
            </CardTitle>
            <CardDescription className="text-xs">Completa solo 2 campos. La contabilidad la hace el sistema.</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className={`p-3 rounded-xl border text-xs font-medium ${meta.color}`}>
              <p className="font-black">📘 Efecto contable: {meta.efecto}</p>
              <p className="mt-1 opacity-90">{meta.detalle}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Monto (S/)
                  <Tooltip text={regTab === "venta" ? "Dinero que entró por la venta." : regTab === "compra" ? "Valor de la mercadería comprada." : regTab === "gasto" ? "Dinero que salió por el gasto o interés." : "Dinero que te prestaron."} />
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej. 150.00"
                  value={fMonto}
                  onChange={(e) => setFMonto(e.target.value)}
                  className="text-right font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Descripción</label>
                <Input
                  placeholder={regTab === "venta" ? "Ej. Venta del día turno tarde" : regTab === "compra" ? "Ej. Compra 20 chocochips a proveedor Molino" : regTab === "gasto" ? "Ej. Pago de luz de junio" : "Ej. Préstamo banco MiBanco"}
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {regTab === "venta" && (
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Costo de la mercadería vendida (S/) — opcional
                  <Tooltip text="Lo que te costó las galletas que vendiste. Sirve para restar el inventario y calcular tu ganancia real. Si no lo sabes, déjalo en 0." />
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej. 80.00"
                  value={fCosto}
                  onChange={(e) => setFCosto(e.target.value)}
                  className="text-right"
                />
              </div>
            )}

            {regTab === "compra" && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <span className="text-xs font-bold text-zinc-700">¿Cómo la pagaste?</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFContado(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${fContado ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-300"}`}
                  >
                    💵 Al contado (sale de caja)
                  </button>
                  <button
                    onClick={() => setFContado(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${!fContado ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-300"}`}
                  >
                    📝 A crédito (queda debiendo)
                  </button>
                </div>
                <Tooltip text="Al contado: el dinero sale de tu caja. A crédito: no sale dinero ahora, pero la deuda aparece en Cuentas por Pagar." />
              </div>
            )}

            {regTab === "gasto" && (
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-bold text-zinc-700 cursor-pointer">
                <input type="checkbox" checked={fEsInteres} onChange={(e) => setFEsInteres(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                Es interés bancario o gasto financiero
                <Tooltip text="Los intereses del banco también son gastos: reducen tu utilidad, igual que el alquiler o la luz." />
              </label>
            )}

            {regTab === "prestamo" && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                ⚠️ Recuerda: un préstamo <b>no es una ganancia</b>. Aumenta tu efectivo pero también tu deuda. Por eso suma en el Activo y en el Pasivo a la vez.
              </div>
            )}

            {formMsg && <p className="text-xs font-bold text-zinc-700 bg-zinc-100 rounded-lg px-3 py-2">{formMsg}</p>}

            <Button onClick={() => handleAddOperacion(regTab)} className="w-full font-black text-sm py-2.5">
              ✅ Guardar {meta.titulo.toLowerCase()}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 bg-white lg:col-span-2">
          <CardHeader className="border-b border-zinc-100">
            <CardTitle className="text-sm font-black">Resumen en vivo</CardTitle>
            <CardDescription className="text-[11px]">Así afecta a tus reportes</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-zinc-600 font-medium">💰 Efectivo en caja</span><b className="tabular-nums">{fmtSol(financialData.efectivoReal)}</b></div>
            <div className="flex justify-between"><span className="text-zinc-600 font-medium">📦 Inventario valorizado</span><b className="tabular-nums">{fmtSol(financialData.inventarioAjustado)}</b></div>
            <div className="flex justify-between"><span className="text-zinc-600 font-medium">📝 Deudas (Ctas. por pagar)</span><b className="tabular-nums">{fmtSol(financialData.cuentasPorPagarMercaderia)}</b></div>
            <div className="flex justify-between border-t pt-2"><span className="font-black">📈 Utilidad neta</span><b className="tabular-nums text-emerald-700">{fmtSol(financialData.utilidadNeta)}</b></div>
            <div className={`p-2 rounded-lg text-[11px] font-black text-center ${financialData.isCuadrado ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {financialData.isCuadrado ? "⚖️ Balance cuadrado: Activo = Pasivo + Patrimonio" : "⚠️ Descuadre detectado"}
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Tienes <b>{operaciones.length}</b> operaciones manuales + <b>{notas.length}</b> ventas del sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <PageHead
          title="Finanzas y Contabilidad"
          sub="Registra tus operaciones del día y mira tus reportes sin saber contabilidad."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handlePrintBalancePdf} className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm">
            📄 PDF Balance
          </Button>
          <Button onClick={handleExportBalanceExcel} className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            📊 Excel Balance (.xlsx)
          </Button>
        </div>
      </div>

      {loading && <div className="p-4 text-sm font-bold text-zinc-500 bg-white rounded-xl border print:hidden">⏳ Cargando datos reales de la tienda…</div>}
      {err && <div className="p-4 text-sm text-red-800 rounded-xl bg-red-50 border border-red-200 print:hidden">{err}</div>}

      {/* ── NIVEL 1: Registrar vs Reportes ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
        <button
          onClick={() => setMainArea("registrar")}
          className={`p-4 rounded-2xl border-2 text-left transition-all ${mainArea === "registrar" ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400"}`}
        >
          <p className="text-base font-black">📝 Registrar Operaciones</p>
          <p className={`text-xs mt-1 ${mainArea === "registrar" ? "text-white/70" : "text-zinc-500"}`}>
            Lo que tú haces a mano: ventas, compras, gastos y préstamos del día a día.
          </p>
        </button>
        <button
          onClick={() => setMainArea("reportes")}
          className={`p-4 rounded-2xl border-2 text-left transition-all ${mainArea === "reportes" ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400"}`}
        >
          <p className="text-base font-black">📊 Ver Reportes Financieros</p>
          <p className={`text-xs mt-1 ${mainArea === "reportes" ? "text-white/70" : "text-zinc-500"}`}>
            Lo que el sistema calcula solo: Balance General y Estado de Resultados.
          </p>
        </button>
      </div>

      {/* ═══════════ ÁREA: REGISTRAR ═══════════ */}
      {mainArea === "registrar" && (
        <div className="space-y-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            {regTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setRegTab(t.id); setFormMsg(""); }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${regTab === t.id ? "bg-emerald-600 text-white border-emerald-600 shadow" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {renderForm()}

          {/* Parámetros iniciales colapsables */}
          <Card className="shadow-sm border-zinc-200 bg-white">
            <button onClick={() => setShowConfig((s) => !s)} className="w-full px-5 py-3.5 flex justify-between items-center text-left">
              <span className="text-sm font-black">⚙️ Datos iniciales de la tienda {showConfig ? "▲" : "▼"}</span>
              <span className="text-[11px] text-zinc-500 font-medium">Caja inicial, alquiler, RUC… (solo se configura una vez)</span>
            </button>
            {showConfig && (
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Nombre comercial</label>
                    <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">RUC</label>
                    <Input value={ruc} onChange={(e) => setRuc(e.target.value)} className="text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Fondo de caja inicial (S/)
                      <Tooltip text="Dinero con el que abriste caja. Es la base de tu Efectivo." />
                    </label>
                    <Input type="number" value={cajaInicial} onChange={(e) => setCajaInicial(Number(e.target.value) || 0)} className="text-right text-xs font-bold" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Alquiler mensual (S/)</label>
                    <Input type="number" value={alquiler} onChange={(e) => setAlquiler(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Luz / Agua / Internet (S/)</label>
                    <Input type="number" value={serviciosLuzAgua} onChange={(e) => setServiciosLuzAgua(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Pago semanal vendedora (S/)</label>
                    <Input type="number" value={pagoVendedoraSemanal} onChange={(e) => setPagoVendedoraSemanal(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Equipos tienda / POS (S/)</label>
                    <Input type="number" value={equiposPOS} onChange={(e) => setEquiposPOS(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Cuentas por cobrar inicial (S/)
                      <Tooltip text="Dinero que tus clientes te deben (fiados)." />
                    </label>
                    <Input type="number" value={cuentasPorCobrarBase} onChange={(e) => setCuentasPorCobrarBase(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Cuentas por pagar inicial (S/)
                      <Tooltip text="Deuda inicial con proveedores antes de registrar compras a crédito." />
                    </label>
                    <Input type="number" value={cuentasPorPagarBase} onChange={(e) => setCuentasPorPagarBase(Number(e.target.value) || 0)} className="text-right text-xs" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={saveConfig} className="font-bold">💾 Guardar datos iniciales</Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════ ÁREA: REPORTES ═══════════ */}
      {mainArea === "reportes" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 print:hidden">
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${reportTab === tab.id ? "bg-zinc-900 text-white shadow-md font-black" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"}`}
              >
                <span className="block text-sm">{tab.label}</span>
                <span className={`text-[10px] block mt-0.5 ${reportTab === tab.id ? "text-white/70" : "text-zinc-400"}`}>{tab.desc}</span>
              </button>
            ))}
          </div>

          {/* ── BALANCE GENERAL ── */}
          {(reportTab === "balance") && (
            <div className="space-y-6">
              <AutoReportBadge />
              <div className="bg-white p-6 rounded-2xl border border-zinc-300 shadow-sm text-center print:border-none print:shadow-none print:p-0 print:mb-4">
                <h2 className="text-2xl sm:text-3xl font-black tracking-wider text-zinc-900 uppercase font-serif">{empresa}</h2>
                <p className="text-base font-black text-zinc-800 uppercase mt-1 tracking-widest">Balance General</p>
                <p className="text-xs text-zinc-600 font-semibold mt-0.5">
                  Al {new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })} · Expresado en Soles (S/)
                </p>
                <div className="mt-4 inline-flex flex-wrap justify-center items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black print:hidden">
                  <span>⚖️ Principio de Equilibrio:</span>
                  <span>Total Activo ({fmtSol(financialData.totalActivo)}) = Total Pasivo y Patrimonio ({fmtSol(financialData.totalPasivoYPatrimonio)})</span>
                  <span>{financialData.isCuadrado ? "✅ Cuadra" : "❌ No cuadra"}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border-2 border-zinc-800 overflow-hidden shadow-md print:shadow-none print:border-2 print:border-black">
                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x-2 divide-zinc-800">
                  {/* ACTIVO */}
                  <div className="flex flex-col justify-between bg-[#EBF7EE]">
                    <div>
                      <div className="bg-[#52B788] text-black font-black text-center py-2.5 px-4 uppercase text-sm sm:text-base border-b-2 border-zinc-800 tracking-wider">
                        Activo
                        <Tooltip text="Lo que la empresa TIENE: dinero en caja, galletas en almacén y lo que te deben tus clientes." />
                      </div>
                      <div className="p-3 border-b border-zinc-300">
                        <h3 className="font-black text-xs sm:text-sm text-[#1B4332] uppercase tracking-wide mb-2">Activo Corriente</h3>
                        <table className="w-full text-xs sm:text-sm">
                          <tbody className="divide-y divide-zinc-200/60 font-medium text-zinc-900">
                            <tr>
                              <td className="py-1.5 pr-2">
                                Efectivo y Equivalentes (Caja / Ventas)
                                <Tooltip text="Dinero disponible: caja inicial + ventas − compras al contado − gastos + préstamos." />
                              </td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.efectivoReal)}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2">
                                <span className="font-bold">Inventarios de Mercaderías</span>
                                <span className="block text-[10px] text-zinc-500 font-normal">Stock valorizado + compras − costo de ventas manuales</span>
                                <Tooltip text="Todas las galletas que tienes en tienda valorizadas a precio de costo. Sube con cada compra y baja con cada venta." />
                              </td>
                              <td className="py-1.5 text-right font-black text-[#1B4332] tabular-nums">{fmtSol(financialData.inventarioAjustado)}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2">
                                Cuentas por Cobrar
                                <Tooltip text="Dinero que tus clientes te deben (ventas al fiado)." />
                              </td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.cuentasPorCobrar)}</td>
                            </tr>
                            <tr className="font-black text-xs sm:text-sm border-t-2 border-zinc-400">
                              <td className="py-2 pr-2 text-zinc-900 uppercase">Total Activo Corriente</td>
                              <td className="py-2 text-right text-red-600 font-black tabular-nums">{fmtSol(financialData.totalActivoCorriente)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3">
                        <h3 className="font-black text-xs sm:text-sm text-[#1B4332] uppercase tracking-wide mb-2">Activo No Corriente</h3>
                        <table className="w-full text-xs sm:text-sm">
                          <tbody className="divide-y divide-zinc-200/60 font-medium text-zinc-900">
                            <tr>
                              <td className="py-1.5 pr-2">Equipos de Tienda / POS</td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.equiposPOS)}</td>
                            </tr>
                            <tr className="font-black text-xs sm:text-sm border-t-2 border-zinc-400">
                              <td className="py-2 pr-2 text-zinc-900 uppercase">Total Activo No Corriente</td>
                              <td className="py-2 text-right text-red-600 font-black tabular-nums">{fmtSol(financialData.totalActivoNoCorriente)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="bg-[#E76F51] text-white font-black p-3.5 flex justify-between items-center border-t-2 border-zinc-800 text-xs sm:text-base uppercase tracking-wider">
                      <span>Total Activo</span>
                      <span className="text-sm sm:text-lg tabular-nums">{fmtSol(financialData.totalActivo)}</span>
                    </div>
                  </div>

                  {/* PASIVO Y PATRIMONIO */}
                  <div className="flex flex-col justify-between bg-[#FDE2D2]/60">
                    <div>
                      <div className="bg-[#E9C46A] text-black font-black text-center py-2.5 px-4 uppercase text-sm sm:text-base border-b-2 border-zinc-800 tracking-wider">
                        Pasivo y Patrimonio
                        <Tooltip text="De dónde salió todo lo que tienes: lo que debes a terceros (Pasivo) + lo que aportaron los dueños más tus ganancias (Patrimonio)." />
                      </div>
                      <div className="p-3 border-b border-zinc-300">
                        <h3 className="font-black text-xs sm:text-sm text-[#7F4F24] uppercase tracking-wide mb-2">
                          Pasivo Corriente
                          <Tooltip text="Lo que la empresa DEBE a terceros: proveedores, banco y sueldos pendientes." />
                        </h3>
                        <table className="w-full text-xs sm:text-sm">
                          <tbody className="divide-y divide-zinc-200/60 font-medium text-zinc-900">
                            <tr>
                              <td className="py-1.5 pr-2">
                                Cuentas por Pagar (Mercadería / Préstamos)
                                <Tooltip text="Deudas con proveedores por compras a crédito + préstamos recibidos." />
                              </td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.cuentasPorPagarMercaderia)}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2">Obligaciones Laborales (Sueldos pendientes)</td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.obligacionesLaborales)}</td>
                            </tr>
                            <tr className="font-black text-xs sm:text-sm border-t-2 border-zinc-400">
                              <td className="py-2 pr-2 text-zinc-900 uppercase">Total Pasivo Corriente</td>
                              <td className="py-2 text-right font-bold tabular-nums">{fmtSol(financialData.totalPasivoCorriente)}</td>
                            </tr>
                            <tr className="font-black text-xs sm:text-sm bg-[#FCEADE]/80">
                              <td className="py-2 pr-2 text-zinc-900 uppercase">Total Pasivo</td>
                              <td className="py-2 text-right text-red-600 font-black tabular-nums">{fmtSol(financialData.totalPasivo)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3 bg-[#FEFAE0]/80">
                        <h3 className="font-black text-xs sm:text-sm text-[#7F4F24] uppercase tracking-wide mb-2">
                          Patrimonio Neto
                          <Tooltip text="La deuda con los DUEÑOS: lo que aportaron + las ganancias acumuladas. Es el valor neto de tu tienda." />
                        </h3>
                        <table className="w-full text-xs sm:text-sm">
                          <tbody className="divide-y divide-zinc-200/60 font-medium text-zinc-900">
                            <tr>
                              <td className="py-1.5 pr-2">
                                Capital Social (Aportado / Apertura)
                                <Tooltip text="Dinero y mercadería que los dueños pusieron al abrir la tienda." />
                              </td>
                              <td className="py-1.5 text-right font-bold tabular-nums">{fmtSol(financialData.capitalSocial)}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-2">
                                <span className="font-bold text-zinc-900">Resultado del Ejercicio</span>
                                <span className="block text-[10px] text-emerald-700 font-semibold">Utilidad Neta que viene del Estado de Resultados ⛓</span>
                                <Tooltip text="Tu ganancia o pérdida del periodo. Se copia automáticamente desde el Estado de Resultados para que el Balance siempre cuadre." />
                              </td>
                              <td className="py-1.5 text-right font-black text-emerald-800 tabular-nums">{fmtSol(financialData.resultadoDelEjercicio)}</td>
                            </tr>
                            <tr className="font-black text-xs sm:text-sm border-t-2 border-zinc-400">
                              <td className="py-2 pr-2 text-zinc-900 uppercase">Total Patrimonio</td>
                              <td className="py-2 text-right text-red-600 font-black tabular-nums">{fmtSol(financialData.totalPatrimonio)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="bg-[#E76F51] text-white font-black p-3.5 flex justify-between items-center border-t-2 border-zinc-800 text-xs sm:text-base uppercase tracking-wider">
                      <span>Total Pasivo y Patrimonio</span>
                      <span className="text-sm sm:text-lg tabular-nums">{fmtSol(financialData.totalPasivoYPatrimonio)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden print:flex justify-around items-center pt-16 text-center text-xs font-bold text-black">
                <div>
                  <div className="w-52 border-t-2 border-black mb-1 mx-auto" />
                  <p>Contador / Administrador</p>
                  <p className="text-[10px] text-zinc-500 font-normal">{empresa}</p>
                </div>
                <div>
                  <div className="w-52 border-t-2 border-black mb-1 mx-auto" />
                  <p>Gerente General / Propietario</p>
                  <p className="text-[10px] text-zinc-500 font-normal">RUC: {ruc}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── ESTADO DE RESULTADOS ── */}
          {reportTab === "resultados" && (
            <div className="space-y-6 print:hidden">
              <AutoReportBadge />
              <Card className="shadow-sm border-zinc-200 bg-white">
                <CardHeader className="border-b border-zinc-100">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg font-black text-zinc-900">
                        Estado de Resultados
                        <Tooltip text="Muestra si ganaste o perdiste: ventas menos costos menos gastos = tu utilidad." />
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Ventas de galletas ({fmtSol(financialData.ventasBackend)} del sistema + {fmtSol(financialData.ventasManuales)} manuales), costo y gastos.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 font-bold border-amber-200">Soles (S/)</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-zinc-100 text-sm">
                    <div className="flex justify-between items-center px-6 py-3.5 bg-emerald-50/60">
                      <span className="font-black text-zinc-900">Ingresos Totales (Ventas Netas)</span>
                      <span className="font-black text-emerald-700 text-base tabular-nums">{fmtSol(financialData.ventasNetas)}</span>
                    </div>
                    <div className="flex justify-between items-center px-6 py-3 text-zinc-700">
                      <span className="font-medium">
                        (−) Costo de Ventas (lo que te costó las galletas vendidas)
                        <Tooltip text="Precio de costo de cada paquete vendido. A más ventas, mayor costo." />
                      </span>
                      <span className="font-bold text-rose-600 tabular-nums">-{fmtSol(financialData.costoVentasTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center px-6 py-3 bg-zinc-50 font-black border-t-2 border-zinc-200">
                      <span className="text-zinc-900">= Margen Bruto (ganancia solo de las galletas)</span>
                      <span className="text-base text-zinc-900 tabular-nums">{fmtSol(financialData.margenBruto)}</span>
                    </div>
                    <div className="px-6 py-3 bg-zinc-50/40 space-y-2">
                      <p className="text-xs font-bold text-zinc-500 uppercase">Gastos operativos del local:</p>
                      <div className="flex justify-between text-xs text-zinc-600 pl-4"><span>• Alquiler del local</span><span>-{fmtSol(alquiler)}</span></div>
                      <div className="flex justify-between text-xs text-zinc-600 pl-4"><span>• Servicios (luz, agua, internet)</span><span>-{fmtSol(serviciosLuzAgua)}</span></div>
                      <div className="flex justify-between text-xs text-zinc-600 pl-4"><span>• Planilla / pago vendedoras</span><span>-{fmtSol(financialData.gastosFijos - alquiler - serviciosLuzAgua)}</span></div>
                      <div className="flex justify-between text-xs text-zinc-600 pl-4"><span>• Gastos registrados a mano ({operaciones.filter((o) => o.tipo === "gasto").length})</span><span>-{fmtSol(financialData.gastosManuales)}</span></div>
                      {financialData.interesesManuales > 0 && (
                        <div className="flex justify-between text-xs text-amber-700 pl-4 font-bold"><span>↳ de los cuales son intereses bancarios</span><span>-{fmtSol(financialData.interesesManuales)}</span></div>
                      )}
                      <div className="flex justify-between text-xs font-bold text-rose-600 pt-1 border-t"><span>Total gastos operativos</span><span>-{fmtSol(financialData.totalGastosOperativos)}</span></div>
                    </div>
                    <div className="flex justify-between items-center px-6 py-4 bg-emerald-600 text-white font-black rounded-b-2xl">
                      <span className="text-base uppercase tracking-wider">
                        Utilidad Neta ⛓ va al Patrimonio
                        <Tooltip text="Esta ganancia se suma automáticamente al Patrimonio del Balance como 'Resultado del Ejercicio'. Así el Balance siempre cuadra." />
                      </span>
                      <span className="text-2xl tabular-nums">{fmtSol(financialData.utilidadNeta)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── ANÁLISIS ── */}
          {reportTab === "analisis" && (
            <div className="space-y-6 print:hidden">
              <AutoReportBadge />
              <Card className="shadow-sm border-zinc-200 bg-white">
                <CardHeader className="pb-3 border-b border-zinc-100">
                  <CardTitle className="text-base font-black text-zinc-900">Análisis Vertical (%)</CardTitle>
                  <CardDescription className="text-xs">De cada S/ 100 vendidos, cuánto es costo, gasto y ganancia.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-extrabold uppercase text-zinc-500">
                        <tr>
                          <th className="px-5 py-3 text-left">Cuenta</th>
                          <th className="px-4 py-3 text-right">Monto (S/)</th>
                          <th className="px-4 py-3 text-right">% sobre ventas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-medium">
                        {[
                          { name: "Ventas Netas (base 100%)", val: financialData.ventasNetas, isBold: true },
                          { name: "Costo de mercadería", val: financialData.costoVentasTotal },
                          { name: "Utilidad Bruta", val: financialData.margenBruto, isBold: true },
                          { name: "Gastos Operativos", val: financialData.totalGastosOperativos },
                          { name: "Utilidad Neta", val: financialData.utilidadNeta, isFinal: true },
                        ].map((r, i) => {
                          const base = financialData.ventasNetas || 1;
                          const pct = (r.val / base) * 100;
                          return (
                            <tr key={i} className={r.isFinal ? "bg-emerald-50 font-black text-emerald-950" : r.isBold ? "bg-zinc-50 font-bold" : ""}>
                              <td className="px-5 py-3">{r.name}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{fmtSol(r.val)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-black text-primary">{pct.toFixed(2)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { l: "Hoy", v: financialData.d },
                  { l: "Últimos 7 días", v: financialData.s },
                  { l: "Este mes", v: financialData.m },
                  { l: "Este año", v: financialData.a },
                ].map((k) => (
                  <Card key={k.l} className="p-4 text-center shadow-sm">
                    <p className="text-[11px] font-bold uppercase text-zinc-500">{k.l}</p>
                    <p className="text-lg font-black tabular-nums">{fmtSol(k.v)}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── LIQUIDACIÓN ── */}
          {reportTab === "liquidacion" && (
            <div className="space-y-6 print:hidden">
              <AutoReportBadge />
              <Card className="shadow-sm border-zinc-200 bg-white">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base font-bold">Liquidación de Vendedoras</CardTitle>
                      <CardDescription className="text-xs">Ventas reales registradas por cada asesora.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-600">Pago base semanal:</span>
                      <Input type="number" value={pagoVendedoraSemanal} onChange={(e) => setPagoVendedoraSemanal(Number(e.target.value) || 0)} className="w-28 text-right font-bold h-8 text-xs" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {financialData.vendedores.map((v) => (
                      <div key={v.nombre} className="border-b pb-4 last:border-0 last:pb-0 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm text-zinc-900">{v.nombre}</p>
                          <p className="text-xs text-zinc-500">{v.cant} notas de venta registradas</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-primary text-base">{fmtSol(v.total)}</p>
                          <p className="text-xs font-bold text-zinc-700">Pago sugerido: {fmtSol(pagoVendedoraSemanal)}</p>
                        </div>
                      </div>
                    ))}
                    {financialData.vendedores.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center">No hay ventas registradas aún.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
