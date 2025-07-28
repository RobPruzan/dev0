// Dev-0 Instrumentation
// Enables iframe to execute functions in parent context

(function() {
  'use strict';
  
  // Generate unique ID for each RPC call
  let rpcId = 0;
  const pendingCalls = new Map();
  const registeredFunctions = new Map();
  
  // Listen for responses from parent
  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    
    const { type, id, result, error, success, functionId, args: callbackArgs } = event.data || {};
    
    if (type === 'dev0-execute-response' && id) {
      const pending = pendingCalls.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingCalls.delete(id);
        
        if (success) {
          pending.resolve(result);
        } else {
          const err = new Error(error?.message || 'Execution failed');
          err.name = error?.name || 'ExecutionError';
          if (error?.stack) {
            err.stack = error.stack;
          }
          pending.reject(err);
        }
      }
    }
    
    // Handle function callbacks from parent
    if (type === 'dev0-function-callback' && functionId) {
      const fn = registeredFunctions.get(functionId);
      if (fn) {
        try {
          // Process callback arguments to handle function results from parent
          const processedCallbackArgs = (callbackArgs || []).map((arg, index) => {
            if (arg && typeof arg === 'object' && arg.__isInlineFunction && arg.__functionString) {
              // Reconstruct the function from its string representation
              try {
                return new Function('return ' + arg.__functionString)();
              } catch (e) {
                return arg;
              }
            }
            return arg;
          });
          
          const result = await fn(...processedCallbackArgs);
          // Send result back to parent
          window.parent.postMessage({
            type: 'dev0-function-callback-response',
            functionId,
            result,
            success: true
          }, '*');
        } catch (error) {
          window.parent.postMessage({
            type: 'dev0-function-callback-response',
            functionId,
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              name: error instanceof Error ? error.name : 'Error'
            },
            success: false
          }, '*');
        }
      }
    }
  });
  
  // Main API - execute functions in parent context
  const execute = async (fn, ...args) => {
    // Process arguments to detect and serialize functions
    const processedArgs = args.map((arg, index) => {
      if (typeof arg === 'function') {
        const functionId = `fn-${++rpcId}-${index}`;
        // Register the function for later callback
        registeredFunctions.set(functionId, arg);
        
        return {
          __isFunction: true,
          __functionId: functionId,
          __functionName: arg.name || 'anonymous'
        };
      }
      return arg;
    });
    
    return new Promise((resolve, reject) => {
      const id = `execute-${++rpcId}`;
      const timeout = 5000; // 5 second timeout
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        pendingCalls.delete(id);
        // Clean up registered functions on timeout
        processedArgs.forEach(arg => {
          if (arg?.__isFunction && arg.__functionId) {
            registeredFunctions.delete(arg.__functionId);
          }
        });
        reject(new Error(`Execution timed out after ${timeout}ms`));
      }, timeout);
      
      // Store pending call
      pendingCalls.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle
      });
      
      // Send execution request to parent
      window.parent.postMessage({
        type: 'dev0-execute-request',
        id,
        fn: fn.toString(),
        args: processedArgs
      }, '*');
    });
  };
  
  // Expose the dev API
  window.dev = {
    execute
  };
  
  // Mark instrumentation as ready
  window.__DEV0__ = {
    ready: true,
    version: '1.0.0'
  };
  
  // Forward mouse events to parent for drag/resize functionality
  const forwardMouseEvent = (e) => {
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'iframe-mouse-event',
        eventType: e.type,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        buttons: e.buttons
      }, '*');
    }
  };

  document.addEventListener('mousedown', forwardMouseEvent);
  document.addEventListener('mousemove', forwardMouseEvent);
  document.addEventListener('mouseup', forwardMouseEvent);
  
  // Notify parent that instrumentation is loaded
  window.parent.postMessage({
    type: 'dev0-instrumentation-ready',
    timestamp: Date.now()
  }, '*');
})();