// src/lib/routing/catalog.ts
import {
  COMMON_FARE_LEGS, EMPTY_FARE_SETTINGS, WIN_LEG_ID, BTS_SOURCE_URL,
  costOfLegs, fareText,
  type FareLegId, type FareLegMap, type FareSettings,
} from "./fares";
import { DEFAULT_TRAFFIC_TUNING, type TrafficTuning } from "./traffic";
import type { RouteOption, RouteStep } from "./types";

export const MIN_WAIT_SAMPLES = 3;
export type CommuteType = "morning" | "evening";

export type Place = { lat: number; lon: number; name: string };

export type Leg = {
  text: string;        // ใช้ {origin} / {destination} แทนชื่อสถานที่ได้
  mode: "WALK" | "TRANSIT";
  minutes: number;     // เวลาฐาน ก่อนคูณตัวคูณจราจร
  traffic?: boolean;   // วิ่งบนถนน → คูณตัวคูณจราจร (รถไฟฟ้าไม่คูณ)
  wait?: boolean;      // ขานี้คือรอรถ → แทนด้วยสถิติจริงได้เมื่อ log พอ
  line?: string;
  unverified?: boolean;
};

export type RouteTemplate = {
  id: string;
  title: string;
  mode: string;
  description: string;
  tag?: string;
  transfers: number;
  fareLegs: FareLegId[];
  defaultWin: boolean;
  legs: Leg[];
  delayed?: { waitMinutes: number; tag: string; description: string };
};

export type CommuteLegDef = {
  origin: Place;
  destination: Place;
  defaultArriveBy: string;   // "HH:MM"
  waitWindow: string;        // ข้อความช่วงเวลารอรถปกติ
  routes: RouteTemplate[];
};

export type CommuteProfile = {
  id: string;
  label: string;
  note?: string;
  slo: { morning: number; evening: number; targetPercent: number };
  departBufferMinutes: number;
  fareLegs: FareLegMap;
  trafficTuning: TrafficTuning;
  winStep?: Leg;             // ขาวินช่วงท้าย เติมอัตโนมัติเมื่อเปิดวินของแผนนั้น
  morning: CommuteLegDef;
  evening: CommuteLegDef;
};

export function legOf(profile: CommuteProfile, type: CommuteType): CommuteLegDef {
  return type === "morning" ? profile.morning : profile.evening;
}

// ================= โปรไฟล์ตั้งต้น: คุณ =================
const PRACHA_UTHIT_76: Place = { lat: 13.6365, lon: 100.5018, name: "ประชาอุทิศ 76 (ทุ่งครุ)" };
const SILOM_COMPLEX: Place = { lat: 13.7285, lon: 100.5348, name: "สีลมคอมเพล็กซ์ (บางรัก)" };

