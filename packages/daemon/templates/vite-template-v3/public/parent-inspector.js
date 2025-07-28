/**
 * Parent window inspector handler for iframe-based devtools
 * This script should be included in the parent page when devtools are loaded in an iframe
 */
(function() {
  let inspectorCanvas = null;
  let inspectorActive = false;
  let originalCursor = '';

  // Create canvas for highlighting in parent window
  function createInspectorCanvas() {
    if (inspectorCanvas) return inspectorCanvas;
    
    inspectorCanvas = document.createElement('canvas');
    inspectorCanvas.id = 'parent-inspector-canvas';
    inspectorCanvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 999999;
      display: none;
    `;
    document.body.appendChild(inspectorCanvas);
    
    const ctx = inspectorCanvas.getContext('2d');
    updateCanvasSize();
    
    return inspectorCanvas;
  }

  function updateCanvasSize() {
    if (!inspectorCanvas) return;
    inspectorCanvas.width = window.innerWidth;
    inspectorCanvas.height = window.innerHeight;
  }

  function clearCanvas() {
    if (!inspectorCanvas) return;
    const ctx = inspectorCanvas.getContext('2d');
    ctx.clearRect(0, 0, inspectorCanvas.width, inspectorCanvas.height);
  }

  function highlightElements(selector) {
    if (!inspectorCanvas) createInspectorCanvas();
    
    try {
      const elements = document.querySelectorAll(selector);
      clearCanvas();
      
      const ctx = inspectorCanvas.getContext('2d');
      elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        
        ctx.strokeStyle = '#FFC107';
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
      });
    } catch (error) {
      console.error('Invalid selector for highlighting:', selector, error);
    }
  }

  function queryElements(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return Array.from(elements).map(el => extractElementData(el));
    } catch (error) {
      console.error('Invalid selector:', selector, error);
      return [];
    }
  }

  function extractElementData(element) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    // Get all attributes
    const attributes = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }

    // Get key computed styles
    const styles = {
      display: computedStyle.display,
      position: computedStyle.position,
      width: computedStyle.width,
      height: computedStyle.height,
      backgroundColor: computedStyle.backgroundColor,
      color: computedStyle.color,
      fontSize: computedStyle.fontSize,
      fontFamily: computedStyle.fontFamily,
      margin: computedStyle.margin,
      padding: computedStyle.padding,
      border: computedStyle.border,
      zIndex: computedStyle.zIndex,
    };

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || '',
      className: element.className.toString(),
      textContent: element.textContent?.trim() || '',
      attributes,
      styles,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom
      },
      xpath: getXPath(element),
      selector: getUniqueSelector(element),
      children: element.children.length,
      parent: element.parentElement?.tagName.toLowerCase(),
      index: Array.from(element.parentElement?.children || []).indexOf(element),
    };
  }

  function getXPath(element) {
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return `/${parts.join('/')}`;
  }

  function getUniqueSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try unique class combination
    if (element.className) {
      const classes = element.className.toString().split(' ').filter(c => c);
      if (classes.length > 0) {
        const selector = `.${classes.join('.')}`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Build path-based selector
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = current.className.toString().split(' ').filter(c => c);
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`;
        }
      }

      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  function activateInspector() {
    inspectorActive = true;
    if (!inspectorCanvas) createInspectorCanvas();
    inspectorCanvas.style.display = 'block';
    updateCanvasSize();
    originalCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';
  }

  function deactivateInspector() {
    inspectorActive = false;
    if (inspectorCanvas) {
      inspectorCanvas.style.display = 'none';
      clearCanvas();
    }
    document.body.style.cursor = originalCursor;
  }

  // Listen for messages from iframe
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
      case 'inspector-request':
        const { action, data, callId } = message.data;
        let result;

        switch (action) {
          case 'queryElements':
            result = queryElements(data.selector);
            break;
          case 'getWindowSize':
            result = { width: window.innerWidth, height: window.innerHeight };
            break;
          default:
            result = { error: `Unknown action: ${action}` };
        }

        // Send response back to iframe
        event.source.postMessage({
          type: 'inspector-response',
          data: { callId, result }
        }, '*');
        break;

      case 'inspector-activate-request':
        activateInspector();
        break;

      case 'inspector-deactivate-request':
        deactivateInspector();
        break;

      case 'inspector-highlight-request':
        highlightElements(message.data.selector);
        break;
    }
  });

  // Handle window resize
  window.addEventListener('resize', updateCanvasSize);

  console.log('Parent window inspector handler loaded');
})();