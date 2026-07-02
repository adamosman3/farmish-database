import type { SessionOptions } from "iron-session";

// Kept free of next/headers imports so middleware (edge runtime) can
// import the options and types directly.

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface SessionData {
  user?: SessionUser;
  accessToken?: string;
  // Transient values held between the /login redirect and the OAuth callback.
  oauthState?: string;
  codeVerifier?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "farmish_dashboard_session",
  // Matches Farmish's 2-hour access-token life. On expiry the middleware
  // sends the user back through OAuth, which is invisible for anyone still
  // signed into Farmish (Doorkeeper skips the consent screen).
  ttl: 60 * 60 * 2,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};