const PROFILE_ME: CommuteProfile = {
  id: "me",
  label: "ประชาอุทิศ ↔ สีลม",
  note: "เข้างาน 9:00 เลิก 18:00",
  slo: { morning: 85, evening: 95, targetPercent: 90 },
  departBufferMinutes: 10,
  trafficTuning: DEFAULT_TRAFFIC_TUNING,
  fareLegs: {
    bus21e: COMMON_FARE_LEGS.bus21e,
    bus141: COMMON_FARE_LEGS.bus141,
    feeder: COMMON_FARE_LEGS.feeder,
    access: COMMON_FARE_LEGS.access,
    win: COMMON_FARE_LEGS.win,
    bts: {
      short: "BTS",
      label: "BTS ศาลาแดง → สะพานตากสิน/วงเวียนใหญ่",
      defaultBaht: null,
      badge: "unset",
      source: "หน้าอัตราค่าโดยสาร BTS ต้องเลือกสถานีเอง อ่านตัวเลขอัตโนมัติไม่ได้ ให้กรอกที่จ่ายจริง",
      sourceUrl: BTS_SOURCE_URL,
    },
  },
  winStep: { text: "ต่อวินเข้า {destination}", mode: "TRANSIT", minutes: 6, line: "วินมอเตอร์ไซค์" },
  morning: {
    origin: PRACHA_UTHIT_76,
    destination: SILOM_COMPLEX,
    defaultArriveBy: "09:00",
    waitWindow: "06:40–07:00",
    routes: [
      {
        id: "morning-21e-direct",
        title: "สาย 21E (ทางด่วน) ต่อเดียว",
        mode: "รถเมล์ทางด่วน · ไม่ต้องเปลี่ยนรถ",
        description: "ขึ้นที่หน้าตลาดประชาอุทิศ 76 / ตลาดยิ่งรวย 76 ลงสีลมได้เลย เหนื่อยน้อยที่สุดถ้ารถมาตามเวลา",
        tag: "ต่อเดียวคุ้มสุด",
        transfers: 0,
        fareLegs: ["bus21e"],
        defaultWin: false,
        delayed: { waitMinutes: 32, tag: "รอนาน", description: "21E รอนานเกิน 25 นาที แนะนำสลับไปออก กม.9 ต่อ 141 แทน" },
        legs: [
          { text: "เดินไปป้ายหน้า {origin}", mode: "WALK", minutes: 5 },
          { text: "รอสาย 21E", mode: "WALK", minutes: 12, wait: true },
          { text: "นั่งสาย 21E ขึ้นทางด่วน มุ่งหน้าสีลม", mode: "TRANSIT", minutes: 38, traffic: true, line: "21E" },
          { text: "เดินไปยัง {destination}", mode: "WALK", minutes: 3 },
        ],
      },
      {
        id: "morning-km9-141",
        title: "ออกแยก กม.9 + ต่อสาย 141 (ทางด่วน)",
        mode: "สาย 21 / กะป๊อ / สองแถว + 141",
        description: "ทางสำรองเมื่อ 21E ขาดระยะ สาย 141 ใต้ทางด่วน กม.9 ปล่อยถี่กว่า ตอนเช้าอาจได้ที่ว่างมากกว่า",
        tag: "รถมาถี่",
        transfers: 1,
        fareLegs: ["feeder", "bus141"],
        defaultWin: false,
        legs: [
          { text: "ขึ้นสาย 21 / กะป๊อ / สองแถวจาก {origin} ไปปากซอยสุขสวัสดิ์ (กม.9)", mode: "TRANSIT", minutes: 17, traffic: true, line: "21 / กะป๊อ / สองแถว" },
          { text: "เดินไปป้ายใต้ทางด่วน กม.9", mode: "WALK", minutes: 3 },
          { text: "รอสาย 141", mode: "WALK", minutes: 8, wait: true },
          { text: "นั่งสาย 141 ขึ้นทางด่วนลงสีลม/ศาลาแดง", mode: "TRANSIT", minutes: 32, traffic: true, line: "141" },
          { text: "เดินเข้า {destination}", mode: "WALK", minutes: 3 },
        ],
      },
    ],
  },
  evening: {
    origin: SILOM_COMPLEX,
    destination: PRACHA_UTHIT_76,
    defaultArriveBy: "19:45",
    waitWindow: "18:10–18:20",
    routes: [
      {
        id: "evening-bts-escape",
        title: "BTS ศาลาแดง → สะพานตากสิน/วงเวียนใหญ่ + ต่อรถ",
        mode: "รถไฟฟ้า BTS + รถเมล์/กะป๊อ",
        description: "หนีรถติดหน้าสีลม–สุรศักดิ์–สะพานตากสินช่วงหัวค่ำ ไม่ต้องยืนรอกลางแจ้งนานเมื่อฝนตก",
        tag: "เร็วที่สุดช่วงเย็น",
        transfers: 1,
        fareLegs: ["bts", "feeder"],
        defaultWin: false,
        legs: [
          { text: "เดินจาก {origin} ขึ้น BTS ศาลาแดง", mode: "WALK", minutes: 5 },
          { text: "นั่ง BTS ข้ามแม่น้ำไปลงสะพานตากสิน หรือวงเวียนใหญ่", mode: "TRANSIT", minutes: 12, line: "BTS" },
          { text: "เดินไปจุดต่อรถ", mode: "WALK", minutes: 3 },
          { text: "รอสาย 21 / 75 / กะป๊อ", mode: "WALK", minutes: 10, wait: true },
          { text: "นั่งรถเข้าซอยประชาอุทิศ ลง {destination}", mode: "TRANSIT", minutes: 26, traffic: true, line: "21 / 75 / กะป๊อ" },
        ],
      },
      {
        id: "evening-21e-silom",
        title: "สาย 21E ขึ้นหน้าสีลมคอมเพล็กซ์",
        mode: "รถเมล์ทางด่วน · ต่อเดียวถึงบ้าน",
        description: "ใกล้ที่ทำงานที่สุด แต่รถที่มาถึงจุดนี้มักมีคนขึ้นมาก่อนแล้ว ที่ว่างอาจน้อย เช็ก ViaBus ก่อนออก",
        tag: "ต่อเดียว",
        transfers: 0,
        fareLegs: ["bus21e"],
        defaultWin: true,
        delayed: { waitMinutes: 38, tag: "ไม่แนะนำ (รอนาน)", description: "21E รอนานมาก แนะนำขึ้น BTS หรือสาย 141 แทน" },
        legs: [
          { text: "เดินไปป้ายหน้า {origin}", mode: "WALK", minutes: 5 },
          { text: "รอสาย 21E", mode: "WALK", minutes: 18, wait: true },
          { text: "นั่งสาย 21E ขึ้นทางด่วน ลงสุขสวัสดิ์เข้าประชาอุทิศ", mode: "TRANSIT", minutes: 44, traffic: true, line: "21E" },
        ],
      },
      {
        id: "evening-21e-chula",
        title: "สาย 21E ขึ้นที่จามจุรีสแควร์ / อู่จุฬาฯ (คนน้อยกว่า)",
        mode: "เดิน/MRT ไปจุดขึ้นรถ + 21E ต่อเดียว",
        description: "จุดขึ้นก่อนถึงสีลมในทิศทางรถ คนมักน้อยกว่าและมีโอกาสได้ที่นั่งมากกว่า",
        tag: "เลี่ยงคนแน่น",
        transfers: 0,
        fareLegs: ["access", "bus21e"],
        defaultWin: true,
        delayed: { waitMinutes: 38, tag: "ไม่แนะนำ (รอนาน)", description: "21E รอนานมาก แนะนำขึ้น BTS หรือสาย 141 แทน" },
        legs: [
          { text: "ไปจามจุรีสแควร์ หรือป้ายอู่จุฬาฯ จาก {origin}", mode: "WALK", minutes: 12, unverified: true },
          { text: "รอสาย 21E", mode: "WALK", minutes: 18, wait: true },
          { text: "นั่งสาย 21E ขึ้นทางด่วน ลงสุขสวัสดิ์เข้าประชาอุทิศ", mode: "TRANSIT", minutes: 44, traffic: true, line: "21E" },
        ],
      },
      {
        id: "evening-141-km9",
        title: "สาย 141 (ทางด่วน) จากหน้า รพ.จุฬาฯ ลง กม.9 + ต่อรถ",
        mode: "รถเมล์ทางด่วน 141 + สองแถว/กะป๊อ",
        description: "เดินไปรอหน้าโรงพยาบาลจุฬาฯ ตรงข้ามสวนลุมพินี ใช้เมื่อ 21E ยังไม่มา หรืออยากเลี่ยงคนแน่นหน้าสีลม",
        transfers: 1,
        fareLegs: ["bus141", "feeder"],
        defaultWin: false,
        legs: [
          { text: "เดินไปป้ายหน้า รพ.จุฬาฯ ตรงข้ามสวนลุมพินี", mode: "WALK", minutes: 8 },
          { text: "รอสาย 141", mode: "WALK", minutes: 12, wait: true },
          { text: "นั่งสาย 141 ขึ้นทางด่วนลงแยก กม.9", mode: "TRANSIT", minutes: 36, traffic: true, line: "141" },
          { text: "เดินไปจุดต่อรถใต้ทางด่วน", mode: "WALK", minutes: 4 },
          { text: "ต่อสองแถว/กะป๊อ/สาย 21 เข้า {destination}", mode: "TRANSIT", minutes: 23, traffic: true, line: "สองแถว/กะป๊อ" },
        ],
      },
    ],
  },
};

