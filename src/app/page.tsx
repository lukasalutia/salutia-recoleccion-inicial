"use client";

import { useState } from "react";
import DriveStep from "@/components/DriveStep";
import FilesStep from "@/components/FilesStep";
import ResultsView from "@/components/ResultsView";
import SaluLogo from "@/components/SaluLogo";

export type CollectedFile = {
  name: string;
  mimeType: string;
  source: "drive" | "local";
  size?: number;
  driveId?: string;
  localFile?: File;
};

type Step = "drive" | "files" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("drive");
  const [collected, setCollected] = useState<CollectedFile[]>([]);

  function addFromDrive(files: CollectedFile[]) {
    setCollected((prev) => [...prev, ...files]);
    setStep("files");
  }

  function addFromLocal(files: CollectedFile[]) {
    setCollected((prev) => [...prev, ...files]);
    setStep("results");
  }

  function skipLocal() {
    setStep("results");
  }

  function reset() {
    setCollected([]);
    setStep("drive");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="w-full px-6 py-4 flex items-center gap-3"
        style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)" }}
      >
        <SaluLogo />
        <span
          className="text-white text-xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Salutia
        </span>
        <span
          className="ml-auto text-white/60 text-sm"
          style={{ fontFamily: "var(--font-poppins)" }}
        >
          Vida Potenciada
        </span>
      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-[#e8f4fb]">
        <div
          className="h-1 transition-all duration-500"
          style={{
            background: "linear-gradient(50deg, #2b4c9c, #28347c)",
            width:
              step === "drive" ? "33%" : step === "files" ? "66%" : "100%",
          }}
        />
      </div>

      {/* Steps indicator */}
      <div className="flex justify-center gap-8 py-5 px-4">
        {[
          { id: "drive", label: "Google Drive", num: 1 },
          { id: "files", label: "Archivos Apple", num: 2 },
          { id: "results", label: "Resultados", num: 3 },
        ].map(({ id, label, num }) => {
          const isActive = step === id;
          const isDone =
            (id === "drive" && (step === "files" || step === "results")) ||
            (id === "files" && step === "results");
          return (
            <div key={id} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                style={{
                  background: isActive
                    ? "linear-gradient(50deg, #2b4c9c, #28347c)"
                    : isDone
                    ? "#ee742f"
                    : "#e8f4fb",
                  color: isActive || isDone ? "white" : "#666666",
                  fontFamily: "var(--font-inter)",
                }}
              >
                {isDone ? "✓" : num}
              </div>
              <span
                className="text-sm hidden sm:block"
                style={{
                  color: isActive ? "#28347c" : isDone ? "#ee742f" : "#666666",
                  fontFamily: "var(--font-poppins)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 pb-12">
        {step === "drive" && <DriveStep onContinue={addFromDrive} />}
        {step === "files" && (
          <FilesStep
            driveCount={collected.filter((f) => f.source === "drive").length}
            onContinue={addFromLocal}
            onSkip={skipLocal}
          />
        )}
        {step === "results" && (
          <ResultsView files={collected} onReset={reset} />
        )}
      </main>
    </div>
  );
}
