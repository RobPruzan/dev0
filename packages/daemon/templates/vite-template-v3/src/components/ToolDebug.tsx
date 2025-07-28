import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Access global variables from useTool
declare global {
  interface Window {
    __toolDebug?: {
      registeredTools: Set<string>;
      projectId: string | null;
      initialSyncReceived: boolean;
      socket: any;
    };
  }
}

export const ToolDebug = () => {
  const [debugState, setDebugState] = useState<any>({});
  
  const refreshDebug = () => {
    if (window.__toolDebug) {
      setDebugState({
        projectId: window.__toolDebug.projectId,
        initialSyncReceived: window.__toolDebug.initialSyncReceived,
        socketConnected: window.__toolDebug.socket?.connected || false,
        registeredTools: Array.from(window.__toolDebug.registeredTools || []),
      });
    }
  };

  useEffect(() => {
    refreshDebug();
    const interval = setInterval(refreshDebug, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tool Client Debug</h2>
        <Button
          onClick={refreshDebug}
          size="sm"
          variant="outline"
          className="h-7 text-xs"
        >
          Refresh
        </Button>
      </div>

      <div className="space-y-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Project ID:</span>
          <span className="text-blue-600">{debugState.projectId || 'not set'}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Socket Connected:</span>
          <span className={debugState.socketConnected ? 'text-green-600' : 'text-red-600'}>
            {debugState.socketConnected ? '✓ connected' : '✗ disconnected'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Initial Sync:</span>
          <span className={debugState.initialSyncReceived ? 'text-green-600' : 'text-yellow-600'}>
            {debugState.initialSyncReceived ? '✓ received' : '⏳ waiting'}
          </span>
        </div>
        
        <div>
          <span className="text-muted-foreground">Registered Tools ({debugState.registeredTools?.length || 0}):</span>
          <div className="mt-1 space-y-1">
            {debugState.registeredTools?.length > 0 ? (
              debugState.registeredTools.map((tool: string) => (
                <div key={tool} className="bg-muted/50 p-1 rounded text-[10px]">
                  {tool}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground italic">No tools in local registry</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};