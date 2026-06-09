"use client";

import { useState } from "react";
import CollectStep from "@/components/CollectStep";
import ResultsView from "@/components/ResultsView";
import SaluLogo from "@/components/SaluLogo";

export type CollectedFile = {
  name: string;
  mimeType: string;
  source: "drive" | "local" | "gmail";
  size?: number;
  driveId?: string;
  localFile?: File;
  gmailMessageId?: string;
  gmailAttachmentId?: string;
  gmailSubject?: string;
};

type Step = "collect" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("collect");
  const [collected, setCollected] = useState<CollectedFile[]>([]);

  function handleCollected(files: CollectedFile[]) {
    setCollected(files);
    setStep("results");
  }

  function reset() {
    setCollected([]);
    setStep("collect");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="w-full px-6 py-4 flex items-center gap-3"
        style={{ background: "linear-gradient(50deg, #2b4c9c, #28347c)" }}
      >
        <SaluLogo />
        <span className="text-white text-xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-inter)" }}>
          Salutia
        </span>
        <span className="ml-auto text-white/60 text-sm" style={{ fontFamily: "var(--font-poppins)" }}>
          Vida Potenciada
        </span>
      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-[#e8f4fb]">
        <div
          className="h-1 transition-all duration-500"
          style={{
            background: "linear-gradient(50deg, #2b4c9c, #28347c)",
            width: step === "collect" ? "50%" : "100%",
          }}
        />
      </div>

      {/* Steps indicator */}
      <div className="flex justify-center gap-10 py-5 px-4">
        {[
          { id: "collect", label: "Recolectar", num: 1 },
          { id: "results", label: "Resultados", num: 2 },
        ].map(({ id, label, num }) => {
          const isActive = step === id;
          const isDone = id === "collect" && step === "results";
          return (
            <div key={id} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                style={{
                  background: isActive ? "linear-gradient(50deg, #2b4c9c, #28347c)" : isDone ? "#ee742f" : "#e8f4fb",
                  color: isActive || isDone ? "white" : "#666",
                  fontFamily: "var(--font-inter)",
                }}
              >
                {isDone ? "✓" : num}
              </div>
              <span
                className="text-sm hidden sm:block"
                style={{
                  color: isActive ? "#28347c" : isDone ? "#ee742f" : "#666",
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
      <main className="flex-1 flex flex-col items-center px-4">
        {step === "collect" && <CollectStep onContinue={handleCollected} />}
        {step === "results" && <ResultsView files={collected} onReset={reset} />}
      </main>
    </div>
  );
}
