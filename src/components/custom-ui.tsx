import React from "react";

export const INK = "#0F172A";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-zinc-200 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[15px] font-extrabold tracking-tight text-black">{title}</h2>
        {sub && <p className="text-xs text-black/60 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tint }: {
  label: string; value: string; sub?: string; icon: string;
  tint: string; // tailwind bg class for icon tile
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${tint}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-black/50">{label}</p>
        <p className="text-[22px] leading-7 font-black tracking-tight text-black tabular-nums truncate">{value}</p>
        {sub && <p className="text-[11px] text-black/60">{sub}</p>}
      </div>
    </Card>
  );
}

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "violet" | "teal" | "red" | "amber" }) {
  const tones: Record<string, string> = {
    zinc: "bg-[#FDF0D5] text-[#3B2314] border-[#E5C07B]",
    violet: "bg-amber-100 text-amber-900 border-amber-200",
    teal: "bg-teal-50 text-teal-800 border-teal-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-100 text-[#7C4A21] border-amber-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${tones[tone]}`}>{children}</span>
  );
}

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-2xl mb-3">{icon}</div>
      <p className="text-sm font-extrabold text-black">{title}</p>
      {hint && <p className="text-xs text-black/60 mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm">⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-[#E5C07B] rounded-xl pl-9 pr-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
      />
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const [today, setToday] = React.useState<string>("");
  React.useEffect(() => {
    setToday(new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/45 capitalize min-h-[16px]">{today}</p>
        <h1 className="text-[22px] font-black tracking-tight text-black">{title}</h1>
        {sub && <p className="text-xs text-black/60 mt-0.5">{sub}</p>}
      </div>
      {right && <div className="flex gap-2">{right}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" }) {
  if (variant === "ghost")
    return <button onClick={onClick} className="px-3 py-2 rounded-xl text-xs font-bold text-black border border-zinc-300 hover:bg-zinc-50">{children}</button>;
  return <button onClick={onClick} className="px-3 py-2 rounded-xl text-xs font-extrabold text-[#FFFBEB] bg-[#7C4A21] hover:bg-[#5C2E0F]">{children}</button>;
}
