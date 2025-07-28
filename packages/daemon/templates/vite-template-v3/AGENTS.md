These are the definitive rules you must use when creating the app:
- this app will be rendered inside an iframe within a tiny panel, around 400x400, but it may be resized to smaller or larger
you should use smaller fonts and smaller containers while being responsive but not ugly responsive. The user expects this to be a dense
devtool that looks good.
- we are using tailwind/vite/shadcn, so we have css vars configured through tailwind colors, and preset components to use, we are going for a 
dark next.js/vercel vibe
- we are rendering in an iframe because we are running inside next.js devtools. This means since we are in an iframe we can't do a lot that 
you might expect we can do for security reasons. Though the user will still ask for devtools. This is because they know you have an API called
`executeInParent` which you get from calling   `const { executeInParent, isLoading, isReady } = useDevExecute();`. This allows you to write a
normal function `executeInParent(() => {})` and it will automatically be serialized and ran in the parent context.  So you can access any dom nodes, create elements, create canvas's, patch API's, everything to get data for the devtool

for example if the user asks you to inspect some element in the parent window, you must executeInParent((setState) => {
  // event listeners for mouse events
  // code for dynamically creating dom elements
  // setState for visualizing any data back to the iframe that's better handled in the structured react app
},setState)

But make sure to only send items through the rpc of executeInParent functions if its cloneable! u don't want things failing

you should think deeply to yourself- am i writing the patching/visualization code in the right context? The easy answer is- if the user asked you to do something like provide a way to "inspect" or "select" something in the "app" of course they are talking about the app they are debugging, so u should execute in parent and visualize content through execute in parent and creating dom nodes there in the right spots. an element inspector should outline the dom node you are hovering (ensuring the outline is ABOVE the dom node). If they say more like- lets patch console logs and visualize them in the app, you should patch the console logs of THE PARENT and then visualize it in the current vite app. Things that don't need to be visualized in the parent shouldn't, but other things must be visualized in the parent to make sense

- you may ask, how are you to send data bac kto the devtool? To solve this problem we implemented an API for executeInParent that allows you to pass rest arguments to it. You can pass rest arguments, and then access them through the arguments of the function u ass `executeInParent((data) => ..., someData). And we automatically handle the case of functions by turning it into an RPC automatically, so `executeInParent((setState, count) => setState(count + 1), setState, count) just works! Though all functions passed are automatically async because it needs to wait for the ack response, so be sure to handle that
- we are running over a next.js app which runs React version 19
- do not add "fluff" in the devtool, thats ugly headers/titles descriptions, think a really good devtool how they would make it
- all devtools should have native copy functionality of the data so they work really well with AI tools. Any write to clipboard has to be executed in the parent context or it will fail
- the user may ask u to make an `MCP`. This is a protocol for servers to expose tools. We have implemented an API in this app called `useTool` which lets you automatically create MCP tools that are sent to the server so the LLM can discover. You need to pass some info like the description, tool name, and arguments so the model will know how to call it, and an execute function which is what the MCP server will remotely ping useTool to execute which it will automatically and send back the result. Only make an MCP if the user does, and you should explore its definition when the user asks you too. You should auto register MCP's unless otherwise asked
- make sure to NEVER re-run the dev server, it's auto hot reloading and will always reload for you
- if you ever need to install dependencies, use bun. you can run bun install [package] and after it installs the vite server will auto hot reload and keep working without any input!