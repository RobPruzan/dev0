// @ts-nocheck
import { useState, useEffect } from "react";
import { useTool } from "../hooks/useTool";

export function ToolExample() {
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [activatedTools, setActivatedTools] = useState<string[]>([]);

  // Single inspect tool - controlled by parent
  const inspectTool = useTool({
    name: "inspect_elements",
    description:
      "Visual element inspector for page analysis. Can activate/deactivate interactive mode or programmatically select elements by CSS selector. Returns detailed element information including styles, attributes, and positioning.",
    execute: async ({
      action,
      selector,
    }: {
      action: string;
      selector?: string;
    }) => {
      if (!window.dev) {
        return {
          success: false,
          error: "Dev API not available. Inspector only works in iframe mode.",
        };
      }

      try {
        if (action === "select") {
          if (!selector) {
            return {
              success: false,
              error: 'Selector is required when action is "select"',
            };
          }

          // Execute element selection in parent context
          const result = await window.dev.execute((sel: string) => {
            try {
              const elements = document.querySelectorAll(sel);
              if (elements.length === 0) {
                return {
                  success: false,
                  error: `No elements found for selector: ${sel}`,
                };
              }

              const element = elements[0]; // Select first matching element

              // Extract element data
              const rect = element.getBoundingClientRect();
              const computedStyle = window.getComputedStyle(element);

              const attributes: Record<string, string> = {};
              for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                attributes[attr.name] = attr.value;
              }

              const elementData = {
                tagName: element.tagName.toLowerCase(),
                id: element.id || "",
                className: element.className.toString(),
                textContent: element.textContent?.trim() || "",
                attributes,
                styles: {
                  display: computedStyle.display,
                  position: computedStyle.position,
                  width: computedStyle.width,
                  height: computedStyle.height,
                  backgroundColor: computedStyle.backgroundColor,
                  color: computedStyle.color,
                  fontSize: computedStyle.fontSize,
                  fontFamily: computedStyle.fontFamily,
                  margin: computedStyle.margin,
                  padding: computedStyle.padding,
                  border: computedStyle.border,
                },
                boundingRect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
                children: element.children.length,
                parent: element.parentElement?.tagName.toLowerCase(),
              };

              // Highlight the selected element
              const canvas = document.getElementById(
                "dev0-inspector-canvas"
              ) as HTMLCanvasElement;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  // Clear previous highlights
                  ctx.clearRect(0, 0, canvas.width, canvas.height);

                  // Draw selection highlight
                  ctx.fillStyle = "rgba(76, 175, 80, 0.3)";
                  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

                  ctx.strokeStyle = "#4CAF50";
                  ctx.lineWidth = 3;
                  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

                  // Draw selection indicator
                  ctx.fillStyle = "#4CAF50";
                  ctx.fillRect(rect.left - 5, rect.top - 5, 10, 10);
                }
              }

              // Send element data to devtools
              const allElements = document.querySelectorAll("*");
              let projectIframe: HTMLIFrameElement | null = null;

              allElements.forEach((el) => {
                if (el.shadowRoot) {
                  const shadowFrames = el.shadowRoot.querySelectorAll("iframe");
                  shadowFrames.forEach((iframe) => {
                    if (
                      iframe.title?.includes("Dev-0 Project:") ||
                      (iframe.src?.includes("localhost") &&
                        !iframe.src?.includes("session="))
                    ) {
                      projectIframe = iframe as HTMLIFrameElement;
                    }
                  });
                }
              });

              if (projectIframe?.contentWindow) {
                projectIframe.contentWindow.postMessage(
                  {
                    type: "element-selected",
                    data: elementData,
                  },
                  "*"
                );
              }

              return {
                success: true,
                elementData,
                message: `Selected element: ${element.tagName.toLowerCase()}${
                  element.id ? "#" + element.id : ""
                }${
                  element.className
                    ? "." + element.className.split(" ").join(".")
                    : ""
                }`,
              };
            } catch (error) {
              return { success: false, error: `Invalid selector: ${sel}` };
            }
          }, selector);

          return result;
        } else {
          // Handle activate/deactivate actions
          await window.dev.execute((act: string) => {
            const api = (window as any).inspectorAPI;
            if (api) {
              if (act === "activate") {
                api.activate();
              } else {
                api.deactivate();
              }
            }
            return `Inspector ${act}d`;
          }, action);

          setInspectorActive(action === "activate");

          return {
            success: true,
            action,
            message:
              action === "activate"
                ? "Inspector activated. Hover over elements to highlight them, click to select. Press ESC to exit."
                : "Inspector deactivated.",
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Inspector error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });

  // Create canvas and setup inspector in parent window
  useEffect(() => {
    if (!window.dev || !window.__DEV0__?.ready) return;

    // Create canvas and event handlers in parent window
    window.dev.execute(() => {
      // Remove existing canvas if any
      const existingCanvas = document.getElementById("dev0-inspector-canvas");
      if (existingCanvas) existingCanvas.remove();

      // Create canvas with proper DPI scaling
      const canvas = document.createElement("canvas");
      canvas.id = "dev0-inspector-canvas";
      canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 999999;
        display: none;
      `;
      document.body.appendChild(canvas);

      const ctx = canvas.getContext("2d")!;

      // DPI scaling for crisp canvas
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      let isActive = false;
      let currentElement: Element | null = null;
      let isLocked = false;

      // Drawing functions
      const clearCanvas = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      };

      const highlightElement = (element: Element) => {
        clearCanvas();
        const rect = element.getBoundingClientRect();

        // Draw highlight
        ctx.fillStyle = "rgba(74, 144, 226, 0.3)";
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

        // Draw border
        ctx.strokeStyle = "#4A90E2";
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        // Draw tooltip
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : "";
        const className = element.className
          ? `.${element.className.toString().split(" ").join(".")}`
          : "";
        const text = `${tagName}${id}${className}`;

        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.font = "12px monospace";
        const textWidth = ctx.measureText(text).width;

        const tooltipX = Math.min(
          rect.left,
          window.innerWidth - textWidth - 10
        );
        const tooltipY = Math.max(rect.top - 25, 0);

        ctx.fillRect(tooltipX - 5, tooltipY, textWidth + 10, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, tooltipX, tooltipY + 15);
      };

      const extractElementData = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          attributes[attr.name] = attr.value;
        }

        return {
          tagName: element.tagName.toLowerCase(),
          id: element.id || "",
          className: element.className.toString(),
          textContent: element.textContent?.trim() || "",
          attributes,
          styles: {
            display: computedStyle.display,
            position: computedStyle.position,
            width: computedStyle.width,
            height: computedStyle.height,
            backgroundColor: computedStyle.backgroundColor,
            color: computedStyle.color,
          },
          boundingRect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          children: element.children.length,
          parent: element.parentElement?.tagName.toLowerCase(),
        };
      };

      // Store locked element separately
      let lockedElement: Element | null = null;

      const drawLockedElement = () => {
        if (!lockedElement) return;

        const rect = lockedElement.getBoundingClientRect();

        // Draw locked highlight (green)
        ctx.fillStyle = "rgba(76, 175, 80, 0.3)";
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

        ctx.strokeStyle = "#4CAF50";
        ctx.lineWidth = 3;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        // Draw selection indicator
        ctx.fillStyle = "#4CAF50";
        ctx.fillRect(rect.left - 5, rect.top - 5, 10, 10);

        // Draw tooltip
        const tagName = lockedElement.tagName.toLowerCase();
        const id = lockedElement.id ? `#${lockedElement.id}` : "";
        const className = lockedElement.className
          ? `.${lockedElement.className.toString().split(" ").join(".")}`
          : "";
        const text = `LOCKED: ${tagName}${id}${className} (click again to unlock)`;

        ctx.fillStyle = "rgba(76, 175, 80, 0.9)";
        ctx.font = "12px monospace";
        const textWidth = ctx.measureText(text).width;

        const tooltipX = Math.min(
          rect.left,
          window.innerWidth - textWidth - 10
        );
        const tooltipY = Math.max(rect.top - 25, 0);

        ctx.fillRect(tooltipX - 5, tooltipY, textWidth + 10, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, tooltipX, tooltipY + 15);
      };

      // Event handlers
      const handleMouseMove = (event: MouseEvent) => {
        if (!isActive || isLocked) return; // DON'T highlight anything when locked

        canvas.style.pointerEvents = "none";
        const element = document.elementFromPoint(event.clientX, event.clientY);
        canvas.style.pointerEvents = "none";

        if (element && element !== canvas && element !== currentElement) {
          clearCanvas();
          highlightElement(element);
          currentElement = element;
        }
      };

      const handleClick = (event: MouseEvent) => {
        if (!isActive) return;

        event.preventDefault();
        event.stopPropagation();

        canvas.style.pointerEvents = "none";
        const element = document.elementFromPoint(event.clientX, event.clientY);
        canvas.style.pointerEvents = "none";

        if (element && element !== canvas) {
          // Check if clicking on already locked element
          if (isLocked && element === lockedElement) {
            // Unlock
            isLocked = false;
            lockedElement = null;
            console.log("Unlocked element");
            return;
          }

          // Lock this element
          isLocked = true;
          lockedElement = element;
          currentElement = element;

          const elementData = extractElementData(element);
          console.log("Locked element and sending data:", elementData);

          // Draw locked selection
          clearCanvas();
          drawLockedElement();

          // Search thoroughly for the Dev-0 project iframe
          console.log("Searching for Dev-0 project iframe...");

          // Search in main document
          const mainIframes = document.querySelectorAll("iframe");
          console.log("Main document iframes:", mainIframes.length);

          // Search in shadow DOMs
          const allElements = document.querySelectorAll("*");
          const shadowIframes: HTMLIFrameElement[] = [];
          allElements.forEach((el) => {
            if (el.shadowRoot) {
              const shadowFrames = el.shadowRoot.querySelectorAll("iframe");
              shadowFrames.forEach((iframe) => {
                shadowIframes.push(iframe as HTMLIFrameElement);
              });
            }
          });
          console.log("Shadow DOM iframes:", shadowIframes.length);

          const allIframes = [...Array.from(mainIframes), ...shadowIframes];
          console.log("Total iframes found:", allIframes.length);

          let projectIframe: HTMLIFrameElement | null = null;
          allIframes.forEach((iframe, index) => {
            console.log(`Iframe ${index}:`, {
              src: iframe.src,
              title: iframe.title,
              id: iframe.id,
              className: iframe.className,
            });

            // Look for Dev-0 project iframe - multiple criteria
            if (
              (iframe.title && iframe.title.includes("Dev-0 Project:")) ||
              (iframe.src &&
                iframe.src.includes("localhost") &&
                !iframe.src.includes("session=")) ||
              (iframe.src && iframe.src.includes("54015")) // or whatever port the template is on
            ) {
              projectIframe = iframe;
              console.log("Found potential Dev-0 project iframe:", {
                title: iframe.title,
                src: iframe.src,
              });
            }
          });

          if (projectIframe?.contentWindow) {
            console.log("Sending element data to project iframe...");
            projectIframe.contentWindow.postMessage(
              {
                type: "element-selected",
                data: elementData,
              },
              "*"
            );
            console.log("Element data sent to project iframe");
          } else {
            console.log(
              "No Dev-0 project iframe found. Searched:",
              allIframes.length,
              "iframes"
            );
            // Also try broadcasting to all windows as fallback
            console.log("Broadcasting as fallback...");
            window.postMessage(
              {
                type: "element-selected",
                data: elementData,
              },
              "*"
            );
          }
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!isActive) return;
        if (event.key === "Escape") {
          isActive = false;
          isLocked = false;
          lockedElement = null;
          canvas.style.display = "none";
          clearCanvas();
          document.body.style.cursor = "";
          currentElement = null;

          // Send deactivation message to iframe
          const iframes = document.querySelectorAll("iframe");
          iframes.forEach((iframe) => {
            const htmlIframe = iframe as HTMLIFrameElement;
            if (htmlIframe.contentWindow) {
              htmlIframe.contentWindow.postMessage(
                {
                  type: "inspector-deactivated",
                  data: { reason: "escape-key" },
                },
                "*"
              );
            }
          });
        }
      };

      // Add event listeners
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKeyDown);

      // Global functions for iframe to call
      (window as any).inspectorAPI = {
        activate: () => {
          isActive = true;
          isLocked = false;
          lockedElement = null;
          canvas.style.display = "block";
          // Update canvas size with DPI scaling
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
          document.body.style.cursor = "crosshair";

          // Set up a global function to handle element data
          (window as any).sendElementToDevtools = (elementData: any) => {
            console.log("sendElementToDevtools called with:", elementData);
            // This will be handled by the dev API response
            return elementData;
          };
        },
        deactivate: () => {
          isActive = false;
          isLocked = false;
          lockedElement = null;
          canvas.style.display = "none";
          clearCanvas();
          document.body.style.cursor = "";
        },
      };

      return "Inspector setup complete";
    });

    // Listen for messages from parent window
    const handleMessage = (event: MessageEvent) => {
      console.log(
        "Iframe received message:",
        event.data,
        "from origin:",
        event.origin
      );

      if (event.data.type === "element-selected") {
        console.log(
          "Setting selected element via postMessage:",
          event.data.data
        );
        console.log(
          "Current selectedElement state before update:",
          selectedElement
        );
        setSelectedElement(event.data.data);
        console.log("setSelectedElement called with:", event.data.data);
      } else if (event.data.type === "inspector-deactivated") {
        console.log("Inspector deactivated from parent");
        setInspectorActive(false);
      } else if (event.data.type === "dev0-execute-response") {
        // Ignore dev0 responses
        return;
      } else {
        console.log("Unhandled message type:", event.data.type);
      }
    };

    // Set up global callback for direct communication
    console.log("Setting up global devToolsCallback...");
    (window as any).devToolsCallback = (elementData: any) => {
      console.log("Global callback received:", elementData);
      setSelectedElement(elementData);
    };
    console.log(
      "Global devToolsCallback set:",
      typeof (window as any).devToolsCallback
    );

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      // Clean up global callback
      delete (window as any).devToolsCallback;
    };
  }, []);

  // Log selectedElement changes
  useEffect(() => {
    console.log("selectedElement state changed to:", selectedElement);
  }, [selectedElement]);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Element Inspector</h2>

      {/* Inspector Controls */}
      <div className="bg-muted p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Visual Inspector</h3>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                window.dev && window.__DEV0__?.ready
                  ? "bg-green-500"
                  : "bg-red-500"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {window.dev && window.__DEV0__?.ready
                ? "Dev API Ready"
                : "Dev API Not Available"}
            </span>
          </div>

          <div
            className={`px-2 py-1 rounded text-xs ${
              inspectorActive
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {inspectorActive ? "Active" : "Inactive"}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => inspectTool.execute({ action: "activate" })}
            disabled={!window.dev || inspectorActive}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            🔍 Start Inspecting
          </button>

          <button
            onClick={() => inspectTool.execute({ action: "deactivate" })}
            disabled={!window.dev || !inspectorActive}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 disabled:opacity-50"
          >
            ⏹️ Stop Inspecting
          </button>
        </div>

        <div className="text-sm text-muted-foreground">
          {inspectorActive ? (
            <div className="space-y-1">
              <p>
                🎯 <strong>Inspector Active:</strong>
              </p>
              <p>• Hover over elements in the parent page to highlight them</p>
              <p>• Click to select an element and view its details</p>
              <p>• Press ESC to exit inspector mode</p>
            </div>
          ) : (
            <p>Click "Start Inspecting" to activate visual element selection</p>
          )}
        </div>
      </div>

      {/* Tool Registration */}
      <div className="bg-muted p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">MCP Tool Registration</h3>

        <div className="flex items-center justify-between p-3 border rounded-md bg-background">
          <div className="flex-1">
            <div className="font-medium">inspect_elements</div>
            <div className="text-xs text-muted-foreground">
              Visual element inspector for AI models
            </div>
            <div className="text-sm text-muted-foreground">
              Status:{" "}
              {inspectTool.isRegistered
                ? "✅ Registered"
                : inspectTool.registrationStatus === "registering"
                ? "⏳ Registering..."
                : inspectTool.registrationStatus === "error"
                ? "❌ Failed"
                : "⭕ Not Registered"}
            </div>
            {inspectTool.registrationError && (
              <div className="text-xs text-destructive mt-1">
                Error: {inspectTool.registrationError}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!inspectTool.isRegistered ? (
              <button
                onClick={inspectTool.registerTool}
                disabled={inspectTool.registrationStatus === "registering"}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {inspectTool.registrationStatus === "registering"
                  ? "Registering..."
                  : "Register"}
              </button>
            ) : (
              <button
                onClick={inspectTool.unregisterTool}
                className="px-3 py-1 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90"
              >
                Unregister
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selected Element Info */}
      {selectedElement && (
        <div className="bg-muted p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Selected Element</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Tag:</strong> {selectedElement.tagName}
            </div>
            <div>
              <strong>ID:</strong> {selectedElement.id || "None"}
            </div>
            <div>
              <strong>Classes:</strong> {selectedElement.className || "None"}
            </div>
            <div>
              <strong>Children:</strong> {selectedElement.children}
            </div>
            <div className="col-span-2">
              <strong>Text:</strong>{" "}
              {selectedElement.textContent.substring(0, 100)}...
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer font-medium">
              Full Element Data
            </summary>
            <pre className="bg-background p-3 rounded mt-2 text-xs overflow-auto max-h-64">
              {JSON.stringify(selectedElement, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
