"use client";

import { useEffect, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  files: CollectedFile[];
  onReset: () => void;
};

type ClassifiedFile = CollectedFile & {
  classification: "medical" | "possibly_medical" | "not_medical" | "pending";
  label: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Estudio de laboratorio": "#26c6b0",
  "Imagen médica": "#1a7a8a",
  "Consulta médica": "#ee742f",
  "Medicación": "#9b59b6",
  "Vacuna": "#27ae60",
  "Documento médico": "#2b4c9c",
  "Posible documento médico": "#7a9cd4",
  "No médico": "#c0cfe8",
};

export default function ResultsView({ files, onReset }: Props) {
  const [items, setItems] = useState<ClassifiedFile[]>(
    files.map((f) => ({ ...f, classification: "pending", label: "Analizando..." }))
  );
  const [classifying, setClassifying] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [preview, setPreview] = useState<ClassifiedFile | null>(null);

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
          files: files.map((f) => ({ name: f.name, mimeType: f.mimeType, gmailSubject: f.gmailSubject })),
        }),
      });

      if (res.status === 503) {
        setApiKeyMissing(true);
        setItems(files.map((f) => ({ ...f, ...heuristicClassify(f) })));
        return;
      }

      const data = await res.json();
      setItems(
        files.map((f, i) => ({
          ...f,
          classification: data.results[i]?.classification ?? "possibly_medical",
          label: data.results[i]?.label ?? "Documento médico",
        }))
      );
    } catch {
      setItems(files.map((f) => ({ ...f, ...heuristicClassify(f) })));
    } finally {
      setClassifying(false);
    }
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (preview && items[index] === preview) setPreview(null);
  }

  const medical = items.filter(
    (f) => f.classification === "medical" || f.classification === "possibly_medical"
  );
  const other = items.filter(
    (f) => f.classification === "not_medical"
  );
  const pending = items.filter((f) => f.classification === "pending");

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
        <h1 className="text-2xl font-bold text-[#28347c]" style={{ fontFamily: "var(--font-inter)" }}>
          No se encontraron documentos
        </h1>
        <p className="text-[#666666] text-sm" style={{ fontFamily: "var(--font-poppins)" }}>
          No seleccionaste ningún archivo.
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
    <>
      <div className="w-full max-w-lg mt-8 flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#28347c]" style={{ fontFamily: "var(--font-inter)" }}>
            {classifying ? "Analizando documentos..." : "Revisá tu colección"}
          </h1>
          <p className="mt-2 text-[#666666] text-sm" style={{ fontFamily: "var(--font-poppins)" }}>
            {classifying
              ? "Salu está clasificando cada archivo..."
              : `${items.length} documento${items.length !== 1 ? "s" : ""} · Tocá uno para ver o borrar`}
          </p>
        </div>

        {/* API key missing */}
        {apiKeyMissing && (
          <div className="rounded-xl p-4 text-sm flex gap-3" style={{ background: "#fff8e1", border: "1px solid #ffe082" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 mt-0.5">
              <path d="M9 2L16 15H2L9 2z" fill="#f59e0b" />
              <path d="M9 7v4M9 13v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p style={{ fontFamily: "var(--font-poppins)", color: "#92400e" }}>
              <span className="font-semibold">Clasificación aproximada</span> — cuando agregues la API key de Anthropic, Salu clasifica con precisión médica real.
            </p>
          </div>
        )}

        {/* Medical files */}
        {(classifying ? pending : medical).length > 0 && (
          <Section
            title={classifying ? `Analizando (${pending.length})` : `Documentos médicos (${medical.length})`}
            titleColor="#28347c"
            items={classifying ? pending : medical}
            classifying={classifying}
            onPreview={setPreview}
            onRemove={(item) => removeItem(items.indexOf(item))}
          />
        )}

        {/* Other files */}
        {!classifying && other.length > 0 && (
          <Section
            title={`No médicos (${other.length})`}
            titleColor="#666666"
            items={other}
            classifying={false}
            onPreview={setPreview}
            onRemove={(item) => removeItem(items.indexOf(item))}
          />
        )}

        {/* Empty state after deletions */}
        {!classifying && items.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "#e8f4fb" }}
          >
            <p className="text-sm text-[#28347c] font-semibold" style={{ fontFamily: "var(--font-poppins)" }}>
              Borraste todos los documentos.
            </p>
          </div>
        )}

        {/* Actions */}
        {!classifying && (
          <div className="flex flex-col gap-3 mt-2">
            <div
              className="rounded-xl p-4 text-sm text-center"
              style={{ background: "#e8f4fb", fontFamily: "var(--font-poppins)", color: "#28347c" }}
            >
              Demo de recolección — en la app real estos documentos se importarían directo a tu historial.
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

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          file={preview}
          onClose={() => setPreview(null)}
          onRemove={() => {
            removeItem(items.indexOf(preview));
            setPreview(null);
          }}
        />
      )}
    </>
  );
}

