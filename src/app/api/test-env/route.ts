import { NextResponse } from "next/server";
import { env, hasSupabase } from "@/lib/routing/env";

export async function GET() {
  return NextResponse.json({
    supabaseUrl: env.supabaseUrl ? "✓ มี" : "✗ ว่าง",
    supabaseAnonKey: env.supabaseAnonKey ? "✓ มี" : "✗ ว่าง",
    hasSupabase: hasSupabase(),
  });
}
