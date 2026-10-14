// src/lib/routing/types.ts

export type RouteStep = {
  instruction: string;
  mode: "WALK" | "TRANSIT";
  durationMinutes: number;
  transitLine?: string;
  departureStop?: string;
  arrivalStop?: string;
};

export type RouteOption = {
  id: string;
  title: string;
  mode: string;
  duration: number;          // เวลารวมทั้งหมด (รวมเวลารอรถแล้ว)
  waitMinutes: number;       // เวลารอรถโดยประมาณ
  transfers: number;         // จำนวนครั้งที่ต่อรถ
  walk: number;              // เวลาเดินรวม (นาที) ไม่รวมเวลารอ
  cost: string;
  description: string;
  tag?: string;
  steps: RouteStep[];
  isLive: boolean;
  unverified: boolean;       // มีขาที่ยังไม่ยืนยันสายรถหรือเวลา
};

export type WeatherStatus = {
  locationName: string;
  temperatureC: number;
  precipitationMm: number;
  rainProbability: number;
  isRaining: boolean;
  summaryText: string;
  // พยากรณ์ฝนล่วงหน้า 2 ชั่วโมง (ช่อง 15 นาที x 8)
  rainOutlook?: { minutesFromNow: number; mm: number }[];
  outlookText?: string;
};

// เวลารอรถเฉลี่ยจริงของผู้ใช้ ต่อ routeId (มาจาก log)
export type WaitOverrides = Record<string, { avgWait: number; samples: number }>;

// สิ่งที่เซิร์ฟเวอร์ดึงให้ (อากาศ + ระยะถนน) ส่วนเส้นทางประกอบฝั่งเบราว์เซอร์
export type ConditionsResponse = {
  fetchedAt: string;
  weather: WeatherStatus;
  roadDistanceKm: number | null;
  baseDriveMinutes: number | null;   // เวลาขับรถตาม OSRM ไม่รวมรถติด
};


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
  waitMinutesActual?: number; // เวลารอรถจริง (นาที)
  crowdLevel?: CrowdLevel;    // 1 = ได้นั่ง, 2 = ยืนสบาย, 3 = อัดแน่น
  departHour?: number;        // ชั่วโมงเวลาไทยที่เริ่มเดินทาง
  profileId?: string;         // ใช้ตอน export/import
};
// ===== ข้อมูลจาก OSRM / Overpass =====
export type NearbyStop = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  distanceM: number;
};

export type NearbyRoute = {
  ref: string;        // เลขสาย เช่น "21"
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