// ================= โปรไฟล์ตั้งต้น: เพื่อน =================
// TODO: ยืนยันพิกัดจาก Google Maps (ตอนนี้เป็นค่าประมาณ ใช้ดึงข้อมูลฝนเท่านั้น)
const RAJPRACHA_PRIMARY: Place = { lat: 13.6594, lon: 100.5069, name: "รร.ราชประชาสมาสัย ฝ่ายประถม · พิกัดประมาณ" };
const CHIT_LOM: Place = { lat: 13.7442, lon: 100.5433, name: "BTS ชิดลม (ราชประสงค์)" };

const PROFILE_FRIEND: CommuteProfile = {
  id: "friend",
  label: "ราชประชาสมาสัย ↔ ชิดลม",
  note: "ยังไม่ยืนยันเลขสายรถเมล์และค่าโดยสาร ตัวเลขทั้งหมดเป็นค่าตั้งต้น",
  slo: { morning: 90, evening: 100, targetPercent: 90 },
  departBufferMinutes: 10,
  trafficTuning: DEFAULT_TRAFFIC_TUNING,
  fareLegs: {
    bus21e: COMMON_FARE_LEGS.bus21e,
    bus141: COMMON_FARE_LEGS.bus141,
    busPlain: COMMON_FARE_LEGS.busPlain,
    win: COMMON_FARE_LEGS.win,
    bts: {
      short: "BTS",
      label: "BTS → ชิดลม (เปลี่ยนสายที่สยาม)",
      defaultBaht: null,
      badge: "unset",
      source: "ต้องเลือกสถานีเองบนหน้าอัตราค่าโดยสาร BTS ให้กรอกที่จ่ายจริง",
      sourceUrl: BTS_SOURCE_URL,
    },
  },
  winStep: { text: "ต่อวินเข้า {destination}", mode: "TRANSIT", minutes: 6, line: "วินมอเตอร์ไซค์" },
  morning: {
    origin: RAJPRACHA_PRIMARY,
    destination: CHIT_LOM,
    defaultArriveBy: "08:00",
    waitWindow: "06:20–06:40",
    routes: [
      {
        id: "friend-21e-saladaeng-chitlom",
        title: "21E/141 ลงศาลาแดง + BTS สยาม → ชิดลม",
        mode: "รถเมล์ทางด่วน + BTS",
        description:
          "สมมติฐานที่คุ้มเช็กที่สุด เพราะโรงเรียนอยู่บนถนนสุขสวัสดิ์ corridor เดียวกับ 21E/141 ต้องยืนยันก่อนว่ารถจอดป้ายหน้าโรงเรียนจริง",
        tag: "ต้องยืนยันก่อนใช้",
        transfers: 1,
        fareLegs: ["bus21e", "bts"],
        defaultWin: false,
        legs: [
          { text: "เดินไปป้ายหน้า {origin}", mode: "WALK", minutes: 4, unverified: true },
          { text: "รอสาย 21E / 141", mode: "WALK", minutes: 15, wait: true, unverified: true },
          { text: "นั่งขึ้นทางด่วนลงศาลาแดง", mode: "TRANSIT", minutes: 40, traffic: true, line: "21E / 141", unverified: true },
          { text: "เดินเข้า BTS ศาลาแดง", mode: "WALK", minutes: 4 },
          { text: "BTS สายสีลม ลงสยาม เปลี่ยนเป็นสายสุขุมวิท ลง {destination}", mode: "TRANSIT", minutes: 12, line: "BTS สีลม + สุขุมวิท" },
        ],
      },
      {
        id: "friend-bus-silomline-chitlom",
        title: "รถเมล์สุขสวัสดิ์ → BTS สายสีลม → สยาม → ชิดลม",
        mode: "รถเมล์ + BTS",
        description:
          "โครงสร้างนี้ถึงชิดลมได้แน่นอนไม่ว่าขึ้น BTS ที่สถานีไหนบนสายสีลม ที่ยังไม่รู้คือเลขสายรถเมล์ที่จอดหน้าโรงเรียน เปิด ViaBus ปักหมุดที่ป้ายแล้วเติมลงในโปรไฟล์",
        tag: "รอเติมเลขสาย",
        transfers: 1,
        fareLegs: ["busPlain", "bts"],
        defaultWin: false,
        legs: [
          { text: "เดินไปป้ายหน้า {origin}", mode: "WALK", minutes: 4, unverified: true },
          { text: "รอรถเมล์ (ยังไม่ยืนยันเลขสาย)", mode: "WALK", minutes: 12, wait: true, unverified: true },
          { text: "นั่งไปลงจุดต่อ BTS สายสีลม (วงเวียนใหญ่ / กรุงธนบุรี / สะพานตากสิน)", mode: "TRANSIT", minutes: 35, traffic: true, unverified: true },
          { text: "เดินขึ้นสถานี BTS", mode: "WALK", minutes: 5, unverified: true },
          { text: "BTS สายสีลม ลงสยาม เปลี่ยนเป็นสายสุขุมวิท ลง {destination}", mode: "TRANSIT", minutes: 20, line: "BTS สีลม + สุขุมวิท" },
        ],
      },
    ],
  },
  evening: {
    origin: CHIT_LOM,
    destination: RAJPRACHA_PRIMARY,
    defaultArriveBy: "19:00",
    waitWindow: "17:00–17:30",
    routes: [
      {
        id: "friend-evening-bts-21e",
        title: "BTS ชิดลม → สยาม → ศาลาแดง + 21E/141 กลับสุขสวัสดิ์",
        mode: "BTS + รถเมล์ทางด่วน",
        description: "ย้อนทางเช้า ต้องยืนยันว่า 21E/141 ขาออกจอดป้ายใกล้โรงเรียน และรอบสุดท้ายกี่โมง",
        tag: "ต้องยืนยันก่อนใช้",
        transfers: 1,
        fareLegs: ["bts", "bus21e"],
        defaultWin: false,
        legs: [
          { text: "ขึ้น BTS ที่ {origin} ลงสยาม เปลี่ยนเป็นสายสีลม ลงศาลาแดง", mode: "TRANSIT", minutes: 12, line: "BTS สุขุมวิท + สีลม" },
          { text: "เดินไปป้ายรถเมล์", mode: "WALK", minutes: 4 },
          { text: "รอสาย 21E / 141", mode: "WALK", minutes: 18, wait: true, unverified: true },
          { text: "นั่งขึ้นทางด่วนกลับสุขสวัสดิ์ ลง {destination}", mode: "TRANSIT", minutes: 45, traffic: true, line: "21E / 141", unverified: true },
        ],
      },
    ],
  },
};

