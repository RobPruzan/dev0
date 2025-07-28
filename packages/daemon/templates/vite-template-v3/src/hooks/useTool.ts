import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  execute: (args: any) => Promise<any> | any;
}

interface UseToolOptions extends Omit<ToolDefinition, 'execute'> {
  execute: (args: any) => Promise<any> | any;
  autoRegister?: boolean; // Automatically register the tool on mount
}

// Global socket instance
let socket: Socket | null = null;
let projectId: string | null = null;

// Track registered tools for ping/pong
const registeredTools = new Set<string>();

// Track if we've received initial tools sync
let initialSyncReceived = false;

// Get project name from environment or generate one
function getProjectName(): string {
  // First, try to get from URL parameter (set by parent iframe)
  const urlParams = new URLSearchParams(window.location.search);
  const projectNameParam = urlParams.get('projectName');
  if (projectNameParam) {
    return projectNameParam;
  }
  
  // Try to get from document title (set by parent iframe)
  if (document.title && document.title !== 'Vite + React + TS') {
    return document.title;
  }
  
  // Try to get from environment variable
  const envProject = import.meta.env.VITE_PROJECT_NAME;
  if (envProject) {
    return envProject;
  }
  
  // Try to detect from URL or generate unique name
  const url = window.location.hostname;
  if (url && url !== 'localhost') {
    const extracted = url.split('.')[0];
    return extracted;
  }
  
  // Generate a unique project name with animal-adjective-number format
  const adjectives = ['noble', 'brave', 'swift', 'calm', 'bright', 'wise', 'kind', 'bold'];
  const animals = ['toucan', 'eagle', 'wolf', 'bear', 'fox', 'owl', 'lion', 'hawk'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 1000);
  
  const generated = `${adjective}-${animal}-${number}`;
  return generated;
}

