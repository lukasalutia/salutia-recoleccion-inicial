import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SCANNABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/webp",
  "image/gif",
]);

const MAX_MESSAGES = 30;

type GmailAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  subject: string;
};

type MessagePart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: MessagePart[];
};

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "has:attachment",
      maxResults: MAX_MESSAGES,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) return NextResponse.json({ attachments: [] });

    const attachments: GmailAttachment[] = [];
    const chunks = chunkArray(messages, 10);

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (msg) => {
          try {
            const msgRes = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "full",
            });

            const headers = msgRes.data.payload?.headers ?? [];
            const subject = headers.find((h) => h.name === "Subject")?.value ?? "Sin asunto";

            const parts = getAllParts(msgRes.data.payload as MessagePart | undefined);
            return parts
              .filter(
                (p) =>
                  p.filename &&
                  p.filename.length > 0 &&
                  p.body?.attachmentId &&
                  SCANNABLE_MIME_TYPES.has(p.mimeType ?? "")
              )
              .map((p) => ({
                messageId: msg.id!,
                attachmentId: p.body!.attachmentId!,
                filename: p.filename!,
                mimeType: p.mimeType!,
                size: p.body?.size ?? 0,
                subject,
              }));
          } catch {
            return [];
          }
        })
      );
      attachments.push(...results.flat());
    }

    return NextResponse.json({ attachments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "gmail_search_failed", detail: message }, { status: 500 });
  }
}

function getAllParts(part: MessagePart | undefined): MessagePart[] {
  if (!part) return [];
  const result: MessagePart[] = [part];
  for (const child of part.parts ?? []) {
    result.push(...getAllParts(child));
  }
  return result;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