export const BUILTIN_PROFILES: CommuteProfile[] = [PROFILE_ME, PROFILE_FRIEND];
export const DEFAULT_PROFILE_ID = "me";

// ================= แผนสำหรับหน้าค่าใช้จ่าย (derive จากโปรไฟล์ ไม่มีลิสต์ซ้ำ) =================
export type PlanDef = {
  id: string;
  title: string;
  commuteType: CommuteType;
  fareLegs: FareLegId[];
  defaultWin: boolean;
};

export function plansOf(profile: CommuteProfile): PlanDef[] {
  const map = (type: CommuteType) =>
    legOf(profile, type).routes.map((r) => ({
      id: r.id,
      title: `${type === "morning" ? "เช้า" : "เย็น"} · ${r.title}`,
      commuteType: type,
      fareLegs: r.fareLegs,
      defaultWin: r.defaultWin,
    }));
  return [...map("morning"), ...map("evening")];
}

export function planFareLegs(planId: string, profile: CommuteProfile, settings: FareSettings): FareLegId[] {
  const plan = plansOf(profile).find((p) => p.id === planId);
  if (!plan) return [];
  const win = settings.winPlans[planId] ?? plan.defaultWin;
  return win && profile.fareLegs[WIN_LEG_ID] ? [...plan.fareLegs, WIN_LEG_ID] : [...plan.fareLegs];
}

