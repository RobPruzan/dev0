import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { devExecute, useDevExecute } from "@/lib/dev-execute";

interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles?: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontFamily: string;
    padding: string;
    margin: string;
  };
  path: string;
}

export const AdvancedInspector: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(
    null
  );
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(
    null
  );
  const animationFrameRef = useRef<number>();
  const { executeInParent, isReady } = useDevExecute();

  // Initialize the inspector in parent window
  useEffect(() => {
    if (!isReady) return;

    const initInspector = async () => {
      await executeInParent(
        async (onElementHover, onElementClick, onDeactivate) => {
          const existingCanvas = document.getElementById(
            "advanced-inspector-canvas"
          );
          if (existingCanvas) existingCanvas.remove();

          const canvas = document.createElement("canvas");
          canvas.id = "advanced-inspector-canvas";
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
          const dpr = window.devicePixelRatio || 1;

          const resizeCanvas = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
          };
          resizeCanvas();
          window.addEventListener("resize", resizeCanvas);

          // Interpolation state
          let currentBox = { x: 0, y: 0, width: 0, height: 0, opacity: 0 };
          let targetBox = { x: 0, y: 0, width: 0, height: 0, opacity: 0 };
          let lockedBox: typeof currentBox | null = null;
          let isAnimating = false;

          // Easing function
          const ease = (t: number) =>
            t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          // Animation loop
          const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Interpolate current box to target
            const speed = 0.2;
            currentBox.x += (targetBox.x - currentBox.x) * speed;
            currentBox.y += (targetBox.y - currentBox.y) * speed;
            currentBox.width += (targetBox.width - currentBox.width) * speed;
            currentBox.height += (targetBox.height - currentBox.height) * speed;
            currentBox.opacity +=
              (targetBox.opacity - currentBox.opacity) * speed;

            // Draw interpolated box
            if (currentBox.opacity > 0.01) {
              // Shadow
              ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
              ctx.shadowBlur = 10;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 2;

              // Fill
              ctx.fillStyle = `rgba(59, 130, 246, ${
                currentBox.opacity * 0.15
              })`;
              ctx.fillRect(
                currentBox.x,
                currentBox.y,
                currentBox.width,
                currentBox.height
              );

              // Border
              ctx.shadowBlur = 0;
              ctx.strokeStyle = `rgba(59, 130, 246, ${currentBox.opacity})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(
                currentBox.x,
                currentBox.y,
                currentBox.width,
                currentBox.height
              );

              // Corner dots
              const dotSize = 4;
              ctx.fillStyle = `rgba(59, 130, 246, ${currentBox.opacity})`;
              ctx.fillRect(
                currentBox.x - dotSize / 2,
                currentBox.y - dotSize / 2,
                dotSize,
                dotSize
              );
              ctx.fillRect(
                currentBox.x + currentBox.width - dotSize / 2,
                currentBox.y - dotSize / 2,
                dotSize,
                dotSize
              );
              ctx.fillRect(
                currentBox.x - dotSize / 2,
                currentBox.y + currentBox.height - dotSize / 2,
                dotSize,
                dotSize
              );
              ctx.fillRect(
                currentBox.x + currentBox.width - dotSize / 2,
                currentBox.y + currentBox.height - dotSize / 2,
                dotSize,
                dotSize
              );
            }

            // Draw locked box if exists
            if (lockedBox) {
              ctx.strokeStyle = "rgba(16, 185, 129, 1)";
              ctx.lineWidth = 3;
              ctx.strokeRect(
                lockedBox.x,
                lockedBox.y,
                lockedBox.width,
                lockedBox.height
              );

              // Locked indicator
              ctx.fillStyle = "rgba(16, 185, 129, 1)";
              const lockSize = 6;
              ctx.fillRect(
                lockedBox.x - lockSize / 2,
                lockedBox.y - lockSize / 2,
                lockSize,
                lockSize
              );
            }

            if (isAnimating) {
              requestAnimationFrame(animate);
            }
          };

          // Helper to get element info
          const getElementInfo = (element: Element): any => {
            const rect = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);

            // Build path
            const path: string[] = [];
            let el: Element | null = element;
            while (el && el !== document.body) {
              const selector =
                el.tagName.toLowerCase() +
                (el.id ? `#${el.id}` : "") +
                (el.className
                  ? `.${el.className
                      .toString()
                      .split(" ")
                      .filter(Boolean)
                      .join(".")}`
                  : "");
              path.unshift(selector);
              el = el.parentElement;
            }

            return {
              tagName: element.tagName.toLowerCase(),
              id: element.id || "",
              className: element.className.toString(),
              textContent: element.textContent?.trim().substring(0, 100) || "",
              boundingRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              computedStyles: {
                backgroundColor: styles.backgroundColor,
                color: styles.color,
                fontSize: styles.fontSize,
                fontFamily: styles.fontFamily,
                padding: styles.padding,
                margin: styles.margin,
              },
              path: path.join(" > "),
            };
          };

          // Mouse handlers
          let isActive = false;
          let lastElement: Element | null = null;

          const handleMouseMove = (e: MouseEvent) => {
            if (!isActive) return;

            canvas.style.pointerEvents = "none";
            const element = document.elementFromPoint(e.clientX, e.clientY);

            if (element && element !== canvas && element !== lastElement) {
              lastElement = element;
              const rect = element.getBoundingClientRect();

              // Update target for interpolation
              targetBox = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                opacity: 1,
              };

              // Send hover info
              const info = getElementInfo(element);
              onElementHover(info);
            } else if (!element) {
              targetBox.opacity = 0;
            }
          };

          const handleClick = (e: MouseEvent) => {
            if (!isActive) return;

            e.preventDefault();
            e.stopPropagation();

            canvas.style.pointerEvents = "none";
            const element = document.elementFromPoint(e.clientX, e.clientY);

            if (element && element !== canvas) {
              const rect = element.getBoundingClientRect();

              if (
                lockedBox &&
                lockedBox.x === rect.x &&
                lockedBox.y === rect.y &&
                lockedBox.width === rect.width &&
                lockedBox.height === rect.height
              ) {
                // Unlock if clicking same element
                lockedBox = null;
              } else {
                // Lock new element
                lockedBox = {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  opacity: 1,
                };

                const info = getElementInfo(element);
                onElementClick(info);
              }
            }
          };

          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isActive) {
              deactivate();
              onDeactivate();
            }
          };

          // Activation functions
          const activate = () => {
            isActive = true;
            isAnimating = true;
            canvas.style.display = "block";
            document.body.style.cursor = "crosshair";
            animate();
          };

          const deactivate = () => {
            isActive = false;
            isAnimating = false;
            canvas.style.display = "none";
            document.body.style.cursor = "";
            targetBox.opacity = 0;
            currentBox.opacity = 0;
            lockedBox = null;
            lastElement = null;
          };

          // Event listeners
          document.addEventListener("mousemove", handleMouseMove);
          document.addEventListener("click", handleClick, true);
          document.addEventListener("keydown", handleKeyDown);

          // Expose API
          (window as any).advancedInspector = {
            activate,
            deactivate,
            isActive: () => isActive,
          };

          return "Advanced inspector initialized";
        },
        (info: ElementInfo) => setHoveredElement(info),
        (info: ElementInfo) => setSelectedElement(info),
        () => setIsActive(false)
      );
    };

    initInspector();
  }, [isReady, executeInParent]);

  const toggleInspector = async () => {
    if (!isReady) return;

    const newState = !isActive;
    setIsActive(newState);

    await devExecute((activate: boolean) => {
      const api = (window as any).advancedInspector;
      if (api) {
        if (activate) {
          api.activate();
        } else {
          api.deactivate();
        }
      }
    }, newState);

    if (!newState) {
      setHoveredElement(null);
      setSelectedElement(null);
    }
  };

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Advanced Element Inspector</h2>
        <Button
          onClick={toggleInspector}
          size="sm"
          variant={isActive ? "default" : "outline"}
          className="h-7 text-xs"
          disabled={!isReady}
        >
          {isActive ? "🔍 Active (ESC to exit)" : "Activate Inspector"}
        </Button>
      </div>

      {/* Hovered Element Info */}
      {hoveredElement && (
        <div className="space-y-2 p-3 bg-muted/50 rounded text-xs">
          <h3 className="font-medium text-muted-foreground">Hovering:</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Element:</span>
              <p className="font-mono">{hoveredElement.tagName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">ID:</span>
              <p className="font-mono truncate">
                {hoveredElement.id || "none"}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Path:</span>
              <p className="font-mono text-[10px] truncate">
                {hoveredElement.path}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selected Element Info */}
      {selectedElement && (
        <div className="space-y-2 p-3 bg-green-500/10 border border-green-500/20 rounded text-xs">
          <h3 className="font-medium text-green-700">Selected Element:</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Tag:</span>
                <p className="font-mono">{selectedElement.tagName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>
                <p className="font-mono">
                  {Math.round(selectedElement.boundingRect.width)}×
                  {Math.round(selectedElement.boundingRect.height)}
                </p>
              </div>
            </div>

            {selectedElement.computedStyles && (
              <div className="space-y-1">
                <p className="text-muted-foreground">Styles:</p>
                <div className="font-mono text-[10px] space-y-0.5">
                  <div>Color: {selectedElement.computedStyles.color}</div>
                  <div>
                    Font: {selectedElement.computedStyles.fontSize}{" "}
                    {selectedElement.computedStyles.fontFamily.split(",")[0]}
                  </div>
                  <div>Padding: {selectedElement.computedStyles.padding}</div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <span className="text-muted-foreground">Path:</span>
              <p className="font-mono text-[10px] break-all">
                {selectedElement.path}
              </p>
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <p className="text-xs text-muted-foreground text-center">
          Move mouse to inspect • Click to select • ESC to exit
        </p>
      )}
    </div>
  );
};
