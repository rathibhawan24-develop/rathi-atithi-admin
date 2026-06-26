// Short URL redirect for invoice links sent over WhatsApp.
// https://admin.rathiatithibhawan.org/i/RAB-XXXXX → /api/invoice/RAB-XXXXX
//
// Half the length of the canonical URL, looks cleaner in chat. The actual
// PDF generation still happens at /api/invoice — this is just a 302.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!/^[A-Z0-9-]{6,20}$/i.test(code)) {
    return new NextResponse("Invalid code", { status: 400 });
  }
  return NextResponse.redirect(
    new URL(`/api/invoice/${code}`, req.url),
    302
  );
}
