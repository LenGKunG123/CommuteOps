"use client";
// src/components/ProfileManager.tsx
import { useMemo, useState } from "react";
import { cloneProfile, type CommuteProfile } from "@/lib/routing/catalog";
import {
  deleteProfile, exportBundle, importBundle, isBuiltin, isCustomized, upsertProfile,
} from "@/lib/routing/store";
import ProfileEditor from "./ProfileEditor";

type Props = {
  profiles: CommuteProfile[];
  profile: CommuteProfile;
  onProfilesChanged: (selectId?: string) => void;
};

const box: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
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

export default function ProfileManager({ profiles, profile, onProfilesChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; lines: string[] } | null>(null);

  const stats = useMemo(() => {
    const all = [...profile.morning.routes, ...profile.evening.routes];
    return {
      morning: profile.morning.routes.length,
      evening: profile.evening.routes.length,
      legs: Object.keys(profile.fareLegs).length,
      unverified: all.filter((r) => r.legs.some((l) => l.unverified)).length,
      noFare: Object.values(profile.fareLegs).filter((f) => f.defaultBaht == null).length,
    };
  }, [profile]);

  function handleSave(next: CommuteProfile) {
    upsertProfile(next);
    setEditing(false);
    setMsg({ kind: "ok", lines: ["บันทึกโปรไฟล์แล้ว"] });
    onProfilesChanged(next.id);
  }

  function duplicate() {
    const label = prompt("ชื่อโปรไฟล์ใหม่", `${profile.label} (คัดลอก)`);
    if (!label) return;
    const id = `custom-${Date.now().toString(36)}`;
    upsertProfile(cloneProfile(profile, id, label.slice(0, 200)));
    onProfilesChanged(id);
    setMsg({ kind: "ok", lines: [`สร้าง "${label}" แล้ว แก้ได้เลย`] });
  }

  async function copyExport(includeLogs: boolean) {
    const json = exportBundle(profile, { includeFares: true, includeLogs });
    try {
      await navigator.clipboard.writeText(json);
      setMsg({ kind: "ok", lines: ["คัดลอก JSON ไปคลิปบอร์ดแล้ว ส่งให้เพื่อนวางในช่องนำเข้าได้เลย"] });
    } catch {
      setMsg({ kind: "err", lines: ["คัดลอกอัตโนมัติไม่ได้ (เบราว์เซอร์ไม่อนุญาต) ใช้โหมด JSON ในหน้าแก้ไขแล้วก๊อปเองแทน"] });
    }
  }

  function doImport() {
    const json = prompt("วาง JSON โปรไฟล์ที่ได้รับมา");
    if (!json) return;
    const r = importBundle(json);
    if (!r.ok) {
      setMsg({ kind: "err", lines: r.errors });
      return;
    }
    setMsg({ kind: "ok", lines: ["นำเข้าสำเร็จ", ...r.warnings] });
    onProfilesChanged(r.profileId);
  }

  function reset() {
    const builtin = isBuiltin(profile.id);
    const text = builtin
      ? `คืนค่าตั้งต้นของ "${profile.label}" — การแก้ไขที่บันทึกไว้จะหาย แต่ log ยังอยู่`
      : `ลบโปรไฟล์ "${profile.label}" รวมทั้ง log และค่าโดยสารของโปรไฟล์นี้ ลบแล้วกู้ไม่ได้`;
    if (!confirm(text)) return;
    deleteProfile(profile.id);
    setEditing(false);
    onProfilesChanged();
    setMsg({ kind: "ok", lines: [builtin ? "คืนค่าตั้งต้นแล้ว" : "ลบแล้ว"] });
  }

  return (
    <section className="search-panel" style={{ marginTop: "28px" }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PROFILES & ROUTES</p>
          <h2>โปรไฟล์และเส้นทาง</h2>
        </div>
        <span className="step-label">04 / โปรไฟล์</span>
      </div>

      <div style={{ ...box, marginBottom: "12px", fontSize: "0.85rem", lineHeight: 1.6 }}>
        <strong>{profile.label}</strong>{" "}
        <span style={{ opacity: 0.7 }}>
          ({isBuiltin(profile.id) ? (isCustomized(profile.id) ? "ตั้งต้น · แก้ไขแล้ว" : "ตั้งต้น") : "สร้างเอง"})
        </span>
        <br />
        เส้นทางเช้า {stats.morning} · เย็น {stats.evening} · ค่าโดยสาร {stats.legs} ประเภท
        {stats.unverified > 0 && <span style={{ color: "#fbbf24" }}> · ยังไม่ยืนยัน {stats.unverified} เส้นทาง</span>}
        {stats.noFare > 0 && <span style={{ color: "#fbbf24" }}> · ยังไม่กรอกราคา {stats.noFare} ประเภท</span>}
        <br />
        <span style={{ opacity: 0.7 }}>โปรไฟล์ในเครื่องนี้: {profiles.length} รายการ</span>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <button type="button" className="primary-button" onClick={() => { setEditing((v) => !v); setMsg(null); }}>
          {editing ? "ปิดหน้าแก้ไข" : "✎ แก้เส้นทางและค่าโดยสาร"}
        </button>
        <button type="button" style={btn} onClick={duplicate}>⧉ ทำสำเนา</button>
        <button type="button" style={btn} onClick={() => copyExport(false)}>↗ ส่งออกให้เพื่อน</button>
        <button type="button" style={btn} onClick={() => copyExport(true)}>↗ ส่งออก + log</button>
        <button type="button" style={btn} onClick={doImport}>↙ นำเข้า</button>
        <button
          type="button"
          onClick={reset}
          style={{ ...btn, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#f87171" }}
        >
          {isBuiltin(profile.id) ? "↺ คืนค่าตั้งต้น" : "🗑 ลบโปรไฟล์"}
        </button>
      </div>

      {msg && (
        <p
          style={{
            fontSize: "0.85rem",
            lineHeight: 1.6,
            padding: "10px 14px",
            borderRadius: "10px",
            marginBottom: "12px",
            background: msg.kind === "ok" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${msg.kind === "ok" ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
            color: msg.kind === "ok" ? "#34d399" : "#f87171",
          }}
        >
          {msg.lines.map((l, i) => (<span key={i}>{l}<br /></span>))}
        </p>
      )}

      {editing && (
        <ProfileEditor
          key={profile.id}
          profile={profile}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}
