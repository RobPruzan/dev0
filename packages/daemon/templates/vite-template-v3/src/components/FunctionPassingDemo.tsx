import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { devExecute, useDevExecute } from "@/lib/dev-execute";

export const FunctionPassingDemo: React.FC = () => {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("");
  const {
    executeInParent,
    isLoading,
    error,
    isReady,
  } = useDevExecute();

  const handleParentExecuteWithCallback = async () => {
    // Type-safe version with the wrapper
    const result = await executeInParent(
      async (setCountCallback) => {
        // This code runs in the parent window
        console.log("🎯 Executing in parent window");
        console.log("setCountCallback type:", typeof setCountCallback);
        console.log("setCountCallback:", setCountCallback);

        // Call the setState function which will execute back in the iframe
        await setCountCallback((prev) => prev + 1);

        // We can also call it multiple times
        setTimeout(async () => {
          await setCountCallback((prev) => prev + 1);
        }, 1000);

        return "Parent execution completed!";
      },
      setCount // TypeScript knows this is a setState function!
    );

    if (result) {
      setMessage(`Result: ${result}`);
    }
  };

  const handleComplexCallback = async () => {
    // Using the direct wrapper for more control
    try {
      const result = await devExecute(
        async (updateCount, updateMessage) => {
          // This runs in parent - TypeScript infers the types!
          console.log("🚀 Complex callback test");

          await updateMessage("Starting complex operation...");

          let counter = 0;
          const interval = setInterval(async () => {
            counter++;
            await updateCount((prev) => prev + 1);
            await updateMessage(`Processing... ${counter}/5`);

            if (counter >= 5) {
              clearInterval(interval);
              await updateMessage("Complex operation completed!");
            }
          }, 500);

          return "Complex operation initiated";
        },
        setCount,
        setMessage
      );

      console.log("Initial result:", result);
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  };

  return (
    <div className="bg-card border rounded p-3 space-y-3">
      <h2 className="text-sm font-medium">Function Passing Demo</h2>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">Count:</span>
          <span className="font-mono text-sm font-bold">{count}</span>
        </div>

        {message && (
          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
            {message}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={handleParentExecuteWithCallback}
          size="sm"
          className="w-full h-7 text-xs"
          disabled={!isReady || isLoading}
        >
          {isLoading ? "Executing..." : "Execute with setState Callback"}
        </Button>

        <Button
          onClick={handleComplexCallback}
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          disabled={!isReady || isLoading}
        >
          {isLoading ? "Executing..." : "Complex Multi-Function Callback"}
        </Button>

        <Button
          onClick={() => {
            setCount(0);
            setMessage("");
          }}
          size="sm"
          variant="ghost"
          className="w-full h-7 text-xs"
        >
          Reset
        </Button>
      </div>
    </div>
  );
};
