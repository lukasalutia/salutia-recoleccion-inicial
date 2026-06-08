import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const MEDICAL_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/webp",
];

const MEDICAL_KEYWORDS = [
  "analisis", "análisis", "laboratorio", "lab", "resultado", "estudio",
  "informe", "radiografia", "radiografía", "eco", "resonancia", "tomografia",
  "tomografía", "hemograma", "sangre", "orina", "consulta", "receta",
  "prescripcion", "prescripción", "vacuna", "certificado", "medico", "médico",
  "clinica", "clínica", "hospital", "diagnostic", "rx", "mri",
  "ultrasound", "xray", "x-ray",
];

function isMedicalCandidate(name: string, mimeType: string): boolean {
  const lowerName = name.toLowerCase();
  const hasMedicalKeyword = MEDICAL_KEYWORDS.some((kw) => lowerName.includes(kw));
  const hasMedicalMime = MEDICAL_MIME_TYPES.includes(mimeType);
  return hasMedicalKeyword || hasMedicalMime;
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
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
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "scan_failed", detail: message }, { status: 500 });
  }
}
