// src/lib/routing/conditions.ts
// ฝั่งเซิร์ฟเวอร์: ดึงเฉพาะของที่เบราว์เซอร์ดึงเองไม่สะดวก (อากาศ + ระยะถนน)
// ตัวคูณจราจรและการประกอบเส้นทางย้ายไปฝั่ง client เพื่อให้แก้โปรไฟล์ได้โดยไม่ต้อง deploy
import { bkkClock, bkkSlotKey } from "./time";
import type { ConditionsResponse, WeatherStatus } from "./types";

type Coord = { lat: number; lon: number };

async function fetchLiveWeather(lat: number, lon: number, locationName: string): Promise<WeatherStatus> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,precipitation,rain,weather_code` +
      `&hourly=precipitation_probability&minutely_15=precipitation` +
      `&timezone=Asia%2FBangkok&forecast_days=2`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Weather API failed");

    const data = await res.json();
    const temp = Math.round(data.current?.temperature_2m ?? 30);
    const precip = data.current?.precipitation ?? 0;
    const weatherCode = data.current?.weather_code ?? 0;
    const rainProb = data.hourly?.precipitation_probability?.[bkkClock().hour] ?? 20;

    // rainProb >= 65 ถือว่า "ฝน" ทั้งที่ยังไม่ตก เป็นการเผื่อให้เลือกแผนกันฝนไว้ก่อน
    const isRaining = precip > 0.1 || weatherCode >= 51 || rainProb >= 65;

    let summaryText = `อุณหภูมิ ${temp}°C · โอกาสฝนตก ${rainProb}%`;
    if (precip > 0.1 || weatherCode >= 51) {
      summaryText = `กำลังมีฝนตก (${precip} มม.) · ${temp}°C — เลี่ยงเส้นทางที่ต้องเดินไกลหรือรอกลางแจ้งนาน`;
    } else if (rainProb >= 60) {
      summaryText = `มีโอกาสฝนตกสูง (${rainProb}%) · ${temp}°C — ควรเผื่อเวลาหรือเลือกเส้นทางเชื่อม BTS`;
    }

    // จับ index จาก time array จริง ไม่สมมติว่า index 0 คือตอนนี้
    const times: unknown[] = Array.isArray(data.minutely_15?.time) ? data.minutely_15.time : [];
    const values: unknown[] = Array.isArray(data.minutely_15?.precipitation) ? data.minutely_15.precipitation : [];

    let rainOutlook: { minutesFromNow: number; mm: number }[] | undefined;
    let outlookText: string | undefined;

    if (times.length > 0 && times.length === values.length) {
      const key = bkkSlotKey();
      let startIdx = times.findIndex((t) => typeof t === "string" && t.slice(0, 16) >= key);
      if (startIdx < 0) startIdx = Math.max(0, times.length - 8);
      rainOutlook = values.slice(startIdx, startIdx + 8).map((mm, i) => ({
        minutesFromNow: i * 15,
        mm: Number(mm ?? 0),
      }));

      const first = rainOutlook[0];
      if (first) {
        const wet = (mm: number) => mm >= 0.1;
        if (wet(first.mm) || precip > 0.1) {
          const dry = rainOutlook.find((s) => s.minutesFromNow > 0 && !wet(s.mm));
          outlookText = dry ? `ฝนน่าจะซาใน ~${dry.minutesFromNow} นาที` : "ฝนน่าจะยังตกต่อเนื่องอีกอย่างน้อย 2 ชั่วโมง";
        } else {
          const wetSlot = rainOutlook.find((s) => wet(s.mm));
          outlookText = wetSlot ? `ฝนอาจเริ่มตกใน ~${wetSlot.minutesFromNow} นาที` : "ไม่มีฝนใน 2 ชั่วโมงข้างหน้า";
        }
      }
    }

    return { locationName, temperatureC: temp, precipitationMm: precip, rainProbability: rainProb, isRaining, summaryText, rainOutlook, outlookText };
  } catch {
    return {
      locationName,
      temperatureC: 31,
      precipitationMm: 0,
      rainProbability: 15,
      isRaining: false,
      summaryText: "ดึงข้อมูลฝนสดไม่ได้ ใช้ค่าปกติแทน",
    };
  }
}

// ระยะทางใช้แสดงผลเท่านั้น ยังไม่ได้นำ duration ของ OSRM ไปคำนวณเวลาเส้นทาง
// OSRM ให้เวลาขับรถตามความเร็วจำกัดถนน ไม่รวมรถติด และไม่ใช่เส้นทางรถเมล์ที่จอดรับส่ง
async function fetchOsrmRoadMetrics(
  start: Coord,
  end: Coord
): Promise<{ distanceKm: number | null; baseDriveMinutes: number | null }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("OSRM failed");
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("No route");
    return {
      distanceKm: Number((route.distance / 1000).toFixed(1)),
      baseDriveMinutes: Math.round(route.duration / 60),
    };
  } catch {
    return { distanceKm: null, baseDriveMinutes: null }; // ไม่เดาตัวเลขใส่
  }
}

export async function fetchConditions(
  origin: Coord & { name: string },
  destination: Coord
): Promise<ConditionsResponse> {
  const [weather, road] = await Promise.all([
    fetchLiveWeather(origin.lat, origin.lon, origin.name),
    fetchOsrmRoadMetrics(origin, destination),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    weather,
    roadDistanceKm: road.distanceKm,
    baseDriveMinutes: road.baseDriveMinutes,
  };
}
