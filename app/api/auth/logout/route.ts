import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { revokeToken } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const accessToken = session.accessToken;
  session.destroy();

  if (accessToken) {
    await revokeToken(accessToken).catch((error) => {
      console.error("Token revocation failed:", error);
    });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
