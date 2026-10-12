"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const u = api.getUser();
    router.replace(u ? "/dashboard" : "/login");
  }, [router]);
  return <div className="p-8 text-sm text-black font-bold">Redirigiendo…</div>;
}
