// src/app/api/sync/route.ts
// proxy ไป Supabase เพื่อไม่ให้ anon key หลุดไปฝั่งเบราว์เซอร์
import { NextRequest, NextResponse } from "next/server";
import { env, hasSupabase } from "@/lib/routing/env";
import { clientIp, rateLimit } from "@/lib/routing/rateLimit";

type PushItem = {
  kind?: unknown;
  itemId?: unknown;
  payload?: unknown;
  deleted?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["log", "profile", "fares"]);
const MAX_ITEMS = 400;

function sbHeaders(): Record<string, string> {
  return {
    apikey: env.supabaseAnonKey,
    Authorization: `Bearer ${env.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  console.log("📍 /api/sync POST called");
  
  if (!hasSupabase()) {
    console.log("❌ Supabase not configured");
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า Supabase บนเซิร์ฟเวอร์ (SUPABASE_URL / SUPABASE_ANON_KEY)" },
      { status: 503 }
    );
  }
  console.log("✓ Supabase configured");

  if (!rateLimit(`sync:${clientIp(req)}`, 20, 60_000)) {
    console.log("❌ Rate limit exceeded");
    return NextResponse.json({ error: "ซิงค์ถี่เกินไป รอ 1 นาที" }, { status: 429 });
  }
  console.log("✓ Rate limit passed");

  try {
    const body = await req.json();
    console.log("📦 Request body received");
    
    const syncKey = String(body?.syncKey ?? "");
    console.log("🔑 syncKey:", syncKey.slice(0, 8) + "...");
    
    if (!UUID_RE.test(syncKey)) {
      console.log("❌ Invalid sync key format");
      return NextResponse.json({ error: "sync key ไม่ถูกต้อง" }, { status: 400 });
    }
    console.log("✓ Sync key valid");

    const rawPush: unknown[] = Array.isArray(body?.push) ? body.push : [];
    console.log(`📤 Items to push: ${rawPush.length}`);
    
    if (rawPush.length > MAX_ITEMS) {
      console.log("❌ Too many items to push");
      return NextResponse.json(
        { error: `ส่งได้ไม่เกิน ${MAX_ITEMS} รายการต่อครั้ง` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const rows = rawPush.flatMap((raw) => {
      const it = (raw ?? {}) as PushItem;
      const kind = String(it.kind ?? "");
      if (!KINDS.has(kind)) return [];
      const itemId = String(it.itemId ?? "").slice(0, 120);
      if (!itemId) return [];
      const json = JSON.stringify(it.payload ?? null);
      if (json.length > 20_000) return [];
      return [{
        sync_key: syncKey,
        kind,
        item_id: itemId,
        payload: it.payload ?? null,
        deleted: Boolean(it.deleted),
        updated_at: nowIso,
      }];
    });
    console.log(`✓ Rows prepared: ${rows.length}`);

    if (rows.length > 0) {
      console.log("📤 Pushing to Supabase...");
      const res = await fetch(`${env.supabaseUrl}/rest/v1/commute_sync`, {
        method: "POST",
        headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      console.log(`   Response status: ${res.status}`);
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`❌ Supabase POST failed: ${text.slice(0, 200)}`);
        return NextResponse.json(
          { error: "บันทึกขึ้นคลาวด์ไม่สำเร็จ", details: text.slice(0, 300) },
          { status: 502 }
        );
      }
      console.log("✓ Push successful");
    }

    console.log("📥 Pulling from Supabase...");
    const pullUrl =
      `${env.supabaseUrl}/rest/v1/commute_sync` +
      `?sync_key=eq.${syncKey}&select=kind,item_id,payload,deleted,updated_at&limit=2000`;

    const pull = await fetch(pullUrl, { headers: sbHeaders(), cache: "no-store" });
    console.log(`   Response status: ${pull.status}`);
    
    if (!pull.ok) {
      const text = await pull.text();
      console.error(`❌ Supabase GET failed: ${text.slice(0, 200)}`);
      return NextResponse.json(
        { error: "ดึงข้อมูลจากคลาวด์ไม่สำเร็จ", details: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const raw: unknown = await pull.json();
    const items = (Array.isArray(raw) ? raw : []).map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        kind: String(row.kind ?? ""),
        itemId: String(row.item_id ?? ""),
        payload: row.payload ?? null,
        deleted: Boolean(row.deleted),
        updatedAt: String(row.updated_at ?? ""),
      };
    });
    console.log(`✓ Pull successful: ${items.length} items`);

    console.log("✓ /api/sync completed successfully");
    return NextResponse.json({ pushed: rows.length, items });
  } catch (error) {
    console.error("❌ /api/sync ERROR:");
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack?.split('\n').slice(0, 3).join('\n'));
    } else {
      console.error("Unknown error:", error);
    }
    
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ซิงค์ไม่สำเร็จ", details }, { status: 502 });
  }
}

