// src/lib/routing/time.ts
const BKK_TZ = "Asia/Bangkok";
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export type BkkClock = { date: string; hour: number; minute: number; weekday: number };

// อ่านเวลาไทยผ่าน Intl ใช้ได้ทั้ง server และ browser ที่ตั้งโซนเวลาอื่น
export function bkkClock(at: Date = new Date()): BkkClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BKK_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: BKK_TZ, weekday: "short" })
    .format(at)
    .slice(0, 3);
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,   // en-GB คืน "24" ตอนเที่ยงคืน
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[wd] ?? 1,
  };
}

// คีย์ช่วง 15 นาทีปัจจุบัน รูปแบบเดียวกับ minutely_15.time ของ Open-Meteo
export function bkkSlotKey(at: Date = new Date()): string {
  const { date, hour, minute } = bkkClock(at);
  const slot = Math.floor(minute / 15) * 15;
  return `${date}T${String(hour).padStart(2, "0")}:${String(slot).padStart(2, "0")}`;
}

export function bkkHourOf(iso: string): number {
  return bkkClock(new Date(iso)).hour;
}

export function bkkMonthOf(iso: string): string {
  return bkkClock(new Date(iso)).date.slice(0, 7);   // YYYY-MM
}

export function parseHhMm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function formatHhMm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx] ?? null;
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