export function planCost(planId: string, profile: CommuteProfile, settings: FareSettings) {
  return costOfLegs(planFareLegs(planId, profile, settings), profile.fareLegs, settings);
}

export function defaultFareSettingsFor(profile: CommuteProfile): FareSettings {
  const m = profile.morning.routes[0]?.id ?? "";
  const e = profile.evening.routes[0]?.id ?? "";
  return { ...EMPTY_FARE_SETTINGS, morningPlan: m, eveningPlan: e, altEveningPlan: profile.evening.routes[1]?.id ?? e };
}

// กันกรณีผู้ใช้แก้โปรไฟล์แล้ว planId ที่เลือกไว้หายไป
export function normalizeFareSettings(profile: CommuteProfile, raw: Partial<FareSettings> | null): FareSettings {
  const base = defaultFareSettingsFor(profile);
  if (!raw) return base;
  const plans = plansOf(profile);
  const pick = (id: unknown, type: CommuteType, fallback: string) =>
    typeof id === "string" && plans.some((p) => p.id === id && p.commuteType === type) ? id : fallback;
  const clampInt = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : 0;
  };
  const fares: Record<FareLegId, number> = {};
  for (const [k, v] of Object.entries(raw.fares ?? {})) {
    const n = Number(v);
    if (profile.fareLegs[k] && Number.isFinite(n) && n >= 0 && n <= 10000) fares[k] = n;
  }
  const winPlans: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw.winPlans ?? {})) {
    if (plans.some((p) => p.id === k)) winPlans[k] = Boolean(v);
  }
  return {
    fares,
    winPlans,
    morningPlan: pick(raw.morningPlan, "morning", base.morningPlan),
    eveningPlan: pick(raw.eveningPlan, "evening", base.eveningPlan),
    altEveningPlan: pick(raw.altEveningPlan, "evening", base.altEveningPlan),
    altEveningDays: clampInt(raw.altEveningDays, 31),
    offDays: clampInt(raw.offDays, 31),
    extraRoundTrips: clampInt(raw.extraRoundTrips, 62),
  };
}

