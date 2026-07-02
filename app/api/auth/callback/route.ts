import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  absoluteUrl,
  exchangeCode,
  fetchCurrentUser,
  revokeToken,
} from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const params = request.nextUrl.searchParams;

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = session.oauthState;
  const codeVerifier = session.codeVerifier;

  delete session.oauthState;
  delete session.codeVerifier;

  const loginWithError = async (error: string) => {
    await session.save();
    return NextResponse.redirect(absoluteUrl(`/login?error=${error}`));
  };

  if (params.get("error")) {
    return loginWithError("oauth_denied");
  }
  if (!code || !state || !expectedState || !codeVerifier || state !== expectedState) {
    return loginWithError("oauth_failed");
  }

  let accessToken: string;
  try {
    accessToken = (await exchangeCode(code, codeVerifier)).access_token;
  } catch (error) {
    console.error("OAuth token exchange failed:", error);
    return loginWithError("oauth_failed");
  }

  try {
    const user = await fetchCurrentUser(accessToken);
    if (user.admin !== true) {
      await revokeToken(accessToken).catch(() => {});
      session.destroy();
      return NextResponse.redirect(absoluteUrl("/login?error=not_admin"));
    }

    session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url ?? null,
    };
    session.accessToken = accessToken;
    await session.save();
    return NextResponse.redirect(absoluteUrl("/"));
  } catch (error) {
    console.error("OAuth callback failed:", error);
    await revokeToken(accessToken).catch(() => {});
    return loginWithError("oauth_failed");
  }
}
