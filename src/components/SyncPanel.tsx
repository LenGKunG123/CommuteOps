"use client";
// src/components/SyncPanel.tsx
import { useState } from "react";
import type { CommuteProfile } from "@/lib/routing/catalog";
import { syncAll, type SyncResult } from "@/lib/routing/sync";
import * as store from "@/lib/routing/store";

type Props = {
  profiles: CommuteProfile[];
  onSynced: () => void;
};

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
  fontFamily: "var(--font-main)",
};

export default function SyncPanel({ profiles, onSynced }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await syncAll(profiles);
      setResult(r);
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ซิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    setShowKey(true);
    setError(null);
    try {
      await navigator.clipboard.writeText(store.getSyncKey());
    } catch {
      /* แสดงให้ก๊อปเองด้านล่างแทน */
    }
  }

  function pasteKey() {
    const v = prompt("วาง sync key จากเครื่องแรก (จะเปลี่ยนการเชื่อมต่อของเครื่องนี้)");
    if (!v) return;
    const trimmed = v.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      setError("รูปแบบ sync key ไม่ถูกต้อง (ต้องเป็น UUID 36 ตัวอักษร)");
      return;
    }
    store.setSyncKey(trimmed);
    setError(null);
    void run();
  }

  return (
    <section className="search-panel" style={{ marginTop: "28px" }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">CLOUD SYNC</p>
          <h2>ซิงก์ข้ามเครื่อง</h2>
        </div>
        <span className="step-label">05 / ซิงก์</span>
      </div>

      <p className="helper-text" style={{ margin: "0 0 12px 0" }}>
        ข้อมูลหลักอยู่ในเครื่องนี้ การซิงก์เป็นการสำรองขึ้นคลาวด์และดึงของจากเครื่องอื่นมารวม
        ใช้งานได้ปกติแม้ไม่ได้ซิงก์ และยังใช้ได้ตอนเน็ตหลุดบนรถ
      </p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <button type="button" className="primary-button" onClick={run} disabled={busy}>
          {busy ? "กำลังซิงก์..." : "⟳ ซิงก์เดี๋ยวนี้"}
        </button>
        <button type="button" style={btn} onClick={copyKey}>🔑 ก๊อป sync key</button>
        <button type="button" style={btn} onClick={pasteKey}>📱 เชื่อมเครื่องนี้กับ key เดิม</button>
      </div>

      {showKey && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            fontSize: "0.82rem",
            lineHeight: 1.6,
            marginBottom: "12px",
            wordBreak: "break-all",
          }}
        >
          <code>{store.getSyncKey()}</code>
          <br />
          <span style={{ color: "#fbbf24" }}>
            ⚠ key นี้คือสิ่งเดียวที่กันคนอื่นเข้าถึงข้อมูลของคุณ อย่าโพสต์ที่สาธารณะ
            ใครมี key นี้จะเห็น log และเส้นทางทั้งหมด · ถ้าจะแชร์ให้เพื่อน ใช้ปุ่มส่งออกโปรไฟล์ในส่วน 04 แทน
          </span>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "0.85rem", color: "#f87171", margin: "0 0 12px 0", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            fontSize: "0.85rem",
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.35)",
            color: "#34d399",
            lineHeight: 1.6,
          }}
        >
          ซิงก์เสร็จ · ส่งขึ้น {result.pushed} รายการ · ได้ log ใหม่ {result.logsAdded} ·
          โปรไฟล์อัปเดต {result.profilesUpdated} · ค่าโดยสารอัปเดต {result.faresUpdated}
          {result.warnings.map((w, i) => (
            <span key={i} style={{ color: "#fbbf24", display: "block" }}>⚠ {w}</span>
          ))}
        </div>
      )}
    </section>
  );
}