// ================= แปลง template เป็น RouteOption =================
export type BuildContext = {
  originName: string;
  destinationName: string;
  multiplier: number;
  bus21eDelayed: boolean;
  waitOverride?: { avgWait: number; samples: number };
  profile: CommuteProfile;
  fareSettings: FareSettings;
};

export function buildRouteOption(t: RouteTemplate, ctx: BuildContext): RouteOption {
  const fill = (s: string) =>
    s.replace(/\{origin\}/g, ctx.originName).replace(/\{destination\}/g, ctx.destinationName);

  const winOn = ctx.fareSettings.winPlans[t.id] ?? t.defaultWin;
  const winStep = winOn ? ctx.profile.winStep : undefined;
  const legs: Leg[] = winStep ? [...t.legs, winStep] : t.legs;

  const delayedActive = ctx.bus21eDelayed && t.delayed != null;
  const o = ctx.waitOverride;
  const historyUsable =
    o != null && o.samples >= MIN_WAIT_SAMPLES && Number.isFinite(o.avgWait) && o.avgWait >= 0;

  // ลำดับความสำคัญ: สถานะขาดระยะที่กดเอง > สถิติจริง > ค่าเดาใน template
  const resolveWait = (fallback: number): number => {
    if (delayedActive && t.delayed) return t.delayed.waitMinutes;
    if (historyUsable && o) return Math.round(o.avgWait);
    return fallback;
  };
  const effective = (l: Leg): number =>
    l.wait ? resolveWait(l.minutes) : l.traffic ? Math.round(l.minutes * ctx.multiplier) : l.minutes;

  const steps: RouteStep[] = legs.map((l) => ({
    instruction: fill(l.text),
    mode: l.mode,
    durationMinutes: effective(l),
    ...(l.line ? { transitLine: l.line } : {}),
  }));

  const duration = legs.reduce((sum, l) => sum + effective(l), 0);
  const waitLeg = legs.find((l) => l.wait);
  const walk = legs.filter((l) => l.mode === "WALK" && !l.wait).reduce((sum, l) => sum + effective(l), 0);
  const unverified = legs.some((l) => l.unverified);

  const notes: string[] = [];
  if (unverified) notes.push("มีขาที่ยังไม่ยืนยัน (สายรถหรือเวลา)");
  if (historyUsable && o && !delayedActive) {
    notes.push(`เวลารอใช้ค่าเฉลี่ยจริงของคุณ ${Math.round(o.avgWait)} นาที (${o.samples} ครั้ง)`);
  }
  if (winOn) notes.push("รวมต่อวินช่วงท้าย");

  const base = delayedActive && t.delayed ? t.delayed.description : t.description;
  const fareLegIds = planFareLegs(t.id, ctx.profile, ctx.fareSettings);

  return {
    id: t.id,
    title: t.title,
    mode: t.mode,
    duration,
    waitMinutes: waitLeg ? effective(waitLeg) : 0,
    transfers: t.transfers + (winOn ? 1 : 0),
    walk,
    cost: fareText(fareLegIds, ctx.profile.fareLegs, ctx.fareSettings),
    description: notes.length ? `${base} · ${notes.join(" · ")}` : base,
    tag: delayedActive && t.delayed ? t.delayed.tag : t.tag,
    isLive: false,
    unverified,
    steps,
  };
}

