"use client";

// src/components/CostPlanner.tsx
import { useMemo, useState } from "react";
import {
  BMTA_AC_MONTHLY_PASS,
  BMTA_SOURCE_URL,
  BTS_SOURCE_URL,
  countWeekdays,
  getFare,
  type FareLegId,
  type FareLegMap,
  type FareSettings,
} from "@/lib/routing/fares";
import { planCost, planFareLegs, plansOf, type CommuteProfile } from "@/lib/routing/catalog";
import { bkkMonthOf } from "@/lib/routing/time";
import type { CommuteLog } from "@/lib/routing/types";

type Props = {
  profile: CommuteProfile;
  settings: FareSettings;
  onChange: (next: FareSettings) => void;
  logs: CommuteLog[];
};

const box: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(0,0,0,0.25)",
  color: "inherit",
  fontFamily: "inherit",
};

function currentBkkMonth(): string {
  return bkkMonthOf(new Date().toISOString());
}

function num(v: string, max = 366): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
}

function badgeOf(id: FareLegId, legs: FareLegMap, settings: FareSettings) {
  if (typeof settings.fares[id] === "number") {
    return { text: "กรอกเอง", color: "#fbbf24", bg: "rgba(245,158,11,0.18)" };
  }
  const b = legs[id]?.badge;
  if (b === "official") return { text: "อ้างอิงทางการ", color: "#34d399", bg: "rgba(16,185,129,0.18)" };
  if (b === "user") return { text: "ผู้ใช้แจ้ง", color: "#60a5fa", bg: "rgba(59,130,246,0.18)" };
  return { text: "ยังไม่ได้กรอก", color: "#f87171", bg: "rgba(239,68,68,0.18)" };
}

