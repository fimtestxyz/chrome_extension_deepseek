/**
 * DeepSeek Research Bot - Sidepanel controller
 * Manages the UI and communicates with background service worker / content script
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  const quickQuery = document.getElementById('quickQuery');
  const quickResearchBtn = document.getElementById('quickResearchBtn');
  
  const deepQuery = document.getElementById('deepQuery');
  const deepResearchBtn = document.getElementById('deepResearchBtn');
  
  const iterationsSlider = document.getElementById('iterations');
  const iterationsValue = document.getElementById('iterationsValue');
  
  const delaySlider = document.getElementById('delay');
  const delayValue = document.getElementById('delayValue');
  
  const progressBar = document.getElementById('progressBar');
  const progressBarFill = document.getElementById('progressBarFill');
  
  const statMessages = document.getElementById('statMessages');
  const statIterations = document.getElementById('statIterations');
  
  const logContainer = document.getElementById('logContainer');

  let sentMessagesCount = 0;
  let currentIterationsCount = 0;

  // Setup sliders
  iterationsSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    iterationsValue.textContent = val;
    document.querySelector('#iterations ~ .slider-value').textContent = val;
  });

  delaySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    delayValue.textContent = val;
    document.querySelector('#delay ~ .slider-value').textContent = val;
  });

  // Helper: Log message to the container
  function log(message, type = 'info') {
    // Remove empty state if it exists
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) {
      logContainer.innerHTML = '';
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Helper: Set status
  function setStatus(text, state = 'ready') {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator';
    
    if (state === 'busy') {
      statusIndicator.classList.add('busy');
    } else if (state === 'error') {
      statusIndicator.classList.add('error');
    }
  }

  // Handle Quick Research Button Click
  quickResearchBtn.addEventListener('click', async () => {
    const query = quickQuery.value.trim();
    if (!query) {
      log('Please enter a query.', 'error');
      return;
    }

    setUIBusy(true);
    setStatus('Quick Researching...', 'busy');
    log(`Started quick research for: "${query.substring(0, 40)}..."`, 'info');

    // Send action to background, which forwards to active content script
    chrome.runtime.sendMessage({
      source: 'sidepanel',
      action: 'quickResearch',
      query: query
    }, (response) => {
      setUIBusy(false);
      
      if (chrome.runtime.lastError) {
        log(`Connection Error: ${chrome.runtime.lastError.message}. Make sure you are on chat.deepseek.com!`, 'error');
        setStatus('Error', 'error');
        return;
      }

      if (response && response.success) {
        log('Quick research finished successfully!', 'success');
        setStatus('Ready', 'ready');
      } else {
        const errMsg = (response && response.error) || 'Failed to complete quick research';
        log(`Error: ${errMsg}`, 'error');
        setStatus('Error', 'error');
      }
    });
  });

  // Handle Deep Research Button Click
  deepResearchBtn.addEventListener('click', () => {
    const query = deepQuery.value.trim();
    if (!query) {
      log('Please enter an initial query.', 'error');
      return;
    }

    const iterations = parseInt(iterationsSlider.value);
    const delay = parseInt(delaySlider.value) * 1000; // to milliseconds

    setUIBusy(true);
    setStatus('Deep Researching...', 'busy');
    progressBar.style.display = 'block';
    progressBarFill.style.width = '0%';
    
    log(`Started deep research (${iterations} iterations) for: "${query.substring(0, 40)}..."`, 'info');

    chrome.runtime.sendMessage({
      source: 'sidepanel',
      action: 'deepResearch',
      query: query,
      iterations: iterations,
      delay: delay
    }, (response) => {
      setUIBusy(false);
      progressBar.style.display = 'none';

      if (chrome.runtime.lastError) {
        log(`Connection Error: ${chrome.runtime.lastError.message}. Make sure you are on chat.deepseek.com!`, 'error');
        setStatus('Error', 'error');
        return;
      }

      if (response && response.success) {
        log('Deep research finished successfully!', 'success');
        setStatus('Ready', 'ready');
      } else {
        const errMsg = (response && response.error) || 'Failed to complete deep research';
        log(`Error: ${errMsg}`, 'error');
        setStatus('Error', 'error');
      }
    });
  });

  // Helper to enable/disable UI controls during processing
  function setUIBusy(isBusy) {
    quickQuery.disabled = isBusy;
    quickResearchBtn.disabled = isBusy;
    deepQuery.disabled = isBusy;
    deepResearchBtn.disabled = isBusy;
    iterationsSlider.disabled = isBusy;
    delaySlider.disabled = isBusy;
  }

  // Receive logs/updates broadcast from the content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.source !== 'content') return;

    switch (message.type) {
      case 'messageSent':
        sentMessagesCount++;
        statMessages.textContent = sentMessagesCount;
        log(`User message sent: "${message.text.substring(0, 50)}..."`, 'info');
        break;

      case 'responseProgress':
        // Update status or temporary logging for stream
        statusText.textContent = `Streaming response (${message.length} chars)...`;
        break;

      case 'responseComplete':
        log(`Response received (${message.content.length} chars).`, 'success');
        break;

      case 'quickResearchStart':
        setStatus('Processing Quick Research...', 'busy');
        log(`Executing query in tab...`, 'info');
        break;

      case 'quickResearchComplete':
        setStatus('Ready', 'ready');
        log(`Core insights parsed successfully.`, 'success');
        if (message.insights && message.insights.keyPoints.length > 0) {
          log('Key Insights:', 'info');
          message.insights.keyPoints.forEach((pt, i) => {
            log(`- ${pt}`, 'success');
          });
        }
        break;

      case 'researchStart':
        currentIterationsCount = 0;
        statIterations.textContent = '0';
        progressBarFill.style.width = '0%';
        setStatus('Running Deep Loop...', 'busy');
        log(`Loop initialized.`, 'info');
        break;

      case 'iterationStart':
        currentIterationsCount = message.iteration;
        statIterations.textContent = currentIterationsCount;
        
        // Update progress bar
        const progressPct = ((message.iteration - 1) / message.maxIterations) * 100;
        progressBarFill.style.width = `${progressPct}%`;
        
        log(`Iteration ${message.iteration}/${message.maxIterations} started.`, 'info');
        log(`Current prompt: "${message.query}"`, 'info');
        break;

      case 'iterationComplete':
        const completedPct = (message.iteration / message.maxIterations) * 100;
        progressBarFill.style.width = `${completedPct}%`;
        log(`Iteration ${message.iteration} completed. Response length: ${message.responseLength} chars.`, 'success');
        
        if (message.insights && message.insights.keyPoints.length > 0) {
          message.insights.keyPoints.forEach(pt => {
            log(`Insight: ${pt}`, 'success');
          });
        }
        break;

      case 'researchComplete':
        progressBarFill.style.width = '100%';
        setStatus('Ready', 'ready');
        log('Deep Research finalized. All done!', 'success');
        break;

      case 'error':
        setStatus('Error occurred', 'error');
        log(`Content Script Error: ${message.message}`, 'error');
        break;
    }
  });

  // Try checking active tab state on load
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('chat.deepseek.com')) {
      log('Connected to DeepSeek page.', 'success');
      // Ask content script for current status
      chrome.tabs.sendMessage(tabs[0].id, { target: 'content', action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded yet (page needs refresh/script isn't running)
          log('Ready (refresh chat.deepseek.com page if bot controls feel unresponsive)', 'warning');
          return;
        }
        if (response && response.success) {
          sentMessagesCount = response.historyLength || 0;
          statMessages.textContent = sentMessagesCount;
          if (response.isProcessing) {
            setUIBusy(true);
            setStatus('Active loop detected...', 'busy');
            log('Resumed active loop status from tab.', 'info');
          }
        }
      });
    } else {
      log('Extension loaded. Open chat.deepseek.com to use the bot!', 'warning');
      setStatus('Waiting for chat.deepseek.com', 'error');
    }
  });
});
