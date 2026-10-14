"use client";
// src/components/ProfileEditor.tsx
// แก้โปรไฟล์ด้วยฟอร์ม ไม่ต้องเขียน JSON (ยังมีโหมด JSON ไว้สำหรับคนที่อยากแก้เร็ว)
import { useState } from "react";
import {
  legOf, validateProfile,
  type CommuteProfile, type CommuteType, type Leg, type RouteTemplate,
} from "@/lib/routing/catalog";
import type { FareLegDef } from "@/lib/routing/fares";
import StopFinder from "./StopFinder";

type Props = {
  profile: CommuteProfile;
  onSave: (next: CommuteProfile) => void;
  onClose: () => void;
};

const box: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const input: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(0,0,0,0.3)",
  color: "inherit",
  fontFamily: "var(--font-main)",
  fontSize: "0.85rem",
};

const btn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 600,
  fontFamily: "var(--font-main)",
};

const btnDanger: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(239,68,68,0.4)",
  background: "rgba(239,68,68,0.12)",
  color: "#f87171",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.76rem",
  color: "#94a3b8",
  fontWeight: 600,
  marginBottom: "3px",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", flex: "1 1 150px", minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const emptyLeg = (): Leg => ({ text: "", mode: "WALK", minutes: 5 });

const emptyRoute = (n: number): RouteTemplate => ({
  id: `route-${Date.now().toString(36)}`,
  title: `เส้นทางใหม่ ${n}`,
  mode: "",
  description: "",
  transfers: 0,
  fareLegs: [],
  defaultWin: false,
  legs: [emptyLeg()],
});

const emptyFareLeg = (): FareLegDef => ({
  label: "ค่าโดยสารใหม่",
  short: "ใหม่",
  defaultBaht: null,
  badge: "unset",
  source: "ยังไม่ระบุแหล่งที่มา",
});

