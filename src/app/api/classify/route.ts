import { NextRequest, NextResponse } from "next/server";

type FileInfo = {
  name: string;
  mimeType: string;
  gmailSubject?: string;
};

type ClassificationResult = {
  classification: "medical" | "possibly_medical" | "not_medical";
  label: string;
  confidence: number;
};

// Called once Anthropic API key is available — stubs 503 until then
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const { files }: { files: FileInfo[] } = await req.json();

  if (!files?.length) {
    return NextResponse.json({ results: [] });
  }

  // Build a single prompt listing all files — one API call for N files
  const fileList = files
    .map((f, i) => {
      const base = `${i + 1}. "${f.name}" (${f.mimeType})`;
      return f.gmailSubject ? `${base} — asunto del email: "${f.gmailSubject}"` : base;
    })
    .join("\n");

  const prompt = `Sos un clasificador de documentos médicos para una app de salud en Argentina.

Para cada archivo de la lista, determiná:
1. Si es un documento médico real (medical), posiblemente médico (possibly_medical), o no médico (not_medical)
2. Una etiqueta en español: "Estudio de laboratorio", "Imagen médica", "Consulta médica", "Medicación", "Vacuna", "Documento médico", o "No médico"
3. Un score de confianza entre 0 y 1

Respondé SOLO con un JSON válido con este formato exacto:
{
  "results": [
    { "classification": "medical", "label": "Estudio de laboratorio", "confidence": 0.95 },
    ...
  ]
}

Archivos a clasificar:
${fileList}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: "anthropic_error", detail: err }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "{}";

    // Extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as { results: ClassificationResult[] };
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "parse_error", detail: message }, { status: 500 });
  }
}
