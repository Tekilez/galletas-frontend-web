export const API_BASE = "https://kardex-ia.onrender.com";

export type AuthUser = { id: string; usuario: string; nombre: string; rol: string };

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("kardex_auth_v1");
    if (!raw) return null;
    const j = JSON.parse(raw);
    const t = j.access_token as string | undefined;
    if (!t) return null;
    // Solo JWT real, no local_xxx
    if (t.startsWith("local_") || !t.includes(".")) return null;
    return t;
  } catch { return null; }
}

async function req(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${txt.slice(0, 500)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

export const api = {
  login: async (usuario: string, password: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ usuario, password }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Login ${res.status}`);
      const j = await res.json();
      const token = j.access_token ?? j.token;
      const user = j.user as AuthUser | undefined;
      if (!token || !user) throw new Error("Respuesta login inválida");
      localStorage.setItem("kardex_auth_v1", JSON.stringify({ access_token: token, user }));
      return { token, user };
    } finally { clearTimeout(t); }
  },
  logout: () => {
    if (typeof window !== "undefined") localStorage.removeItem("kardex_auth_v1");
  },
  getUser: (): AuthUser | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("kardex_auth_v1");
      if (!raw) return null;
      return (JSON.parse(raw).user as AuthUser) ?? null;
    } catch { return null; }
  },
  productos: () => req("/api/v1/productos?limit=100&offset=0") as Promise<any[]>,
  crearProducto: (data: { nombre: string; categoria?: string; descripcion?: string; margen_ganancia?: number; activo?: boolean }) =>
    req("/api/v1/productos", { method: "POST", body: JSON.stringify(data) }),
  actualizarProducto: (id: string, data: any) =>
    req(`/api/v1/productos/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  eliminarProducto: (id: string) =>
    req(`/api/v1/productos/${encodeURIComponent(id)}`, { method: "DELETE" }),

  variantes: () => req("/api/v1/variantes?limit=100&offset=0") as Promise<any[]>,
  crearVariante: (data: {
    producto_id: string;
    sku: string;
    talla: string;
    color: string;
    stock_actual?: number;
    stock_minimo?: number;
    precio_costo: number;
    precio_venta: number;
    imagen_url?: string;
  }) => req("/api/v1/variantes", { method: "POST", body: JSON.stringify(data) }),
  actualizarVariante: (id: string, data: any) =>
    req(`/api/v1/variantes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),

  transacciones: (tipo?: string) =>
    req(`/api/v1/transacciones?limit=100&offset=0${tipo ? `&tipo=${tipo}` : ""}`) as Promise<any[]>,
  kardex: () => req("/api/v1/transacciones/kardex?limit=100&offset=0") as Promise<any[]>,
  crearTransaccion: (data: {
    variante_id: string;
    tipo: "entrada" | "salida" | "ajuste";
    cantidad: number;
    precio_unitario: number;
    stock_anterior: number;
    stock_nuevo: number;
    motivo?: string;
    referencia?: string;
    notas?: string;
  }) => req("/api/v1/transacciones", { method: "POST", body: JSON.stringify(data) }),

  clientes: () => req("/api/v1/clientes?limit=100&offset=0") as Promise<any[]>,
  notas: () => req("/api/v1/notas?limit=100&offset=0") as Promise<any[]>,
  notaByCodigo: (c: string) => req(`/api/v1/notas/${encodeURIComponent(c)}`),
  devoluciones: () => req("/api/v1/devoluciones?limit=100&offset=0") as Promise<any[]>,
  devolucionByCodigo: (c: string) => req(`/api/v1/devoluciones/${encodeURIComponent(c)}`),
  crearDevolucion: (data: {
    nota_codigo: string;
    items: { variante_id: string; cantidad: number; motivo?: string }[];
    motivo_general?: string;
  }) => req("/api/v1/devoluciones", { method: "POST", body: JSON.stringify(data) }),
  vendedores: () => req("/api/v1/auth/vendedores") as Promise<any[]>,
  asistencia: async (fecha?: string) => {
    const res = await req(`/api/v1/asistencia/historial${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ""}`).catch(() => ({ success: false, data: [] }));
    if (res && res.data) return res.data as any[];
    if (Array.isArray(res)) return res;
    return [];
  },
  chat: (pregunta: string) =>
    req("/api/v1/chat", { method: "POST", body: JSON.stringify({ pregunta }) }),

  scanReceipt: async (file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/v1/scan-receipt`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OCR ${res.status}: ${txt.slice(0, 250)}`);
    }
    return res.json();
  },

  parseReceiptText: async (text: string) => {
    const prompt = `Analiza este texto o boleta de compra a proveedor y extrae en formato JSON estricto:
{"proveedor": "nombre o null", "nro_doc": "boleta/factura o null", "items": [{"nombre": "Galleta Chocochips", "categoria": "clasicas", "talla": "PAQ12", "color": "CHOCOCHIPS", "cantidad": 10, "precio_costo": 15.00, "precio_venta_sugerido": 21.75}]}
Texto de la boleta:
${text}`;
    return req("/api/v1/chat", { method: "POST", body: JSON.stringify({ pregunta: prompt }) });
  },
};

export const fmtSol = (n: number) =>
  `S/ ${(Number(n) || 0).toFixed(2)}`;


