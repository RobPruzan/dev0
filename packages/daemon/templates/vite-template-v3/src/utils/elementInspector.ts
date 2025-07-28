// @ts-nocheck
import { sendToParent } from "./iframeMessaging";
import "../types/dev-api";

export interface ElementData {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  boundingRect: DOMRect;
  xpath: string;
  selector: string;
  children: number;
  parent?: string;
  index: number;
}

export class ElementInspector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isActive: boolean = false;
  private currentElement: Element | null = null;
  private originalCursor: string = "";
  private excludeSelectors: string[] = [];
  private hasDevAPI: boolean = false;

  constructor() {
    // Check if dev API is available
    this.hasDevAPI = !!(window.dev && window.__DEV0__?.ready);

    // Create local canvas for UI feedback
    this.canvas = this.createLocalCanvas();
    this.ctx = this.canvas.getContext("2d")!;

    // If no dev API, setup direct event listeners
    if (!this.hasDevAPI) {
      this.setupEventListeners();
      this.setupResizeObserver();
    }
  }

  private createLocalCanvas(): HTMLCanvasElement {
    // Create a local canvas for UI feedback
    const canvas = document.createElement("canvas");
    canvas.id = "element-inspector-local-canvas";
    canvas.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 300px;
      height: 200px;
      pointer-events: none;
      z-index: 999999;
      display: none;
      border: 2px solid #4A90E2;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 8px;
    `;
    document.body.appendChild(canvas);
    return canvas;
  }

  private setupEventListeners() {
    // Only setup for direct access (non-dev API mode)
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("click", this.handleClick.bind(this));
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }

  private setupResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
      this.updateCanvasSize();
    });
    resizeObserver.observe(document.body);
  }

  private updateCanvasSize() {
    // Local canvas is fixed size for feedback
    this.canvas.width = 300;
    this.canvas.height = 200;
  }

  private handleMouseMove(event: MouseEvent) {
    if (!this.isActive) return;

    const element = this.getElementFromPoint(event.clientX, event.clientY);
    if (element && element !== this.currentElement) {
      this.highlightElement(element);
      this.currentElement = element;
    }
  }

  private handleClick(event: MouseEvent) {
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();

    const element = this.getElementFromPoint(event.clientX, event.clientY);
    if (element) {
      this.selectElement(element);
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.isActive) return;

    switch (event.key) {
      case "Escape":
        this.deactivate();
        break;
      case "Enter":
        if (this.currentElement) {
          this.selectElement(this.currentElement);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        this.selectParentElement();
        break;
      case "ArrowDown":
        event.preventDefault();
        this.selectFirstChild();
        break;
      case "ArrowLeft":
        event.preventDefault();
        this.selectPreviousSibling();
        break;
      case "ArrowRight":
        event.preventDefault();
        this.selectNextSibling();
        break;
    }
  }

  private getElementFromPoint(x: number, y: number): Element | null {
    // Only for direct access mode
    if (this.hasDevAPI) return null;

    this.canvas.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    this.canvas.style.pointerEvents = "none";

    if (element && !this.shouldExcludeElement(element)) {
      return element;
    }
    return null;
  }

  private shouldExcludeElement(element: Element): boolean {
    // Exclude canvas and inspector UI elements
    if (element === this.canvas) return true;
    if (element.id === "element-inspector-canvas") return true;

    // Check custom exclude selectors
    for (const selector of this.excludeSelectors) {
      if (element.matches(selector)) return true;
    }

    return false;
  }

  private highlightElement(element: Element) {
    this.clearCanvas();

    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    // Draw highlight overlay
    this.ctx.fillStyle = "rgba(74, 144, 226, 0.3)";
    this.ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

    // Draw border
    this.ctx.strokeStyle = "#4A90E2";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

    // Draw element info tooltip
    this.drawTooltip(element, rect);
  }

  private drawTooltip(element: Element, rect: DOMRect) {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const className = element.className
      ? `.${element.className.toString().split(" ").join(".")}`
      : "";
    const text = `${tagName}${id}${className}`;

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.ctx.font = "12px monospace";
    const textWidth = this.ctx.measureText(text).width;

    const tooltipX = Math.min(rect.left, window.innerWidth - textWidth - 10);
    const tooltipY = Math.max(rect.top - 25, 0);

    this.ctx.fillRect(tooltipX - 5, tooltipY, textWidth + 10, 20);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(text, tooltipX, tooltipY + 15);
  }

  public clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private selectElement(element: Element) {
    const elementData = this.extractElementData(element);

    // Send selection to parent/tools
    sendToParent("element-selected", elementData);

    // Highlight selected element with different color
    this.highlightSelectedElement(element);

    console.log("Element selected:", elementData);
  }

  private highlightSelectedElement(element: Element) {
    this.clearCanvas();

    const rect = element.getBoundingClientRect();

    // Draw selected element highlight
    this.ctx.fillStyle = "rgba(76, 175, 80, 0.3)";
    this.ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

    this.ctx.strokeStyle = "#4CAF50";
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

    // Draw selection indicator
    this.ctx.fillStyle = "#4CAF50";
    this.ctx.fillRect(rect.left - 5, rect.top - 5, 10, 10);
  }

  public extractElementData(element: Element): ElementData {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    // Get all attributes
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }

    // Get key computed styles
    const styles: Record<string, string> = {
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
      zIndex: computedStyle.zIndex,
    };

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || "",
      className: element.className.toString(),
      textContent: element.textContent?.trim() || "",
      attributes,
      styles,
      boundingRect: rect,
      xpath: this.getXPath(element),
      selector: this.getUniqueSelector(element),
      children: element.children.length,
      parent: element.parentElement?.tagName.toLowerCase(),
      index: Array.from(element.parentElement?.children || []).indexOf(element),
    };
  }

  private getXPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return `/${parts.join("/")}`;
  }

  private getUniqueSelector(element: Element): string {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try unique class combination
    if (element.className) {
      const classes = element.className
        .toString()
        .split(" ")
        .filter((c) => c);
      if (classes.length > 0) {
        const selector = `.${classes.join(".")}`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Build path-based selector
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = current.className
          .toString()
          .split(" ")
          .filter((c) => c);
        if (classes.length > 0) {
          selector += `.${classes.join(".")}`;
        }
      }

      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter(
        (s) => s.tagName === current!.tagName
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  private selectParentElement() {
    if (this.currentElement?.parentElement) {
      this.highlightElement(this.currentElement.parentElement);
      this.currentElement = this.currentElement.parentElement;
    }
  }

  private selectFirstChild() {
    if (this.currentElement?.children.length) {
      this.highlightElement(this.currentElement.children[0]);
      this.currentElement = this.currentElement.children[0];
    }
  }

  private selectPreviousSibling() {
    if (this.currentElement?.previousElementSibling) {
      this.highlightElement(this.currentElement.previousElementSibling);
      this.currentElement = this.currentElement.previousElementSibling;
    }
  }

  private selectNextSibling() {
    if (this.currentElement?.nextElementSibling) {
      this.highlightElement(this.currentElement.nextElementSibling);
      this.currentElement = this.currentElement.nextElementSibling;
    }
  }

  public async activate() {
    this.isActive = true;
    this.canvas.style.display = "block";
    this.updateCanvasSize();

    if (this.hasDevAPI && window.dev) {
      // Create inspector canvas in parent window
      await window.dev.execute(() => {
        // This runs in parent context
        let canvas = document.getElementById(
          "dev0-inspector-canvas"
        ) as HTMLCanvasElement;
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvas.id = "dev0-inspector-canvas";
          canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 999999;
            display: block;
          `;
          document.body.appendChild(canvas);
        }

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.display = "block";

        // Change cursor
        document.body.style.cursor = "crosshair";

        return "Inspector canvas created in parent";
      });

      this.showLocalFeedback("🔍 Inspector activated in parent window");
    } else {
      this.originalCursor = document.body.style.cursor;
      document.body.style.cursor = "crosshair";
    }

    sendToParent("inspector-activated", { active: true });
  }

  public async deactivate() {
    this.isActive = false;
    this.canvas.style.display = "none";
    this.clearCanvas();

    if (this.hasDevAPI && window.dev) {
      // Remove inspector canvas from parent window
      await window.dev.execute(() => {
        const canvas = document.getElementById("dev0-inspector-canvas");
        if (canvas) {
          canvas.style.display = "none";
          const ctx = (canvas as HTMLCanvasElement).getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          }
        }

        // Restore cursor
        document.body.style.cursor = "";

        return "Inspector deactivated in parent";
      });

      this.showLocalFeedback("❌ Inspector deactivated");
    } else {
      document.body.style.cursor = this.originalCursor;
    }

    this.currentElement = null;
    sendToParent("inspector-deactivated", { active: false });
  }

  public async toggle() {
    if (this.isActive) {
      await this.deactivate();
    } else {
      await this.activate();
    }
  }

  public setExcludeSelectors(selectors: string[]) {
    this.excludeSelectors = selectors;
  }

  public async queryElements(selector: string): Promise<ElementData[]> {
    if (this.hasDevAPI && window.dev) {
      // Execute in parent context using dev API
      return await window.dev.execute((sel: string) => {
        // This entire function runs in parent context
        const extractElementData = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);

          // Get all attributes
          const attributes: Record<string, string> = {};
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attributes[attr.name] = attr.value;
          }

          // Get XPath
          const getXPath = (el: Element): string => {
            const parts: string[] = [];
            let current: Element | null = el;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let index = 1;
              let sibling = current.previousElementSibling;

              while (sibling) {
                if (sibling.tagName === current.tagName) {
                  index++;
                }
                sibling = sibling.previousElementSibling;
              }

              const tagName = current.tagName.toLowerCase();
              parts.unshift(`${tagName}[${index}]`);
              current = current.parentElement;
            }

            return `/${parts.join("/")}`;
          };

          // Get unique selector
          const getUniqueSelector = (el: Element): string => {
            if (el.id) return `#${el.id}`;

            if (el.className) {
              const classes = el.className
                .toString()
                .split(" ")
                .filter((c) => c);
              if (classes.length > 0) {
                const selector = `.${classes.join(".")}`;
                if (document.querySelectorAll(selector).length === 1) {
                  return selector;
                }
              }
            }

            const path: string[] = [];
            let current: Element | null = el;

            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();

              if (current.id) {
                selector += `#${current.id}`;
                path.unshift(selector);
                break;
              }

              if (current.className) {
                const classes = current.className
                  .toString()
                  .split(" ")
                  .filter((c) => c);
                if (classes.length > 0) {
                  selector += `.${classes.join(".")}`;
                }
              }

              const siblings = Array.from(
                current.parentElement?.children || []
              );
              const sameTagSiblings = siblings.filter(
                (s) => s.tagName === current!.tagName
              );
              if (sameTagSiblings.length > 1) {
                const index = sameTagSiblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
              }

              path.unshift(selector);
              current = current.parentElement;
            }

            return path.join(" > ");
          };

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
              fontSize: computedStyle.fontSize,
              fontFamily: computedStyle.fontFamily,
              margin: computedStyle.margin,
              padding: computedStyle.padding,
              border: computedStyle.border,
              zIndex: computedStyle.zIndex,
            },
            boundingRect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
            } as DOMRect,
            xpath: getXPath(element),
            selector: getUniqueSelector(element),
            children: element.children.length,
            parent: element.parentElement?.tagName.toLowerCase(),
            index: Array.from(element.parentElement?.children || []).indexOf(
              element
            ),
          };
        };

        try {
          const elements = document.querySelectorAll(sel);
          return Array.from(elements).map((el) => extractElementData(el));
        } catch (error) {
          console.error("Invalid selector:", sel, error);
          return [];
        }
      }, selector);
    } else {
      // Direct access mode
      try {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el) => this.extractElementData(el));
      } catch (error) {
        console.error("Invalid selector:", selector, error);
        return [];
      }
    }
  }

  public async highlightElements(selector: string) {
    if (this.hasDevAPI && window.dev) {
      // Execute highlighting in parent context
      const count = await window.dev.execute((sel: string) => {
        try {
          const canvas = document.getElementById(
            "dev0-inspector-canvas"
          ) as HTMLCanvasElement;
          if (!canvas) return 0;

          const ctx = canvas.getContext("2d");
          if (!ctx) return 0;

          // Clear previous highlights
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const elements = document.querySelectorAll(sel);

          elements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            ctx.fillStyle = "rgba(255, 193, 7, 0.3)";
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

            ctx.strokeStyle = "#FFC107";
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
          });

          return elements.length;
        } catch (error) {
          console.error("Invalid selector for highlighting:", sel, error);
          return 0;
        }
      }, selector);

      this.showLocalFeedback(`🎯 Highlighted ${count} elements: ${selector}`);
    } else {
      // Direct access mode
      try {
        const elements = document.querySelectorAll(selector);
        this.clearCanvas();

        elements.forEach((element) => {
          const rect = element.getBoundingClientRect();
          this.ctx.fillStyle = "rgba(255, 193, 7, 0.3)";
          this.ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

          this.ctx.strokeStyle = "#FFC107";
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
        });
      } catch (error) {
        console.error("Invalid selector for highlighting:", selector, error);
      }
    }
  }

  public async clearHighlights() {
    if (this.hasDevAPI && window.dev) {
      await window.dev.execute(() => {
        const canvas = document.getElementById(
          "dev0-inspector-canvas"
        ) as HTMLCanvasElement;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        return "Highlights cleared";
      });

      this.showLocalFeedback("🧹 Highlights cleared");
    } else {
      this.clearCanvas();
    }
  }

  private showLocalFeedback(message: string) {
    this.clearCanvas();
    this.ctx.fillStyle = "#4A90E2";
    this.ctx.font = "12px monospace";
    this.ctx.fillText("Element Inspector", 10, 20);

    this.ctx.fillStyle = "#333";
    this.ctx.font = "10px monospace";
    const lines = this.wrapText(message, 280);
    lines.forEach((line, i) => {
      this.ctx.fillText(line, 10, 40 + i * 15);
    });
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine + (currentLine ? " " : "") + word;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}

// Global instance
export const elementInspector = new ElementInspector();

// Expose to window for debugging
(window as any).elementInspector = elementInspector;
