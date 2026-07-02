import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, pkceChallenge, randomToken } from "@/lib/oauth";

export async function GET() {
  const session = await getSession();
  const state = randomToken();
  const codeVerifier = randomToken();
  session.oauthState = state;
  session.codeVerifier = codeVerifier;
  await session.save();

  return NextResponse.redirect(
    authorizeUrl(state, await pkceChallenge(codeVerifier))
  );
}
