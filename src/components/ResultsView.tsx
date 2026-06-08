"use client";

import { useEffect, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  files: CollectedFile[];
  onReset: () => void;
};

type ClassifiedFile = CollectedFile & {
  classification?: "medical" | "possibly_medical" | "not_medical" | "pending";
  label?: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Estudio de laboratorio": "#26c6b0",
  "Imagen médica": "#1a7a8a",
  "Consulta médica": "#ee742f",
  "Medicación": "#9b59b6",
  "Vacuna": "#27ae60",
  "Documento médico": "#2b4c9c",
  "No médico": "#c0cfe8",
};

export default function ResultsView({ files, onReset }: Props) {
  const [classified, setClassified] = useState<ClassifiedFile[]>(
    files.map((f) => ({ ...f, classification: "pending" }))
  );
  const [classifying, setClassifying] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  useEffect(() => {
    if (files.length === 0) return;
    classifyAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function classifyAll() {
    setClassifying(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, mimeType: f.mimeType })),
        }),
      });

      if (res.status === 503) {
        setApiKeyMissing(true);
        // Fall back to heuristic classification
        setClassified(files.map((f) => ({ ...f, ...heuristicClassify(f) })));
        return;
      }

      const data = await res.json();
      setClassified(
        files.map((f, i) => ({
          ...f,
          classification: data.results[i]?.classification ?? "possibly_medical",
          label: data.results[i]?.label ?? "Documento médico",
        }))
      );
    } catch {
      setClassified(files.map((f) => ({ ...f, ...heuristicClassify(f) })));
    } finally {
      setClassifying(false);
    }
  }

  const medicalFiles = classified.filter(
    (f) => f.classification === "medical" || f.classification === "possibly_medical"
  );
  const otherFiles = classified.filter(
    (f) => f.classification === "not_medical" || f.classification === "pending"
  );

  if (files.length === 0) {
    return (
      <div className="w-full max-w-lg mt-8 flex flex-col items-center gap-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "#e8f4fb" }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke="#2b4c9c" strokeWidth="2" />
            <path d="M11 16l4 4 6-7" stroke="#2b4c9c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1
          className="text-2xl font-bold text-[#28347c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          No se encontraron documentos
        </h1>
        <p
          className="text-[#666666] text-sm"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          No seleccionaste ningún archivo. Podés volver e intentar de nuevo.
        </p>
        <button
          onClick={onReset}
          className="py-3 px-6 rounded-xl text-white font-semibold text-sm"
          style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mt-8 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-[#28347c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {classifying ? "Analizando documentos..." : "Documentos encontrados"}
        </h1>
        <p
          className="mt-2 text-[#666666] text-sm"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          {classifying
            ? "Salu está clasificando cada archivo..."
            : `${medicalFiles.length} documento${medicalFiles.length !== 1 ? "s" : ""} médico${medicalFiles.length !== 1 ? "s" : ""} listo${medicalFiles.length !== 1 ? "s" : ""} para importar`}
        </p>
      </div>

      {/* API key missing notice */}
      {apiKeyMissing && (
        <div
          className="rounded-xl p-4 text-sm flex gap-3"
          style={{ background: "#fff8e1", border: "1px solid #ffe082" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 mt-0.5">
            <path d="M9 2L16 15H2L9 2z" fill="#f59e0b" />
            <path d="M9 7v4M9 13v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontFamily: "var(--font-poppins)", color: "#92400e" }}>
            <span className="font-semibold">API de Anthropic no configurada.</span> La clasificación es aproximada.
            Cuando agregues la key, Salu clasificará con precisión médica.
          </p>
        </div>
      )}

      {/* Medical files */}
      {medicalFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="text-xs font-semibold text-[#28347c] uppercase tracking-wide"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Documentos médicos ({medicalFiles.length})
          </p>
          {medicalFiles.map((f, i) => (
            <FileCard key={i} file={f} classifying={classifying} />
          ))}
        </div>
      )}

      {/* Other files */}
      {otherFiles.length > 0 && !classifying && (
        <div className="flex flex-col gap-2">
          <p
            className="text-xs font-semibold text-[#666666] uppercase tracking-wide"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            No médicos ({otherFiles.length})
          </p>
          {otherFiles.map((f, i) => (
            <FileCard key={i} file={f} classifying={false} />
          ))}
        </div>
      )}

      {/* Actions */}
      {!classifying && (
        <div className="flex flex-col gap-3 mt-2">
          <div
            className="rounded-xl p-4 text-sm text-center"
            style={{
              background: "#e8f4fb",
              fontFamily: "var(--font-poppins)",
              color: "#28347c",
            }}
          >
            Esta es una demo de recolección. En la app real, estos documentos
            se importarían directo a tu historial Salutia.
          </div>
          <button
            onClick={onReset}
            className="w-full py-3 rounded-xl font-semibold text-sm border border-[#2b4c9c] text-[#2b4c9c] bg-white"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Empezar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}

function heuristicClassify(f: CollectedFile): { classification: ClassifiedFile["classification"]; label: string } {
  const name = f.name.toLowerCase();
  const medicalKeywords = [
    "analisis", "análisis", "laboratorio", "lab", "estudio", "resultado",
    "informe", "radiografia", "radiografía", "eco", "resonancia", "tomografia",
    "tomografía", "hemograma", "sangre", "orina", "consulta", "receta",
    "prescripcion", "prescripción", "vacuna", "certificado", "medico", "médico",
    "clinica", "clínica", "hospital", "diagnostic",
  ];
  const isMedical = medicalKeywords.some((k) => name.includes(k));
  const isPdf = f.mimeType.includes("pdf") || name.endsWith(".pdf");

  if (isMedical) {
    if (name.includes("lab") || name.includes("analisis") || name.includes("hemograma") || name.includes("sangre"))
      return { classification: "medical", label: "Estudio de laboratorio" };
    if (name.includes("eco") || name.includes("radio") || name.includes("resonancia") || name.includes("tomografia"))
      return { classification: "medical", label: "Imagen médica" };
    if (name.includes("vacuna"))
      return { classification: "medical", label: "Vacuna" };
    if (name.includes("receta") || name.includes("prescripcion"))
      return { classification: "medical", label: "Medicación" };
    return { classification: "medical", label: "Documento médico" };
  }
  if (isPdf) return { classification: "possibly_medical", label: "Posible documento médico" };
  return { classification: "not_medical", label: "No médico" };
}

function FileCard({ file, classifying }: { file: ClassifiedFile; classifying: boolean }) {
  const color = file.label ? (CATEGORY_COLORS[file.label] ?? "#2b4c9c") : "#c0cfe8";
  const sourceIcon = file.source === "drive" ? "Drive" : "Local";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border bg-white"
      style={{ borderColor: "#e8f4fb", boxShadow: "0 1px 4px rgba(40,52,124,0.05)" }}
    >
      {/* Category color indicator */}
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ background: classifying ? "#e8f4fb" : color, minHeight: "36px" }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium text-[#333333] truncate"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          {file.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: classifying ? "#f0f0f0" : color + "22",
              color: classifying ? "#999" : color,
              fontFamily: "var(--font-inter)",
              fontWeight: 600,
            }}
          >
            {classifying ? "Analizando..." : (file.label ?? "Procesando")}
          </span>
          <span className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
            {sourceIcon}
          </span>
        </div>
      </div>
    </div>
  );
}
