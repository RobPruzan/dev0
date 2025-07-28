import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { devExecute, useDevExecute } from "@/lib/dev-execute";

export const DOMManipulator: React.FC = () => {
  const [results, setResults] = useState<string[]>([]);
  const { executeInParent, isLoading, isReady } = useDevExecute();

  const addResult = (result: string) => {
    setResults((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${result}`,
    ]);
  };

  const handleSmoothHighlight = async () => {

    await executeInParent(async (onProgress) => {
      // Find all buttons in the parent document
      const buttons = document.querySelectorAll("button");
      const totalButtons = buttons.length;

      await onProgress(`Found ${totalButtons} buttons to highlight`);

      // Create style element for animation
      const style = document.createElement("style");
      style.textContent = `
          @keyframes pulse-highlight {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(59, 130, 246, 0.3); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          .dom-manipulator-highlight {
            animation: pulse-highlight 0.5s ease-out !important;
            position: relative !important;
            z-index: 1000 !important;
          }
        `;
      document.head.appendChild(style);

      // Highlight each button with a delay
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i] as HTMLElement;

        // Add highlight class
        button.classList.add("dom-manipulator-highlight");

        // Remove class after animation
        setTimeout(() => {
          button.classList.remove("dom-manipulator-highlight");
        }, 500);

        await onProgress(
          `Highlighted button ${i + 1}/${totalButtons}: "${
            button.textContent?.trim() || "No text"
          }"`
        );

        // Wait before next button
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Cleanup
      setTimeout(() => style.remove(), 1000);

      return `Highlighted ${totalButtons} buttons`;
    }, addResult);
  };

  const handleDOMAnalysis = async () => {
    const analysis = await executeInParent(async (reportBack) => {
      const stats = {
        totalElements: document.querySelectorAll("*").length,
        images: document.images.length,
        links: document.links.length,
        forms: document.forms.length,
        headings: {
          h1: document.querySelectorAll("h1").length,
          h2: document.querySelectorAll("h2").length,
          h3: document.querySelectorAll("h3").length,
        },
        interactive: {
          buttons: document.querySelectorAll("button").length,
          inputs: document.querySelectorAll("input").length,
          textareas: document.querySelectorAll("textarea").length,
          selects: document.querySelectorAll("select").length,
        },
      };

      await reportBack(`Analyzing DOM structure...`);

      // Find largest element
      let largestElement = null;
      let largestArea = 0;

      document.querySelectorAll("*").forEach((el) => {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > largestArea && rect.width > 0 && rect.height > 0) {
          largestArea = area;
          largestElement = el;
        }
      });

      await reportBack(
        `Found largest element: ${
          largestElement?.tagName || "none"
        } (${Math.round(largestArea)} px²)`
      );

      // Find deepest nesting
      let maxDepth = 0;
      const findDepth = (el: Element, depth = 0): number => {
        maxDepth = Math.max(maxDepth, depth);
        Array.from(el.children).forEach((child) => findDepth(child, depth + 1));
        return maxDepth;
      };
      findDepth(document.body);

      await reportBack(`Maximum DOM depth: ${maxDepth} levels`);

      return stats;
    }, addResult);

    if (analysis) {
      addResult(`DOM Analysis Complete: ${JSON.stringify(analysis, null, 2)}`);
    }
  };

  const handleInteractiveEdit = async () => {
    await executeInParent(
      async (onElementClick, onComplete) => {
        // Create an overlay for selecting elements
        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.1);
          z-index: 99999;
          cursor: crosshair;
        `;

        const info = document.createElement("div");
        info.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 10px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 100000;
          font-family: monospace;
          font-size: 14px;
        `;
        info.textContent =
          "Click any element to edit its text. Press ESC to cancel.";

        document.body.appendChild(overlay);
        document.body.appendChild(info);

        let highlightedEl: HTMLElement | null = null;

        const highlight = (el: HTMLElement) => {
          if (highlightedEl) {
            highlightedEl.style.outline = "";
          }
          el.style.outline = "2px solid #3b82f6";
          highlightedEl = el;
        };

        const cleanup = () => {
          overlay.remove();
          info.remove();
          if (highlightedEl) {
            highlightedEl.style.outline = "";
          }
          document.removeEventListener("keydown", handleKeydown);
        };

        const handleKeydown = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            cleanup();
            onComplete("Edit mode cancelled");
          }
        };

        document.addEventListener("keydown", handleKeydown);

        overlay.addEventListener("mousemove", (e) => {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          if (el && el !== overlay && el !== info) {
            highlight(el as HTMLElement);
          }
        });

        overlay.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const el = document.elementFromPoint(e.clientX, e.clientY);
          if (el && el !== overlay && el !== info) {
            const originalText = el.textContent || "";
            await onElementClick(
              `Selected: <${el.tagName.toLowerCase()}> "${originalText
                .trim()
                .substring(0, 50)}..."`
            );

            // Create inline editor
            const editor = document.createElement("input");
            editor.type = "text";
            editor.value = originalText;
            editor.style.cssText = `
              position: absolute;
              top: ${(el as HTMLElement).offsetTop}px;
              left: ${(el as HTMLElement).offsetLeft}px;
              width: ${(el as HTMLElement).offsetWidth}px;
              height: ${(el as HTMLElement).offsetHeight}px;
              font: inherit;
              border: 2px solid #3b82f6;
              background: white;
              z-index: 100001;
              padding: 4px;
            `;

            document.body.appendChild(editor);
            editor.focus();
            editor.select();

            editor.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                el.textContent = editor.value;
                editor.remove();
                cleanup();
                onComplete(`Updated text to: "${editor.value}"`);
              } else if (e.key === "Escape") {
                editor.remove();
              }
            });

            editor.addEventListener("blur", () => {
              editor.remove();
            });
          }
        });

        return "Interactive edit mode activated";
      },
      addResult,
      addResult
    );
  };

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold">DOM Manipulator</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          onClick={handleSmoothHighlight}
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!isReady || isLoading}
        >
          Highlight Buttons
        </Button>

        <Button
          onClick={handleDOMAnalysis}
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!isReady || isLoading}
        >
          Analyze DOM
        </Button>

        <Button
          onClick={handleInteractiveEdit}
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!isReady || isLoading}
        >
          Edit Mode
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">
              Results:
            </h3>
            <Button
              onClick={() => setResults([])}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
            >
              Clear
            </Button>
          </div>
          <div className="bg-muted/50 rounded p-2 max-h-32 overflow-y-auto">
            {results.map((result, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
