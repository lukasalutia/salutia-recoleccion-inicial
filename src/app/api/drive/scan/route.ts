import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const MEDICAL_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/webp",
  "image/gif",
];

const MAX_FILES = 30;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file
const MEDICAL_CONFIDENCE_THRESHOLD = 0.75;

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

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. List all PDF/image files from Drive
    const mimeQuery = MEDICAL_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ");
    const res = await drive.files.list({
      q: `(${mimeQuery}) and trashed=false`,
      fields: "files(id,name,mimeType,size)",
      orderBy: "modifiedTime desc",
      pageSize: MAX_FILES,
    });

    const allFiles: DriveFile[] = (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: f.size ? parseInt(f.size) : undefined,
    }));

    if (allFiles.length === 0) {
      return NextResponse.json({ files: [] });
    }

    // 2. If no API key, fall back to name-based heuristic
    if (!apiKey) {
      return NextResponse.json({ files: allFiles, fallback: true });
    }

    // 3. Download each file and classify with Claude
    const classified = await classifyFilesWithClaude(allFiles, accessToken, apiKey);
    const medical = classified.filter((f) => f.confidence >= MEDICAL_CONFIDENCE_THRESHOLD);

    return NextResponse.json({ files: medical });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "scan_failed", detail: message }, { status: 500 });
  }
}

async function classifyFilesWithClaude(
  files: DriveFile[],
  accessToken: string,
  apiKey: string
): Promise<ClassifiedDriveFile[]> {
  // Process in parallel with concurrency limit of 5
  const results: ClassifiedDriveFile[] = [];
  const chunks = chunkArray(files, 5);

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((f) => classifySingleFile(f, accessToken, apiKey))
    );
    results.push(...chunkResults);
  }

  return results;
}

async function classifySingleFile(
  file: DriveFile,
  accessToken: string,
  apiKey: string
): Promise<ClassifiedDriveFile> {
  // When classification fails, fall back to name-based (conservative — won't pass 0.75 threshold unless name is clearly medical)
  const fallback: ClassifiedDriveFile = {
    ...file,
    ...classifyByName(file.name),
  };

  try {
    // Skip files that are too large
    if (file.size && file.size > MAX_FILE_BYTES) {
      return { ...file, ...classifyByName(file.name) };
    }

    // Download file content from Drive
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!downloadRes.ok) return fallback;

    const buffer = await downloadRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Build Claude content based on MIME type
    const isImage = file.mimeType.startsWith("image/");
    const isPdf = file.mimeType === "application/pdf";

    if (!isImage && !isPdf) return fallback;

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
      const mediaType = file.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
    }

    contentBlocks.push({
      type: "text",
      text: `Analizá este archivo llamado "${file.name}". Determiná si es un documento médico.

Respondé SOLO con JSON válido:
{
  "is_medical": true/false,
  "confidence": 0.0-1.0,
  "label": "Estudio de laboratorio" | "Imagen médica" | "Consulta médica" | "Medicación" | "Vacuna" | "Documento médico" | "No médico"
}`,
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
        max_tokens: 256,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!claudeRes.ok) return fallback;

    const data = await claudeRes.json();
    const text: string = data.content?.[0]?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as {
      is_medical: boolean;
      confidence: number;
      label: string;
    };

    return {
      ...file,
      label: parsed.label ?? "Documento médico",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return fallback;
  }
}

function classifyByName(name: string): { label: string; confidence: number } {
  const n = name.toLowerCase();
  if (["lab", "analisis", "hemograma", "sangre"].some((k) => n.includes(k)))
    return { label: "Estudio de laboratorio", confidence: 0.7 };
  if (["eco", "radio", "resonancia", "tomografia", "rx"].some((k) => n.includes(k)))
    return { label: "Imagen médica", confidence: 0.7 };
  if (["vacuna"].some((k) => n.includes(k)))
    return { label: "Vacuna", confidence: 0.8 };
  if (["receta", "prescripcion"].some((k) => n.includes(k)))
    return { label: "Medicación", confidence: 0.7 };
  if (["medico", "clinica", "hospital", "consulta", "resultado", "informe"].some((k) => n.includes(k)))
    return { label: "Documento médico", confidence: 0.6 };
  return { label: "Documento médico", confidence: 0.4 };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