// ================= validator สำหรับ JSON ที่ import เข้ามา =================
type Fail = { ok: false; errors: string[] };
type Pass = { ok: true; profile: CommuteProfile };

export function validateProfile(raw: unknown): Pass | Fail {
  const errors: string[] = [];
  const o = raw as Record<string, unknown>;
  if (typeof raw !== "object" || raw == null) return { ok: false, errors: ["ไม่ใช่ JSON object"] };

  const str = (v: unknown, field: string, max = 200): string => {
    if (typeof v !== "string" || v.trim() === "" || v.length > max) {
      errors.push(`${field} ต้องเป็นข้อความ 1–${max} ตัวอักษร`);
      return "";
    }
    return v;
  };
  const num = (v: unknown, field: string, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(`${field} ต้องเป็นตัวเลข ${min}–${max}`);
      return fallback;
    }
    return n;
  };
  const place = (v: unknown, field: string): Place => {
    const p = (v ?? {}) as Record<string, unknown>;
    return {
      lat: num(p.lat, `${field}.lat`, -90, 90, 13.7),
      lon: num(p.lon, `${field}.lon`, -180, 180, 100.5),
      name: str(p.name, `${field}.name`),
    };
  };
  const legs = (v: unknown, field: string): Leg[] => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 20) {
      errors.push(`${field} ต้องเป็น array 1–20 รายการ`);
      return [];
    }
    return v.map((x, i) => {
      const l = (x ?? {}) as Record<string, unknown>;
      return {
        text: str(l.text, `${field}[${i}].text`, 300),
        mode: l.mode === "TRANSIT" ? "TRANSIT" : "WALK",
        minutes: num(l.minutes, `${field}[${i}].minutes`, 0, 600, 0),
        traffic: Boolean(l.traffic),
        wait: Boolean(l.wait),
        unverified: Boolean(l.unverified),
        ...(typeof l.line === "string" && l.line.length <= 100 ? { line: l.line } : {}),
      };
    });
  };

  const fareLegs: FareLegMap = {};
  const rawLegs = (o.fareLegs ?? {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawLegs).slice(0, 30)) {
    const f = (v ?? {}) as Record<string, unknown>;
    const b = f.defaultBaht;
    fareLegs[id] = {
      label: str(f.label, `fareLegs.${id}.label`),
      short: str(f.short, `fareLegs.${id}.short`, 40),
      defaultBaht: b == null ? null : num(b, `fareLegs.${id}.defaultBaht`, 0, 10000, 0),
      badge: f.badge === "official" || f.badge === "user" ? f.badge : "unset",
      source: typeof f.source === "string" ? f.source.slice(0, 500) : "ไม่ระบุแหล่งที่มา",
      ...(typeof f.sourceUrl === "string" && /^https:\/\//.test(f.sourceUrl) ? { sourceUrl: f.sourceUrl } : {}),
      ...(f.monthlyPass ? { monthlyPass: true } : {}),
    };
  }
  if (Object.keys(fareLegs).length === 0) errors.push("fareLegs ว่าง");

  const commuteLeg = (v: unknown, field: string): CommuteLegDef => {
    const c = (v ?? {}) as Record<string, unknown>;
    const routesRaw = c.routes;
    if (!Array.isArray(routesRaw) || routesRaw.length === 0 || routesRaw.length > 20) {
      errors.push(`${field}.routes ต้องเป็น array 1–20 รายการ`);
    }
    const routes: RouteTemplate[] = (Array.isArray(routesRaw) ? routesRaw : []).map((x, i) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(r.fareLegs) ? r.fareLegs.filter((f): f is string => typeof f === "string") : [];
      for (const id of ids) if (!fareLegs[id]) errors.push(`${field}.routes[${i}] อ้าง fareLeg "${id}" ที่ไม่มีใน fareLegs`);
      const d = (r.delayed ?? null) as Record<string, unknown> | null;
      return {
        id: str(r.id, `${field}.routes[${i}].id`, 80),
        title: str(r.title, `${field}.routes[${i}].title`),
        mode: str(r.mode, `${field}.routes[${i}].mode`),
        description: typeof r.description === "string" ? r.description.slice(0, 1000) : "",
        ...(typeof r.tag === "string" && r.tag.length <= 60 ? { tag: r.tag } : {}),
        transfers: num(r.transfers, `${field}.routes[${i}].transfers`, 0, 10, 0),
        fareLegs: ids,
        defaultWin: Boolean(r.defaultWin),
        legs: legs(r.legs, `${field}.routes[${i}].legs`),
        ...(d
          ? {
              delayed: {
                waitMinutes: num(d.waitMinutes, `${field}.routes[${i}].delayed.waitMinutes`, 0, 180, 30),
                tag: typeof d.tag === "string" ? d.tag.slice(0, 60) : "รอนาน",
                description: typeof d.description === "string" ? d.description.slice(0, 500) : "",
              },
            }
          : {}),
      };
    });
    const seen = new Set<string>();
    for (const r of routes) {
      if (seen.has(r.id)) errors.push(`${field} มี route id ซ้ำ: ${r.id}`);
      seen.add(r.id);
    }
    return {
      origin: place(c.origin, `${field}.origin`),
      destination: place(c.destination, `${field}.destination`),
      defaultArriveBy: typeof c.defaultArriveBy === "string" && /^\d{2}:\d{2}$/.test(c.defaultArriveBy) ? c.defaultArriveBy : "09:00",
      waitWindow: typeof c.waitWindow === "string" ? c.waitWindow.slice(0, 60) : "—",
      routes,
    };
  };

  const slo = (o.slo ?? {}) as Record<string, unknown>;
  const profile: CommuteProfile = {
    id: str(o.id, "id", 60).replace(/[^a-zA-Z0-9_-]/g, "-"),
    label: str(o.label, "label"),
    ...(typeof o.note === "string" ? { note: o.note.slice(0, 500) } : {}),
    slo: {
      morning: num(slo.morning, "slo.morning", 10, 600, 85),
      evening: num(slo.evening, "slo.evening", 10, 600, 95),
      targetPercent: num(slo.targetPercent, "slo.targetPercent", 1, 100, 90),
    },
    departBufferMinutes: num(o.departBufferMinutes ?? 10, "departBufferMinutes", 0, 120, 10),
    fareLegs,
    trafficTuning: DEFAULT_TRAFFIC_TUNING, // ปรับละเอียดได้ภายหลัง ยังไม่เปิดให้ import ทับ
    ...(o.winStep ? { winStep: legs([o.winStep], "winStep")[0] } : {}),
    morning: commuteLeg(o.morning, "morning"),
    evening: commuteLeg(o.evening, "evening"),
  };

  return errors.length ? { ok: false, errors: errors.slice(0, 12) } : { ok: true, profile };
}

export function cloneProfile(profile: CommuteProfile, newId: string, newLabel: string): CommuteProfile {
  return JSON.parse(JSON.stringify({ ...profile, id: newId, label: newLabel })) as CommuteProfile;
}
