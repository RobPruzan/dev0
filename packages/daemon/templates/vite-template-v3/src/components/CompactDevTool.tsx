// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTool } from "@/hooks/useTool";
import { FunctionPassingDemo } from "./FunctionPassingDemo";
import { AdvancedInspector } from "./AdvancedInspector";
import { DOMManipulator } from "./DOMManipulator";
import { ToolPersistenceTest } from "./ToolPersistenceTest";
import { WebSocketDebug } from "./WebSocketDebug";
import { ToolDebug } from "./ToolDebug";
import "../types/dev-api";
// import { useTool } from "@/hooks/useParentControlledTool";

declare global {
  interface Window {
    __DEV0__?: {
      ready: boolean;
    };
  }
}

export const CompactDevTool: React.FC = () => {
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // stupid remove
  useEffect(() => {
    const checkReady = () => {
      if (window.dev && window.__DEV0__?.ready) {
        setIsReady(true);
      } else {
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    window.dev?.execute(() => {
      const existingCanvas = document.getElementById("dev0-inspector-canvas");
      if (existingCanvas) existingCanvas.remove();
      const canvas = document.createElement("canvas");
      canvas.id = "dev0-inspector-canvas";
      canvas.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        pointer-events: none; z-index: 999999; display: none;
      `;
      document.body.appendChild(canvas);

      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);

      let isActive = false;
      let lockedElement: Element | null = null;

      const highlightElement = (element: Element, isLocked = false) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = element.getBoundingClientRect();

        ctx.fillStyle = isLocked
          ? "rgba(76, 175, 80, 0.3)"
          : "rgba(74, 144, 226, 0.25)";
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

        ctx.strokeStyle = isLocked ? "#4CAF50" : "#4A90E2";
        ctx.lineWidth = isLocked ? 3 : 2;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        if (isLocked) {
          ctx.fillStyle = "#4CAF50";
          ctx.fillRect(rect.left - 5, rect.top - 5, 10, 10);
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isActive || lockedElement) return;
        canvas.style.pointerEvents = "none";
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element && element !== canvas) {
          highlightElement(element);
        }
      };

      const handleClick = (e: MouseEvent) => {
        if (!isActive) return;
        e.preventDefault();
        e.stopPropagation();

        canvas.style.pointerEvents = "none";
        const element = document.elementFromPoint(e.clientX, e.clientY);

        if (element && element !== canvas) {
          if (lockedElement === element) {
            lockedElement = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          } else {
            lockedElement = element;
            highlightElement(element, true);

            const rect = element.getBoundingClientRect();
            const elementData = {
              tagName: element.tagName.toLowerCase(),
              id: element.id || "",
              className: element.className.toString(),
              textContent: element.textContent?.trim() || "",
              boundingRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              children: element.children.length,
            };

            const allElements = document.querySelectorAll("*");
            allElements.forEach((el) => {
              if (el.shadowRoot) {
                const iframes = el.shadowRoot.querySelectorAll("iframe");
                iframes.forEach((iframe) => {
                  if (iframe.title?.includes("Dev-0 Project:")) {
                    iframe.contentWindow?.postMessage(
                      {
                        type: "element-selected",
                        data: elementData,
                      },
                      "*"
                    );
                  }
                });
              }
            });
          }
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isActive) {
          isActive = false;
          lockedElement = null;
          canvas.style.display = "none";
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          document.body.style.cursor = "";
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKeyDown);

      (window as any).inspectorAPI = {
        activate: () => {
          isActive = true;
          lockedElement = null;
          canvas.style.display = "block";
          document.body.style.cursor = "crosshair";
        },
        deactivate: () => {
          isActive = false;
          lockedElement = null;
          canvas.style.display = "none";
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          document.body.style.cursor = "";
        },
      };

      return "Inspector ready";
    });

    // Listen for element selection messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "element-selected") {
        setSelectedElement(event.data.data);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isReady]);

  const changeBackground = async () => {
    if (!window.dev) return;
    const color = `hsl(${Math.random() * 360}, 70%, 80%)`;
    await window.dev.execute((newColor: string) => {
      document.body.style.transition = "background-color 0.5s ease";
      document.body.style.backgroundColor = newColor;
      setTimeout(() => (document.body.style.backgroundColor = ""), 2000);
      return `Changed to ${newColor}`;
    }, color);
  };

  const inspectorTool = useTool({
    name: "inspect_elements",
    description: "Visual element inspector with highlighting and selection",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["activate", "deactivate"],
        },
      },
      required: ["action"],
    },
    execute: async ({ action }: { action: string }) => {
      if (!window.dev)
        return { success: false, error: "Dev API not available" };

      await window.dev.execute((act: string) => {
        const api = (window as any).inspectorAPI;
        if (api) api[act]();
      }, action);

      setInspectorActive(action === "activate");
      return { success: true, message: `Inspector ${action}d` };
    },
  });

  const windowDataTool = useTool({
    name: "get_window_data",
    description:
      "Fetches general information about the current window including title, URL, dimensions, and document statistics",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      if (!window.dev)
        return { success: false, error: "Dev API not available" };

      const data = await window.dev.execute(() => {
        const windowData = {
          title: document.title,
          url: window.location.href,
          domain: window.location.hostname,
          protocol: window.location.protocol,

          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          screen: {
            width: window.screen.width,
            height: window.screen.height,
            availWidth: window.screen.availWidth,
            availHeight: window.screen.availHeight,
            pixelRatio: window.devicePixelRatio,
          },

          document: {
            readyState: document.readyState,
            charset: document.characterSet,
            contentType: document.contentType,
            lastModified: document.lastModified,
            elementCount: document.getElementsByTagName("*").length,
            imageCount: document.images.length,
            linkCount: document.links.length,
            formCount: document.forms.length,
            scriptCount: document.scripts.length,
            styleSheetCount: document.styleSheets.length,
          },

          meta: {
            description:
              document
                .querySelector('meta[name="description"]')
                ?.getAttribute("content") || "",
            keywords:
              document
                .querySelector('meta[name="keywords"]')
                ?.getAttribute("content") || "",
            author:
              document
                .querySelector('meta[name="author"]')
                ?.getAttribute("content") || "",
            viewport:
              document
                .querySelector('meta[name="viewport"]')
                ?.getAttribute("content") || "",
          },

          performance: {
            loadTime:
              performance.timing.loadEventEnd -
              performance.timing.navigationStart,
            domContentLoaded:
              performance.timing.domContentLoadedEventEnd -
              performance.timing.navigationStart,
            resourceCount: performance.getEntriesByType("resource").length,
          },

          userAgent: navigator.userAgent,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          onlineStatus: navigator.onLine,
        };

        return windowData;
      });

      return {
        success: true,
        data,
        message: "Window data fetched successfully",
      };
    },
  });

  useEffect(() => {
    if (window.parent !== window) {
      const inspectToolSchema = {
        type: "object" as const,
        properties: {
          action: {
            type: "string" as const,
            enum: ["activate", "deactivate"],
          },
        },
        required: ["action"],
      };

      const windowDataSchema = {
        type: "object" as const,
        properties: {},
        required: [],
      };

      window.parent.postMessage(
        {
          type: "mcp-tools-register",
          tools: [
            {
              name: "inspect_elements",
              description:
                "Visual element inspector with highlighting and selection",
              inputSchema: JSON.parse(JSON.stringify(inspectToolSchema)), // Ensure plain object
              category: "DevTools",
            },
            {
              name: "get_window_data",
              description:
                "Fetches general information about the current window including title, URL, dimensions, and document statistics",
              inputSchema: JSON.parse(JSON.stringify(windowDataSchema)), // Ensure plain object
              category: "DevTools",
            },
          ],
        },
        "*"
      );
    }
  }, []);

  return (
    <div className="h-full w-full bg-background text-foreground p-3 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">DevTool</h1>
          <div
            className={`w-2 h-2 rounded-full ${
              isReady ? "bg-green-500" : "bg-red-500"
            }`}
          />
        </div>

        {/* WebSocket Debug - show at top for troubleshooting */}
        <WebSocketDebug />

        {/* Tool Client Debug */}
        <ToolDebug />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="bg-card border rounded p-3">
              <h2 className="text-xs font-medium mb-2">RPC Demo</h2>
              <Button
                onClick={changeBackground}
                disabled={!isReady}
                size="sm"
                className="w-full h-7 text-xs"
              >
                Change Background
              </Button>
            </div>

            <div className="bg-card border rounded p-3">
              <h2 className="text-xs font-medium mb-2">Element Inspector</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => inspectorTool.execute({ action: "activate" })}
                  disabled={!isReady || inspectorActive}
                  size="sm"
                  variant={inspectorActive ? "default" : "outline"}
                  className="h-7 text-xs"
                >
                  {inspectorActive ? "🔍 Active" : "Activate"}
                </Button>
                <Button
                  onClick={() =>
                    inspectorTool.execute({ action: "deactivate" })
                  }
                  disabled={!isReady || !inspectorActive}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                >
                  Stop
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-card border rounded p-3">
              <h2 className="text-xs font-medium mb-2">MCP Tools</h2>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs">
                  <span className="font-mono">inspect_elements</span>
                  {inspectorTool.isRegistered ? (
                    <span className="text-green-600">✅</span>
                  ) : (
                    <Button
                      onClick={inspectorTool.registerTool}
                      size="sm"
                      variant="ghost"
                      className="h-5 px-2 text-xs"
                    >
                      Register
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs">
                  <span className="font-mono">get_window_data</span>
                  {windowDataTool.isRegistered ? (
                    <span className="text-green-600">✅</span>
                  ) : (
                    <Button
                      onClick={windowDataTool.registerTool}
                      size="sm"
                      variant="ghost"
                      className="h-5 px-2 text-xs"
                    >
                      Register
                    </Button>
                  )}
                </div>
              </div>
              <Button
                onClick={async () => {
                  const response = await fetch(
                    "http://localhost:8002/clear-tools",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    }
                  );
                  const result = await response.json();
                  if (result.success) {
                    console.log(
                      "🗑️ Successfully cleared all MCP tools:",
                      result
                    );
                    if (window.parent !== window) {
                      window.parent.postMessage(
                        {
                          type: "mcp-tools-cleared",
                          message: result.message,
                        },
                        "*"
                      );
                    }
                  }
                }}
                size="sm"
                variant="destructive"
                className="w-full h-6 text-xs mt-2"
              >
                Clear All
              </Button>
            </div>

            <div className="bg-card border rounded p-3">
              <h2 className="text-xs font-medium mb-2">Add to Claude Code</h2>
              <div className="relative">
                <pre className="text-xs bg-muted/50 p-2 pr-16 rounded border overflow-x-auto font-mono">
                  {`claude mcp add devtools -- node /Users/robby/dev-0/packages/mcp-server/dist/index.js --stdio`}
                </pre>
                <Button
                  onClick={async () => {
                    try {
                      const command =
                        "claude mcp add devtools -- node /Users/robby/dev-0/packages/mcp-server/dist/index.js --stdio";
                      if (window.dev) {
                        await window.dev.execute((text: string) => {
                          return navigator.clipboard.writeText(text);
                        }, command);
                      } else {
                        await navigator.clipboard.writeText(command);
                      }

                      const btn = event?.target as HTMLButtonElement;
                      if (btn) {
                        const originalContent = btn.innerHTML;
                        btn.innerHTML =
                          '<span class="flex items-center gap-1">✓ Copied</span>';
                        btn.classList.add("text-green-600");
                        setTimeout(() => {
                          btn.innerHTML = originalContent;
                          btn.classList.remove("text-green-600");
                        }, 2000);
                      }
                    } catch (error) {
                      console.error("Failed to copy:", error);
                      const btn = event?.target as HTMLButtonElement;
                      if (btn) {
                        const originalContent = btn.innerHTML;
                        btn.innerHTML =
                          '<span class="flex items-center gap-1">✗ Failed</span>';
                        btn.classList.add("text-red-600");
                        setTimeout(() => {
                          btn.innerHTML = originalContent;
                          btn.classList.remove("text-red-600");
                        }, 2000);
                      }
                    }
                  }}
                  size="sm"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-6 px-2 text-xs"
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Run in terminal to add these DevTools to Claude Code
              </p>
            </div>
          </div>
        </div>

        {/* Tool Persistence Test */}
        <ToolPersistenceTest />

        {/* Advanced Inspector */}
        <AdvancedInspector />

        {/* DOM Manipulator */}
        <DOMManipulator />

        {/* Function Passing Demo */}
        <FunctionPassingDemo />

        {/* Selected Element */}
        {selectedElement && (
          <div className="bg-card border rounded p-3">
            <h2 className="text-xs font-medium mb-2">Selected Element</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Tag:</span>
                <p className="font-mono">{selectedElement.tagName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">ID:</span>
                <p className="font-mono truncate">
                  {selectedElement.id || "none"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Classes:</span>
                <p className="font-mono truncate">
                  {selectedElement.className || "none"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>
                <p className="font-mono">
                  {Math.round(selectedElement.boundingRect.width)}×
                  {Math.round(selectedElement.boundingRect.height)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