export default function CostPlanner({ profile, settings, onChange, logs }: Props) {
  const [monthValue, setMonthValue] = useState<string>(currentBkkMonth());

  const legs = profile.fareLegs;
  const legOrder = useMemo(() => Object.keys(legs), [legs]);
  const plans = useMemo(() => plansOf(profile), [profile]);
  const morningPlans = useMemo(() => plans.filter((p) => p.commuteType === "morning"), [plans]);
  const eveningPlans = useMemo(() => plans.filter((p) => p.commuteType === "evening"), [plans]);

  const [year, month0] = useMemo(() => {
    const parts = monthValue.split("-");
    const y = parseInt(parts[0] ?? "", 10);
    const m = parseInt(parts[1] ?? "", 10);
    return [
      Number.isFinite(y) ? y : new Date().getFullYear(),
      Number.isFinite(m) ? m - 1 : new Date().getMonth(),
    ] as const;
  }, [monthValue]);

  const set = (patch: Partial<FareSettings>) => onChange({ ...settings, ...patch });

  const calc = useMemo(() => {
    const weekdays = countWeekdays(year, month0);
    const effDays = Math.max(0, weekdays - settings.offDays);
    const altDays = Math.min(Math.max(0, settings.altEveningDays), effDays);
    const extra = Math.max(0, settings.extraRoundTrips);

    const tally: Record<FareLegId, number> = {};
    const add = (planId: string, times: number) => {
      if (times <= 0) return;
      for (const leg of planFareLegs(planId, profile, settings)) {
        tally[leg] = (tally[leg] ?? 0) + times;
      }
    };
    add(settings.morningPlan, effDays + extra);
    add(settings.eveningPlan, effDays - altDays + extra);
    add(settings.altEveningPlan, altDays);

    let total = 0;
    const unknown: FareLegId[] = [];
    const rows = legOrder
      .filter((id) => (tally[id] ?? 0) > 0)
      .map((id) => {
        const count = tally[id] ?? 0;
        const price = getFare(id, legs, settings);
        if (price == null) unknown.push(id);
        else total += price * count;
        return { id, count, price, sum: price == null ? null : price * count };
      });

    const days = effDays + extra;
    const perDay =
      days > 0
        ? Math.round(
            (planCost(settings.morningPlan, profile, settings).knownBaht +
              planCost(settings.eveningPlan, profile, settings).knownBaht) * 10
          ) / 10
        : 0;

    // เทียบตั๋วรายเดือน: นับทุกขาที่ติดธง monthlyPass ไม่ผูกกับเลขสายใดสายหนึ่ง
    const passLegs = legOrder.filter((id) => legs[id]?.monthlyPass && (tally[id] ?? 0) > 0);
    let bmtaSpend = 0;
    let bmtaTrips = 0;
    let bmtaUnknown = false;
    for (const id of passLegs) {
      const count = tally[id] ?? 0;
      const price = getFare(id, legs, settings);
      bmtaTrips += count;
      if (price == null) bmtaUnknown = true;
      else bmtaSpend += price * count;
    }
    const bmtaAvgFare = bmtaTrips > 0 && bmtaSpend > 0 ? bmtaSpend / bmtaTrips : null;

    return {
      weekdays, effDays, altDays, extra, days, total, unknown, rows, perDay, tally,
      passLegs, bmtaSpend, bmtaTrips, bmtaUnknown, bmtaAvgFare,
    };
  }, [settings, year, month0, profile, legs, legOrder]);

  // ค่าโดยสารจากทริปที่บันทึกไว้จริงในเดือนที่เลือก
  const logged = useMemo(() => {
    const inMonth = logs.filter((l) => bkkMonthOf(l.endedAtIso) === monthValue);
    let total = 0;
    let unknownTrips = 0;
    let counted = 0;
    for (const l of inMonth) {
      if (!plans.some((p) => p.id === l.routeId)) continue;
      counted++;
      const c = planCost(l.routeId, profile, settings);
      total += c.knownBaht;
      if (c.unknown.length > 0) unknownTrips++;
    }
    return { trips: inMonth.length, counted, total, unknownTrips };
  }, [logs, monthValue, settings, profile, plans]);

  const comparison = (list: typeof plans) =>
    list.map((p) => {
      const c = planCost(p.id, profile, settings);
      return { plan: p, perTrip: c.knownBaht, unknown: c.unknown, month: c.knownBaht * calc.days };
    });

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <section className="search-panel" style={{ marginTop: "28px" }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">MONTHLY COMMUTE COST</p>
          <h2>ค่าเดินทางต่อเดือน</h2>
        </div>
        <span className="step-label">03 / ค่าใช้จ่าย</span>
      </div>

      <p style={{ fontSize: "0.82rem", opacity: 0.7, margin: "0 0 14px 0" }}>
        คิดจากโปรไฟล์ <strong>{profile.label}</strong>
      </p>

      {/* 1) เดือนและจำนวนวัน */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
        <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
          เดือน{" "}
          <input
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value || currentBkkMonth())}
            style={inputStyle}
          />
        </label>
        <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
          {monthLabel}: วันจันทร์–ศุกร์ <strong style={{ color: "#f8fafc" }}>{calc.weekdays}</strong> วัน
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px", marginBottom: "14px" }}>
        <label style={{ ...box, fontSize: "0.82rem", color: "#94a3b8" }}>
          วันธรรมดาที่ไม่ได้เดินทาง (นักขัตฤกษ์ / ลา / WFH)
          <input
            type="number"
            min={0}
            value={settings.offDays}
            onChange={(e) => set({ offDays: num(e.target.value, 31) })}
            style={{ ...inputStyle, display: "block", width: "100%", marginTop: "6px" }}
          />
          <small style={{ display: "block", marginTop: "4px", opacity: 0.8 }}>
            แอปไม่มีปฏิทินวันหยุดทางการ ให้ใส่เอง
          </small>
        </label>
        <label style={{ ...box, fontSize: "0.82rem", color: "#94a3b8" }}>
          วันพิเศษที่ต้องเดินทางเพิ่ม (นับเป็นไป-กลับ)
          <input
            type="number"
            min={0}
            value={settings.extraRoundTrips}
            onChange={(e) => set({ extraRoundTrips: num(e.target.value, 62) })}
            style={{ ...inputStyle, display: "block", width: "100%", marginTop: "6px" }}
          />
          <small style={{ display: "block", marginTop: "4px", opacity: 0.8 }}>
            เช่น เสาร์-อาทิตย์ที่ต้องเข้า ใช้แผนเช้า/เย็นหลักด้านล่าง
          </small>
        </label>
      </div>

      {/* 2) แผนที่ใช้ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px", marginBottom: "18px" }}>
        <label style={{ ...box, fontSize: "0.82rem", color: "#94a3b8" }}>
          แผนเช้าหลัก
          <select
            value={settings.morningPlan}
            onChange={(e) => set({ morningPlan: e.target.value })}
            style={{ ...inputStyle, display: "block", width: "100%", marginTop: "6px" }}
          >
            {morningPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        <label style={{ ...box, fontSize: "0.82rem", color: "#94a3b8" }}>
          แผนเย็นหลัก
          <select
            value={settings.eveningPlan}
            onChange={(e) => set({ eveningPlan: e.target.value })}
            style={{ ...inputStyle, display: "block", width: "100%", marginTop: "6px" }}
          >
            {eveningPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        <label style={{ ...box, fontSize: "0.82rem", color: "#94a3b8" }}>
          แผนเย็นสำรอง (วันฝนตก / เหนื่อย)
          <select
            value={settings.altEveningPlan}
            onChange={(e) => set({ altEveningPlan: e.target.value })}
            style={{ ...inputStyle, display: "block", width: "100%", marginTop: "6px" }}
          >
            {eveningPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <span style={{ display: "block", marginTop: "8px" }}>
            ใช้กี่วันในเดือนนี้{" "}
            <input
              type="number"
              min={0}
              value={settings.altEveningDays}
              onChange={(e) => set({ altEveningDays: num(e.target.value, 31) })}
              style={{ ...inputStyle, width: "70px" }}
            />
          </span>
        </label>
      </div>

      {/* 3) สรุปผล */}
      <div className="route-metrics" style={{ marginBottom: "10px" }}>
        <div className="metric-primary">
          <strong>{calc.total.toLocaleString("th-TH")}</strong>
          <span>บาท / เดือน (เฉพาะที่ทราบราคา)</span>
        </div>
        <div className="metric"><span>วันที่เดินทาง</span><strong>{calc.days} วัน</strong></div>
        <div className="metric"><span>ต่อวัน (ไป-กลับ แผนหลัก)</span><strong>{calc.perDay} บาท</strong></div>
        <div className="metric"><span>วันใช้แผนสำรอง</span><strong>{calc.altDays} วัน</strong></div>
      </div>

      {calc.unknown.length > 0 && (
        <p style={{ fontSize: "0.85rem", color: "#fbbf24", margin: "0 0 14px 0", lineHeight: 1.5 }}>
          ⚠ ยอดนี้ยังไม่รวม: {calc.unknown.map((id) => legs[id]?.label ?? id).join(", ")} เพราะยังไม่มีราคา
          กรอกในตารางค่าโดยสารด้านล่างแล้วยอดจะอัปเดตเอง
        </p>
      )}

      {/* 4) แยกตามประเภทค่าโดยสาร */}
      <div style={{ ...box, marginBottom: "18px" }}>
        <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>แยกตามประเภท</strong>
        {calc.rows.length === 0 ? (
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>ไม่มีเที่ยวเดินทางในเดือนนี้</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.86rem" }}>
            {calc.rows.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <span>{legs[r.id]?.label ?? r.id}</span>
                <span style={{ opacity: 0.85 }}>
                  {r.count} เที่ยว × {r.price ?? "?"} ={" "}
                  <strong>{r.sum == null ? "ไม่ทราบ" : `${r.sum.toLocaleString("th-TH")} บาท`}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5) เทียบแผน */}
      <div style={{ ...box, marginBottom: "18px" }}>
        <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
          เทียบแผน ถ้าใช้แผนเดียวทุกเที่ยว (นับ {calc.days} วัน)
        </strong>
        {[
          { title: "ขาเช้า", rows: comparison(morningPlans) },
          { title: "ขากลับเย็น", rows: comparison(eveningPlans) },
        ].map((g) => (
          <div key={g.title} style={{ marginBottom: "8px" }}>
            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "4px" }}>{g.title}</div>
            {g.rows.map((r) => (
              <div
                key={r.plan.id}
                style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", fontSize: "0.85rem", padding: "2px 0" }}
              >
                <span>{r.plan.title}</span>
                <span style={{ opacity: 0.9 }}>
                  {r.perTrip} บาท/เที่ยว · <strong>{r.month.toLocaleString("th-TH")} บาท/เดือน</strong>
                  {r.unknown.length > 0 && <span style={{ color: "#fbbf24" }}> (ไม่รวมที่ยังไม่กรอก)</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
        <small style={{ opacity: 0.7 }}>
          เทียบเฉพาะค่าโดยสาร ไม่รวมเวลาและความแน่น ดูสถิติจริงในส่วน SLO ประกอบ
        </small>
      </div>

      {/* 6) ตั๋วรายเดือน ขสมก. */}
      {calc.passLegs.length > 0 && (
        <div style={{ ...box, marginBottom: "18px", fontSize: "0.85rem", lineHeight: 1.6 }}>
          <strong style={{ display: "block", marginBottom: "4px" }}>เทียบกับตั๋วรายเดือน ขสมก.</strong>
          ตั๋วรายเดือนรถปรับอากาศบนเว็บ ขสมก. ราคา {BMTA_AC_MONTHLY_PASS.toLocaleString("th-TH")} บาท ·
          ค่ารถเมล์ ({calc.passLegs.map((id) => legs[id]?.short ?? id).join(", ")}) เดือนนี้{" "}
          <strong>{calc.bmtaSpend.toLocaleString("th-TH")} บาท</strong> จาก {calc.bmtaTrips} เที่ยว
          {calc.bmtaUnknown && <span style={{ color: "#fbbf24" }}> (ยังไม่รวมขาที่ไม่ได้กรอกราคา)</span>}
          {calc.bmtaAvgFare != null &&
            ` · ถึงจุดคุ้มเมื่อขึ้นประมาณ ${Math.ceil(BMTA_AC_MONTHLY_PASS / calc.bmtaAvgFare)} เที่ยว/เดือน (คิดจากค่าเฉลี่ยที่กรอกไว้)`}
          <br />
          <span style={{ color: "#fbbf24" }}>
            ⚠ หน้าเว็บไม่ระบุวันที่มีผลของราคานี้ และยังไม่ยืนยันว่าตั๋วรายเดือนใช้กับสายทางด่วน
            (ค่าทางด่วนเพิ่ม 2 บาท) ได้หรือไม่ ควรสอบถาม ขสมก. ก่อนซื้อ
          </span>
        </div>
      )}

      {/* 7) ใช้จริงจาก log */}
      <div style={{ ...box, marginBottom: "18px", fontSize: "0.85rem", lineHeight: 1.6 }}>
        <strong style={{ display: "block", marginBottom: "4px" }}>จากทริปที่บันทึกไว้ในเดือนนี้</strong>
        {logged.trips === 0 ? (
          <span style={{ opacity: 0.75 }}>ยังไม่มี log ในเดือนที่เลือก</span>
        ) : (
          <>
            {logged.counted} เที่ยว · ค่าโดยสารรวมประมาณ{" "}
            <strong>{logged.total.toLocaleString("th-TH")} บาท</strong>
            {logged.unknownTrips > 0 && (
              <span style={{ color: "#fbbf24" }}> (มี {logged.unknownTrips} เที่ยวที่ยังไม่รวมค่าที่ไม่ทราบราคา)</span>
            )}
            {logged.trips !== logged.counted && (
              <span style={{ opacity: 0.7 }}> · ข้าม {logged.trips - logged.counted} เที่ยวที่เส้นทางถูกลบ/เปลี่ยนชื่อไปแล้ว</span>
            )}
            <br />
            <span style={{ opacity: 0.7 }}>คิดจากแผนที่กดจับเวลา × ค่าโดยสารที่ตั้งไว้ ไม่ใช่ยอดที่จ่ายจริง</span>
          </>
        )}
      </div>

      {/* 8) ตารางค่าโดยสาร (แก้ได้) */}
      <div style={{ ...box }}>
        <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
          ตารางค่าโดยสาร (แก้เป็นราคาจริงที่จ่ายได้)
        </strong>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {legOrder.map((id) => {
            const leg = legs[id];
            if (!leg) return null;
            const b = badgeOf(id, legs, settings);
            const current = settings.fares[id];
            return (
              <div key={id} style={{ fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>
                    {leg.label}{" "}
                    <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, color: b.color, background: b.bg }}>
                      {b.text}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder={leg.defaultBaht != null ? String(leg.defaultBaht) : "กรอกราคา"}
                      value={typeof current === "number" ? current : ""}
                      onChange={(e) => {
                        const next = { ...settings.fares };
                        const v = parseFloat(e.target.value);
                        if (e.target.value === "" || !Number.isFinite(v) || v < 0) delete next[id];
                        else next[id] = v;
                        set({ fares: next });
                      }}
                      style={{ ...inputStyle, width: "100px" }}
                      aria-label={`ค่าโดยสาร ${leg.label}`}
                    />
                    <span>บาท</span>
                  </span>
                </div>
                <div style={{ opacity: 0.65, marginTop: "2px", lineHeight: 1.45 }}>
                  {leg.source}
                  {leg.sourceUrl && (
                    <>
                      {" "}
                      <a href={leg.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                        ดูแหล่งอ้างอิง
                      </a>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
          <strong style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem" }}>
            ต้องต่อวินช่วงท้ายไหม (รายแผน)
          </strong>
          {!profile.winStep ? (
            <small style={{ opacity: 0.7 }}>โปรไฟล์นี้ยังไม่ได้ตั้งค่าขาวิน (winStep)</small>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.84rem" }}>
              {plans.map((p) => {
                const on = settings.winPlans[p.id] ?? p.defaultWin;
                return (
                  <label key={p.id} style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => set({ winPlans: { ...settings.winPlans, [p.id]: e.target.checked } })}
                    />
                    {p.title}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.75rem", opacity: 0.65, margin: "12px 0 0 0", lineHeight: 1.5 }}>
        แหล่งอ้างอิงทางการ:{" "}
        <a href={BMTA_SOURCE_URL} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
          ขสมก. (ค่าโดยสารรถปรับอากาศ, ตั๋วรายเดือน)
        </a>{" "}
        ·{" "}
        <a href={BTS_SOURCE_URL} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
          BTS (เส้นทางและอัตราค่าโดยสาร)
        </a>
        . อัตราค่าโดยสารอาจเปลี่ยนแปลง ควรเช็กกับต้นทางก่อนตัดสินใจ
      </p>
    </section>
  );
}
