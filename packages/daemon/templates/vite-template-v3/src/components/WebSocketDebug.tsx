import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export const WebSocketDebug = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const fetchDebugInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8001/debug');
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      setDebugInfo({ error: error instanceof Error ? error.message : String(error) });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDebugInfo();
    const interval = setInterval(fetchDebugInfo, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">WebSocket Debug Info</h2>
        <Button
          onClick={fetchDebugInfo}
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {debugInfo && (
        <div className="space-y-3 text-xs">
          {debugInfo.error ? (
            <div className="text-red-600">Error: {JSON.stringify(debugInfo.error)}</div>
          ) : (
            <>
              <div>
                <h3 className="font-medium text-muted-foreground mb-1">
                  Project Connections ({debugInfo.projectConnections?.length || 0})
                </h3>
                <div className="bg-muted/50 p-2 rounded font-mono">
                  {debugInfo.projectConnections?.length > 0 ? (
                    debugInfo.projectConnections.map((projectId: string) => (
                      <div key={projectId}>{projectId}</div>
                    ))
                  ) : (
                    <span className="text-muted-foreground">No connections</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-muted-foreground mb-1">
                  Tool Registry ({debugInfo.toolRegistry?.length || 0})
                </h3>
                <div className="space-y-1">
                  {debugInfo.toolRegistry?.length > 0 ? (
                    debugInfo.toolRegistry.map((tool: any) => (
                      <div 
                        key={tool.name} 
                        className={`bg-muted/50 p-2 rounded font-mono ${
                          tool.online ? 'border-l-2 border-green-500' : 'border-l-2 border-red-500'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="break-all">{tool.name}</span>
                          <span className={tool.online ? 'text-green-600' : 'text-red-600'}>
                            {tool.online ? '● online' : '○ offline'}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Project: {tool.projectId}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Last seen: {new Date(tool.lastSeen).toLocaleTimeString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-muted/50 p-2 rounded text-muted-foreground">
                      No tools registered
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-muted-foreground mb-1">
                  Pending Executions: {String(debugInfo.pendingExecutions || 0)}
                </h3>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};