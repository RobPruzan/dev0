import React, { useState, useEffect } from 'react';
import { useTool } from '@/hooks/useTool';

export function TestTool() {
  const [lastResult, setLastResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [registrationAttempts, setRegistrationAttempts] = useState(0);
  
  const tool = useTool({
    name: 'test_tool',
    description: 'A simple test tool for debugging',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    autoRegister: true, // Enable auto-registration
    execute: async (args: { message?: string }) => {
      console.log('[TestTool] Execute called with args:', args);
      setExecuting(true);
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = {
        response: `Echo: ${args.message || 'No message provided'}`,
        timestamp: new Date().toISOString(),
        projectId: tool.projectId
      };
      
      setLastResult(result);
      setExecuting(false);
      return result;
    }
  });


  return (
    <div className="p-4 border border-gray-700 rounded-lg">
      <h3 className="text-lg font-bold mb-2">Test Tool Debug Panel</h3>
      
      <div className="space-y-2 text-sm">
        <div>Project ID: <span className="font-mono text-blue-400">{tool.projectId}</span></div>
        <div>Tool Name: <span className="font-mono text-blue-400">{tool.name}</span></div>
        <div>Registration Status: 
          <span className={`ml-2 font-mono ${
            tool.registrationStatus === 'success' ? 'text-green-400' : 
            tool.registrationStatus === 'error' ? 'text-red-400' : 
            tool.registrationStatus === 'registering' ? 'text-yellow-400' : 
            'text-gray-400'
          }`}>
            {tool.registrationStatus}
          </span>
        </div>
        <div>Is Registered: <span className={`font-mono ${tool.isRegistered ? 'text-green-400' : 'text-red-400'}`}>{String(tool.isRegistered)}</span></div>
        {tool.registrationError && (
          <div className="text-red-400">Error: {tool.registrationError}</div>
        )}
      </div>

      <div className="mt-4 space-x-2">
        <button
          onClick={() => {
            setRegistrationAttempts(prev => prev + 1);
            tool.registerTool();
          }}
          className="px-3 py-1 text-xs border border-gray-600 rounded hover:bg-gray-800"
          disabled={tool.isRegistered}
        >
          Register Tool (Attempts: {registrationAttempts})
        </button>
        <button
          onClick={() => tool.unregisterTool()}
          className="px-3 py-1 text-xs border border-gray-600 rounded hover:bg-gray-800"
          disabled={!tool.isRegistered}
        >
          Unregister Tool
        </button>
        <button
          onClick={async () => {
            const result = await tool.execute({ message: 'Test from UI' });
            console.log('[TestTool] Manual execution result:', result);
          }}
          className="px-3 py-1 text-xs border border-gray-600 rounded hover:bg-gray-800"
          disabled={executing}
        >
          {executing ? 'Executing...' : 'Test Execute'}
        </button>
      </div>

      {lastResult && (
        <div className="mt-4 p-2 bg-gray-900 rounded text-xs">
          <div className="font-bold mb-1">Last Execution Result:</div>
          <pre className="text-gray-300">{JSON.stringify(lastResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}