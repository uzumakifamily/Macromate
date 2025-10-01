// Content script runs on every webpage
let isRecording = false;
let recordedSteps = [];
let highlightElement = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRecording') {
    startRecording();
    sendResponse({ status: 'recording started' });
  } else if (request.action === 'stopRecording') {
    const steps = stopRecording();
    sendResponse({ steps: steps });
  } else if (request.action === 'runMacro') {
    runMacro(request.steps);
    sendResponse({ status: 'macro running' });
  }
  return true;
});

// Start recording user interactions
function startRecording() {
  isRecording = true;
  recordedSteps = [];
  
  // Show recording indicator
  showRecordingIndicator();
  
  // Add event listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleChange, true);
  
  console.log('🎬 MacroMate: Recording started');
}

// Stop recording
function stopRecording() {
  isRecording = false;
  
  // Remove event listeners
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleChange, true);
  
  // Remove indicator
  removeRecordingIndicator();
  
  console.log('🛑 MacroMate: Recording stopped', recordedSteps);
  
  return recordedSteps;
}

// Handle click events
function handleClick(event) {
  if (!isRecording) return;
  
  const target = event.target;
  
  // Ignore clicks on the recording indicator
  if (target.id === 'macromate-indicator') return;
  
  const selector = getSelector(target);
  const tagName = target.tagName.toLowerCase();
  
  // Record the click
  recordedSteps.push({
    type: 'click',
    selector: selector,
    tagName: tagName,
    text: target.innerText?.substring(0, 50) || '',
    timestamp: Date.now()
  });
  
  // Visual feedback
  highlightElementBriefly(target);
  
  console.log('👆 Click recorded:', selector);
}

// Handle input events
function handleInput(event) {
  if (!isRecording) return;
  
  const target = event.target;
  const selector = getSelector(target);
  const value = target.value;
  
  // Check if it's a password field
  const isSecret = target.type === 'password';
  
  // Remove previous input step for same element (debounce)
  recordedSteps = recordedSteps.filter(step => 
    !(step.type === 'type' && step.selector === selector)
  );
  
  // Record the input
  recordedSteps.push({
    type: 'type',
    selector: selector,
    text: isSecret ? '{{SECRET}}' : value,
    secret: isSecret,
    timestamp: Date.now()
  });
  
  console.log('⌨️ Input recorded:', selector);
}

// Handle change events (for selects, checkboxes, etc.)
function handleChange(event) {
  if (!isRecording) return;
  
  const target = event.target;
  const selector = getSelector(target);
  const tagName = target.tagName.toLowerCase();
  
  if (tagName === 'select') {
    recordedSteps.push({
      type: 'select',
      selector: selector,
      value: target.value,
      timestamp: Date.now()
    });
    console.log('📋 Select recorded:', selector);
  } else if (target.type === 'checkbox' || target.type === 'radio') {
    recordedSteps.push({
      type: 'click',
      selector: selector,
      checked: target.checked,
      timestamp: Date.now()
    });
    console.log('☑️ Checkbox/Radio recorded:', selector);
  }
}

// Run recorded macro
async function runMacro(steps) {
  console.log('▶️ MacroMate: Running macro with', steps.length, 'steps');
  
  showRunningIndicator();
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`Step ${i + 1}/${steps.length}:`, step.type);
    
    try {
      await executeStep(step);
      await wait(500); // Wait between steps
    } catch (error) {
      console.error('❌ Error executing step:', error);
      alert(`Error at step ${i + 1}: ${error.message}`);
      break;
    }
  }
  
  removeRunningIndicator();
  console.log('✅ MacroMate: Macro completed');
}

// Execute a single step
async function executeStep(step) {
  const element = document.querySelector(step.selector);
  
  if (!element) {
    throw new Error(`Element not found: ${step.selector}`);
  }
  
  // Scroll element into view
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(200);
  
  // Highlight element
  highlightElementBriefly(element);
  
  switch (step.type) {
    case 'click':
      element.click();
      break;
      
    case 'type':
      element.focus();
      element.value = step.text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      break;
      
    case 'select':
      element.value = step.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      break;
      
    case 'wait':
      await wait(step.timeout || 1000);
      break;
      
    default:
      console.warn('Unknown step type:', step.type);
  }
}

// Get unique CSS selector for an element
function getSelector(element) {
  // Try ID first
  if (element.id) {
    return `#${element.id}`;
  }
  
  // Try name attribute
  if (element.name) {
    return `[name="${element.name}"]`;
  }
  
  // Try unique class combination
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      const selector = element.tagName.toLowerCase() + '.' + classes.join('.');
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }
  
  // Build path from parent
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === current.tagName) nth++;
      }
      if (nth > 1) {
        selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
    }
    
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

// Highlight element briefly
function highlightElementBriefly(element) {
  const originalOutline = element.style.outline;
  const originalBackground = element.style.backgroundColor;
  
  element.style.outline = '3px solid #6b46c1';
  element.style.backgroundColor = 'rgba(107, 70, 193, 0.1)';
  
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.backgroundColor = originalBackground;
  }, 1000);
}

// Show recording indicator
function showRecordingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'macromate-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      animation: pulse 2s infinite;
    ">
      <span style="
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
        animation: blink 1s infinite;
      "></span>
      Recording...
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    </style>
  `;
  document.body.appendChild(indicator);
}

// Remove recording indicator
function removeRecordingIndicator() {
  const indicator = document.getElementById('macromate-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Show running indicator
function showRunningIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'macromate-running-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #6b46c1 0%, #4299e1 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <span style="animation: spin 1s linear infinite;">⚡</span>
      Running Macro...
    </div>
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  document.body.appendChild(indicator);
}

// Remove running indicator
function removeRunningIndicator() {
  const indicator = document.getElementById('macromate-running-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('✅ MacroMate content script loaded');