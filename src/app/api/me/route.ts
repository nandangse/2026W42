import { NextResponse } from "next/server";
import { currentUser, RAGHU_EMAIL } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/me — the signed-in user's identity + role, used by the client to
// route (uploader → upload page only) and to gate UI (admin page, mgmt edits).
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      disabled: u.disabled,
      isRaghu: u.email.toLowerCase() === RAGHU_EMAIL,
    },
  });
}
