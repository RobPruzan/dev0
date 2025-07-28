/**
 * Iframe messaging utility for communicating between parent and child frames
 */

export interface IframeMessage {
  type: string;
  data?: any;
  timestamp?: number;
}

export class IframeMessenger {
  private targetOrigin: string;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor(targetOrigin: string = '*') {
    this.targetOrigin = targetOrigin;
    this.setupMessageListener();
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (this.targetOrigin !== '*' && event.origin !== this.targetOrigin) {
        return;
      }

      const message: IframeMessage = event.data;
      if (message && message.type) {
        this.handleMessage(message);
      }
    });
  }

  private handleMessage(message: IframeMessage) {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach(listener => listener(message.data));
    }
  }

  /**
   * Send a message to the parent window
   */
  sendToParent(type: string, data?: any) {
    const message: IframeMessage = {
      type,
      data,
      timestamp: Date.now()
    };
    window.parent.postMessage(message, this.targetOrigin);
  }

  /**
   * Send a message to a child iframe
   */
  sendToChild(iframe: HTMLIFrameElement, type: string, data?: any) {
    if (!iframe.contentWindow) {
      console.warn('Cannot send message: iframe contentWindow is null');
      return;
    }

    const message: IframeMessage = {
      type,
      data,
      timestamp: Date.now()
    };
    iframe.contentWindow.postMessage(message, this.targetOrigin);
  }

  /**
   * Send a message to all child iframes
   */
  sendToAllChildren(type: string, data?: any) {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      this.sendToChild(iframe, type, data);
    });
  }

  /**
   * Listen for messages of a specific type
   */
  on(type: string, callback: (data: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  /**
   * Remove a message listener
   */
  off(type: string, callback: (data: any) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all listeners for a type
   */
  removeAllListeners(type: string) {
    this.listeners.delete(type);
  }
}

// Global instance for easy access
export const iframeMessenger = new IframeMessenger();

// Convenience functions
export const sendToParent = (type: string, data?: any) => iframeMessenger.sendToParent(type, data);
export const sendToAllChildren = (type: string, data?: any) => iframeMessenger.sendToAllChildren(type, data);
export const onMessage = (type: string, callback: (data: any) => void) => iframeMessenger.on(type, callback);