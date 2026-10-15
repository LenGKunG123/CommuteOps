// src/lib/routing/traffic.ts
import { bkkClock } from "./time";
import type { LiveTraffic } from "./types";

export type TrafficWindow = { from: number; to: number; multiplier: number; label: string };

export type TrafficTuning = {
  offPeak: { multiplier: number; label: string };
  windows: TrafficWindow[];      // ชั่วโมงทศนิยม เช่น 17.25 = 17:15
  weekendMultiplier: number;
  rainPenalty: number;
};

// ค่าเดาทั้งหมด ใช้เมื่อไม่มีข้อมูลจราจรสด
export const DEFAULT_TRAFFIC_TUNING: TrafficTuning = {
  offPeak: { multiplier: 1.15, label: "จราจรคล่องตัว" },
  windows: [
    { from: 6.5, to: 8.75, multiplier: 1.55, label: "ชั่วโมงเร่งด่วนเช้า" },
    { from: 8.75, to: 17.25, multiplier: 1.25, label: "จราจรปานกลางช่วงกลางวัน" },
    { from: 17.25, to: 20.5, multiplier: 1.75, label: "ชั่วโมงเร่งด่วนเย็น" },
  ],
  weekendMultiplier: 1.15,
  rainPenalty: 0.25,
};

export type TrafficState = {
  multiplier: number;
  label: string;
  source: "live" | "clock";
  delayMinutes?: number;
};

// ถ้ามีจราจรสด ใช้อัตราส่วน travel/freeFlow แทนค่าเดาจากนาฬิกา
// และไม่บวกค่าปรับฝนอีก เพราะตัวเลขสดสะท้อนผลของฝนอยู่แล้ว ถ้าบวกจะนับซ้ำ
export function calculateTraffic(
  tuning: TrafficTuning,
  isRaining: boolean,
  live?: LiveTraffic | null,
  at: Date = new Date()
): TrafficState {
  if (live && Number.isFinite(live.multiplier) && live.multiplier > 0) {
    const m = Number(Math.min(Math.max(live.multiplier, 0.8), 4).toFixed(2));
    const parts = [`จราจรสด: ช้ากว่าถนนโล่ง ${Math.round((m - 1) * 100)}%`];
    if (live.delayMinutes >= 1) parts.push(`+${Math.round(live.delayMinutes)} นาทีจากรถติด`);
    if (isRaining) parts.push("ฝนตก (รวมในตัวเลขสดแล้ว)");
    return { multiplier: m, label: parts.join(" · "), source: "live", delayMinutes: live.delayMinutes };
  }

  const { hour, minute, weekday } = bkkClock(at);
  const timeDec = hour + minute / 60;
  const isWeekend = weekday === 0 || weekday === 6;

  let multiplier = isWeekend ? tuning.weekendMultiplier : tuning.offPeak.multiplier;
  let label = isWeekend ? "วันหยุด · จราจรเบา" : tuning.offPeak.label;

  if (!isWeekend) {
    const w = tuning.windows.find((x) => timeDec >= x.from && timeDec <= x.to);
    if (w) {
      multiplier = w.multiplier;
      label = w.label;
    }
  }

  if (isRaining) {
    multiplier = Number((multiplier + tuning.rainPenalty).toFixed(2));
    label += " + ฝนทำให้ติดสะสม";
  }

  return { multiplier, label: `ประมาณการ: ${label}`, source: "clock" };
}