// Initialize socket connection
function initializeSocket() {
  if (!socket) {
    socket = io('http://localhost:8001', {
      transports: ['websocket'],
    });

    // Expose debug info
    (window as any).__toolDebug = {
      registeredTools,
      projectId,
      get initialSyncReceived() { return initialSyncReceived; },
      socket
    };

    socket.on('connect', () => {
      // Get project ID when connecting, not before
      if (!projectId) {
        projectId = getProjectName();
      }
      socket!.emit('project:register', { projectId });
      
      // Mark that we're connected but haven't received initial sync yet
      initialSyncReceived = false;
    });

    socket.on('disconnect', () => {
      // Clear registered tools on disconnect
      registeredTools.clear();
      initialSyncReceived = false;
    });

    // Handle ping from server
    socket.on('ping', (data: { timestamp: number }) => {
      // Respond with pong containing all registered tool names and projectId
      socket!.emit('pong', {
        toolNames: Array.from(registeredTools),
        projectId: projectId
      });
    });

    // Handle initial tools list when project registers
    socket.on('project:tools', (data: { tools: string[] }) => {
      // Update our local registered tools set
      registeredTools.clear();
      data.tools.forEach(tool => registeredTools.add(tool));
      
      // Mark that we've received initial sync
      initialSyncReceived = true;
      
      // Notify all tool hooks to sync their state
      window.dispatchEvent(new CustomEvent('tools:sync', { detail: data.tools }));
    });

    // Handle tools cleared event
    socket.on('tools:cleared', () => {
      registeredTools.clear();
      // Notify all tool hooks to re-register
      window.dispatchEvent(new Event('tools:cleared'));
    });

    // Listen for tool execution requests
    socket.on('tool:execute', async (data: {
      toolName: string;
      args: any;
      executionId: string;
    }) => {
      const { toolName, args, executionId } = data;
      
      // Extract the actual tool name (remove project prefix)
      const actualToolName = toolName.includes('_') ? toolName.split('_').slice(1).join('_') : toolName;
      
      // Find the tool handler
      const handler = toolHandlers.get(actualToolName);
      
      if (handler) {
        try {
          const result = await handler(args);
          socket!.emit('tool:execution:response', {
            executionId,
            result,
          });
        } catch (error) {
          socket!.emit('tool:execution:response', {
            executionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        socket!.emit('tool:execution:response', {
          executionId,
          error: `Tool ${toolName} not found`,
        });
      }
    });
  }
  
  return socket;
}

// Store tool handlers
const toolHandlers = new Map<string, (args: any) => Promise<any>>();

export function useTool(options: UseToolOptions) {
  const { name, description, inputSchema, execute, autoRegister = false } = options;
  const registeredRef = useRef(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'registering' | 'success' | 'error'>('idle');
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const registerTool = useCallback(() => {
    const socketInstance = initializeSocket();
    
    // Ensure we have a project ID
    if (!projectId) {
      projectId = getProjectName();
    }
    
    // Check if already registered
    const fullToolName = `${projectId}_${name}`;
    if (registeredTools.has(fullToolName)) {
      setIsRegistered(true);
      setRegistrationStatus('success');
      registeredRef.current = true;
      return;
    }
    
    // Wait a bit if we haven't received initial sync yet
    // This ensures the project is registered first
    if (!initialSyncReceived && socketInstance.connected) {
      setTimeout(() => {
        registerTool();
      }, 100);
      return;
    }
    
    setRegistrationStatus('registering');
    setRegistrationError(null);
    registeredRef.current = true;
    
    const toolData = {
      projectId,
      tool: {
        name: `${projectId}_${name}`,
        description: `[${projectId}] ${description}`,
        inputSchema: inputSchema ? JSON.parse(JSON.stringify(inputSchema)) : undefined,
      },
    };
    
    socketInstance.emit('tool:register', toolData);
  }, [name, description, inputSchema]);

  useEffect(() => {
    const socketInstance = initializeSocket();
    toolHandlers.set(name, execute);

    // Ensure we have a project ID
    if (!projectId) {
      projectId = getProjectName();
    }

    const fullToolName = `${projectId}_${name}`;
    
    
    if (initialSyncReceived && registeredTools.has(fullToolName)) {
      setIsRegistered(true);
      setRegistrationStatus('success');
      registeredRef.current = true;
    }

    const handleRegistrationResponse = (response: { name: string; success: boolean; error?: string }) => {
      if (response.name === `${projectId}_${name}`) {
        if (response.success) {
          setIsRegistered(true);
          setRegistrationStatus('success');
          setRegistrationError(null);
          registeredTools.add(`${projectId}_${name}`);
        } else {
          setIsRegistered(false);
          setRegistrationStatus('error');
          setRegistrationError(response.error || 'Unknown registration error');
          registeredTools.delete(`${projectId}_${name}`);
        }
      }
    };

    const handleUnregistrationResponse = (response: { name: string; success: boolean }) => {
      if (response.name === `${projectId}_${name}` && response.success) {
        registeredTools.delete(`${projectId}_${name}`);
        setIsRegistered(false);
        setRegistrationStatus('idle');
        registeredRef.current = false;
      }
    };

    // Handle tools cleared - re-register
    const handleToolsCleared = () => {
      setIsRegistered(false);
      setRegistrationStatus('idle');
      // Auto re-register if it was previously registered
      if (registeredRef.current) {
        setTimeout(() => registerTool(), 100);
      }
    };

    // Handle reconnection - re-register and force project registration
    const handleReconnect = () => {
      socketInstance.emit('project:register', { projectId });
      
      if (registeredRef.current && !isRegistered) {
        setTimeout(() => registerTool(), 100);
      }
    };

    // Handle tools sync event from server
    const handleToolsSync = (event: CustomEvent) => {
      const tools = event.detail as string[];
      const fullToolName = `${projectId}_${name}`;
      
      if (tools.includes(fullToolName)) {
        setIsRegistered(true);
        setRegistrationStatus('success');
        registeredRef.current = true;
        registeredTools.add(fullToolName);
      } else {
        setIsRegistered(false);
        setRegistrationStatus('idle');
        registeredRef.current = false;
      }
    };

    socketInstance.on('tool:registered', handleRegistrationResponse);
    socketInstance.on('tool:unregistered', handleUnregistrationResponse);
    socketInstance.on('connect', handleReconnect);
    window.addEventListener('tools:cleared', handleToolsCleared);
    window.addEventListener('tools:sync', handleToolsSync as EventListener);

    // Only cleanup on unmount, not on every re-render
    return () => {
      socketInstance.off('tool:registered', handleRegistrationResponse);
      socketInstance.off('tool:unregistered', handleUnregistrationResponse);
      socketInstance.off('connect', handleReconnect);
      window.removeEventListener('tools:cleared', handleToolsCleared);
      window.removeEventListener('tools:sync', handleToolsSync as EventListener);
      
      // Remove tool handler on unmount
      toolHandlers.delete(name);
      
      // Note: We don't automatically unregister the tool from the server
      // This allows tools to persist across component remounts
      // Users must explicitly call unregisterTool() to remove from server
    };
  }, [name, execute, registerTool, isRegistered]); // Added dependencies

  // Auto-register effect
  useEffect(() => {
    if (autoRegister && !registeredRef.current && registrationStatus === 'idle') {
      registerTool();
    }
  }, [autoRegister, name, registerTool, registrationStatus]);

  const unregisterTool = useCallback(() => {
    const socketInstance = initializeSocket();
    
    registeredRef.current = false;
    
    socketInstance.emit('tool:unregister', {
      projectId,
      toolName: `${projectId}_${name}`,
    });
    
    setIsRegistered(false);
    setRegistrationStatus('idle');
    setRegistrationError(null);
  }, [name]);

  // Return a function to manually execute the tool
  const executeTool = useCallback(async (args: any) => {
    return execute(args);
  }, [execute]);

  return {
    execute: executeTool,
    isRegistered,
    registrationStatus,
    registrationError,
    registerTool,
    unregisterTool,
    projectId: projectId || 'unknown',
    name,
    description,
    inputSchema,
  };
}

// Utility hook to get all registered tools
export function useRegisteredTools() {
  return Array.from(toolHandlers.keys());
}