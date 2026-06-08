"use client";

import { useEffect, useRef, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  onContinue: (files: CollectedFile[]) => void;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
};

type State = "idle" | "connecting" | "scanning" | "done" | "error";

export default function DriveStep({ onContinue }: Props) {
  const [state, setState] = useState<State>("idle");
  const [found, setFound] = useState<DriveFile[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
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

  function connectAndScan() {
    if (!window.google) {
      setError("El script de Google no cargó. Recargá la página e intentá de nuevo.");
      return;
    }

    setState("connecting");
    setError(null);

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Client ID de Google no configurado.");
      setState("error");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setError("No se pudo conectar con Google Drive.");
          setState("error");
          return;
        }
        await scanDrive(response.access_token);
      },
    });

    tokenClient.requestAccessToken();
  }

  async function scanDrive(accessToken: string) {
    setState("scanning");
    try {
      const res = await fetch("/api/drive/scan", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("scan_failed");
      const { files } = await res.json();
      setFound(files);
      setSelected(new Set(files.map((f: DriveFile) => f.id)));
      setState("done");
    } catch {
      setError("No se pudo escanear Drive. Intentá de nuevo.");
      setState("error");
    }
  }

  function toggleFile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    if (!found) return;
    const files: CollectedFile[] = found
      .filter((f) => selected.has(f.id))
      .map((f) => ({
        name: f.name,
        mimeType: f.mimeType,
        source: "drive",
        size: f.size,
        driveId: f.id,
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
          Conectá tu Google Drive
        </h1>
        <p
          className="mt-2 text-[#666666] text-sm leading-relaxed"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          Salutia va a buscar estudios, análisis y documentos médicos en tu
          Drive. Solo lectura — no modifica nada.
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
            <p
              className="font-semibold text-[#333333]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Google Drive
            </p>
            <p
              className="text-xs text-[#666666]"
              style={{ fontFamily: "var(--font-poppins)" }}
            >
              Solo lectura · Sin base de datos · Se borra al recargar
            </p>
          </div>
        </div>

        {/* Idle */}
        {state === "idle" && (
          <button
            onClick={connectAndScan}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm"
            style={{
              background: "linear-gradient(50deg, #2b4c9c, #28347c)",
              fontFamily: "var(--font-inter)",
            }}
          >
            Conectar y buscar documentos
          </button>
        )}

        {/* Connecting / scanning */}
        {(state === "connecting" || state === "scanning") && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#2b4c9c", borderTopColor: "transparent" }}
            />
            <p
              className="text-sm text-[#666666]"
              style={{ fontFamily: "var(--font-poppins)" }}
            >
              {state === "connecting"
                ? "Esperando autorización de Google..."
                : "Salu está leyendo tus archivos..."}
            </p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="flex flex-col gap-3">
            <p
              className="text-sm text-red-500"
              style={{ fontFamily: "var(--font-poppins)" }}
            >
              {error}
            </p>
            <button
              onClick={() => { setState("idle"); setError(null); }}
              className="w-full py-3 rounded-xl font-semibold text-sm border border-[#2b4c9c] text-[#2b4c9c] bg-white"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Results */}
        {state === "done" && found && (
          <div className="flex flex-col gap-2">
            {found.length === 0 ? (
              <p
                className="text-sm text-[#666666] text-center py-3"
                style={{ fontFamily: "var(--font-poppins)" }}
              >
                No encontramos documentos médicos en tu Drive.
              </p>
            ) : (
              <>
                <p
                  className="text-xs font-semibold text-[#28347c] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {found.length} documento{found.length !== 1 ? "s" : ""} encontrado{found.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                  {found.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => toggleFile(f.id)}
                      className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                      style={{
                        borderColor: selected.has(f.id) ? "#2b4c9c" : "#e8f4fb",
                        background: selected.has(f.id) ? "#e8f4fb" : "white",
                      }}
                    >
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
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium text-[#333333] truncate"
                          style={{ fontFamily: "var(--font-poppins)" }}
                        >
                          {f.name}
                        </p>
                        <p
                          className="text-xs text-[#666666]"
                          style={{ fontFamily: "var(--font-poppins)" }}
                        >
                          {f.mimeType.includes("pdf") ? "PDF" : f.mimeType.split("/")[1]?.toUpperCase() ?? "Archivo"}
                          {f.size ? ` · ${(f.size / 1024).toFixed(0)} KB` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={confirm}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm mt-1 transition-opacity"
              style={{
                background: selected.size > 0 ? "#ee742f" : "linear-gradient(50deg, #2b4c9c, #28347c)",
                fontFamily: "var(--font-inter)",
              }}
            >
              {selected.size > 0
                ? `Confirmar ${selected.size} documento${selected.size !== 1 ? "s" : ""} →`
                : "Continuar sin documentos de Drive →"}
            </button>
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