export default function ProfileEditor({ profile, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CommuteProfile>(() => structuredClone(profile));
  const [tab, setTab] = useState<CommuteType>("morning");
  const [openRoute, setOpenRoute] = useState<number | null>(0);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // แก้ draft แบบ immutable ด้วยการ clone ทั้งก้อน อ่านง่ายกว่าเขียน lens
  const edit = (fn: (d: CommuteProfile) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setErrors([]);
  };

  const leg = legOf(draft, tab);
  const routes = leg.routes;

  const editRoute = (ri: number, patch: Partial<RouteTemplate>) =>
    edit((d) => {
      const r = legOf(d, tab).routes[ri];
      if (r) Object.assign(r, patch);
    });

  const editLegRow = (ri: number, li: number, patch: Partial<Leg>) =>
    edit((d) => {
      const l = legOf(d, tab).routes[ri]?.legs[li];
      if (l) Object.assign(l, patch);
    });

  const move = <T,>(arr: T[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const a = arr[i];
    const b = arr[j];
    if (a === undefined || b === undefined) return;
    arr[i] = b;
    arr[j] = a;
  };

  const baseMinutes = (r: RouteTemplate) => r.legs.reduce((s, l) => s + l.minutes, 0);

  function save() {
    const result = validateProfile(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSave(result.profile);
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      const result = validateProfile(parsed);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setDraft(result.profile);
      setShowJson(false);
      setErrors([]);
    } catch {
      setErrors(["JSON ไม่ถูกต้อง"]);
    }
  }

  return (
    <div style={{ ...box, marginTop: "12px" }}>
      {/* ===== ข้อมูลโปรไฟล์ ===== */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
        <Field label="ชื่อโปรไฟล์">
          <input
            value={draft.label}
            onChange={(e) => edit((d) => { d.label = e.target.value; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
        <Field label="หมายเหตุ (แสดงบนหน้าแรก)">
          <input
            value={draft.note ?? ""}
            onChange={(e) => edit((d) => { d.note = e.target.value; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
        <Field label="SLO เช้า ≤ (นาที)">
          <input
            type="number" min={10} max={600}
            value={draft.slo.morning}
            onChange={(e) => edit((d) => { d.slo.morning = Number(e.target.value) || 0; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
        <Field label="SLO เย็น ≤ (นาที)">
          <input
            type="number" min={10} max={600}
            value={draft.slo.evening}
            onChange={(e) => edit((d) => { d.slo.evening = Number(e.target.value) || 0; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
        <Field label="เป้า SLO (%)">
          <input
            type="number" min={1} max={100}
            value={draft.slo.targetPercent}
            onChange={(e) => edit((d) => { d.slo.targetPercent = Number(e.target.value) || 0; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
        <Field label="เวลาเผื่อตอนบอกเวลาออก (นาที)">
          <input
            type="number" min={0} max={120}
            value={draft.departBufferMinutes}
            onChange={(e) => edit((d) => { d.departBufferMinutes = Number(e.target.value) || 0; })}
            style={{ ...input, width: "100%" }}
          />
        </Field>
      </div>

      {/* ===== แท็บ เช้า / เย็น ===== */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {(["morning", "evening"] as CommuteType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setOpenRoute(0); }}
            style={{
              ...btn,
              flex: 1,
              background: tab === t ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)",
              border: tab === t ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {t === "morning" ? "☀ ขาไป (เช้า)" : "☾ ขากลับ (เย็น)"}
          </button>
        ))}
      </div>

      {/* ===== ต้นทาง / ปลายทาง ===== */}
      <div style={{ ...box, marginBottom: "12px" }}>
        <strong style={{ fontSize: "0.88rem", display: "block", marginBottom: "8px" }}>
          ต้นทาง → ปลายทาง
        </strong>
        {(["origin", "destination"] as const).map((which) => {
          const place = which === "origin" ? leg.origin : leg.destination;
          return (
            <div key={which} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Field label={which === "origin" ? "ชื่อต้นทาง" : "ชื่อปลายทาง"}>
                  <input
                    value={place.name}
                    onChange={(e) => edit((d) => { legOf(d, tab)[which].name = e.target.value; })}
                    style={{ ...input, width: "100%" }}
                  />
                </Field>
                <Field label="ละติจูด">
                  <input
                    type="number" step="0.00001"
                    value={place.lat}
                    onChange={(e) => edit((d) => { legOf(d, tab)[which].lat = Number(e.target.value); })}
                    style={{ ...input, width: "100%" }}
                  />
                </Field>
                <Field label="ลองจิจูด">
                  <input
                    type="number" step="0.00001"
                    value={place.lon}
                    onChange={(e) => edit((d) => { legOf(d, tab)[which].lon = Number(e.target.value); })}
                    style={{ ...input, width: "100%" }}
                  />
                </Field>
              </div>
              <p style={{ fontSize: "0.76rem", opacity: 0.6, margin: "4px 0 6px 0" }}>
                หาพิกัดจาก Google Maps: คลิกขวาบนแผนที่ → ตัวเลขชุดแรกคือ lat ชุดที่สองคือ lon
              </p>
              <StopFinder lat={place.lat} lon={place.lon} label={place.name || "จุดนี้"} />
            </div>
          );
        })}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Field label="เวลาที่ต้องถึง (ค่าตั้งต้น)">
            <input
              type="time"
              value={leg.defaultArriveBy}
              onChange={(e) => edit((d) => { legOf(d, tab).defaultArriveBy = e.target.value; })}
              style={{ ...input, width: "100%" }}
            />
          </Field>
          <Field label="ช่วงเวลารอรถปกติ (ข้อความ)">
            <input
              value={leg.waitWindow}
              onChange={(e) => edit((d) => { legOf(d, tab).waitWindow = e.target.value; })}
              placeholder="06:40–07:00"
              style={{ ...input, width: "100%" }}
            />
          </Field>
        </div>
      </div>

      {/* ===== เส้นทาง ===== */}
      <strong style={{ fontSize: "0.88rem", display: "block", marginBottom: "8px" }}>
        เส้นทาง ({routes.length})
      </strong>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        {routes.map((r, ri) => {
          const isOpen = openRoute === ri;
          return (
            <div key={r.id} style={{ ...box, background: "rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setOpenRoute(isOpen ? null : ri)}
                  style={{ ...btn, flex: "1 1 180px", textAlign: "left" }}
                >
                  {isOpen ? "▾" : "▸"} {r.title || "(ไม่มีชื่อ)"}{" "}
                  <span style={{ opacity: 0.7, fontWeight: 400 }}>
                    · {r.legs.length} ขา · ฐาน {baseMinutes(r)} นาที
                  </span>
                </button>
                <button type="button" style={btn} onClick={() => edit((d) => move(legOf(d, tab).routes, ri, -1))} aria-label="เลื่อนขึ้น">↑</button>
                <button type="button" style={btn} onClick={() => edit((d) => move(legOf(d, tab).routes, ri, 1))} aria-label="เลื่อนลง">↓</button>
                <button
                  type="button"
                  style={btnDanger}
                  onClick={() => {
                    if (!confirm(`ลบเส้นทาง "${r.title}" ออกจากโปรไฟล์ (log เก่าของเส้นทางนี้จะยังอยู่แต่ไม่ถูกคิดค่าโดยสาร)`)) return;
                    edit((d) => { legOf(d, tab).routes.splice(ri, 1); });
                    setOpenRoute(null);
                  }}
                >
                  ลบ
                </button>
              </div>

              {isOpen && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <Field label="ชื่อเส้นทาง">
                      <input value={r.title} onChange={(e) => editRoute(ri, { title: e.target.value })} style={{ ...input, width: "100%" }} />
                    </Field>
                    <Field label="ประเภท (เช่น รถเมล์ทางด่วน + BTS)">
                      <input value={r.mode} onChange={(e) => editRoute(ri, { mode: e.target.value })} style={{ ...input, width: "100%" }} />
                    </Field>
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <span style={labelStyle}>คำอธิบาย / ข้อควรรู้</span>
                    <textarea
                      value={r.description}
                      onChange={(e) => editRoute(ri, { description: e.target.value })}
                      rows={2}
                      style={{ ...input, width: "100%", resize: "vertical" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <Field label="ป้ายกำกับสั้น (เช่น ต่อเดียว)">
                      <input value={r.tag ?? ""} onChange={(e) => editRoute(ri, { tag: e.target.value })} style={{ ...input, width: "100%" }} />
                    </Field>
                    <Field label="จำนวนครั้งที่ต่อรถ">
                      <input
                        type="number" min={0} max={10}
                        value={r.transfers}
                        onChange={(e) => editRoute(ri, { transfers: Number(e.target.value) || 0 })}
                        style={{ ...input, width: "100%" }}
                      />
                    </Field>
                  </div>

                  {/* ค่าโดยสารที่ใช้ */}
                  <div style={{ marginBottom: "12px" }}>
                    <span style={labelStyle}>ค่าโดยสารที่ต้องจ่ายในเส้นทางนี้ (ติ๊กได้หลายอย่าง)</span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {Object.entries(draft.fareLegs).map(([id, def]) => (
                        <label
                          key={id}
                          style={{
                            display: "flex", gap: "6px", alignItems: "center", cursor: "pointer",
                            padding: "4px 10px", borderRadius: "999px", fontSize: "0.8rem",
                            border: r.fareLegs.includes(id) ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.18)",
                            background: r.fareLegs.includes(id) ? "rgba(59,130,246,0.2)" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={r.fareLegs.includes(id)}
                            onChange={(e) =>
                              editRoute(ri, {
                                fareLegs: e.target.checked
                                  ? [...r.fareLegs, id]
                                  : r.fareLegs.filter((x) => x !== id),
                              })
                            }
                          />
                          {def.short}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ขั้นตอน */}
                  <span style={labelStyle}>ขั้นตอนการเดินทาง ({r.legs.length} ขา)</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {r.legs.map((l, li) => (
                      <div
                        key={li}
                        style={{
                          padding: "10px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.04)",
                          border: l.unverified ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ fontSize: "0.78rem", opacity: 0.7, minWidth: "20px" }}>{li + 1}.</span>
                          <input
                            value={l.text}
                            onChange={(e) => editLegRow(ri, li, { text: e.target.value })}
                            placeholder="เช่น รอสาย 21E ที่ป้ายหน้า {origin}"
                            style={{ ...input, flex: 1, minWidth: 0 }}
                          />
                          <button type="button" style={btn} onClick={() => edit((d) => { const rr = legOf(d, tab).routes[ri]; if (rr) move(rr.legs, li, -1); })} aria-label="เลื่อนขึ้น">↑</button>
                          <button type="button" style={btn} onClick={() => edit((d) => { const rr = legOf(d, tab).routes[ri]; if (rr) move(rr.legs, li, 1); })} aria-label="เลื่อนลง">↓</button>
                          <button
                            type="button"
                            style={btnDanger}
                            onClick={() => edit((d) => { legOf(d, tab).routes[ri]?.legs.splice(li, 1); })}
                            aria-label="ลบขานี้"
                          >
                            ✕
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
                          <Field label="นาที">
                            <input
                              type="number" min={0} max={600}
                              value={l.minutes}
                              onChange={(e) => editLegRow(ri, li, { minutes: Number(e.target.value) || 0 })}
                              style={{ ...input, width: "100%" }}
                            />
                          </Field>
                          <Field label="ประเภท">
                            <select
                              value={l.mode}
                              onChange={(e) => editLegRow(ri, li, { mode: e.target.value === "TRANSIT" ? "TRANSIT" : "WALK" })}
                              style={{ ...input, width: "100%" }}
                            >
                              <option value="WALK">เดิน / รอ</option>
                              <option value="TRANSIT">นั่งรถ</option>
                            </select>
                          </Field>
                          <Field label="สายรถ (ถ้ามี)">
                            <input
                              value={l.line ?? ""}
                              onChange={(e) => editLegRow(ri, li, { line: e.target.value })}
                              placeholder="21E"
                              style={{ ...input, width: "100%" }}
                            />
                          </Field>
                        </div>

                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px", fontSize: "0.8rem" }}>
                          <label style={{ display: "flex", gap: "5px", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(l.wait)}
                              onChange={(e) => editLegRow(ri, li, { wait: e.target.checked })}
                            />
                            ขานี้คือรอรถ
                          </label>
                          <label style={{ display: "flex", gap: "5px", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(l.traffic)}
                              onChange={(e) => editLegRow(ri, li, { traffic: e.target.checked })}
                            />
                            วิ่งบนถนน (เจอรถติด)
                          </label>
                          <label style={{ display: "flex", gap: "5px", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(l.unverified)}
                              onChange={(e) => editLegRow(ri, li, { unverified: e.target.checked })}
                            />
                            ยังไม่ยืนยัน
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    style={{ ...btn, marginTop: "8px" }}
                    onClick={() => edit((d) => { legOf(d, tab).routes[ri]?.legs.push(emptyLeg()); })}
                  >
                    ＋ เพิ่มขั้นตอน
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        style={{ ...btn, marginBottom: "16px" }}
        onClick={() =>
          edit((d) => {
            const list = legOf(d, tab).routes;
            list.push(emptyRoute(list.length + 1));
          })
        }
      >
        ＋ เพิ่มเส้นทางใหม่
      </button>

      {/* ===== ค่าโดยสาร ===== */}
      <div style={{ ...box, marginBottom: "14px" }}>
        <strong style={{ fontSize: "0.88rem", display: "block", marginBottom: "8px" }}>
          ประเภทค่าโดยสารในโปรไฟล์นี้
        </strong>
        <p style={{ fontSize: "0.78rem", opacity: 0.65, margin: "0 0 10px 0", lineHeight: 1.5 }}>
          เว้นราคาว่างไว้ถ้ายังไม่รู้ ระบบจะแสดงว่า &quot;ยังไม่กรอก&quot; แทนที่จะเดาตัวเลขให้
        </p>
        {Object.entries(draft.fareLegs).map(([id, def]) => (
          <div key={id} style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px dashed rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Field label="ชื่อเต็ม">
                <input
                  value={def.label}
                  onChange={(e) => edit((d) => { const f = d.fareLegs[id]; if (f) f.label = e.target.value; })}
                  style={{ ...input, width: "100%" }}
                />
              </Field>
              <Field label="ชื่อสั้น">
                <input
                  value={def.short}
                  onChange={(e) => edit((d) => { const f = d.fareLegs[id]; if (f) f.short = e.target.value; })}
                  style={{ ...input, width: "100%" }}
                />
              </Field>
              <Field label="ราคา (บาท)">
                <input
                  type="number" min={0} step="0.5"
                  value={def.defaultBaht ?? ""}
                  placeholder="ยังไม่รู้"
                  onChange={(e) =>
                    edit((d) => {
                      const f = d.fareLegs[id];
                      if (!f) return;
                      const v = parseFloat(e.target.value);
                      f.defaultBaht = e.target.value === "" || !Number.isFinite(v) ? null : v;
                    })
                  }
                  style={{ ...input, width: "100%" }}
                />
              </Field>
              <Field label="ที่มาของราคา">
                <select
                  value={def.badge}
                  onChange={(e) =>
                    edit((d) => {
                      const f = d.fareLegs[id];
                      if (f) f.badge = e.target.value as FareLegDef["badge"];
                    })
                  }
                  style={{ ...input, width: "100%" }}
                >
                  <option value="unset">ยังไม่ยืนยัน</option>
                  <option value="user">ผู้ใช้แจ้ง</option>
                  <option value="official">อ้างอิงทางการ</option>
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginTop: "8px" }}>
              <Field label="อธิบายที่มา">
                <input
                  value={def.source}
                  onChange={(e) => edit((d) => { const f = d.fareLegs[id]; if (f) f.source = e.target.value; })}
                  style={{ ...input, width: "100%" }}
                />
              </Field>
              <label style={{ display: "flex", gap: "5px", alignItems: "center", fontSize: "0.8rem", cursor: "pointer", paddingBottom: "8px" }}>
                <input
                  type="checkbox"
                  checked={Boolean(def.monthlyPass)}
                  onChange={(e) => edit((d) => { const f = d.fareLegs[id]; if (f) f.monthlyPass = e.target.checked; })}
                />
                นับรวมตั๋วเดือน ขสมก.
              </label>
              <button
                type="button"
                style={{ ...btnDanger, marginBottom: "6px" }}
                onClick={() => {
                  const used = [...draft.morning.routes, ...draft.evening.routes].filter((r) => r.fareLegs.includes(id));
                  if (used.length > 0) {
                    alert(`ลบไม่ได้ ยังมี ${used.length} เส้นทางใช้ค่าโดยสารนี้อยู่ (${used.map((r) => r.title).join(", ")})`);
                    return;
                  }
                  edit((d) => { delete d.fareLegs[id]; });
                }}
              >
                ลบ
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          style={btn}
          onClick={() => edit((d) => { d.fareLegs[`fare-${Date.now().toString(36)}`] = emptyFareLeg(); })}
        >
          ＋ เพิ่มประเภทค่าโดยสาร
        </button>
      </div>

      {/* ===== ข้อผิดพลาด ===== */}
      {errors.length > 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#f87171",
            fontSize: "0.84rem",
            lineHeight: 1.6,
            marginBottom: "12px",
          }}
        >
          <strong>บันทึกไม่ได้:</strong>
          <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px" }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ===== ปุ่มล่าง ===== */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" className="primary-button" onClick={save}>บันทึกโปรไฟล์</button>
        <button type="button" style={btn} onClick={onClose}>ยกเลิก</button>
        <button
          type="button"
          style={btn}
          onClick={() => {
            setJsonText(JSON.stringify(draft, null, 2));
            setShowJson((v) => !v);
          }}
        >
          {showJson ? "ซ่อนโหมด JSON" : "โหมด JSON (ขั้นสูง)"}
        </button>
      </div>

      {showJson && (
        <div style={{ marginTop: "12px" }}>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            aria-label="แก้ไขโปรไฟล์เป็น JSON"
            style={{
              width: "100%",
              minHeight: "260px",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.35)",
              color: "#e2e8f0",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.76rem",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <button type="button" style={{ ...btn, marginTop: "8px" }} onClick={applyJson}>
            ใช้ค่าจาก JSON นี้
          </button>
        </div>
      )}
    </div>
  );
}
