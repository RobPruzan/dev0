import { useEffect } from 'react';
import { useTool } from './useTool';

// Global registry of all tools
const toolRegistry = new Map<string, {
  registerTool: () => void;
  unregisterTool: () => void;
  isRegistered: boolean;
}>();

// Register a tool in the global registry
export function registerToolGlobally(name: string, tool: {
  registerTool: () => void;
  unregisterTool: () => void;
  isRegistered: boolean;
}) {
  toolRegistry.set(name, tool);
}

// Unregister a tool from the global registry
export function unregisterToolGlobally(name: string) {
  toolRegistry.delete(name);
}

// Hook to handle global MCP commands
export function useGlobalMCPCommands() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'mcp-tool-command') {
        const { action, toolName } = event.data;
        
        
        const tool = toolRegistry.get(toolName);
        
        if (tool) {
          
          if (action === 'register') {
            if (!tool.isRegistered) {
              tool.registerTool();
            } else {
            }
          } else if (action === 'unregister') {
            if (tool.isRegistered) {
              tool.unregisterTool();
            } else {
            }
          }
        } else {
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
}

// Hook that combines useTool with global registration
export function useGloballyControlledTool(options: Parameters<typeof useTool>[0]) {
  const tool = useTool(options);
  
  useEffect(() => {
    registerToolGlobally(options.name, tool);
    
    return () => {
      unregisterToolGlobally(options.name);
    };
  }, [options.name, tool]);
  
  return tool;
}