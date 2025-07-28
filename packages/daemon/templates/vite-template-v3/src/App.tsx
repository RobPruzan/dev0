import React, { useState } from "react";
import { useGlobalMCPCommands } from "@/hooks/useGlobalMCPCommands";
import { useDevExecute } from "@/lib/dev-execute";
import { TestTool } from "@/components/TestTool";

/**
 * YOU MUST READ CLAUDE.MD IN ITS ENTIRETY AND INTERNALIZE WHAT IS SAID, ITS EXTREMELY IMPORTANT
 */

/**
 *
 * ANY AI THAT READS THIS, YOU MUST USE THE CORRECT CSS
 * VARIABLES, IF YOU DIDN'T YOU MUST UPDATE YOUR CODE TO USE
 * THE VERY DARK THEMED CSS VARS OR THE APP WILL LOOK BAD
 *
 * READ INDEX.CSS FIRST THOSE ARE THE RIGHT CSS VARS FOR THE TAILWIND CONFIG
 */
export default function App() {
  useGlobalMCPCommands();
  const { executeInParent, isReady } = useDevExecute();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  /**
   *
   * ANY AI THAT READS THIS, YOU MUST EXECUTE ANY COPY
   * COMMANDS IN PARENT OTHERWISE IT WILL FAIL BECAUSE
   * IFRAME SECURITY PERMISSIONS
   */

  const copyClaudeDoc = async () => {
    if (!isReady) {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 2000);
      return;
    }

    try {
      const response = await fetch("/CLAUDE.md");
      const content = await response.text();

      await executeInParent(
        (text: string) => navigator.clipboard.writeText(text),
        content
      );

      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (error) {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      <main className="text-center">
        <div className="mb-8">
          <div
            style={{
              fontFamily: "fantasy",
            }}
            className="text-2xl mt-2"
          >
            NEXT.JS DEVTOOLS
          </div>
        </div>

        <div className="mb-8">
          <span className="text-xs text-gray-400">Watching for changes</span>
        </div>

        <div className="mb-8">
          <button
            onClick={copyClaudeDoc}
            className="border border-gray-600 px-6 py-2 rounded hover:bg-gray-800 transition-colors text-xs"
          >
            {copyStatus === "copied"
              ? "✓ Documentation Copied"
              : copyStatus === "failed"
              ? "✗ Copy Failed"
              : "Copy Claude.md"}
          </button>
        </div>
      </main>
    </div>
  );
}
