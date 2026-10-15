"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActiveTrip,
  CommuteLog,
  ConditionsResponse,
  CrowdLevel,
  RouteOption,
} from "@/lib/routing/types";
import CostPlanner from "@/components/CostPlanner";
import ProfileManager from "@/components/ProfileManager";
import SyncPanel from "@/components/SyncPanel";
import { buildRouteOption, legOf, type CommuteProfile, type CommuteType } from "@/lib/routing/catalog";
import { calculateTraffic } from "@/lib/routing/traffic";
import type { FareSettings } from "@/lib/routing/fares";
import { bkkHourOf, formatHhMm, parseHhMm, percentile } from "@/lib/routing/time";
import * as store from "@/lib/routing/store";
import Link from "next/link";

const CROWD_LABELS: Record<CrowdLevel, string> = {
  1: "ว่าง / ได้นั่ง",
  2: "ยืนสบาย",
  3: "อัดแน่น",
};

type PendingFinish = {
  trip: ActiveTrip;
  endedAtIso: string;
  actualMinutes: number;
};

// ต้องมี log กี่ครั้งถึงเชื่อ p80 แทนค่าประมาณ
const MIN_P80_SAMPLES = 4;

// ยังไม่ยืนยัน deep link ของ ViaBus แก้จุดเดียวที่นี่
const VIABUS_URL = "https://www.viabus.co/";

