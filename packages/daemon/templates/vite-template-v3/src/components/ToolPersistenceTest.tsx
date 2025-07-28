import React from 'react';
import { useTool } from '@/hooks/useTool';
import { Button } from '@/components/ui/button';

export const ToolPersistenceTest = () => {
  const testTool = useTool({
    name: 'persistenceTest',
    description: 'Test tool for verifying registration persistence',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    execute: async (args) => {
      return { 
        result: `Test tool executed with message: ${args.message}`,
        timestamp: new Date().toISOString()
      };
    }
  });

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold">Tool Persistence Test</h2>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">Tool Name:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded">
            {testTool.projectId}_{testTool.name}
          </code>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm">Status:</span>
          <span className={`text-xs px-2 py-1 rounded ${
            testTool.isRegistered 
              ? 'bg-green-500/20 text-green-700' 
              : 'bg-muted text-muted-foreground'
          }`}>
            {testTool.isRegistered ? '✓ Registered' : 'Not registered'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm">Registration State:</span>
          <span className="text-xs text-muted-foreground">
            {testTool.registrationStatus}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={testTool.registerTool}
          size="sm"
          variant="default"
          disabled={testTool.isRegistered || testTool.registrationStatus === 'registering'}
        >
          Register Tool
        </Button>
        
        <Button
          onClick={testTool.unregisterTool}
          size="sm"
          variant="outline"
          disabled={!testTool.isRegistered}
        >
          Unregister Tool
        </Button>
        
        <Button
          onClick={() => {
            testTool.execute({ message: 'Hello from test!' })
              .then(result => console.log('Tool result:', result))
              .catch(err => console.error('Tool error:', err));
          }}
          size="sm"
          variant="secondary"
          disabled={!testTool.isRegistered}
        >
          Execute Test
        </Button>
      </div>
      
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Instructions to test persistence:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Click "Register Tool" and wait for green checkmark</li>
          <li>Refresh the page (Cmd+R or F5)</li>
          <li>The tool should still show as registered ✓</li>
        </ol>
        <p className="mt-2">
          Current behavior: {testTool.isRegistered 
            ? 'Tool is registered and should persist after refresh' 
            : 'Tool is not registered'}
        </p>
      </div>
      
      {testTool.registrationError && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          Error: {testTool.registrationError}
        </div>
      )}
    </div>
  );
};