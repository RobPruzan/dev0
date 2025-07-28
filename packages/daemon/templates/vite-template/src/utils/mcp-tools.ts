export interface MCPTool {
  name: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }[];
  category?: string;
}

export function registerMCPTools(tools: MCPTool[]) {
  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: "mcp-tools-register",
        tools: tools,
      },
      "*"
    );
  }
}

export function listenForMCPToolActivation(
  callback: (activatedTools: string[]) => void
) {
  const handler = (event: MessageEvent) => {
    if (event.data.type === "mcp-tools-activated") {
      callback(event.data.tools);
    }
  };

  window.addEventListener("message", handler);

  return () => {
    window.removeEventListener("message", handler);
  };
}

export const exampleMCPTools: MCPTool[] = [
  {
    name: "element_inspector",
    description: "Activate visual element inspector overlay",
    category: "DevTools",
    parameters: [
      {
        name: "action",
        type: "string",
        description: "Action to perform: activate, deactivate, or toggle",
        required: true,
      },
    ],
  },
  {
    name: "query_elements",
    description: "Find elements using CSS selectors",
    category: "DevTools",
    parameters: [
      {
        name: "selector",
        type: "string",
        description: "CSS selector to query",
        required: true,
      },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of results",
        required: false,
      },
    ],
  },
  {
    name: "screenshot",
    description: "Capture a screenshot of the current view",
    category: "Utilities",
    parameters: [],
  },
  {
    name: "console_log",
    description: "Log messages to the browser console",
    category: "Utilities",
    parameters: [
      {
        name: "message",
        type: "string",
        description: "Message to log",
        required: true,
      },
    ],
  },
];