function gmapsTransitUrl(orig: string, dest: string): string {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}` +
    "&travelmode=transit"
  );
}

// สรุปเวลารอเฉลี่ยจริงต่อเส้นทาง ใช้แทนค่าเดาเมื่อมีข้อมูลพอ
function buildWaitOverrides(list: CommuteLog[]): Record<string, { avgWait: number; samples: number }> {
  const acc: Record<string, number[]> = {};
  for (const l of list) {
    if (l.waitMinutesActual != null) (acc[l.routeId] ??= []).push(l.waitMinutesActual);
  }
  const out: Record<string, { avgWait: number; samples: number }> = {};
  for (const [id, arr] of Object.entries(acc)) {
    out[id] = { avgWait: arr.reduce((a, b) => a + b, 0) / arr.length, samples: arr.length };
  }
  return out;
}

function sloLimit(profile: CommuteProfile, type: CommuteType): number {
  return type === "morning" ? profile.slo.morning : profile.slo.evening;
}

export default function Home() {
  const [profiles, setProfiles] = useState<CommuteProfile[]>([]);
  const [profile, setProfile] = useState<CommuteProfile | null>(null);
  const [commuteType, setCommuteType] = useState<CommuteType>("morning");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [arriveBy, setArriveBy] = useState("09:00");
  const [priority, setPriority] = useState("balanced");
  const [bus21eDelayed, setBus21eDelayed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<ConditionsResponse | null>(null);

  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [logs, setLogs] = useState<CommuteLog[]>([]);
  const [fareSettings, setFareSettings] = useState<FareSettings | null>(null);
  const [manualMinutesInput, setManualMinutesInput] = useState<Record<string, string>>({});
  const [manualWaitInput, setManualWaitInput] = useState<Record<string, string>>({});
  const [manualCrowdInput, setManualCrowdInput] = useState<Record<string, CrowdLevel | undefined>>({});
  const [pendingFinish, setPendingFinish] = useState<PendingFinish | null>(null);
  const [finishWait, setFinishWait] = useState("");
  const [finishCrowd, setFinishCrowd] = useState<CrowdLevel | undefined>(undefined);

  // ===== ดึงอากาศ + จราจรสดจากเซิร์ฟเวอร์ =====
  const fetchConditions = useCallback(async (p: CommuteProfile, type: CommuteType) => {
    const leg = legOf(p, type);
    setLoading(true);
    try {
      const res = await fetch("/api/conditions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: leg.origin, destination: leg.destination }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConditions((await res.json()) as ConditionsResponse);
    } catch (e) {
      console.error("ดึงสภาพการเดินทางไม่ได้", e);
      setConditions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ===== สลับโปรไฟล์ / สลับช่วงเช้า-เย็น =====
  const activateProfile = useCallback(
    (p: CommuteProfile, type: CommuteType = "morning") => {
      const leg = legOf(p, type);
      // คำนวณ SLO ใหม่ด้วยเกณฑ์ของโปรไฟล์ปัจจุบัน
      const loaded = store.loadLogs(p.id).map((l) => ({
        ...l,
        metSlo: l.actualMinutes <= sloLimit(p, l.commuteType),
      }));

      setProfile(p);
      setCommuteType(type);
      setOrigin(leg.origin.name);
      setDestination(leg.destination.name);
      setArriveBy(leg.defaultArriveBy);
      setLogs(loaded);
      setActiveTrip(store.loadTrip(p.id));
      setFareSettings(store.loadFares(p));
      setExpandedId(null);
      setPendingFinish(null);
      setBus21eDelayed(false);
      store.setActiveProfileId(p.id);
      void fetchConditions(p, type);
    },
    [fetchConditions]
  );

  const reloadProfiles = useCallback(
    (selectId?: string) => {
      const list = store.listProfiles();
      setProfiles(list);
      const wanted = selectId ?? profile?.id ?? store.getActiveProfileId();
      const next = list.find((p) => p.id === wanted) ?? list[0];
      if (next) activateProfile(next, commuteType);
    },
    [activateProfile, commuteType, profile?.id]
  );

  useEffect(() => {
    store.migrateLegacy();
    const list = store.listProfiles();
    setProfiles(list);
    const id = store.getActiveProfileId();
    const start = list.find((p) => p.id === id) ?? list[0];
    if (start) activateProfile(start, "morning");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeTrip) {
      setElapsedMinutes(0);
      return;
    }
    const updateTimer = () => {
      const startMs = new Date(activeTrip.startedAtIso).getTime();
      setElapsedMinutes(Math.max(0, Math.round((Date.now() - startMs) / 60000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 15000);
    return () => clearInterval(interval);
  }, [activeTrip]);

  // ===== ตัวคูณจราจร + ประกอบเส้นทาง (ทำฝั่งเบราว์เซอร์) =====
  const traffic = useMemo(
    () =>
      profile
        ? calculateTraffic(
            profile.trafficTuning,
            conditions?.weather.isRaining ?? false,
            conditions?.liveTraffic ?? null
          )
        : null,
    [profile, conditions]
  );

  const builtRoutes = useMemo(() => {
    if (!profile || !fareSettings || !traffic) return [];
    const leg = legOf(profile, commuteType);
    const overrides = buildWaitOverrides(logs);
    return leg.routes.map((t) =>
      buildRouteOption(t, {
        originName: origin.trim() || leg.origin.name,
        destinationName: destination.trim() || leg.destination.name,
        multiplier: traffic.multiplier,
        bus21eDelayed,
        waitOverride: overrides[t.id],
        profile,
        fareSettings,
      })
    );
  }, [profile, fareSettings, traffic, logs, commuteType, origin, destination, bus21eDelayed]);

  const routes = useMemo(() => {
    const list = [...builtRoutes];
    if (priority === "fastest") return list.sort((a, b) => a.duration - b.duration);
    if (priority === "less-walking") return list.sort((a, b) => a.walk - b.walk);
    if (priority === "few-transfers") return list.sort((a, b) => a.transfers - b.transfers);
    return list.sort(
      (a, b) =>
        a.transfers * 1.2 + a.walk / 8 + a.duration / 45 -
        (b.transfers * 1.2 + b.walk / 8 + b.duration / 45)
    );
  }, [builtRoutes, priority]);

  const observabilityStats = useMemo(() => {
    if (logs.length === 0) return null;
    const total = logs.length;
    const sloPassed = logs.filter((l) => l.metSlo).length;
    return {
      total,
      sloRate: Math.round((sloPassed / total) * 100),
      avgActual: Math.round(logs.reduce((acc, l) => acc + l.actualMinutes, 0) / total),
      avgDiff: Math.round(logs.reduce((acc, l) => acc + l.diffMinutes, 0) / total),
    };
  }, [logs]);

  const routeStats = useMemo(() => {
    const groups = new Map<string, CommuteLog[]>();
    for (const l of logs) {
      const key = `${l.commuteType}|${l.routeId}`;
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    }
    const avg = (nums: number[]): number | null =>
      nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;

    return Array.from(groups.entries())
      .flatMap(([key, g]) => {
        const first = g[0];
        if (!first) return [];
        return [{
          key,
          routeTitle: first.routeTitle,
          commuteType: first.commuteType,
          count: g.length,
          avgActual: avg(g.map((l) => l.actualMinutes)),
          avgWait: avg(g.flatMap((l) => (l.waitMinutesActual != null ? [l.waitMinutesActual] : []))),
          waitSamples: g.filter((l) => l.waitMinutesActual != null).length,
          avgCrowd: avg(g.flatMap((l) => (l.crowdLevel != null ? [l.crowdLevel] : []))),
          crowdSamples: g.filter((l) => l.crowdLevel != null).length,
        }];
      })
      .sort((a, b) => b.count - a.count);
  }, [logs]);

  const p80ByRoute = useMemo(() => {
    const acc: Record<string, number[]> = {};
    for (const l of logs) (acc[l.routeId] ??= []).push(l.actualMinutes);
    const out: Record<string, { p80: number; samples: number }> = {};
    for (const [id, arr] of Object.entries(acc)) {
      const p = percentile(arr, 80);
      if (p != null) out[id] = { p80: p, samples: arr.length };
    }
    return out;
  }, [logs]);

  const weatherInfo = useMemo(() => {
    const w = conditions?.weather;
    if (!w) return { icon: "⛅", label: "กำลังตรวจสอบ...", color: "#94a3b8" };
    if (w.isRaining) return { icon: "🌧", label: "มีฝนตก / ทางเปียก", color: "#60a5fa" };
    if (w.rainProbability >= 60) return { icon: "⛈", label: "โอกาสฝนตกสูง", color: "#f87171" };
    return { icon: "☀️", label: "อากาศโปร่ง / เหมาะแก่การเดินทาง", color: "#fbbf24" };
  }, [conditions]);

  // ===== actions =====
  function chooseCommute(type: CommuteType) {
    if (profile) activateProfile(profile, type);
  }

  function switchProfile(id: string) {
    const next = profiles.find((p) => p.id === id);
    if (next) activateProfile(next, "morning");
  }

  function refreshConditions() {
    if (profile) void fetchConditions(profile, commuteType);
  }

  function toggle21eDelay() {
    setBus21eDelayed((v) => !v);
  }

  function updateFareSettings(next: FareSettings) {
    if (!profile) return;
    setFareSettings(next);
    store.saveFares(profile.id, next);
  }

  function swapLocations() {
    setOrigin(destination);
    setDestination(origin);
  }

  function toggleSaved(id: string) {
    setSaved((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function persistLogs(next: CommuteLog[]) {
    setLogs(next);
    if (profile) store.saveLogs(profile.id, next);
  }

  function startTripTimer(route: RouteOption) {
    if (!profile) return;
    const trip: ActiveTrip = {
      routeId: route.id,
      routeTitle: route.title,
      commuteType,
      origin,
      destination,
      startedAtIso: new Date().toISOString(),
      estimatedMinutes: route.duration,
    };
    setActiveTrip(trip);
    store.saveTrip(profile.id, trip);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelActiveTrip() {
    setActiveTrip(null);
    if (profile) store.saveTrip(profile.id, null);
  }

  function finishActiveTrip() {
    if (!activeTrip) return;
    const endDate = new Date();
    const startMs = new Date(activeTrip.startedAtIso).getTime();
    const actualMins = Math.max(1, Math.round((endDate.getTime() - startMs) / 60000));
    setFinishWait("");
    setFinishCrowd(undefined);
    setPendingFinish({ trip: activeTrip, endedAtIso: endDate.toISOString(), actualMinutes: actualMins });
  }

  function confirmFinish(skip: boolean) {
    if (!pendingFinish) return;
    const { trip, endedAtIso, actualMinutes } = pendingFinish;
    const waitParsed = parseInt(finishWait, 10);
    saveTripLog({
      routeId: trip.routeId,
      routeTitle: trip.routeTitle,
      commuteType: trip.commuteType,
      origin: trip.origin,
      destination: trip.destination,
      startedAtIso: trip.startedAtIso,
      endedAtIso,
      actualMinutes,
      estimatedMinutes: trip.estimatedMinutes,
      waitMinutesActual:
        !skip && Number.isFinite(waitParsed) && waitParsed >= 0 && waitParsed <= 120
          ? waitParsed
          : undefined,
      crowdLevel: skip ? undefined : finishCrowd,
    });
    setPendingFinish(null);
    setActiveTrip(null);
    if (profile) store.saveTrip(profile.id, null);
  }

  function logManualTrip(route: RouteOption) {
    const actualMins = parseInt(manualMinutesInput[route.id] || "", 10);
    if (Number.isNaN(actualMins) || actualMins <= 0 || actualMins > 300) {
      alert("กรุณากรอกเวลาเดินทางจริงเป็นตัวเลขนาที (1–300 นาที)");
      return;
    }
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - actualMins * 60000);
    const w = parseInt(manualWaitInput[route.id] || "", 10);
    saveTripLog({
      routeId: route.id,
      routeTitle: route.title,
      commuteType,
      origin,
      destination,
      startedAtIso: startDate.toISOString(),
      endedAtIso: endDate.toISOString(),
      actualMinutes: actualMins,
      estimatedMinutes: route.duration,
      waitMinutesActual: Number.isFinite(w) && w >= 0 && w <= 120 ? w : undefined,
      crowdLevel: manualCrowdInput[route.id],
    });
    setManualMinutesInput((prev) => ({ ...prev, [route.id]: "" }));
    setManualWaitInput((prev) => ({ ...prev, [route.id]: "" }));
    setManualCrowdInput((prev) => ({ ...prev, [route.id]: undefined }));
  }

  function saveTripLog(params: {
    routeId: string;
    routeTitle: string;
    commuteType: CommuteType;
    origin: string;
    destination: string;
    startedAtIso: string;
    endedAtIso: string;
    actualMinutes: number;
    estimatedMinutes: number;
    waitMinutesActual?: number;
    crowdLevel?: CrowdLevel;
  }) {
    if (!profile) return;
    const endDate = new Date(params.endedAtIso);
    const newLog: CommuteLog = {
      id: `log-${Date.now()}`,
      dateStr: endDate.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      commuteType: params.commuteType,
      routeId: params.routeId,
      routeTitle: params.routeTitle,
      origin: params.origin,
      destination: params.destination,
      startedAtIso: params.startedAtIso,
      endedAtIso: params.endedAtIso,
      actualMinutes: params.actualMinutes,
      estimatedMinutes: params.estimatedMinutes,
      diffMinutes: params.actualMinutes - params.estimatedMinutes,
      metSlo: params.actualMinutes <= sloLimit(profile, params.commuteType),
      waitMinutesActual: params.waitMinutesActual,
      crowdLevel: params.crowdLevel,
      departHour: bkkHourOf(params.startedAtIso),
      profileId: profile.id,
    };
    persistLogs([newLog, ...logs].slice(0, 50));
  }

  function deleteLog(id: string) {
    if (profile) store.addTombstone(profile.id, id);
    persistLogs(logs.filter((l) => l.id !== id));
  }

  function departureAdvice(route: RouteOption): { leaveBy: string; basis: string } | null {
    if (!profile) return null;
    const target = parseHhMm(arriveBy);
    if (target == null) return null;
    const buffer = profile.departBufferMinutes;
    const h = p80ByRoute[route.id];
    if (h && h.samples >= MIN_P80_SAMPLES) {
      return {
        leaveBy: formatHhMm(target - h.p80 - buffer),
        basis: `p80 จาก log จริง ${h.p80} นาที (${h.samples} ครั้ง) + เผื่อ ${buffer} นาที`,
      };
    }
    return {
      leaveBy: formatHhMm(target - route.duration - buffer),
      basis: `ค่าประมาณ ${route.duration} นาที + เผื่อ ${buffer} นาที (log ยังไม่ถึง ${MIN_P80_SAMPLES} ครั้ง)`,
    };
  }

  function getRouteTypeClass(title: string, mode: string): string {
    if (title.includes("BTS") || mode.includes("BTS") || mode.includes("รถไฟฟ้า")) return "route-type-bts";
    if (title.includes("21E") || title.includes("141") || title.includes("ต่อเดียว")) return "route-type-bus-direct";
    return "route-type-feeder";
  }

  if (!profile || !fareSettings) {
    return (
      <main className="app-shell">
        <p className="helper-text">กำลังโหลดโปรไฟล์…</p>
      </main>
    );
  }

  const currentLeg = legOf(profile, commuteType);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="CommuteOps หน้าหลัก">
          <span className="brand-mark">C</span>
          <span>Commute<span className="brand-light">Ops</span></span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <select
            value={profile.id}
            onChange={(e) => switchProfile(e.target.value)}
            aria-label="เลือกโปรไฟล์ผู้เดินทาง"
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#f8fafc",
              padding: "6px 10px",
              borderRadius: "999px",
              fontSize: "0.82rem",
              fontFamily: "var(--font-main)",
              maxWidth: "200px",
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span className="topbar-note">
            <span className="status-dot" /> ESTIMATE
          </span>
        </div>
      </header>

      {activeTrip && (
        <section
          style={{
            marginBottom: "24px",
            padding: "16px 20px",
            borderRadius: "16px",
            background: "rgba(16, 185, 129, 0.18)",
            border: "1px solid rgba(16, 185, 129, 0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#34d399" }}>
              ● ACTIVE COMMUTE MONITORING
            </span>
            <h3 style={{ margin: "4px 0", fontSize: "1.1rem" }}>
              กำลังเดินทาง: {activeTrip.routeTitle}
            </h3>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              {activeTrip.origin} → {activeTrip.destination} · เวลาที่ผ่านไป:{" "}
              <strong>{elapsedMinutes} นาที</strong> (ประเมินไว้ ~{activeTrip.estimatedMinutes} นาที)
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={finishActiveTrip}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                background: "#10b981",
                color: "#06281e",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-main)",
              }}
            >
              ✓ ถึงปลายทางแล้ว (บันทึก SLO)
            </button>
            <button
              type="button"
              onClick={cancelActiveTrip}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontFamily: "var(--font-main)",
              }}
            >
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {pendingFinish && (
        <section
          style={{
            marginBottom: "24px",
            padding: "16px 20px",
            borderRadius: "16px",
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.5)",
          }}
        >
          <strong style={{ display: "block", marginBottom: "4px" }}>
            ถึงแล้ว ใช้เวลา {pendingFinish.actualMinutes} นาที — บันทึกเพิ่มอีก 2 อย่าง (ไม่บังคับ)
          </strong>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
            <label htmlFor="finish-wait" style={{ fontSize: "0.88rem" }}>รอรถจริง (นาที):</label>
            <input
              id="finish-wait"
              type="number"
              min={0}
              max={120}
              placeholder="เช่น 15"
              value={finishWait}
              onChange={(e) => setFinishWait(e.target.value)}
              style={{
                width: "100px",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.25)",
                color: "inherit",
                fontFamily: "var(--font-main)",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
            <span style={{ fontSize: "0.88rem" }}>ความแน่น:</span>
            {([1, 2, 3] as CrowdLevel[]).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setFinishCrowd(finishCrowd === lv ? undefined : lv)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: finishCrowd === lv ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.25)",
                  background: finishCrowd === lv ? "rgba(59,130,246,0.3)" : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontFamily: "var(--font-main)",
                }}
              >
                {lv} · {CROWD_LABELS[lv]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => confirmFinish(false)}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                background: "#3b82f6",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-main)",
              }}
            >
              บันทึก
            </button>
            <button
              type="button"
              onClick={() => confirmFinish(true)}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontFamily: "var(--font-main)",
              }}
            >
              ข้าม (บันทึกแค่เวลารวม)
            </button>
          </div>
        </section>
      )}

      <section className="hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div className="hero-copy" style={{ flex: "1 1 280px" }}>
            <p className="eyebrow">YOUR DAILY COMMUTE, SIMPLIFIED</p>
            <h1>ไปทำงานวันนี้<br /><span>ไปทางไหนดี?</span></h1>
            <p className="hero-description">
              {profile.label}
              {profile.note ? ` · ${profile.note}` : ""} — ประมาณการจากเวลาจริงของกรุงเทพฯ อากาศสด และสถิติของคุณ
            </p>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "16px",
              padding: "16px",
              minWidth: "200px",
              flex: "0 0 auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "2rem" }}>{weatherInfo.icon}</span>
              <div>
                <strong style={{ fontSize: "1.1rem", display: "block" }}>
                  {conditions?.weather ? `${conditions.weather.temperatureC}°C` : "—"}
                </strong>
                <span style={{ fontSize: "0.75rem", color: weatherInfo.color, fontWeight: 600 }}>
                  {weatherInfo.label}
                </span>
              </div>
            </div>

            <div style={{ fontSize: "0.78rem", color: "#94a3b8", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "8px" }}>
              📍 {conditions?.weather?.locationName ?? currentLeg.origin.name}
              <br />
              🚗 {traffic?.label ?? "ตรวจสอบการจราจร"}
              {conditions?.roadDistanceKm != null && (
                <>
                  <br />
                  📏 ระยะทางถนน ~{conditions.roadDistanceKm} กม.
                </>
              )}
              {traffic?.source === "live" && conditions?.liveTraffic ? (
                <>
                  <br />
                  🟢 <strong style={{ color: "#34d399" }}>จราจรสด (TomTom)</strong>
                  <br />
                  🚘 ขับรถตอนนี้ {conditions.liveTraffic.travelMinutes} นาที · ถนนโล่ง{" "}
                  {conditions.liveTraffic.freeFlowMinutes} นาที · ตัวคูณ {traffic.multiplier}
                  <br />
                  <span style={{ opacity: 0.7 }}>(เวลารถส่วนตัว ไม่ใช่รถเมล์ที่จอดรับส่ง)</span>
                </>
              ) : (
                <>
                  <br />
                  🟡 ตัวคูณจราจรเป็นค่าประมาณจากเวลา (ยังไม่มีข้อมูลสด)
                </>
              )}
              {conditions?.weather?.outlookText && (
                <>
                  <br />
                  🌦 <strong style={{ color: "#e2e8f0" }}>{conditions.weather.outlookText}</strong>
                </>
              )}
            </div>

            {conditions?.weather?.rainOutlook && conditions.weather.rainOutlook.length > 0 && (
              <div style={{ marginTop: "8px" }} title="ปริมาณฝนราย 15 นาที ล่วงหน้า 2 ชั่วโมง (ซ้าย = ตอนนี้)">
                <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "28px" }}>
                  {conditions.weather.rainOutlook.map((s) => (
                    <div
                      key={s.minutesFromNow}
                      style={{
                        flex: 1,
                        height: `${Math.max(3, Math.min(28, s.mm * 28))}px`,
                        borderRadius: "2px",
                        background: s.mm >= 0.1 ? "#60a5fa" : "rgba(148,163,184,0.35)",
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "#94a3b8", marginTop: "2px" }}>
                  <span>ตอนนี้</span>
                  <span>+2 ชม.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="search-panel" aria-labelledby="search-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PLAN A TRIP</p>
            <h2 id="search-title">ตั้งค่าสถานการณ์วันนี้</h2>
          </div>
          <span className="step-label">01 / สถานการณ์</span>
        </div>

        <div className="commute-presets" role="group" aria-label="เลือกช่วงการเดินทาง">
          <button
            className={`commute-preset ${commuteType === "morning" ? "commute-preset-active" : ""}`}
            type="button"
            onClick={() => chooseCommute("morning")}
          >
            <span aria-hidden="true">☀</span>
            <span>
              <strong>ไปทำงาน (เช้า)</strong>
              <small>{profile.morning.origin.name} → {profile.morning.destination.name}</small>
            </span>
          </button>
          <button
            className={`commute-preset ${commuteType === "evening" ? "commute-preset-active" : ""}`}
            type="button"
            onClick={() => chooseCommute("evening")}
          >
            <span aria-hidden="true">☾</span>
            <span>
              <strong>กลับบ้าน (เย็น)</strong>
              <small>{profile.evening.origin.name} → {profile.evening.destination.name}</small>
            </span>
          </button>
        </div>

        <div
          className="trip-time-note"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}
        >
          <div>
            <span className="time-note-icon" aria-hidden="true">◷</span>{" "}
            <span>เวลารอรถปกติ: <strong>{currentLeg.waitWindow} น.</strong></span>
          </div>
          <button
            type="button"
            onClick={toggle21eDelay}
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              border: bus21eDelayed ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.25)",
              background: bus21eDelayed ? "rgba(239, 68, 68, 0.2)" : "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              fontFamily: "var(--font-main)",
            }}
          >
            {bus21eDelayed
              ? "🚨 สถานะ: รถขาดระยะ/รอนาน (คลิกเพื่อรีเซ็ต)"
              : "🚌 กดเมื่อเปิด ViaBus แล้วเห็นรถรอนานเกิน 25 นาที"}
          </button>
        </div>

        <div className="location-fields">
          <label className="location-field">
            <span className="field-icon origin-icon">A</span>
            <span className="field-content">
              <span className="field-label">ต้นทาง (ชื่อที่แสดงใน runbook)</span>
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </span>
          </label>
          <button className="swap-button" type="button" onClick={swapLocations} aria-label="สลับต้นทางและปลายทาง">↕</button>
          <label className="location-field">
            <span className="field-icon destination-icon">B</span>
            <span className="field-content">
              <span className="field-label">ปลายทาง (ชื่อที่แสดงใน runbook)</span>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </span>
          </label>
        </div>

        <div className="preference-row">
          <label htmlFor="priority">โหมดสภาพร่างกาย / เป้าหมายวันนี้</label>
          <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="balanced">สมดุลโดยรวม (เวลา + แรง)</option>
            <option value="fastest">รีบมาก (เน้นถึงไวที่สุด)</option>
            <option value="few-transfers">เหนื่อยมาก (ขอต่อรถน้อยที่สุด)</option>
            <option value="less-walking">ฝนตก / ขี้เกียจเดิน (เน้นเดินน้อย)</option>
          </select>
          <button className="primary-button" onClick={refreshConditions} type="button" disabled={loading}>
            {loading ? "กำลังอัปเดต..." : "อัปเดตอากาศ/จราจร"} <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="preference-row" style={{ marginTop: "12px" }}>
          <label htmlFor="arrive-by">
            {commuteType === "morning" ? "ต้องถึงที่ทำงานไม่เกิน" : "อยากถึงบ้านไม่เกิน"}
          </label>
          <input
            id="arrive-by"
            type="time"
            value={arriveBy}
            onChange={(e) => setArriveBy(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(15, 23, 42, 0.6)",
              color: "#fff",
              fontFamily: "var(--font-main)",
            }}
          />
          <a
            className="details-button"
            href={gmapsTransitUrl(origin, destination)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            🗺 Google Maps (transit)
          </a>
          <a
            className="details-button"
            href={VIABUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            🚌 เปิด ViaBus
          </a>
        </div>
      </section>

      <section className="results-section" aria-live="polite">
        <div className="results-heading">
          <div>
            <p className="eyebrow">RECOMMENDED RUNBOOK</p>
            <h2>ลำดับทางเลือกที่เหมาะกับคุณตอนนี้</h2>
          </div>
          <span className="result-count">{routes.length} แผนการเดินทาง</span>
        </div>

        <div className="route-list">
          {routes.map((route, index) => {
            const isExpanded = expandedId === route.id;
            const isCurrentlyTracking = activeTrip?.routeId === route.id;
            const typeClass = getRouteTypeClass(route.title, route.mode);
            const advice = departureAdvice(route);

            return (
              <article className={`route-card ${index === 0 ? "route-card-featured" : ""}`} key={route.id}>
                <div className="route-card-top">
                  <div className={`route-icon ${typeClass}`}>
                    {route.mode.includes("BTS") || route.mode.includes("รถไฟฟ้า") ? "⇄" : "🚌"}
                  </div>
                  <div className="route-title-wrap">
                    <div className="route-title-line">
                      <h3>อันดับ {index + 1}: {route.title}</h3>
                      {route.tag && <span className="recommend-tag">{route.tag}</span>}
                      {route.unverified && (
                        <span
                          className="recommend-tag"
                          style={{ background: "rgba(245,158,11,0.25)", color: "#fbbf24" }}
                          title="สายรถหรือเวลาบางขายังไม่ได้ยืนยัน"
                        >
                          ยังไม่ยืนยัน
                        </span>
                      )}
                    </div>
                    <p>{route.mode}</p>
                  </div>
                  <button
                    className={`save-button ${saved.includes(route.id) ? "is-saved" : ""}`}
                    onClick={() => toggleSaved(route.id)}
                    type="button"
                    aria-label={saved.includes(route.id) ? "เอาออกจากรายการโปรด" : "บันทึกเป็นรายการโปรด"}
                  >
                    {saved.includes(route.id) ? "♥" : "♡"}
                  </button>
                </div>

                <div className="route-metrics">
                  <div className="metric-primary">
                    <strong>~{route.duration}</strong><span>นาทีรวมรอรถ</span>
                  </div>
                  <div className="metric"><span>ต่อรถ</span><strong>{route.transfers} ครั้ง</strong></div>
                  <div className="metric"><span>เดินรวม</span><strong>{route.walk} นาที</strong></div>
                  <div className="metric"><span>ค่าโดยสาร</span><strong>{route.cost}</strong></div>
                </div>

                <p className="route-disclaimer">{route.description}</p>

                {advice && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      margin: "0 0 12px 0",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      background: "rgba(56,189,248,0.1)",
                      border: "1px solid rgba(56,189,248,0.25)",
                      lineHeight: 1.5,
                    }}
                  >
                    ⏱ ออกไม่เกิน <strong>{advice.leaveBy} น.</strong>{" "}
                    <span style={{ opacity: 0.75 }}>· {advice.basis}</span>
                  </p>
                )}

                {isExpanded && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                    <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
                      Runbook ขั้นตอนการเดินทาง:
                    </strong>
                    <ol style={{ paddingLeft: "20px", margin: "0 0 12px 0", fontSize: "0.9rem", lineHeight: 1.7 }}>
                      {route.steps.map((step, sIdx) => (
                        <li key={sIdx}>
                          {step.instruction} <strong>(~{step.durationMinutes} นาที)</strong>
                        </li>
                      ))}
                    </ol>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", paddingTop: "10px", borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                      <span style={{ fontSize: "0.85rem" }}>ลืมกดจับเวลา? บันทึกเวลาจริงย้อนหลัง:</span>
                      <input
                        type="number"
                        placeholder="นาทีจริง เช่น 62"
                        aria-label="เวลาเดินทางจริง (นาที)"
                        value={manualMinutesInput[route.id] || ""}
                        onChange={(e) => setManualMinutesInput((prev) => ({ ...prev, [route.id]: e.target.value }))}
                        style={{ width: "130px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "inherit", fontFamily: "var(--font-main)" }}
                      />
                      <input
                        type="number"
                        min={0}
                        max={120}
                        placeholder="รอจริง (นาที)"
                        aria-label="เวลารอรถจริง (นาที)"
                        value={manualWaitInput[route.id] || ""}
                        onChange={(e) => setManualWaitInput((prev) => ({ ...prev, [route.id]: e.target.value }))}
                        style={{ width: "120px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "inherit", fontFamily: "var(--font-main)" }}
                      />
                      <select
                        aria-label="ความแน่นของรถ"
                        value={manualCrowdInput[route.id] ?? ""}
                        onChange={(e) =>
                          setManualCrowdInput((prev) => ({
                            ...prev,
                            [route.id]: e.target.value ? (Number(e.target.value) as CrowdLevel) : undefined,
                          }))
                        }
                        style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "inherit", fontFamily: "var(--font-main)" }}
                      >
                        <option value="">ความแน่น (ไม่ระบุ)</option>
                        <option value="1">1 · {CROWD_LABELS[1]}</option>
                        <option value="2">2 · {CROWD_LABELS[2]}</option>
                        <option value="3">3 · {CROWD_LABELS[3]}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => logManualTrip(route)}
                        style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "inherit", cursor: "pointer", fontFamily: "var(--font-main)" }}
                      >
                        ＋ บันทึกสถิติ
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button
                    className="details-button"
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : route.id)}
                    style={{ flex: "1 1 auto" }}
                  >
                    {isExpanded ? "ซ่อนขั้นตอน ↑" : "ดู Runbook / บันทึกย้อนหลัง ↗"}
                  </button>
                  <button
                    type="button"
                    onClick={() => (isCurrentlyTracking ? finishActiveTrip() : startTripTimer(route))}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "10px",
                      border: "none",
                      background: isCurrentlyTracking ? "#10b981" : "rgba(59, 130, 246, 0.25)",
                      color: isCurrentlyTracking ? "#06281e" : "#93c5fd",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font-main)",
                    }}
                  >
                    {isCurrentlyTracking ? `✓ ถึงแล้ว (${elapsedMinutes} นาที)` : "▶ เริ่มจับเวลาแผนนี้"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="search-panel" style={{ marginTop: "28px" }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">COMMUTE OBSERVABILITY &amp; SRE METRICS</p>
            <h2>สถิติเวลาเดินทางจริง &amp; SLO</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`ล้างประวัติการเดินทางทั้งหมดของโปรไฟล์ "${profile.label}" ใช่หรือไม่ (ลบแล้วกู้ไม่ได้)`)) {
                    for (const l of logs) store.addTombstone(profile.id, l.id);
                    persistLogs([]);
                  }
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#f87171",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-main)",
                }}
              >
                🗑 ล้างทั้งหมด
              </button>
            )}
            <span className="step-label">02 / ประวัติ &amp; SLO</span>
          </div>
        </div>

        {!observabilityStats ? (
          <p className="helper-text" style={{ margin: "12px 0" }}>
            ยังไม่มีข้อมูลการเดินทางที่บันทึกไว้ กดปุ่ม <strong>▶ เริ่มจับเวลาแผนนี้</strong> ตอนเริ่มเดินทาง
            หรือกางการ์ดเพื่อกรอกเวลาเดินทางจริงย้อนหลังได้เลย
          </p>
        ) : (
          <>
            <div className="route-metrics" style={{ marginBottom: "20px" }}>
              <div className="metric-primary">
                <strong>{observabilityStats.sloRate}%</strong>
                <span>
                  SLO Attainment (เป้า {profile.slo.targetPercent}% · เช้า ≤{profile.slo.morning} / เย็น ≤{profile.slo.evening} นาที)
                </span>
              </div>
              <div className="metric"><span>เวลาเดินทางเฉลี่ยจริง</span><strong>{observabilityStats.avgActual} นาที</strong></div>
              <div className="metric">
                <span>ความคลาดเคลื่อนเฉลี่ย (Drift)</span>
                <strong>
                  {observabilityStats.avgDiff > 0 ? `+${observabilityStats.avgDiff}` : observabilityStats.avgDiff} นาที
                </strong>
              </div>
              <div className="metric"><span>จำนวนทริปที่บันทึก</span><strong>{observabilityStats.total} เที่ยว</strong></div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
                สถิติรายเส้นทาง (จากข้อมูลจริงของคุณ)
              </strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {routeStats.map((s) => (
                  <div
                    key={s.key}
                    style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.85rem" }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {s.commuteType === "morning" ? "☀" : "☾"} {s.routeTitle}
                    </div>
                    <div style={{ opacity: 0.8, marginTop: "2px" }}>
                      {s.count} เที่ยว · เฉลี่ย {s.avgActual} นาที
                      {s.avgWait != null && <> · รอเฉลี่ย {s.avgWait} นาที ({s.waitSamples} ครั้ง)</>}
                      {s.avgCrowd != null && <> · แน่นเฉลี่ย {s.avgCrowd}/3 ({s.crowdSamples} ครั้ง)</>}
                      {s.count < 5 && <> · ข้อมูลยังน้อย</>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {logs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                      {log.dateStr} · {log.commuteType === "morning" ? "☀ ขาไป" : "☾ ขากลับ"}
                    </span>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", marginTop: "2px" }}>{log.routeTitle}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ textAlign: "right", fontSize: "0.88rem" }}>
                      <strong>{log.actualMinutes} นาทีจริง</strong>{" "}
                      <span style={{ opacity: 0.75 }}>
                        (คาดไว้ {log.estimatedMinutes} นาที / {log.diffMinutes > 0 ? `+${log.diffMinutes}` : log.diffMinutes})
                      </span>
                      {(log.waitMinutesActual != null || log.crowdLevel != null) && (
                        <div style={{ fontSize: "0.78rem", opacity: 0.75, marginTop: "2px" }}>
                          {log.waitMinutesActual != null && <>รอ {log.waitMinutesActual} นาที</>}
                          {log.waitMinutesActual != null && log.crowdLevel != null && " · "}
                          {log.crowdLevel != null && <>แน่น {log.crowdLevel}/3 ({CROWD_LABELS[log.crowdLevel]})</>}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: log.metSlo ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: log.metSlo ? "#34d399" : "#f87171",
                      }}
                    >
                      {log.metSlo ? "PASS SLO" : "BREACH"}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteLog(log.id)}
                      style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.1)", color: "#f87171", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, fontFamily: "var(--font-main)" }}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <CostPlanner profile={profile} settings={fareSettings} onChange={updateFareSettings} logs={logs} />

      <ProfileManager profiles={profiles} profile={profile} onProfilesChanged={reloadProfiles} />

      <SyncPanel profiles={profiles} onSynced={() => reloadProfiles()} />

      <footer className="footer">
        <span>CommuteOps <span className="footer-muted">· Personal Transit Observability</span></span>
        <span>Open-Meteo · TomTom · OSRM · OpenStreetMap</span>
      </footer>
    </main>
  );
}
