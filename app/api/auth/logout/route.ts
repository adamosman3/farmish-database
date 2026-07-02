import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { absoluteUrl, revokeToken } from "@/lib/oauth";

export async function GET() {
  const session = await getSession();
  const accessToken = session.accessToken;
  session.destroy();

  if (accessToken) {
    await revokeToken(accessToken).catch((error) => {
      console.error("Token revocation failed:", error);
    });
  }

  return NextResponse.redirect(absoluteUrl("/login"));
}
