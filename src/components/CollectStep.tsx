"use client";

import { useEffect, useRef, useState } from "react";
import type { CollectedFile } from "@/app/page";

type Props = {
  onContinue: (files: CollectedFile[]) => void;
};

// ─── Drive types ────────────────────────────────────────────────────────────
type DriveFolder = { id: string; name: string };
type DriveFile   = { id: string; name: string; mimeType: string; size?: number };
type DriveState  = "idle" | "connecting" | "loading_folders" | "selecting" | "scanning" | "done" | "error";

// ─── Gmail types ─────────────────────────────────────────────────────────────
type GmailAttachment = { messageId: string; attachmentId: string; filename: string; mimeType: string; size: number; subject: string };
type GmailState = "idle" | "connecting" | "scanning" | "done" | "error";

export default function CollectStep({ onContinue }: Props) {
  // Drive
  const [driveState, setDriveState]   = useState<DriveState>("idle");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [folders, setFolders]         = useState<DriveFolder[]>([]);
  const [folderSearch, setFolderSearch] = useState("");
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [driveFiles, setDriveFiles]   = useState<DriveFile[]>([]);
  const [driveSelected, setDriveSelected] = useState<Set<string>>(new Set());
  const [driveTotal, setDriveTotal]   = useState(0);
  const [driveError, setDriveError]   = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  // Gmail
  const [gmailState, setGmailState]           = useState<GmailState>("idle");
  const [gmailAttachments, setGmailAttachments] = useState<GmailAttachment[]>([]);
  const [gmailSelected, setGmailSelected]     = useState<Set<string>>(new Set());
  const [gmailError, setGmailError]           = useState<string | null>(null);

  // Local files
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFiles, setLocalFiles]   = useState<File[]>([]);
  const [dragging, setDragging]       = useState(false);

  // Paste
  const pasteRef = useRef<HTMLDivElement>(null);
  const [pastedFiles, setPastedFiles] = useState<File[]>([]);
  const [pasteHint, setPasteHint]     = useState(false);

  // ─── Google Identity Services ─────────────────────────────────────────────
  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }, []);

  // ─── Drive logic ─────────────────────────────────────────────────────────
  function connectDrive() {
    if (!window.google) { setDriveError("Recargá la página e intentá de nuevo."); return; }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { setDriveError("Client ID no configurado."); return; }
    setDriveState("connecting"); setDriveError(null);
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: async (r) => {
        if (r.error || !r.access_token) { setDriveError("No se pudo conectar."); setDriveState("error"); return; }
        setAccessToken(r.access_token);
        await loadFolders(r.access_token);
      },
    }).requestAccessToken();
  }

  async function loadFolders(token: string) {
    setDriveState("loading_folders");
    try {
      const res = await fetch("/api/drive/folders", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const { folders: f } = await res.json();
      setFolders(f);
      setDriveState("selecting");
    } catch {
      setDriveError("No se pudieron cargar las carpetas."); setDriveState("error");
    }
  }

  async function scanFolders() {
    if (!accessToken || selectedFolders.size === 0) return;
    setDriveState("scanning"); setDriveError(null);
    try {
      const res = await fetch("/api/drive/scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds: Array.from(selectedFolders) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDriveFiles(data.files ?? []);
      setDriveSelected(new Set((data.files ?? []).map((f: DriveFile) => f.id)));
      setDriveTotal(data.total ?? 0);
      setDriveState("done");
    } catch {
      setDriveError("Error al escanear."); setDriveState("error");
    }
  }

  function toggleFolder(id: string) {
    setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleDriveFile(id: string) {
    setDriveSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ─── Gmail logic ─────────────────────────────────────────────────────────
  function connectGmail() {
    if (!window.google) { setGmailError("Recargá la página e intentá de nuevo."); return; }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { setGmailError("Client ID no configurado."); return; }
    setGmailState("connecting"); setGmailError(null);
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      callback: async (r) => {
        if (r.error || !r.access_token) { setGmailError("No se pudo conectar."); setGmailState("error"); return; }
        await searchGmail(r.access_token);
      },
    }).requestAccessToken();
  }

  async function searchGmail(token: string) {
    setGmailState("scanning");
    try {
      const res = await fetch("/api/gmail/search", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const { attachments } = await res.json();
      setGmailAttachments(attachments);
      setGmailSelected(new Set((attachments as GmailAttachment[]).map((a) => `${a.messageId}:${a.attachmentId}`)));
      setGmailState("done");
    } catch {
      setGmailError("No se pudo buscar en Gmail."); setGmailState("error");
    }
  }

  function toggleGmail(key: string) {
    setGmailSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ─── Local files logic ────────────────────────────────────────────────────
  function handleLocalFiles(list: FileList | null) {
    if (!list) return;
    const valid = Array.from(list).filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["pdf","jpg","jpeg","png","heic","tiff","webp"].includes(ext ?? "");
    });
    setLocalFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...valid.filter(f => !seen.has(f.name + f.size))];
    });
  }
  function removeLocal(i: number) { setLocalFiles(prev => prev.filter((_, j) => j !== i)); }

  // ─── Paste logic ──────────────────────────────────────────────────────────
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      setPastedFiles(prev => {
        const seen = new Set(prev.map(f => f.name + f.size));
        return [...prev, ...files.filter(f => !seen.has(f.name + f.size))];
      });
      setPasteHint(false);
    }
  }
  function removePasted(i: number) { setPastedFiles(prev => prev.filter((_, j) => j !== i)); }

  // Also listen for paste on the whole window when the paste card is visible
  useEffect(() => {
    function onWindowPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") { const f = item.getAsFile(); if (f) files.push(f); }
      }
      if (files.length > 0) {
        setPastedFiles(prev => {
          const seen = new Set(prev.map(f => f.name + f.size));
          return [...prev, ...files.filter(f => !seen.has(f.name + f.size))];
        });
      }
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, []);

  // ─── Totals & continue ───────────────────────────────────────────────────
  const totalCount = driveSelected.size + localFiles.length + pastedFiles.length + gmailSelected.size;

  function handleContinue() {
    const fromDrive: CollectedFile[] = driveFiles
      .filter(f => driveSelected.has(f.id))
      .map(f => ({ name: f.name, mimeType: f.mimeType, source: "drive", size: f.size, driveId: f.id }));

    const fromLocal: CollectedFile[] = localFiles.map(f => ({
      name: f.name, mimeType: f.type || "application/octet-stream",
      source: "local", size: f.size, localFile: f,
    }));

    const fromPaste: CollectedFile[] = pastedFiles.map(f => ({
      name: f.name || "Archivo pegado", mimeType: f.type || "application/octet-stream",
      source: "local", size: f.size, localFile: f,
    }));

    const fromGmail: CollectedFile[] = gmailAttachments
      .filter(a => gmailSelected.has(`${a.messageId}:${a.attachmentId}`))
      .map(a => ({
        name: a.filename,
        mimeType: a.mimeType,
        source: "gmail" as const,
        size: a.size,
        gmailMessageId: a.messageId,
        gmailAttachmentId: a.attachmentId,
      }));

    onContinue([...fromDrive, ...fromLocal, ...fromPaste, ...fromGmail]);
  }

  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(folderSearch.toLowerCase()));

  return (
    <div className="w-full max-w-lg mt-6 flex flex-col gap-4 pb-28">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#28347c]" style={{ fontFamily: "var(--font-inter)" }}>
          Recolectá tus documentos
        </h1>
        <p className="mt-1.5 text-[#666666] text-sm" style={{ fontFamily: "var(--font-poppins)" }}>
          Usá una o más fuentes — Drive, tus archivos, o pegando directo.
        </p>
      </div>

      {/* ── CARD 1: GOOGLE DRIVE ─────────────────────────────────────────── */}
      <SectionCard
        icon={<DriveIcon />}
        title="Google Drive"
        subtitle="Elegí carpetas y Salu las analiza"
        count={driveSelected.size}
        countLabel="documentos"
      >
        {driveState === "idle" && (
          <button onClick={connectDrive} className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}>
            Conectar Google Drive
          </button>
        )}

        {(driveState === "connecting" || driveState === "loading_folders" || driveState === "scanning") && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-5 h-5 rounded-full border-2 animate-spin flex-shrink-0"
              style={{ borderColor: "#2b4c9c", borderTopColor: "transparent" }} />
            <p className="text-sm text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              {driveState === "connecting" && "Esperando autorización..."}
              {driveState === "loading_folders" && "Cargando carpetas..."}
              {driveState === "scanning" && "Salu está leyendo los archivos..."}
            </p>
          </div>
        )}

        {driveState === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-red-500" style={{ fontFamily: "var(--font-poppins)" }}>{driveError}</p>
            <button onClick={() => { setDriveState("idle"); setDriveError(null); }}
              className="text-xs text-[#2b4c9c] underline self-start" style={{ fontFamily: "var(--font-poppins)" }}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {driveState === "selecting" && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="#999" strokeWidth="1.3" />
                <path d="M9.5 9.5l2.5 2.5" stroke="#999" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Buscar carpeta..." value={folderSearch}
                onChange={e => setFolderSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-lg border border-[#e8f4fb] text-sm outline-none focus:border-[#2b4c9c]"
                style={{ fontFamily: "var(--font-poppins)", color: "#333" }} />
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
              {filteredFolders.map(f => (
                <button key={f.id} onClick={() => toggleFolder(f.id)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all"
                  style={{ borderColor: selectedFolders.has(f.id) ? "#2b4c9c" : "#e8f4fb", background: selectedFolders.has(f.id) ? "#e8f4fb" : "white" }}>
                  <Checkbox checked={selectedFolders.has(f.id)} />
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
                      fill={selectedFolders.has(f.id) ? "#2b4c9c" : "#c0cfe8"} />
                  </svg>
                  <span className="text-sm flex-1 truncate"
                    style={{ fontFamily: "var(--font-poppins)", color: selectedFolders.has(f.id) ? "#28347c" : "#333", fontWeight: selectedFolders.has(f.id) ? 600 : 400 }}>
                    {f.name}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={scanFolders} disabled={selectedFolders.size === 0}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}>
              Analizar {selectedFolders.size > 0 ? `${selectedFolders.size} carpeta${selectedFolders.size !== 1 ? "s" : ""}` : "carpetas"}
            </button>
          </div>
        )}

        {driveState === "done" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              {driveFiles.length} médico{driveFiles.length !== 1 ? "s" : ""} de {driveTotal} escaneados
              {" · "}<button onClick={() => setDriveState("selecting")} className="text-[#2b4c9c] underline">cambiar carpetas</button>
            </p>
            {driveFiles.length > 0 && (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
                {driveFiles.map(f => (
                  <button key={f.id} onClick={() => toggleDriveFile(f.id)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all"
                    style={{ borderColor: driveSelected.has(f.id) ? "#2b4c9c" : "#e8f4fb", background: driveSelected.has(f.id) ? "#e8f4fb" : "white" }}>
                    <Checkbox checked={driveSelected.has(f.id)} />
                    <span className="text-sm flex-1 truncate" style={{ fontFamily: "var(--font-poppins)", color: "#333" }}>{f.name}</span>
                    <span className="text-xs text-[#666]" style={{ fontFamily: "var(--font-poppins)" }}>
                      {f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── CARD 2: GMAIL ───────────────────────────────────────────────── */}
      <SectionCard
        icon={<GmailIcon />}
        title="Gmail"
        subtitle="Salu busca adjuntos médicos en tu correo"
        count={gmailSelected.size}
        countLabel="adjuntos"
      >
        {gmailState === "idle" && (
          <button onClick={connectGmail} className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)", fontFamily: "var(--font-inter)" }}>
            Conectar Gmail
          </button>
        )}

        {(gmailState === "connecting" || gmailState === "scanning") && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-5 h-5 rounded-full border-2 animate-spin flex-shrink-0"
              style={{ borderColor: "#2b4c9c", borderTopColor: "transparent" }} />
            <p className="text-sm text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              {gmailState === "connecting" ? "Esperando autorización..." : "Buscando adjuntos médicos..."}
            </p>
          </div>
        )}

        {gmailState === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-red-500" style={{ fontFamily: "var(--font-poppins)" }}>{gmailError}</p>
            <button onClick={() => { setGmailState("idle"); setGmailError(null); }}
              className="text-xs text-[#2b4c9c] underline self-start" style={{ fontFamily: "var(--font-poppins)" }}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {gmailState === "done" && gmailAttachments.length === 0 && (
          <p className="text-xs text-[#666666] py-1" style={{ fontFamily: "var(--font-poppins)" }}>
            No se encontraron adjuntos médicos en los últimos correos.
          </p>
        )}

        {gmailState === "done" && gmailAttachments.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#666666]" style={{ fontFamily: "var(--font-poppins)" }}>
              {gmailAttachments.length} adjunto{gmailAttachments.length !== 1 ? "s" : ""} encontrado{gmailAttachments.length !== 1 ? "s" : ""}
              {" · "}<button onClick={() => setGmailState("idle")} className="text-[#2b4c9c] underline">reconectar</button>
            </p>
            <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
              {gmailAttachments.map(a => {
                const key = `${a.messageId}:${a.attachmentId}`;
                const selected = gmailSelected.has(key);
                return (
                  <button key={key} onClick={() => toggleGmail(key)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all"
                    style={{ borderColor: selected ? "#2b4c9c" : "#e8f4fb", background: selected ? "#e8f4fb" : "white" }}>
                    <Checkbox checked={selected} />
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                      <path d="M2 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                        fill={selected ? "#2b4c9c22" : "#f0f0f0"} stroke={selected ? "#2b4c9c" : "#c0cfe8"} strokeWidth="1" />
                      <path d="M1 4l6 4 6-4" stroke={selected ? "#2b4c9c" : "#c0cfe8"} strokeWidth="1" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate"
                        style={{ fontFamily: "var(--font-poppins)", color: selected ? "#28347c" : "#333", fontWeight: selected ? 600 : 400 }}>
                        {a.filename}
                      </p>
                      <p className="text-xs truncate" style={{ fontFamily: "var(--font-poppins)", color: "#999" }}>
                        {a.subject}
                      </p>
                    </div>
                    {a.size > 0 && (
                      <span className="text-xs text-[#999] flex-shrink-0" style={{ fontFamily: "var(--font-poppins)" }}>
                        {(a.size / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── CARD 3: LOCAL FILES ──────────────────────────────────────────── */}
      <SectionCard
        icon={<FileIcon />}
        title="Tus archivos"
        subtitle="iPhone, Android, computadora o iCloud"
        count={localFiles.length}
        countLabel="archivos"
      >
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-6 cursor-pointer transition-all"
          style={{ borderColor: dragging ? "#2b4c9c" : "#c0cfe8", background: dragging ? "#e8f4fb" : "white" }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleLocalFiles(e.dataTransfer.files); }}
        >
          <p className="text-sm font-semibold text-[#28347c]" style={{ fontFamily: "var(--font-inter)" }}>
            {dragging ? "Soltá acá" : "Tocar para seleccionar"}
          </p>
          <p className="text-xs text-[#666] mt-0.5" style={{ fontFamily: "var(--font-poppins)" }}>
            PDF, JPG, PNG, HEIC
          </p>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.tiff,.webp"
            className="hidden" onChange={e => handleLocalFiles(e.target.files)} />
        </div>
        {localFiles.length > 0 && (
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {localFiles.map((f, i) => (
              <FileRow key={f.name + f.size} name={f.name} size={f.size} onRemove={() => removeLocal(i)} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── CARD 4: PASTE ────────────────────────────────────────────────── */}
      <SectionCard
        icon={<PasteIcon />}
        title="Pegar archivo"
        subtitle="Copiaste un PDF o imagen → pegalo acá"
        count={pastedFiles.length}
        countLabel="pegados"
      >
        <div
          ref={pasteRef}
          contentEditable
          suppressContentEditableWarning
          onPaste={handlePaste}
          onKeyDown={(e) => e.preventDefault()}
          onFocus={() => setPasteHint(true)}
          onBlur={() => setPasteHint(false)}
          onClick={() => { pasteRef.current?.focus(); setPasteHint(true); }}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-6 cursor-text outline-none transition-all"
          style={{
            borderColor: pasteHint ? "#2b4c9c" : "#c0cfe8",
            background: pasteHint ? "#e8f4fb" : "white",
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="8" y="2" width="12" height="4" rx="2" fill={pasteHint ? "#2b4c9c" : "#c0cfe8"} />
            <rect x="4" y="4" width="20" height="22" rx="3" stroke={pasteHint ? "#2b4c9c" : "#c0cfe8"} strokeWidth="1.5" fill="none" />
            <path d="M9 13h10M9 17h7" stroke={pasteHint ? "#2b4c9c" : "#c0cfe8"} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-semibold mt-2" style={{ fontFamily: "var(--font-inter)", color: pasteHint ? "#28347c" : "#666" }}>
            {pasteHint ? "Ahora pegá (Cmd+V / Ctrl+V / mantener presionado)" : "Tocá acá y luego pegá"}
          </p>
          <p className="text-xs mt-0.5" style={{ fontFamily: "var(--font-poppins)", color: "#999" }}>
            Funciona con PDFs e imágenes copiados
          </p>
        </div>
        {pastedFiles.length > 0 && (
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {pastedFiles.map((f, i) => (
              <FileRow key={f.name + f.size + i} name={f.name || "Archivo pegado"} size={f.size} onRemove={() => removePasted(i)} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── STICKY CONTINUE BUTTON ─────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t border-[#e8f4fb]"
        style={{ boxShadow: "0 -4px 16px rgba(40,52,124,0.08)" }}>
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleContinue}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all"
            style={{
              background: totalCount > 0 ? "#ee742f" : "linear-gradient(50deg, #2b4c9c, #28347c)",
              fontFamily: "var(--font-inter)",
            }}
          >
            {totalCount > 0
              ? `Analizar ${totalCount} documento${totalCount !== 1 ? "s" : ""} con Salu →`
              : "Continuar sin documentos →"}
          </button>
          {totalCount > 0 && (
            <div className="flex justify-center gap-4 mt-2 flex-wrap">
              {driveSelected.size > 0 && <Chip label={`${driveSelected.size} Drive`} color="#2b4c9c" />}
              {gmailSelected.size > 0 && <Chip label={`${gmailSelected.size} Gmail`} color="#ea4335" />}
              {localFiles.length > 0 && <Chip label={`${localFiles.length} archivos`} color="#2b4c9c" />}
              {pastedFiles.length > 0 && <Chip label={`${pastedFiles.length} pegados`} color="#2b4c9c" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({
  icon, title, subtitle, count, countLabel, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  count: number; countLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#e8f4fb] bg-white p-4 flex flex-col gap-3"
      style={{ boxShadow: "0 2px 12px rgba(40,52,124,0.06)" }}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#333]" style={{ fontFamily: "var(--font-inter)" }}>{title}</p>
          <p className="text-xs text-[#666]" style={{ fontFamily: "var(--font-poppins)" }}>{subtitle}</p>
        </div>
        {count > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: "#ee742f22", color: "#ee742f", fontFamily: "var(--font-inter)" }}>
            {count} {countLabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FileRow({ name, size, onRemove }: { name: string; size?: number; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e8f4fb] bg-white">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
        <path d="M3 1h5l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="#e8f4fb" stroke="#2b4c9c" strokeWidth="1" />
        <path d="M8 1v4h4" stroke="#2b4c9c" strokeWidth="1" />
      </svg>
      <span className="text-sm flex-1 truncate text-[#333]" style={{ fontFamily: "var(--font-poppins)" }}>{name}</span>
      {size && <span className="text-xs text-[#999]" style={{ fontFamily: "var(--font-poppins)" }}>{(size / 1024).toFixed(0)} KB</span>}
      <button onClick={onRemove} className="text-[#999] hover:text-red-400 transition-colors p-0.5 flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
      style={{ borderColor: checked ? "#2b4c9c" : "#c0cfe8", background: checked ? "#2b4c9c" : "white" }}>
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full"
      style={{ background: color + "15", color, fontFamily: "var(--font-inter)", fontWeight: 600 }}>
      {label}
    </span>
  );
}

function DriveIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 8a2 2 0 0 1 2-2h24a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" fill="#f5f5f5" />
      <path d="M2 8l14 9 14-9" stroke="#ea4335" strokeWidth="0" fill="none" />
      <path d="M4 6h24L16 16 4 6z" fill="#ea4335" />
      <path d="M2 8v16l8-8-8-8z" fill="#fbbc04" />
      <path d="M30 8v16l-8-8 8-8z" fill="#34a853" />
      <path d="M10 16l-8 8h28l-8-8-6 4-6-4z" fill="#4285f4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#e8f4fb" }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4 2h7l5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="#2b4c9c" fillOpacity="0.2" stroke="#2b4c9c" strokeWidth="1.2" />
        <path d="M11 2v5h5" stroke="#2b4c9c" strokeWidth="1.2" />
        <path d="M6 10h6M6 13h4" stroke="#2b4c9c" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PasteIcon() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#e8f4fb" }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="5" y="1" width="8" height="3" rx="1.5" fill="#2b4c9c" fillOpacity="0.4" />
        <rect x="2" y="2.5" width="14" height="14" rx="2" stroke="#2b4c9c" strokeWidth="1.2" fill="none" />
        <path d="M5 8h8M5 11h6" stroke="#2b4c9c" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
