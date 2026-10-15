// src/lib/routing/conditions.ts
// ฝั่งเซิร์ฟเวอร์: ดึงเฉพาะของที่เบราว์เซอร์ดึงเองไม่สะดวก
// การประกอบเส้นทางอยู่ฝั่ง client เพื่อให้แก้โปรไฟล์ได้โดยไม่ต้อง deploy
import { env, hasTomTom } from "@/lib/routing/env";
import { bkkClock, bkkSlotKey } from "./time";
import type { ConditionsResponse, LiveTraffic, WeatherStatus } from "./types";

export type Coord = { lat: number; lon: number };

async function fetchLiveWeather(lat: number, lon: number, locationName: string): Promise<WeatherStatus> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,precipitation,rain,weather_code` +
      `&hourly=precipitation_probability&minutely_15=precipitation` +
      `&timezone=Asia%2FBangkok&forecast_days=2`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Open-Meteo ตอบ ${res.status}`);

    const data = await res.json();
    const temp = Math.round(Number(data?.current?.temperature_2m ?? 30));
    const precip = Number(data?.current?.precipitation ?? 0);
    const weatherCode = Number(data?.current?.weather_code ?? 0);
    const probArr = data?.hourly?.precipitation_probability;
    const rainProb = Number(
      (Array.isArray(probArr) ? probArr[bkkClock().hour] : undefined) ?? 20
    );

    // rainProb >= 65 ถือว่า "ฝน" แม้ยังไม่ตก เป็นการเผื่อให้เลือกแผนกันฝนไว้ก่อน
    const isRaining = precip > 0.1 || weatherCode >= 51 || rainProb >= 65;

    let summaryText = `อุณหภูมิ ${temp}°C · โอกาสฝนตก ${rainProb}%`;
    if (precip > 0.1 || weatherCode >= 51) {
      summaryText = `กำลังมีฝนตก (${precip} มม.) · ${temp}°C — เลี่ยงเส้นทางที่ต้องเดินไกลหรือรอกลางแจ้งนาน`;
    } else if (rainProb >= 60) {
      summaryText = `มีโอกาสฝนตกสูง (${rainProb}%) · ${temp}°C — ควรเผื่อเวลาหรือเลือกเส้นทางเชื่อม BTS`;
    }

    // จับ index จาก time array จริง ไม่สมมติว่า index 0 คือตอนนี้
    const times: unknown[] = Array.isArray(data?.minutely_15?.time) ? data.minutely_15.time : [];
    const values: unknown[] = Array.isArray(data?.minutely_15?.precipitation)
      ? data.minutely_15.precipitation
      : [];

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
          outlookText = dry
            ? `ฝนน่าจะซาใน ~${dry.minutesFromNow} นาที`
            : "ฝนน่าจะยังตกต่อเนื่องอีกอย่างน้อย 2 ชั่วโมง";
        } else {
          const wetSlot = rainOutlook.find((s) => wet(s.mm));
          outlookText = wetSlot
            ? `ฝนอาจเริ่มตกใน ~${wetSlot.minutesFromNow} นาที`
            : "ไม่มีฝนใน 2 ชั่วโมงข้างหน้า";
        }
      }
    }

    return {
      locationName,
      temperatureC: temp,
      precipitationMm: precip,
      rainProbability: rainProb,
      isRaining,
      summaryText,
      ...(rainOutlook ? { rainOutlook } : {}),
      ...(outlookText ? { outlookText } : {}),
    };
  } catch (e) {
    console.error("Open-Meteo ล่ม", e);
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

// TomTom Routing API: ขอทีเดียวได้ทั้งเวลาจริงและเวลาถ้าถนนโล่ง ประหยัดโควตากว่าเรียก 2 ครั้ง
// TomTom Routing API: ขอทีเดียวได้ทั้งเวลาจริงและเวลาถ้าถนนโล่ง ประหยัดโควตากว่าเรียก 2 ครั้ง
// หมายเหตุ: ไม่ส่ง instructionsType เลย เพราะไม่ต้องการคำสั่งนำทาง
// (ค่า "none" ไม่มีจริง TomTom รับแค่ coded / text / tagged)
async function fetchTomTomTraffic(start: Coord, end: Coord): Promise<LiveTraffic | null> {
  if (!hasTomTom()) return null;
  try {
    const path = `${start.lat},${start.lon}:${end.lat},${end.lon}`;
    const params = new URLSearchParams({
      key: env.tomtomKey,
      traffic: "true",
      computeTravelTimeFor: "all",
      routeType: "fastest",
      travelMode: "car",
    });

    const res = await fetch(
      `https://api.tomtom.com/routing/1/calculateRoute/${encodeURIComponent(path)}/json?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      // 400 = พารามิเตอร์ผิด · 403 = key ผิด/ไม่มีสิทธิ์ Routing · 429 = โควตาหมด
      const body = await res.text();
      console.error(`TomTom ตอบ ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const s = data?.routes?.[0]?.summary;
    const travelSec = Number(s?.travelTimeInSeconds);
    const freeSec = Number(s?.noTrafficTravelTimeInSeconds);
    const meters = Number(s?.lengthInMeters);
    if (!Number.isFinite(travelSec) || !Number.isFinite(freeSec) || freeSec <= 0) return null;

    return {
      travelMinutes: Math.round(travelSec / 60),
      freeFlowMinutes: Math.round(freeSec / 60),
      delayMinutes: Math.round(Number(s?.trafficDelayInSeconds ?? 0) / 60),
      multiplier: Number((travelSec / freeSec).toFixed(3)),
      distanceKm: Number.isFinite(meters) ? Number((meters / 1000).toFixed(1)) : 0,
    };
  } catch (e) {
    console.error("TomTom ล่ม", e);
    return null;
  }
}

// ใช้เมื่อไม่มี TomTom key หรือ TomTom ล่ม
async function fetchOsrmRoadMetrics(
  start: Coord,
  end: Coord
): Promise<{ distanceKm: number | null; baseDriveMinutes: number | null }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`OSRM ตอบ ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error("OSRM ไม่มีเส้นทาง");
    return {
      distanceKm: Number((Number(route.distance) / 1000).toFixed(1)),
      baseDriveMinutes: Math.round(Number(route.duration) / 60),
    };
  } catch (e) {
    console.error("OSRM ล่ม", e);
    return { distanceKm: null, baseDriveMinutes: null };   // ไม่เดาตัวเลขใส่
  }
}

export async function fetchConditions(
  origin: Coord & { name: string },
  destination: Coord
): Promise<ConditionsResponse> {
  const [weather, live] = await Promise.all([
    fetchLiveWeather(origin.lat, origin.lon, origin.name),
    fetchTomTomTraffic(origin, destination),
  ]);

  // TomTom ให้ระยะทางมาด้วย ถ้าได้แล้วไม่ต้องรบกวน OSRM public instance
  if (live) {
    return {
      fetchedAt: new Date().toISOString(),
      weather,
      roadDistanceKm: live.distanceKm > 0 ? live.distanceKm : null,
      baseDriveMinutes: live.freeFlowMinutes,
      liveTraffic: live,
    };
  }

  const road = await fetchOsrmRoadMetrics(origin, destination);
  return {
    fetchedAt: new Date().toISOString(),
    weather,
    roadDistanceKm: road.distanceKm,
    baseDriveMinutes: road.baseDriveMinutes,
    liveTraffic: null,
  };
}
