// src/lib/routing/fares.ts
export type FareLegId = string;
export type FareBadge = "official" | "user" | "unset";

export type FareLegDef = {
  label: string;
  short: string;
  defaultBaht: number | null;  // null = ไม่มีแหล่งอ้างอิง ให้ผู้ใช้กรอก ห้ามเดาใส่
  badge: FareBadge;
  source: string;
  sourceUrl?: string;
  monthlyPass?: boolean;       // นับรวมเวลาเทียบกับตั๋วรายเดือน ขสมก.
};

export type FareLegMap = Record<FareLegId, FareLegDef>;

export const BMTA_SOURCE_URL = "https://www.bmta.co.th/th/services";
export const BTS_SOURCE_URL = "https://www.bts.co.th/routemap.html";

// ราคาตั๋วรายเดือนรถปรับอากาศบนเว็บ ขสมก. ไม่ระบุวันที่มีผล และยังไม่ยืนยันว่าใช้กับสายทางด่วนได้
export const BMTA_AC_MONTHLY_PASS = 1020;

// ขาที่ใช้ซ้ำได้หลายโปรไฟล์ โปรไฟล์หยิบไปเฉพาะที่ใช้ และทับค่าได้
export const COMMON_FARE_LEGS: FareLegMap = {
  bus21e: {
    short: "21E",
    label: "รถเมล์ 21E (ทางด่วน) ต่อเที่ยว",
    defaultBaht: 22,
    badge: "user", // ตารางทางการไม่ได้ระบุสาย 21E ตรง ๆ ตัวเลขนี้ผู้ใช้ยืนยันเอง
    source: "ตารางรถปรับอากาศ ขสมก. 12–20 บาทตามระยะ + ทางด่วน 2 บาท · 22 = 20 + 2 (ผู้ใช้ยืนยัน)",
    sourceUrl: BMTA_SOURCE_URL,
    monthlyPass: true,
  },
  bus141: {
    short: "141",
    label: "รถเมล์ 141 (ทางด่วน) ต่อเที่ยว",
    defaultBaht: null,
    badge: "unset",
    source: "ยังไม่ยืนยันจากแหล่งทางการ ตารางระบุรถปรับอากาศ 12–20 บาท + ทางด่วน 2 บาท ให้กรอกที่จ่ายจริง",
    sourceUrl: BMTA_SOURCE_URL,
    monthlyPass: true,
  },
  busPlain: {
    short: "รถเมล์",
    label: "รถเมล์ธรรมดา/ปรับอากาศ (ไม่ขึ้นทางด่วน) ต่อเที่ยว",
    defaultBaht: null,
    badge: "unset",
    source: "ขึ้นกับประเภทรถและระยะ ยังไม่ยืนยันเลขสายที่ใช้ ให้กรอกที่จ่ายจริง",
    sourceUrl: BMTA_SOURCE_URL,
    monthlyPass: true,
  },
  feeder: {
    short: "รถต่อ",
    label: "รถต่อ (สาย 21 / กะป๊อ / สองแถว) ต่อเที่ยว",
    defaultBaht: null,
    badge: "unset",
    source: "เปลี่ยนตามประเภทรถและระยะ ไม่มีค่าอ้างอิงทางการ ให้กรอกที่จ่ายจริง",
  },
  access: {
    short: "ค่าไปจุดขึ้นรถ",
    label: "ค่าเดินทางไปจุดขึ้นรถ (เช่น MRT ไปจามจุรี)",
    defaultBaht: 0,
    badge: "user",
    source: "ตั้งต้น 0 บาท (เดินไป) ถ้าใช้ MRT หรืออย่างอื่นให้กรอกค่าจริง",
  },
  win: {
    short: "วิน",
    label: "วินมอเตอร์ไซค์ช่วงท้าย",
    defaultBaht: 10,
    badge: "user",
    source: "ผู้ใช้แจ้ง 10 บาท (วินไม่มีอัตราทางการ)",
  },
};

export const WIN_LEG_ID: FareLegId = "win";

export type FareSettings = {
  fares: Record<FareLegId, number>;   // ราคาที่ผู้ใช้กรอกทับ
  winPlans: Record<string, boolean>;  // เปิด/ปิดวินรายแผน
  morningPlan: string;
  eveningPlan: string;
  altEveningPlan: string;
  altEveningDays: number;
  offDays: number;
  extraRoundTrips: number;
};

export const EMPTY_FARE_SETTINGS: FareSettings = {
  fares: {},
  winPlans: {},
  morningPlan: "",
  eveningPlan: "",
  altEveningPlan: "",
  altEveningDays: 0,
  offDays: 0,
  extraRoundTrips: 0,
};

export function getFare(id: FareLegId, legs: FareLegMap, settings: FareSettings): number | null {
  const v = settings.fares[id];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  return legs[id]?.defaultBaht ?? null;
}

export type LegCost = { id: FareLegId; baht: number | null };

export function costOfLegs(ids: FareLegId[], legs: FareLegMap, settings: FareSettings) {
  const rows: LegCost[] = ids.map((id) => ({ id, baht: getFare(id, legs, settings) }));
  return {
    rows,
    knownBaht: rows.reduce((s, r) => s + (r.baht ?? 0), 0),
    unknown: rows.filter((r) => r.baht == null).map((r) => r.id),
  };
}

// ข้อความค่าโดยสารสำหรับการ์ดเส้นทาง บอกชัดว่าส่วนไหนยังไม่กรอก
export function fareText(ids: FareLegId[], legs: FareLegMap, settings: FareSettings): string {
  if (ids.length === 0) return "—";
  const { knownBaht, unknown } = costOfLegs(ids, legs, settings);
  if (unknown.length === 0) return `${knownBaht} บาท`;
  const names = unknown.map((id) => legs[id]?.short ?? id).join(", ");
  return knownBaht > 0 ? `${knownBaht} บาท + ${names} (ยังไม่กรอก)` : `ยังไม่กรอก: ${names}`;
}

// จำนวนวันจันทร์–ศุกร์ในเดือน ยังไม่หักวันหยุดนักขัตฤกษ์ (ไม่มีปฏิทินทางการในแอป)
export function countWeekdays(year: number, month0: number): number {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month0, d).getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}
