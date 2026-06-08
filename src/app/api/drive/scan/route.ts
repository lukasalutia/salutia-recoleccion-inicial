import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SCANNABLE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/webp",
  "image/gif",
];

const CLAUDE_SUPPORTED_IMAGES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const MAX_FILES_PER_FOLDER = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MEDICAL_CONFIDENCE_THRESHOLD = 0.35;

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
};

type ClassifiedDriveFile = DriveFile & {
  label: string;
  confidence: number;
};

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const { folderIds }: { folderIds: string[] } = await req.json();
  if (!folderIds?.length) {
    return NextResponse.json({ error: "no_folders" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // Build query: files inside any of the selected folders
    const parentQuery = folderIds.map((id) => `'${id}' in parents`).join(" or ");
    const mimeQuery = SCANNABLE_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ");

    const res = await drive.files.list({
      q: `(${parentQuery}) and (${mimeQuery}) and trashed=false`,
      fields: "files(id,name,mimeType,size)",
      orderBy: "modifiedTime desc",
      pageSize: MAX_FILES_PER_FOLDER * folderIds.length,
    });

    const allFiles: DriveFile[] = (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: f.size ? parseInt(f.size) : undefined,
    }));

    if (allFiles.length === 0) {
      return NextResponse.json({ files: [], total: 0 });
    }

    if (!apiKey) {
      // No API key — return all files unfiltered so user can review
      return NextResponse.json({ files: allFiles, fallback: true, total: allFiles.length });
    }

    const classified = await classifyWithClaude(allFiles, accessToken, apiKey);
    const medical = classified.filter((f) => f.confidence >= MEDICAL_CONFIDENCE_THRESHOLD);

    return NextResponse.json({ files: medical, total: allFiles.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "scan_failed", detail: message }, { status: 500 });
  }
}

async function classifyWithClaude(
  files: DriveFile[],
  accessToken: string,
  apiKey: string
): Promise<ClassifiedDriveFile[]> {
  const results: ClassifiedDriveFile[] = [];
  const chunks = chunkArray(files, 5);
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((f) => classifyOne(f, accessToken, apiKey))
    );
    results.push(...chunkResults);
  }
  return results;
}

async function classifyOne(
  file: DriveFile,
  accessToken: string,
  apiKey: string
): Promise<ClassifiedDriveFile> {
  const nameFallback: ClassifiedDriveFile = { ...file, ...classifyByName(file.name) };

  try {
    if (file.size && file.size > MAX_FILE_BYTES) return nameFallback;

    const isPdf = file.mimeType === "application/pdf";
    const isClaudeImage = CLAUDE_SUPPORTED_IMAGES.includes(file.mimeType);

    if (!isPdf && !isClaudeImage) return nameFallback;

    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!downloadRes.ok) return nameFallback;

    const buffer = await downloadRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

    const contentBlocks: ContentBlock[] = [];

    if (isPdf) {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
    } else {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: file.mimeType, data: base64 },
      });
    }

    contentBlocks.push({
      type: "text",
      text: `Analizá este archivo llamado "${file.name}". ¿Es un documento médico?

Respondé SOLO con JSON:
{"is_medical":true/false,"confidence":0.0-1.0,"label":"Estudio de laboratorio"|"Imagen médica"|"Consulta médica"|"Medicación"|"Vacuna"|"Documento médico"|"No médico"}`,
    });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 128,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!claudeRes.ok) return nameFallback;

    const data = await claudeRes.json();
    const text: string = data.content?.[0]?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return nameFallback;

    const parsed = JSON.parse(jsonMatch[0]) as {
      confidence: number;
      label: string;
    };

    return {
      ...file,
      label: parsed.label ?? "Documento médico",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return nameFallback;
  }
}

function classifyByName(name: string): { label: string; confidence: number } {
  const n = name.toLowerCase();
  if (["lab", "analisis", "hemograma", "sangre", "resultado"].some((k) => n.includes(k)))
    return { label: "Estudio de laboratorio", confidence: 0.7 };
  if (["eco", "radio", "resonancia", "tomografia", "rx"].some((k) => n.includes(k)))
    return { label: "Imagen médica", confidence: 0.7 };
  if (["vacuna"].some((k) => n.includes(k)))
    return { label: "Vacuna", confidence: 0.8 };
  if (["receta", "prescripcion"].some((k) => n.includes(k)))
    return { label: "Medicación", confidence: 0.7 };
  if (["medico", "clinica", "hospital", "consulta", "informe", "estudio"].some((k) => n.includes(k)))
    return { label: "Documento médico", confidence: 0.6 };
  return { label: "Documento médico", confidence: 0.4 };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
