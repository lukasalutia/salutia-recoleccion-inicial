import { NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";

// MIME types likely to contain medical documents
const MEDICAL_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/webp",
];

// Filename keywords that suggest medical documents
const MEDICAL_KEYWORDS = [
  "analisis", "análisis", "laboratorio", "lab", "resultado", "estudio",
  "informe", "radiografia", "radiografía", "eco", "resonancia", "tomografia",
  "tomografía", "hemograma", "sangre", "orina", "consulta", "receta",
  "prescripcion", "prescripción", "vacuna", "certificado", "medico", "médico",
  "clinica", "clínica", "hospital", "diagnostic", "rx ", " rx", "mri",
  "ultrasound", "xray", "x-ray",
];

function isMedicalCandidate(name: string, mimeType: string): boolean {
  const lowerName = name.toLowerCase();
  const hasMedicalKeyword = MEDICAL_KEYWORDS.some((kw) => lowerName.includes(kw));
  const hasMedicalMime = MEDICAL_MIME_TYPES.includes(mimeType);
  return hasMedicalKeyword || hasMedicalMime;
}

export async function GET() {
  const cookieStore = await cookies();
  const tokenRaw = cookieStore.get("drive_token")?.value;

  if (!tokenRaw) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const tokens = JSON.parse(tokenRaw);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
    // Search for likely medical files — no full drive scan, targeted query
    const mimeQuery = MEDICAL_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ");
    const res = await drive.files.list({
      q: `(${mimeQuery}) and trashed=false`,
      fields: "files(id,name,mimeType,size,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
    });

    const allFiles = res.data.files ?? [];
    const candidates = allFiles.filter((f) =>
      isMedicalCandidate(f.name ?? "", f.mimeType ?? "")
    );

    return NextResponse.json({
      files: candidates.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size) : undefined,
        modifiedTime: f.modifiedTime,
      })),
      total: allFiles.length,
      filtered: candidates.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "scan_failed", detail: message }, { status: 500 });
  }
}
