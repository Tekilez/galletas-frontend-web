"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, fmtSol } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function DashboardPage() {
  const [notas, setNotas] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topRango, setTopRango] = useState<"todo" | "mes" | "semana">("todo");

  const load = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([api.notas(), api.variantes(), api.productos()]);
      const [n, v, p] = results;
      if (n.status === "fulfilled") setNotas(Array.isArray(n.value) ? n.value : []);
      if (v.status === "fulfilled") setVariantes(Array.isArray(v.value) ? v.value : []);
      if (p.status === "fulfilled") setProductos(Array.isArray(p.value) ? p.value : []);
    } catch (e: any) { }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Complex aggregations
  const stats = useMemo(() => {
    const now = new Date();
    let ventasMes = 0;
    
    const porVend = new Map<string, { nombre: string; total: number }>();
    const porProd = new Map<string, { 
      id: string;
      nombre: string; 
      categoria: string; 
      tallaColor: string; 
      sku: string; 
      cant: number; 
      total: number;
    }>();
    const ultimos7Dias = new Map<string, { date: string; revenue: number; tickets: number }>();

    // Init last 7 days map
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric" });
      ultimos7Dias.set(d.toDateString(), { date: str, revenue: 0, tickets: 0 });
    }

    let totalPaquetesVendidos = 0;

    for (const n of notas) {
      if (!n.created_at) continue;
      const date = new Date(n.created_at);
      const total = Number(n.total) || 0;
      
      if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
        ventasMes += total;
      }

      // 7 Days
      const dateStr = date.toDateString();
      if (ultimos7Dias.has(dateStr)) {
        const entry = ultimos7Dias.get(dateStr)!;
        entry.revenue += total;
        entry.tickets += 1;
      }

      // Best Seller
      const vendName = n.vendedor_nombre ?? "Sin asignar";
      const vCurr = porVend.get(vendName) ?? { nombre: vendName, total: 0 };
      vCurr.total += total;
      porVend.set(vendName, vCurr);

      // Check date filter for top items ranking
      let includeInTop = true;
      if (topRango === "mes") {
        includeInTop = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      } else if (topRango === "semana") {
        const diffDays = Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        includeInTop = diffDays <= 7;
      }

      // Best Products
      const items = n.detalles ?? n.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          const qty = Number(it.cantidad) || 1;
          const price = Number(it.precio_unitario ?? it.subtotal ?? it.precio ?? 0) * qty;
          const vid = it.variante_id ?? it.id;
          
          if (includeInTop) {
            totalPaquetesVendidos += qty;
          }

          // Buscar nombre real y fallback
          const varObj = variantes.find((vx: any) => vx.id === vid || vx.sku === vid);
          const directProd = productos.find((px: any) => px.id === vid || px.id === varObj?.producto_id);
          
          let prodName = it.nombre ?? it.producto_nombre ?? directProd?.nombre ?? varObj?.producto_nombre ?? "";
          let categoria = directProd?.categoria ?? "Galletas";
          let talla = varObj?.talla ?? it.talla ?? "";
          let color = varObj?.color ?? it.color ?? "";
          let sku = it.sku ?? varObj?.sku ?? (varObj ? `${talla}/${color}` : "");
          
          if (!prodName && !sku) {
            prodName = `Galleta #${String(vid ?? "").slice(0, 8).toUpperCase()}`;
          } else if (!prodName) {
            prodName = sku;
          }

          const label = `${prodName} ${talla ? `(${talla}/${color})` : ""}`.trim();
          
          if (includeInTop) {
            const curr = porProd.get(label) ?? { 
              id: vid,
              nombre: prodName, 
              categoria,
              tallaColor: talla && color ? `${talla} · ${color}` : talla || color || "Estándar",
              sku: sku || label, 
              cant: 0, 
              total: 0 
            };
            curr.cant += qty;
            curr.total += price;
            porProd.set(label, curr);
          }
        }
      }
    }

    const vendedores = [...porVend.values()].sort((a, b) => b.total - a.total);
    const topVendedor = vendedores[0] ?? { nombre: "—", total: 0 };
    
    const chartData = [...ultimos7Dias.values()];
    const productosOrdenados = [...porProd.values()].sort((a, b) => b.cant - a.cant);
    const galletaMasVendida = productosOrdenados[0] ?? null;

    return {
      ventasMes,
      topVendedor,
      chartData,
      totalNotas: notas.length,
      totalPaquetesVendidos,
      galletaMasVendida,
      productos: productosOrdenados.slice(0, 8),
      ultimas: notas.slice(-8).reverse()
    };
  }, [notas, variantes, productos, topRango]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">E-Commerce Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Resumen general de las ventas, estadísticas y ranking de galletas.</p>
        </div>
        <Button onClick={load} disabled={loading} className="font-bold shadow-sm">
          {loading ? "Cargando..." : "↻ Refrescar Datos"}
        </Button>
      </div>

      {/* TOP CARDS */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-white to-purple-50/50 border-purple-200/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-purple-900 flex items-center justify-between">
              <span>Mejor Vendedora</span>
              <span>🎉</span>
            </CardTitle>
            <CardDescription className="font-bold text-zinc-800 text-base">{stats.topVendedor.nombre}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-700">{fmtSol(stats.topVendedor.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">Ventas generadas en el mes</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700">Ingresos del Mes</CardTitle>
            <span className="text-emerald-600 font-bold text-xs">💰</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{fmtSol(stats.ventasMes)}</div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 font-bold border-emerald-200 mt-2">
              ✓ Ventas Activas
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700">Total de Notas</CardTitle>
            <span className="text-blue-600 font-bold text-xs">🧾</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{stats.totalNotas}</div>
            <p className="text-xs text-muted-foreground mt-2">Notas y boletas registradas</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700">Stock General</CardTitle>
            <span className="text-amber-600 font-bold text-xs">📦</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{variantes.length}</div>
            <p className="text-xs text-muted-foreground mt-2">Variantes registradas en tienda</p>
          </CardContent>
        </Card>
      </div>

      {/* SECCIÓN DESTACADA: TOP DE VENTAS & GALLETA MÁS VENDIDA */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-lg">
              👑
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight">Top de Ventas · Galletas Más Vendidas</h2>
              <p className="text-xs text-zinc-500">Ranking y análisis de rotación de productos en tiempo real.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold">
            <button
              onClick={() => setTopRango("todo")}
              className={`px-3 py-1.5 rounded-lg transition-all ${topRango === "todo" ? "bg-white text-zinc-900 shadow-sm font-extrabold" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Histórico Total
            </button>
            <button
              onClick={() => setTopRango("mes")}
              className={`px-3 py-1.5 rounded-lg transition-all ${topRango === "mes" ? "bg-white text-zinc-900 shadow-sm font-extrabold" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Este Mes
            </button>
            <button
              onClick={() => setTopRango("semana")}
              className={`px-3 py-1.5 rounded-lg transition-all ${topRango === "semana" ? "bg-white text-zinc-900 shadow-sm font-extrabold" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Últimos 7 Días
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          {/* SPOTLIGHT HERO: GALLETA #1 MÁS VENDIDA */}
          <Card className="md:col-span-5 bg-gradient-to-br from-[#18181B] to-[#27272A] text-white border-zinc-800 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
            
            <CardHeader className="pb-3 relative z-10">
              <div className="flex items-center justify-between">
                <Badge className="bg-amber-500 text-black font-black uppercase text-[10px] tracking-wider px-2.5 py-1">
                  ⭐ #1 Galleta Más Vendida
                </Badge>
                <span className="text-xs text-white/50 font-bold uppercase tracking-wider">
                  {topRango === "todo" ? "Histórico" : topRango === "mes" ? "Mes Actual" : "Últimos 7 Días"}
                </span>
              </div>
              <CardTitle className="text-2xl font-black text-white mt-3">
                {stats.galletaMasVendida ? stats.galletaMasVendida.nombre : "Sin ventas registradas"}
              </CardTitle>
              <CardDescription className="text-white/60 text-xs">
                {stats.galletaMasVendida?.categoria ? `Categoría: ${stats.galletaMasVendida.categoria}` : "Registra ventas en caja para ver el podio"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 relative z-10 pt-1">
              {stats.galletaMasVendida ? (
                <>
                  <div className="grid grid-cols-2 gap-3 bg-white/[0.07] p-3.5 rounded-xl border border-white/10">
                    <div>
                      <p className="text-[11px] uppercase font-bold text-white/50 tracking-wider">Unidades Vendidas</p>
                      <p className="text-2xl font-black text-amber-400 mt-0.5">{stats.galletaMasVendida.cant} <span className="text-xs font-normal text-white/70">paquetes</span></p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase font-bold text-white/50 tracking-wider">Ingreso Generado</p>
                      <p className="text-2xl font-black text-emerald-400 mt-0.5">{fmtSol(stats.galletaMasVendida.total)}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-white/80">
                      <span>Participación en ventas</span>
                      <span className="text-amber-400">
                        {stats.totalPaquetesVendidos > 0 
                          ? `${((stats.galletaMasVendida.cant / stats.totalPaquetesVendidos) * 100).toFixed(1)}%` 
                          : "0%"}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/15 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${stats.totalPaquetesVendidos > 0 
                            ? Math.min(100, (stats.galletaMasVendida.cant / stats.totalPaquetesVendidos) * 100) 
                            : 0}%` 
                        }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[11px] text-white/50 border-t border-white/10">
                    <span>Variante: <strong>{stats.galletaMasVendida.tallaColor}</strong></span>
                    <span>SKU: <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">{stats.galletaMasVendida.sku}</code></span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-white/50">
                  <p className="text-4xl mb-2">🛍️</p>
                  <p className="text-sm font-semibold">Aún no hay ventas en este período</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* RANKING TOP GALLETAS */}
          <Card className="md:col-span-7 shadow-sm border-zinc-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-zinc-900">Ranking Top Galletas</CardTitle>
                  <CardDescription className="text-xs">Galletas con mayor demanda por volumen de venta</CardDescription>
                </div>
                <Badge variant="secondary" className="font-bold text-xs">
                  {stats.productos.length} Productos
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.productos.map((p, idx) => {
                  const maxQty = stats.productos[0]?.cant || 1;
                  const pct = Math.round((p.cant / maxQty) * 100);
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={p.sku + idx} className="p-2.5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/70 transition-all">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-zinc-100 font-black text-xs flex items-center justify-center shrink-0">
                            {idx < 3 ? medals[idx] : `#${idx + 1}`}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{p.nombre}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{p.tallaColor} · SKU: {p.sku}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-zinc-900">{p.cant} uds.</span>
                          <span className="block text-[11px] font-bold text-emerald-600">{fmtSol(p.total)}</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-zinc-400" : idx === 2 ? "bg-amber-700" : "bg-primary/70"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {stats.productos.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="text-2xl mb-1">🏷️</p>
                    <p className="font-semibold text-sm">No hay productos vendidos en este rango.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-zinc-200">
          <CardHeader>
            <CardTitle className="text-base font-bold text-zinc-900">Ingresos (Últimos 7 días)</CardTitle>
            <CardDescription className="text-xs">Flujo diario de ingresos generados en tienda</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ChartContainer config={{ revenue: { label: "Ingresos", color: "hsl(var(--primary))" } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={10} fontSize={12} tickFormatter={(val) => `S/ ${val}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3 shadow-sm border-zinc-200">
          <CardHeader>
            <CardTitle className="text-base font-bold text-zinc-900">Flujo de Notas (Últimos 7 días)</CardTitle>
            <CardDescription className="text-xs">Cantidad de operaciones cerradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ChartContainer config={{ tickets: { label: "Notas Registradas", color: "hsl(var(--primary))" } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={10} fontSize={12} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="tickets" stroke="var(--color-tickets)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TABLE: ÚLTIMAS NOTAS */}
      <Card className="shadow-sm border-zinc-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-zinc-900">Últimas Notas de Venta</CardTitle>
            <CardDescription className="text-xs">Registro reciente de comprobantes y clientes</CardDescription>
          </div>
          <Link href="/dashboard/ventas" className="text-xs font-bold text-primary hover:underline px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors">
            Ver todas las ventas →
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Doc</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.ultimas.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-semibold text-zinc-900">
                    {n.cliente?.nombre || n.codigo || String(n.id).slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{n.vendedor_nombre ?? "—"}</TableCell>
                  <TableCell className="text-right font-black text-zinc-900">{fmtSol(Number(n.total) || 0)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 font-bold border-emerald-200">Pagado</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {stats.ultimas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin registros recientes</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
