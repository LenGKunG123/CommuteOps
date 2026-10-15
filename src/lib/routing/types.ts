// src/lib/routing/types.ts
// ไฟล์นี้ไม่ import อะไรเลย เป็นฐานของทุกไฟล์

export type RouteStep = {
  instruction: string;
  mode: "WALK" | "TRANSIT";
  durationMinutes: number;
  transitLine?: string;
};

export type RouteOption = {
  id: string;
  title: string;
  mode: string;
  duration: number;      // เวลารวม (รวมรอรถแล้ว)
  waitMinutes: number;
  transfers: number;
  walk: number;          // เวลาเดินรวม ไม่รวมเวลารอ
  cost: string;
  description: string;
  tag?: string;
  steps: RouteStep[];
  isLive: boolean;
  unverified: boolean;   // มีขาที่ยังไม่ยืนยันสายรถหรือเวลา
};

export type WeatherStatus = {
  locationName: string;
  temperatureC: number;
  precipitationMm: number;
  rainProbability: number;
  isRaining: boolean;
  summaryText: string;
  rainOutlook?: { minutesFromNow: number; mm: number }[];
  outlookText?: string;
};

// จราจรสดจาก TomTom (เวลารถส่วนตัว ไม่ใช่รถเมล์ที่จอดรับส่ง)
export type LiveTraffic = {
  travelMinutes: number;
  freeFlowMinutes: number;
  delayMinutes: number;
  multiplier: number;    // travel / freeFlow
  distanceKm: number;
};

export type ConditionsResponse = {
  fetchedAt: string;
  weather: WeatherStatus;
  roadDistanceKm: number | null;
  baseDriveMinutes: number | null;
  liveTraffic: LiveTraffic | null;   // null = ไม่มี key หรือ API ล่ม
};

export type NearbyStop = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  distanceM: number;
};

export type NearbyRoute = {
  ref: string;
  name: string;
  from?: string;
  to?: string;
  operator?: string;
};

export type StopsResponse = {
  stops: NearbyStop[];
  routes: NearbyRoute[];
  note: string;
};

// เวลารอเฉลี่ยจริงของผู้ใช้ ต่อ routeId
export type WaitOverrides = Record<string, { avgWait: number; samples: number }>;

export type ActiveTrip = {
  routeId: string;
  routeTitle: string;
  commuteType: "morning" | "evening";
  origin: string;
  destination: string;
  startedAtIso: string;
  estimatedMinutes: number;
};

export type CrowdLevel = 1 | 2 | 3;

export type CommuteLog = {
  id: string;
  dateStr: string;
  commuteType: "morning" | "evening";
  routeId: string;
  routeTitle: string;
  origin: string;
  destination: string;
  startedAtIso: string;
  endedAtIso: string;
  actualMinutes: number;
  estimatedMinutes: number;
  diffMinutes: number;        // บวก = ช้ากว่าที่คาด
  metSlo: boolean;
  waitMinutesActual?: number;
  crowdLevel?: CrowdLevel;
  departHour?: number;
  profileId?: string;
};
