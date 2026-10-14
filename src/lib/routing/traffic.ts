// src/lib/routing/traffic.ts
// ตัวคูณจราจรจาก "เวลา" ไม่ใช่ข้อมูลจราจรสด ตัวเลขทั้งหมดเป็นค่าเดา ปรับได้รายโปรไฟล์
import { bkkClock } from "./time";

export type TrafficWindow = { from: number; to: number; multiplier: number; label: string };

export type TrafficTuning = {
  offPeak: { multiplier: number; label: string };
  windows: TrafficWindow[];       // ชั่วโมงทศนิยม เช่น 17.25 = 17:15
  weekendMultiplier: number;
  rainPenalty: number;
};

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

export type TrafficState = { multiplier: number; label: string };

export function calculateTraffic(
  tuning: TrafficTuning,
  isRaining: boolean,
  at: Date = new Date()
): TrafficState {
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
  return { multiplier, label };
}
