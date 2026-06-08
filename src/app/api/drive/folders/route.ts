import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name,parents)",
      orderBy: "name",
      pageSize: 200,
    });

    const folders = (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
    }));

    return NextResponse.json({ folders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "folders_failed", detail: message }, { status: 500 });
  }
}
