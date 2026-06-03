/**
 * DeepSeek Research Bot - Sidepanel controller
 * Manages the UI and communicates with background service worker / content script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  const quickQuery = document.getElementById('quickQuery');
  const quickResearchBtn = document.getElementById('quickResearchBtn');
  
  const deepQuery = document.getElementById('deepQuery');
  const deepResearchBtn = document.getElementById('deepResearchBtn');
  const querySetSelect = document.getElementById('querySetSelect');
  const queryPreview = document.getElementById('queryPreview');
  
  const iterationsSlider = document.getElementById('iterations');
  const iterationsValue = document.getElementById('iterationsValue');
  
  const delaySlider = document.getElementById('delay');
  const delayValue = document.getElementById('delayValue');
  
  const progressBar = document.getElementById('progressBar');
  const progressBarFill = document.getElementById('progressBarFill');
  
  const statMessages = document.getElementById('statMessages');
  const statIterations = document.getElementById('statIterations');
  
  const logContainer = document.getElementById('logContainer');
  const themeToggle = document.getElementById('themeToggle');

  let sentMessagesCount = 0;
  let currentIterationsCount = 0;
  let cachedSets = {}; // Store sets locally for quick lookup

  // ── Theme ──────────────────────────────────────────────
  async function initTheme() {
    const data = await chrome.storage.sync.get('theme');
    const isDark = data.theme !== 'light'; // dark is default
    document.body.classList.toggle('light-mode', !isDark);
  }

  themeToggle.addEventListener('click', async () => {
    const isNowLight = document.body.classList.toggle('light-mode');
    await chrome.storage.sync.set({ theme: isNowLight ? 'light' : 'dark' });
  });

  // Listen for theme changes from options page
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      const isLight = changes.theme.newValue === 'light';
      document.body.classList.toggle('light-mode', isLight);
    }
    if (changes.nextQuerySets) {
      loadQuerySets();
    }
  });

  // ── Query Sets ─────────────────────────────────────────
  async function loadQuerySets() {
    const data = await chrome.storage.sync.get('nextQuerySets');
    cachedSets = data.nextQuerySets || {};
    
    querySetSelect.innerHTML = '';
    
    const names = Object.keys(cachedSets);
    if (names.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No sets found — add in Options';
      opt.value = '';
      querySetSelect.appendChild(opt);
      queryPreview.innerHTML = '<em>Open Options to create query sets.</em>';
      return;
    }

    names.forEach(setName => {
      const opt = document.createElement('option');
      opt.textContent = setName;
      opt.value = setName;
      querySetSelect.appendChild(opt);
    });

    updatePreview();
  }

  function updatePreview() {
    const selected = querySetSelect.value;
    const queries = cachedSets[selected] || [];
    
    if (queries.length === 0) {
      queryPreview.innerHTML = '<em>No questions in this set.</em>';
      return;
    }

    queryPreview.innerHTML = '<ol>' + queries.map(q => `<li>${q}</li>`).join('') + '</ol>';
    
    // Auto-adjust iterations to match set size
    const currentIter = parseInt(iterationsSlider.value);
    if (currentIter > queries.length) {
      iterationsSlider.value = queries.length;
      iterationsValue.textContent = queries.length;
      document.querySelector('#iterations ~ .slider-value').textContent = queries.length;
    }
    iterationsSlider.max = queries.length;
  }

  querySetSelect.addEventListener('change', updatePreview);

  // ── Sliders ────────────────────────────────────────────
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

  // ── Logging ────────────────────────────────────────────
  function log(message, type = 'info') {
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) logContainer.innerHTML = '';

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function setStatus(text, state = 'ready') {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator';
    if (state === 'busy') statusIndicator.classList.add('busy');
    else if (state === 'error') statusIndicator.classList.add('error');
  }

  // ── Quick Research ─────────────────────────────────────
  quickResearchBtn.addEventListener('click', async () => {
    const query = quickQuery.value.trim();
    if (!query) { log('Please enter a query.', 'error'); return; }

    setUIBusy(true);
    setStatus('Quick Researching...', 'busy');
    log(`Started quick research for: "${query.substring(0, 40)}..."`, 'info');

    chrome.runtime.sendMessage({
      source: 'sidepanel',
      action: 'quickResearch',
      query: query
    }, (response) => {
      setUIBusy(false);
      if (chrome.runtime.lastError) {
        log(`Connection Error: ${chrome.runtime.lastError.message}`, 'error');
        setStatus('Error', 'error');
        return;
      }
      if (response && response.success) {
        log('Quick research finished successfully!', 'success');
        setStatus('Ready', 'ready');
      } else {
        log(`Error: ${(response && response.error) || 'Failed'}`, 'error');
        setStatus('Error', 'error');
      }
    });
  });

  // ── Deep Research ──────────────────────────────────────
  deepResearchBtn.addEventListener('click', async () => {
    const query = deepQuery.value.trim();
    if (!query) { log('Please enter an initial query.', 'error'); return; }

    const selectedSet = querySetSelect.value;
    if (!selectedSet || !cachedSets[selectedSet]) {
      log('Please select a Query Set first.', 'error');
      return;
    }

    const queries = cachedSets[selectedSet];
    const iterations = parseInt(iterationsSlider.value);
    const delay = parseInt(delaySlider.value) * 1000;

    setUIBusy(true);
    setStatus('Deep Researching...', 'busy');
    progressBar.style.display = 'block';
    progressBarFill.style.width = '0%';
    
    log(`Started deep research (${iterations} iters) using "${selectedSet}"`, 'info');

    chrome.runtime.sendMessage({
      source: 'sidepanel',
      action: 'deepResearch',
      query: query,
      queries: queries,
      iterations: iterations,
      delay: delay
    }, (response) => {
      setUIBusy(false);
      progressBar.style.display = 'none';

      if (chrome.runtime.lastError) {
        log(`Connection Error: ${chrome.runtime.lastError.message}`, 'error');
        setStatus('Error', 'error');
        return;
      }
      if (response && response.success) {
        log('Deep research finished successfully!', 'success');
        setStatus('Ready', 'ready');
      } else {
        log(`Error: ${(response && response.error) || 'Failed'}`, 'error');
        setStatus('Error', 'error');
      }
    });
  });

  function setUIBusy(isBusy) {
    quickQuery.disabled = isBusy;
    quickResearchBtn.disabled = isBusy;
    deepQuery.disabled = isBusy;
    deepResearchBtn.disabled = isBusy;
    querySetSelect.disabled = isBusy;
    iterationsSlider.disabled = isBusy;
    delaySlider.disabled = isBusy;
  }

  // ── Content Script Messages ────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only process messages from content script (not our own)
    if (message.source !== 'content') return;
    
    // Also ignore if sender is this extension's own tabs (defensive)
    if (sender.id !== chrome.runtime.id) return;

    switch (message.type) {
      case 'messageSent':
        sentMessagesCount++;
        statMessages.textContent = sentMessagesCount;
        log(`User message sent: "${message.text.substring(0, 50)}..."`, 'info');
        break;
      case 'responseProgress':
        statusText.textContent = `Streaming response (${message.length} chars)...`;
        break;
      case 'responseComplete':
        log(`Response received (${message.content.length} chars).`, 'success');
        break;
      case 'quickResearchStart':
        setStatus('Processing Quick Research...', 'busy');
        log('Executing query in tab...', 'info');
        break;
      case 'quickResearchComplete':
        setStatus('Ready', 'ready');
        log('Core insights parsed successfully.', 'success');
        if (message.insights && message.insights.keyPoints.length > 0) {
          log('Key Insights:', 'info');
          message.insights.keyPoints.forEach((pt) => log(`- ${pt}`, 'success'));
        }
        break;
      case 'researchStart':
        currentIterationsCount = 0;
        statIterations.textContent = '0';
        progressBarFill.style.width = '0%';
        setStatus('Running Deep Loop...', 'busy');
        log('Loop initialized.', 'info');
        break;
      case 'iterationStart':
        currentIterationsCount = message.iteration;
        statIterations.textContent = currentIterationsCount;
        progressBarFill.style.width = `${((message.iteration - 1) / message.maxIterations) * 100}%`;
        log(`Iteration ${message.iteration}/${message.maxIterations} started.`, 'info');
        log(`Current prompt: "${message.query}"`, 'info');
        break;
      case 'iterationComplete':
        progressBarFill.style.width = `${(message.iteration / message.maxIterations) * 100}%`;
        log(`Iteration ${message.iteration} completed. ${message.responseLength} chars.`, 'success');
        if (message.insights && message.insights.keyPoints.length > 0) {
          message.insights.keyPoints.forEach(pt => log(`Insight: ${pt}`, 'success'));
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

  // ── Initial Tab Check ──────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0]?.url && tabs[0].url.includes('chat.deepseek.com')) {
      log('Connected to DeepSeek page.', 'success');
      chrome.tabs.sendMessage(tabs[0].id, { target: 'content', action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          log('Ready (refresh chat.deepseek.com if unresponsive)', 'warning');
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
      log('Open chat.deepseek.com to use the bot!', 'warning');
      setStatus('Waiting for chat.deepseek.com', 'error');
    }
  });

  // ── Init ───────────────────────────────────────────────
  await initTheme();
  await loadQuerySets();
});
