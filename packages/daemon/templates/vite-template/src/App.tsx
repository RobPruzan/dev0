import { useState, useEffect } from "react";
import { Button } from "./components/ui/button";
import {
  registerMCPTools,
  listenForMCPToolActivation,
  exampleMCPTools,
} from "./utils/mcp-tools";

function App() {
  const [count, setCount] = useState(0);
  const [activatedTools, setActivatedTools] = useState<string[]>([]);

  useEffect(() => {
    // Register MCP tools with the parent window
    registerMCPTools(exampleMCPTools);

    // Listen for tool activation changes
    const cleanup = listenForMCPToolActivation((tools) => {
      setActivatedTools(tools);
      console.log("Activated MCP tools:", tools);
    });

    return cleanup;
  }, []);

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Vite + React Template</h1>
        <Button
          variant={"outline"}
          onClick={() => setCount((count) => count + 1)}
        >
          count is {count}
        </Button>
      </div>

      {activatedTools.length > 0 && (
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Active MCP Tools:</h2>
          <ul className="text-sm text-muted-foreground">
            {activatedTools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
