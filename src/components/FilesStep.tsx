"use client";

import { useRef, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  driveCount: number;
  onContinue: (files: CollectedFile[]) => void;
  onSkip: () => void;
};

export default function FilesStep({ driveCount, onContinue, onSkip }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["pdf", "jpg", "jpeg", "png", "heic", "tiff", "webp"].includes(ext ?? "");
    });
    setPicked((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...arr.filter((f) => !existing.has(f.name + f.size))];
    });
  }

  function removeFile(index: number) {
    setPicked((prev) => prev.filter((_, i) => i !== index));
  }

  function confirm() {
    const files: CollectedFile[] = picked.map((f) => ({
      name: f.name,
      mimeType: f.type || "application/octet-stream",
      source: "local",
      size: f.size,
      localFile: f,
    }));
    onContinue(files);
  }

  return (
    <div className="w-full max-w-lg mt-8 flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-bold text-[#28347c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Tus archivos
        </h1>
        <p
          className="mt-2 text-[#666666] text-sm leading-relaxed"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          {driveCount > 0 ? (
            <>
              Encontramos{" "}
              <span className="font-semibold text-[#ee742f]">
                {driveCount} documento{driveCount !== 1 ? "s" : ""}
              </span>{" "}
              en tu Drive. Ahora podés sumar archivos desde tu dispositivo.
            </>
          ) : (
            "Seleccioná documentos médicos guardados en tu dispositivo."
          )}
        </p>
      </div>

      {/* Device hint chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "iCloud / iPhone", icon: "🍎" },
          { label: "Google Files", icon: "📁" },
          { label: "Downloads", icon: "⬇️" },
          { label: "WhatsApp / Mail", icon: "📎" },
        ].map(({ label, icon }) => (
          <span
            key={label}
            className="text-xs px-3 py-1 rounded-full border border-[#e8f4fb] text-[#666666]"
            style={{ fontFamily: "var(--font-poppins)", background: "#fafafa" }}
          >
            {icon} {label}
          </span>
        ))}
      </div>

      {/* Drop zone */}
      <div
        className="rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-8 cursor-pointer"
        style={{
          borderColor: dragging ? "#2b4c9c" : "#c0cfe8",
          background: dragging ? "#e8f4fb" : "white",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <rect width="44" height="44" rx="10" fill="#e8f4fb" />
          <path
            d="M14 12h10l6 6v14a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z"
            fill="#2b4c9c"
            fillOpacity="0.15"
            stroke="#2b4c9c"
            strokeWidth="1.5"
          />
          <path d="M24 12v6h6" stroke="#2b4c9c" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M18 22h8M18 26h5" stroke="#2b4c9c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p
          className="mt-3 text-sm font-semibold text-[#28347c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {dragging ? "Soltá los archivos acá" : "Tocar para seleccionar archivos"}
        </p>
        <p
          className="text-xs text-[#666666] mt-1 text-center"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          PDF, JPG, PNG, HEIC · Funciona en iPhone, Android y computadora
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,.tiff,.webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Selected files */}
      {picked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="text-xs font-semibold text-[#28347c] uppercase tracking-wide"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {picked.length} archivo{picked.length !== 1 ? "s" : ""} seleccionado{picked.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
            {picked.map((f, i) => (
              <div
                key={f.name + f.size}
                className="flex items-center gap-3 p-3 rounded-xl border border-[#e8f4fb] bg-white"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "#e8f4fb" }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                      fill="#2b4c9c"
                      fillOpacity="0.2"
                      stroke="#2b4c9c"
                      strokeWidth="1"
                    />
                    <path d="M10 2v4h4" stroke="#2b4c9c" strokeWidth="1" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium text-[#333333] truncate"
                    style={{ fontFamily: "var(--font-poppins)" }}
                  >
                    {f.name}
                  </p>
                  <p className="text-xs text-[#666666]">
                    {(f.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-[#666666] hover:text-red-500 transition-colors flex-shrink-0 p-1"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={confirm}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm mt-1"
            style={{ background: "#ee742f", fontFamily: "var(--font-inter)" }}
          >
            Continuar con {picked.length} archivo{picked.length !== 1 ? "s" : ""} →
          </button>
        </div>
      )}

      <button
        onClick={onSkip}
        className="text-sm text-[#666666] underline underline-offset-2 self-center"
        style={{ fontFamily: "var(--font-poppins)" }}
      >
        Saltear este paso
      </button>
    </div>
  );
}