function Section({
  title,
  titleColor,
  items,
  classifying,
  onPreview,
  onRemove,
}: {
  title: string;
  titleColor: string;
  items: ClassifiedFile[];
  classifying: boolean;
  onPreview: (f: ClassifiedFile) => void;
  onRemove: (f: ClassifiedFile) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ fontFamily: "var(--font-inter)", color: titleColor }}
      >
        {title}
      </p>
      {items.map((f, i) => (
        <FileRow
          key={f.driveId ?? f.name + i}
          file={f}
          classifying={classifying}
          onPreview={() => onPreview(f)}
          onRemove={() => onRemove(f)}
        />
      ))}
    </div>
  );
}

function FileRow({
  file,
  classifying,
  onPreview,
  onRemove,
}: {
  file: ClassifiedFile;
  classifying: boolean;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const color = CATEGORY_COLORS[file.label] ?? "#2b4c9c";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border bg-white"
      style={{ borderColor: "#e8f4fb", boxShadow: "0 1px 4px rgba(40,52,124,0.05)" }}
    >
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ background: classifying ? "#e8f4fb" : color, minHeight: "36px" }}
      />

      {/* Tap to preview */}
      <button className="flex-1 min-w-0 text-left" onClick={onPreview}>
        <p
          className="text-sm font-medium text-[#333333] truncate"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          {file.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: classifying ? "#f0f0f0" : color + "22",
              color: classifying ? "#999" : color,
              fontFamily: "var(--font-inter)",
            }}
          >
            {classifying ? "Analizando..." : file.label}
          </span>
          <span className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
            {file.source === "drive" ? "Drive" : file.source === "gmail" ? "Gmail" : "Local"}
            {file.size ? ` · ${(file.size / 1024).toFixed(0)} KB` : ""}
          </span>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onPreview}
          className="p-2 rounded-lg text-[#666666] hover:text-[#2b4c9c] hover:bg-[#e8f4fb] transition-colors"
          title="Ver"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg text-[#666666] hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Eliminar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PreviewModal({
  file,
  onClose,
  onRemove,
}: {
  file: ClassifiedFile;
  onClose: () => void;
  onRemove: () => void;
}) {
  const color = CATEGORY_COLORS[file.label] ?? "#2b4c9c";
  const previewUrl =
    file.localFile ? URL.createObjectURL(file.localFile) : null;
  const isPdf =
    file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.mimeType.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(40,52,124,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh", boxShadow: "0 20px 60px rgba(40,52,124,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e8f4fb]">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold text-[#333333] truncate"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {file.name}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color, fontFamily: "var(--font-poppins)", fontWeight: 600 }}
            >
              {file.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#666666] hover:bg-[#e8f4fb] transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Preview area */}
        <div
          className="flex-1 overflow-auto flex items-center justify-center"
          style={{ background: "#f5f7fa", minHeight: "200px" }}
        >
          {previewUrl && isPdf && (
            <iframe
              src={previewUrl}
              className="w-full h-full"
              style={{ minHeight: "400px" }}
              title={file.name}
            />
          )}
          {previewUrl && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={file.name}
              className="max-w-full max-h-96 object-contain p-4"
            />
          )}
          {!previewUrl && file.source === "drive" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#e8f4fb" />
                <path d="M16 14h14l8 8v18a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="#2b4c9c" fillOpacity="0.15" stroke="#2b4c9c" strokeWidth="1.5" />
                <path d="M30 14v8h8" stroke="#2b4c9c" strokeWidth="1.5" />
              </svg>
              <p className="text-sm text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
                Archivo de Google Drive
              </p>
              <a
                href={`https://drive.google.com/file/d/${file.driveId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-[#2b4c9c] underline"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                Abrir en Drive →
              </a>
            </div>
          )}
          {!previewUrl && file.source === "gmail" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#fce8e6" />
                <path d="M10 16a2 2 0 0 1 2-2h24a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V16z" fill="white" stroke="#ea4335" strokeWidth="1.5" />
                <path d="M10 17l14 9 14-9" stroke="#ea4335" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
                Adjunto de Gmail
              </p>
              <p className="text-xs text-[#999]" style={{ fontFamily: "var(--font-poppins)" }}>
                Vista previa no disponible — el documento quedará guardado en tu historial.
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-[#e8f4fb]">
          <button
            onClick={onRemove}
            className="flex-1 py-3 rounded-xl font-semibold text-sm border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Eliminar documento
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
            style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}
          >
            Mantener
          </button>
        </div>
      </div>
    </div>
  );
}

function heuristicClassify(f: CollectedFile): { classification: ClassifiedFile["classification"]; label: string } {
  const name = f.name.toLowerCase();
  const medicalKeywords = [
    "analisis", "análisis", "laboratorio", "lab", "resultado", "estudio",
    "informe", "radiografia", "radiografía", "eco", "resonancia", "tomografia",
    "tomografía", "hemograma", "sangre", "orina", "consulta", "receta",
    "prescripcion", "prescripción", "vacuna", "certificado", "medico", "médico",
    "clinica", "clínica", "hospital", "diagnostic",
  ];
  const isMedical = medicalKeywords.some((k) => name.includes(k));
  const isPdf = f.mimeType.includes("pdf") || name.endsWith(".pdf");

  if (isMedical) {
    if (name.includes("lab") || name.includes("analisis") || name.includes("hemograma"))
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
