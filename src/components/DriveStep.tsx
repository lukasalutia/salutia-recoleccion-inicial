"use client";

import { useEffect, useRef, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  onContinue: (files: CollectedFile[]) => void;
};

type DriveFolder = { id: string; name: string };
type DriveFile = { id: string; name: string; mimeType: string; size?: number };
type Step = "idle" | "connecting" | "loading_folders" | "selecting" | "scanning" | "done" | "error";

export default function DriveStep({ onContinue }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<DriveFile[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [scannedTotal, setScannedTotal] = useState(0);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  function connectDrive() {
    if (!window.google) {
      setError("Script de Google no cargó. Recargá la página.");
      return;
    }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { setError("Client ID no configurado."); return; }

    setStep("connecting");
    setError(null);

    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setError("No se pudo conectar con Google Drive.");
          setStep("error");
          return;
        }
        setAccessToken(response.access_token);
        await loadFolders(response.access_token);
      },
    }).requestAccessToken();
  }

  async function loadFolders(token: string) {
    setStep("loading_folders");
    try {
      const res = await fetch("/api/drive/folders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const { folders: f } = await res.json();
      setFolders(f);
      setStep("selecting");
    } catch {
      setError("No se pudieron cargar las carpetas.");
      setStep("error");
    }
  }

  async function scanFolders() {
    if (!accessToken || selected.size === 0) return;
    setStep("scanning");
    setError(null);
    try {
      const res = await fetch("/api/drive/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFound(data.files ?? []);
      setConfirmed(new Set((data.files ?? []).map((f: DriveFile) => f.id)));
      setScannedTotal(data.total ?? 0);
      setStep("done");
    } catch {
      setError("Error al escanear las carpetas.");
      setStep("error");
    }
  }

  function toggleFolder(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleFile(id: string) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirm() {
    const files: CollectedFile[] = found
      .filter((f) => confirmed.has(f.id))
      .map((f) => ({
        name: f.name,
        mimeType: f.mimeType,
        source: "drive",
        size: f.size,
        driveId: f.id,
      }));
    onContinue(files);
  }

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full max-w-lg mt-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#28347c]" style={{ fontFamily: "var(--font-inter)" }}>
          Conectá tu Google Drive
        </h1>
        <p className="mt-2 text-[#666666] text-sm leading-relaxed" style={{ fontFamily: "var(--font-poppins)" }}>
          Elegí las carpetas donde tenés tus documentos médicos y Salu los analiza.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[#e8f4fb] bg-white p-5 flex flex-col gap-4"
        style={{ boxShadow: "0 2px 12px rgba(40,52,124,0.07)" }}
      >
        {/* Drive header */}
        <div className="flex items-center gap-3">
          <DriveIcon />
          <div>
            <p className="font-semibold text-[#333333]" style={{ fontFamily: "var(--font-inter)" }}>
              Google Drive
            </p>
            <p className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              Solo lectura · Sin base de datos · Se borra al recargar
            </p>
          </div>
        </div>

        {/* IDLE */}
        {step === "idle" && (
          <button
            onClick={connectDrive}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm"
            style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}
          >
            Conectar Google Drive
          </button>
        )}

        {/* LOADING STATES */}
        {(step === "connecting" || step === "loading_folders" || step === "scanning") && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "#2b4c9c", borderTopColor: "transparent" }}
            />
            <p className="text-sm text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              {step === "connecting" && "Esperando autorización..."}
              {step === "loading_folders" && "Cargando carpetas..."}
              {step === "scanning" && "Salu está leyendo tus archivos..."}
            </p>
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-500" style={{ fontFamily: "var(--font-poppins)" }}>{error}</p>
            <button
              onClick={() => { setStep("idle"); setError(null); }}
              className="w-full py-3 rounded-xl font-semibold text-sm border border-[#2b4c9c] text-[#2b4c9c]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* FOLDER SELECTION */}
        {step === "selecting" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-[#28347c] uppercase tracking-wide" style={{ fontFamily: "var(--font-inter)" }}>
              {folders.length} carpetas encontradas — elegí las que contienen documentos médicos
            </p>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="#666666" strokeWidth="1.3" />
                <path d="M9.5 9.5l2.5 2.5" stroke="#666666" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Buscar carpeta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-[#e8f4fb] text-sm outline-none focus:border-[#2b4c9c] transition-colors"
                style={{ fontFamily: "var(--font-poppins)", color: "#333333" }}
              />
            </div>

            {/* Folder list */}
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {filteredFolders.length === 0 && (
                <p className="text-sm text-[#666666] text-center py-4" style={{ fontFamily: "var(--font-poppins)" }}>
                  No se encontraron carpetas
                </p>
              )}
              {filteredFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggleFolder(f.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: selected.has(f.id) ? "#2b4c9c" : "#e8f4fb",
                    background: selected.has(f.id) ? "#e8f4fb" : "white",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all"
                    style={{
                      borderColor: selected.has(f.id) ? "#2b4c9c" : "#c0cfe8",
                      background: selected.has(f.id) ? "#2b4c9c" : "white",
                    }}
                  >
                    {selected.has(f.id) && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {/* Folder icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                    <path d="M2 4a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
                      fill={selected.has(f.id) ? "#2b4c9c" : "#c0cfe8"}
                      stroke={selected.has(f.id) ? "#2b4c9c" : "#c0cfe8"}
                      strokeWidth="0.5"
                    />
                  </svg>
                  <span
                    className="text-sm flex-1 truncate"
                    style={{
                      fontFamily: "var(--font-poppins)",
                      color: selected.has(f.id) ? "#28347c" : "#333333",
                      fontWeight: selected.has(f.id) ? 600 : 400,
                    }}
                  >
                    {f.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Scan button */}
            <button
              onClick={scanFolders}
              disabled={selected.size === 0}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-40"
              style={{
                background: selected.size > 0 ? "linear-gradient(50deg, #2b4c9c, #28347c)" : "#ccc",
                fontFamily: "var(--font-inter)",
              }}
            >
              {selected.size === 0
                ? "Elegí al menos una carpeta"
                : `Analizar ${selected.size} carpeta${selected.size !== 1 ? "s" : ""} con Salu`}
            </button>
          </div>
        )}

        {/* RESULTS */}
        {step === "done" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[#28347c] uppercase tracking-wide" style={{ fontFamily: "var(--font-inter)" }}>
              {found.length} médico{found.length !== 1 ? "s" : ""} de {scannedTotal} archivo{scannedTotal !== 1 ? "s" : ""} escaneados
            </p>

            {found.length === 0 ? (
              <p className="text-sm text-[#666666] text-center py-3" style={{ fontFamily: "var(--font-poppins)" }}>
                No encontramos documentos médicos en esas carpetas.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                {found.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => toggleFile(f.id)}
                    className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                    style={{
                      borderColor: confirmed.has(f.id) ? "#2b4c9c" : "#e8f4fb",
                      background: confirmed.has(f.id) ? "#e8f4fb" : "white",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all"
                      style={{
                        borderColor: confirmed.has(f.id) ? "#2b4c9c" : "#c0cfe8",
                        background: confirmed.has(f.id) ? "#2b4c9c" : "white",
                      }}
                    >
                      {confirmed.has(f.id) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#333333] truncate" style={{ fontFamily: "var(--font-poppins)" }}>
                        {f.name}
                      </p>
                      <p className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
                        {f.mimeType.includes("pdf") ? "PDF" : f.mimeType.split("/")[1]?.toUpperCase()}
                        {f.size ? ` · ${(f.size / 1024).toFixed(0)} KB` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setStep("selecting")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm border border-[#2b4c9c] text-[#2b4c9c] bg-white"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                ← Cambiar carpetas
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: "#ee742f", fontFamily: "var(--font-inter)" }}
              >
                {confirmed.size > 0 ? `Confirmar ${confirmed.size} →` : "Continuar →"}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onContinue([])}
        className="text-sm text-[#666666] underline underline-offset-2 self-center"
        style={{ fontFamily: "var(--font-poppins)" }}
      >
        No tengo Drive, saltear este paso
      </button>
    </div>
  );
}

function DriveIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}
