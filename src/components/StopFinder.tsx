"use client";
// src/components/StopFinder.tsx
// ค้นป้ายและสายรถใกล้พิกัดที่ระบุ สำหรับเติมข้อมูลเส้นทางที่ยังไม่รู้
import { useState } from "react";
import type { StopsResponse } from "@/lib/routing/types";

type Props = {
  lat: number;
  lon: number;
  label: string;
};

const btn: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 600,
  fontFamily: "var(--font-main)",
};

export default function StopFinder({ lat, lon, label }: Props) {
  const [radius, setRadius] = useState(500);
  const [data, setData] = useState<StopsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setError(null);
    setCopied(null);
    try {
      const res = await fetch("/api/stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? `HTTP ${res.status}`));
      setData(json as StopsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyRef(ref: string) {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(`คัดลอก "${ref}" แล้ว เอาไปวางในช่องสายรถได้`);
    } catch {
      setCopied(`สายที่เลือก: ${ref} (คัดลอกอัตโนมัติไม่ได้ พิมพ์เองได้เลย)`);
    }
  }

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "10px",
        background: "rgba(56,189,248,0.07)",
        border: "1px solid rgba(56,189,248,0.22)",
        fontSize: "0.82rem",
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>🔍 ค้นป้าย/สายรถใกล้ {label}</span>
        <label style={{ opacity: 0.8 }}>
          รัศมี{" "}
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.3)",
              color: "inherit",
              fontFamily: "var(--font-main)",
            }}
          >
            <option value={300}>300 ม.</option>
            <option value={500}>500 ม.</option>
            <option value={1000}>1 กม.</option>
            <option value={2000}>2 กม.</option>
          </select>
        </label>
        <button type="button" style={btn} onClick={search} disabled={loading}>
          {loading ? "ค้นหา..." : "ค้นหา"}
        </button>
      </div>

      {error && <p style={{ color: "#f87171", margin: "8px 0 0 0", lineHeight: 1.5 }}>{error}</p>}
      {copied && <p style={{ color: "#34d399", margin: "8px 0 0 0", lineHeight: 1.5 }}>{copied}</p>}

      {data && (
        <div style={{ marginTop: "10px", lineHeight: 1.6 }}>
          <div style={{ marginBottom: "8px" }}>
            <strong>ป้ายที่เจอ ({data.stops.length})</strong>
            {data.stops.length === 0 ? (
              <div style={{ opacity: 0.75 }}>ไม่มีป้ายใน OSM ในรัศมีนี้ ลองขยายรัศมี</div>
            ) : (
              <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px" }}>
                {data.stops.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    {s.name} <span style={{ opacity: 0.7 }}>· {s.distanceM} ม.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <strong>สายที่ผ่านป้ายเหล่านี้ ({data.routes.length})</strong>
            {data.routes.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                OSM ไม่มีข้อมูลสายที่ผูกกับป้ายแถวนี้ ต้องดูจาก ViaBus
              </div>
            ) : (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                {data.routes.map((r, i) => (
                  <button
                    key={`${r.ref}-${i}`}
                    type="button"
                    onClick={() => copyRef(r.ref)}
                    title={`${r.name}${r.from ? ` · ${r.from} → ${r.to ?? "?"}` : ""} (คลิกเพื่อคัดลอก)`}
                    style={{ ...btn, padding: "4px 10px" }}
                  >
                    {r.ref}
                    {r.to ? <span style={{ opacity: 0.7, fontWeight: 400 }}> → {r.to}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p style={{ margin: "10px 0 0 0", color: "#fbbf24", lineHeight: 1.5 }}>⚠ {data.note}</p>
        </div>
      )}
    </div>
  );
}
