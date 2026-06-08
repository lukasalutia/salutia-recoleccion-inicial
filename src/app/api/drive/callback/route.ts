import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL("/?drive_error=access_denied", req.nextUrl.origin)
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${req.nextUrl.origin}/api/drive/callback`
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Store token in a short-lived session cookie (ephemeral — no DB)
    const cookieStore = await cookies();
    cookieStore.set("drive_token", JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60, // 1 hour
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.redirect(new URL("/?drive_connected=1", req.nextUrl.origin));
  } catch {
    return NextResponse.redirect(
      new URL("/?drive_error=token_exchange", req.nextUrl.origin)
    );
  }
}
