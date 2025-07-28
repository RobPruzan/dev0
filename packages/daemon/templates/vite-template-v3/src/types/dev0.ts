// Types for Dev0 instrumentation

export interface DevToolsAPI {
  sendToParent: (type: string, data: any) => void
  expose: (name: string, fn: Function) => void
  ready: boolean
  version?: string
}

export interface ComponentStats {
  totalElements: number
  buttons: number
  inputs: number
  reactComponents: number
}

export interface RandomData {
  type: 'user-interaction'
  action: string
  timestamp: number
  randomValue: number
  position: { x: number; y: number }
}

export interface ParentActionRequest {
  action: string
  duration?: number
  color?: string
}

export interface AppReadyMessage {
  message: string
  timestamp: number
  userAgent: string
}

export interface ColorChangeMessage {
  color: string
}

declare global {
  interface Window {
  }
}