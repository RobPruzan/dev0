import React, { useState } from 'react';
import { devExecute, createDevExecutor } from '@/lib/dev-execute';

// Create specialized executors with specific types
const executeWithNumber = createDevExecutor<[number], string>();
const executeWithCallbacks = createDevExecutor<
  [
    (value: React.SetStateAction<number>) => void,
    (message: string) => void
  ],
  { success: boolean; count: number }
>();

export const TypeSafeExample: React.FC = () => {
  const [count, setCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleTypedExecution = async () => {
    // Example 1: Simple typed execution
    const result1 = await executeWithNumber(
      (num) => `The number is ${num}`,
      42
    );
    addLog(`Result 1: ${result1}`);

    // Example 2: Complex typed execution with callbacks
    const result2 = await executeWithCallbacks(
      async (updateCount, logMessage) => {
        // TypeScript knows these are async functions!
        await logMessage('Starting operation...');
        
        for (let i = 0; i < 3; i++) {
          await updateCount(prev => prev + 1);
          await logMessage(`Incremented to ${i + 1}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return { success: true, count: 3 };
      },
      setCount,
      addLog
    );
    
    addLog(`Result 2: ${JSON.stringify(result2)}`);
  };

  const handleGenericExecution = async () => {
    // Using the generic devExecute with full type inference
    const result = await devExecute(
      async (getTitle, updateLog) => {
        const title = await getTitle();
        await updateLog(`Parent window title: ${title}`);
        
        // Return a complex object
        return {
          timestamp: Date.now(),
          title,
          userAgent: navigator.userAgent.slice(0, 50) + '...'
        };
      },
      async () => document.title,
      addLog
    );
    
    addLog(`Generic result: ${JSON.stringify(result, null, 2)}`);
  };

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">Type-Safe Dev Execute Examples</h2>
      
      <div className="space-y-2">
        <p>Count: {count}</p>
        
        <div className="space-x-2">
          <button
            onClick={handleTypedExecution}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Run Typed Examples
          </button>
          
          <button
            onClick={handleGenericExecution}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Run Generic Example
          </button>
          
          <button
            onClick={() => {
              setCount(0);
              setLog([]);
            }}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Reset
          </button>
        </div>
      </div>
      
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Log:</h3>
        <div className="bg-gray-100 p-2 rounded h-48 overflow-y-auto font-mono text-sm">
          {log.map((entry, i) => (
            <div key={i} className="text-gray-700">{entry}</div>
          ))}
        </div>
      </div>
    </div>
  );
};