/**
 * DeepSeek Research Bot - Content Script
 * Injected into chat.deepseek.com pages
 * Handles all DOM interaction and research automation
 */

class DeepSeekResearchBot {
  constructor() {
    this.conversationHistory = [];
    this.isProcessing = false;
    this.messageQueue = [];
    this.researchContext = {};
  }

  /**
   * Wait for send button to become enabled
   */
  async waitForSendButtonEnabled(timeout = 30000) {
    console.log('[RTK] ⏳ Waiting for send button to become enabled...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Find the send button with multiple selectors
      const sendButton = document.querySelector('button[type="submit"]') ||
                         document.querySelector('._52c986b.ds-icon-button') ||
                         document.querySelector('.ds-button--primary') ||
                         Array.from(document.querySelectorAll('.ds-button')).find(btn => {
                           const svg = btn.querySelector('svg');
                           return svg && btn.textContent.includes('Send') === false;
                         });
      
      if (sendButton) {
        // Check if button is disabled
        const isDisabled = sendButton.disabled || 
                          sendButton.classList.contains('ds-button--disabled') ||
                          sendButton.getAttribute('aria-disabled') === 'true' ||
                          sendButton.classList.contains('_52c986b'); // Disabled class pattern
                          
        if (!isDisabled && sendButton.getAttribute('aria-disabled') !== 'true') {
          console.log('[RTK] ✓ Send button is now enabled and ready');
          return sendButton;
        }
      }
      
      // Also check for any enabled send icon button
      const enabledButton = Array.from(document.querySelectorAll('.ds-button')).find(btn => {
        const hasSvg = btn.querySelector('svg') !== null;
        const isDisabledBtn = btn.classList.contains('ds-button--disabled') || 
                              btn.getAttribute('aria-disabled') === 'true';
        return hasSvg && !isDisabledBtn;
      });
      
      if (enabledButton) {
        console.log('[RTK] ✓ Found enabled send button');
        return enabledButton;
      }
      
      await this.sleep(500);
    }
    
    console.warn('[RTK] ⚠️ Timeout waiting for send button to become enabled');
    return null;
  }

  /**
   * Check if DeepSeek is ready for next message
   */
  async isDeepSeekReady() {
    // Check for loading indicators
    const loadingIndicators = document.querySelectorAll('[class*="loading"], [class*="typing"], [class*="thinking"]');
    const isThinking = Array.from(loadingIndicators).some(el => el.offsetParent !== null);
    
    // Check if send button is disabled
    const sendButton = document.querySelector('.ds-button--primary');
    const isButtonDisabled = sendButton && (
      sendButton.disabled ||
      sendButton.classList.contains('ds-button--disabled') ||
      sendButton.getAttribute('aria-disabled') === 'true'
    );
    
    // Check for streaming response
    const streamingIndicator = document.querySelector('[class*="streaming"], [class*="generating"]');
    const isStreaming = streamingIndicator && streamingIndicator.offsetParent !== null;
    
    const isReady = !isThinking && !isButtonDisabled && !isStreaming;
    
    if (!isReady) {
      if (isThinking) console.log('[RTK] ⏳ AI is still thinking...');
      if (isButtonDisabled) console.log('[RTK] ⏳ Send button is disabled, waiting...');
      if (isStreaming) console.log('[RTK] ⏳ Response is still streaming...');
    }
    
    return isReady;
  }

  /**
   * Wait for DeepSeek to complete response and become ready
   */
  async waitForReadyState(timeout = 120000) {
    console.log('[RTK] ⏳ Waiting for DeepSeek to complete response...');
    const startTime = Date.now();
    let lastResponseLength = 0;
    let stableCount = 0;

    // Get initial message count
    const initialMessages = document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="message"]');
    const initialCount = initialMessages.length;

    while (Date.now() - startTime < timeout) {
      // Strategy 1: Specific assistant selectors
      let assistantMessages = Array.from(document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="assistant"]'))
        .filter(m => {
          const role = m.getAttribute('data-message-role');
          if (role === 'assistant') return true;
          return m.classList.contains('assistant') || m.querySelector('.assistant');
        });

      // Strategy 2: Fallback - newest non-user message
      if (assistantMessages.length === 0) {
        const allMessages = document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="message"]');
        if (allMessages.length > initialCount) {
          const latest = allMessages[allMessages.length - 1];
          if (latest.getAttribute('data-message-role') !== 'user' && !latest.classList.contains('user')) {
            assistantMessages = [latest];
          }
        }
      }

      if (assistantMessages.length > 0) {
        const latestResponse = assistantMessages[assistantMessages.length - 1];
        const currentLength = (latestResponse.innerText || latestResponse.textContent || '').length;

        // Check if response length is stable
        if (currentLength === lastResponseLength && currentLength > 10) {
          stableCount++;
          if (stableCount >= 4) {
            console.log('[RTK] ✓ Response appears complete and stable');
            await this.sleep(2000);
            const isReady = await this.isDeepSeekReady();
            if (isReady) {
              console.log('[RTK] ✓ DeepSeek is ready for next question');
              return true;
            }
          }
        } else {
          stableCount = 0;
          lastResponseLength = currentLength;
          if (currentLength > 0) {
            console.log(`[RTK] 📥 Receiving response... (${currentLength} chars)`);
          }
        }
      }

      // Strategy 3: Send button re-enabled = AI done
      const sendButton = await this.waitForSendButtonEnabled(2000);
      if (sendButton && lastResponseLength > 10) {
        console.log('[RTK] ✓ Send button ready and response received');
        await this.sleep(1000);
        return true;
      }

      await this.sleep(1500);
    }

    console.log('[RTK] ✓ Assuming ready state (timeout reached)');
    return true;
  }

  /**
   * Types message and clicks send button
   */
  async sendMessage(text, options = {}) {
    const {
      simulateEnter = true,
      clickSend = true,
      delayBeforeClick = 300,
      realisticTyping = false,
      typingSpeed = 20,
      waitForResponse = false,
      responseTimeout = 120000,
      waitForReady = true
    } = options;

    // Wait for DeepSeek to be ready before sending
    if (waitForReady) {
      console.log('[RTK] 🟢 Checking if DeepSeek is ready...');
      const isReady = await this.waitForReadyState(30000);
      if (!isReady) {
        console.warn('[RTK] ⚠️ DeepSeek may not be ready, but proceeding anyway...');
      }
    }

    // Locate elements
    const textarea = document.querySelector('textarea[placeholder="Message DeepSeek"]') || 
                     document.querySelector('textarea');
    
    // Find send button - look for enabled button
    let sendButton = null;
    let buttonCheckStart = Date.now();
    
    while (!sendButton && (Date.now() - buttonCheckStart) < 5000) {
      sendButton = document.querySelector('button[type="submit"]') ||
                   document.querySelector('._52c986b.ds-icon-button') ||
                   Array.from(document.querySelectorAll('.ds-button')).find(btn => {
                     const hasSvg = btn.querySelector('svg') !== null;
                     const isDisabled = btn.disabled || 
                                       btn.classList.contains('ds-button--disabled') ||
                                       btn.getAttribute('aria-disabled') === 'true';
                     return hasSvg && !isDisabled;
                   });
      
      if (!sendButton) {
        await this.sleep(500);
      }
    }

    if (!textarea) {
      console.error('[RTK] ❌ Textarea not found');
      return false;
    }

    if (clickSend && !sendButton) {
      console.warn('[RTK] ⚠️ Enabled send button not found, will try Enter key only');
    } else if (sendButton) {
      console.log('[RTK] ✓ Enabled send button found');
    }

    console.log(`[RTK] 📤 Sending: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    // Focus and clear
    textarea.focus();
    await this.sleep(100);
    
    // Get native setter
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 
      "value"
    ).set;

    // Clear existing text
    nativeTextAreaValueSetter.call(textarea, '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await this.sleep(50);
    
    // Type the message
    if (realisticTyping) {
      console.log('[RTK] ⌨️ Typing message...');
      for (let i = 0; i <= text.length; i++) {
        const partialText = text.substring(0, i);
        nativeTextAreaValueSetter.call(textarea, partialText);
        textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        await this.sleep(typingSpeed);
      }
      console.log('[RTK] ✓ Finished typing');
    } else {
      nativeTextAreaValueSetter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      console.log('[RTK] ✓ Typed message');
    }

    await this.sleep(150);

    // METHOD 1: Simulate Enter keypress
    if (simulateEnter) {
      console.log('[RTK] ⌨️ Simulating Enter keypress...');
      ['keydown', 'keyup'].forEach(eventType => {
        const event = new KeyboardEvent(eventType, {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true
        });
        textarea.dispatchEvent(event);
      });
      console.log('[RTK] ✓ Enter keypress simulated');
      await this.sleep(200);
    }

    // METHOD 2: Click send button if available and enabled
    if (clickSend && sendButton) {
      console.log('[RTK] 🖱️ Clicking send button...');
      
      // Final check that button is enabled
      const isEnabled = !sendButton.disabled && 
                       !sendButton.classList.contains('ds-button--disabled') &&
                       sendButton.getAttribute('aria-disabled') !== 'true';
      
      if (isEnabled) {
        await this.sleep(delayBeforeClick);
        
        // Click the button
        sendButton.click();
        console.log('[RTK] ✓ Send button clicked');
        
        // Clear textarea after sending
        await this.sleep(200);
        nativeTextAreaValueSetter.call(textarea, '');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        
      } else {
        console.warn('[RTK] ⚠️ Send button became disabled before click');
      }
    }

    // Store in history
    this.conversationHistory.push({ role: 'user', content: text, timestamp: Date.now() });
    
    // Notify sidepanel
    this.notifySidePanel({ type: 'messageSent', text });
    
    // Wait for response if requested
    if (waitForResponse) {
      const response = await this.waitForResponse(responseTimeout);
      return response;
    }
    
    return true;
  }

  /**
   * Wait for AI response
   */
  async waitForResponse(timeout = 120000) {
    console.log('[RTK] ⏳ Waiting for AI response...');
    
    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;
    let lastLength = 0;

    // Get initial message count to detect NEW messages
    const initialMessages = document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="message"]');
    const initialCount = initialMessages.length;
    
    // Diagnostic: log what message elements exist in the DOM
    const allRoleEls = document.querySelectorAll('[data-message-role]');
    const allMsgEls = document.querySelectorAll('[class*="message"]');
    console.log(`[RTK] 🔍 DOM diagnostic: ${allRoleEls.length} [data-message-role] elements, ${allMsgEls.length} [class*=message] elements, ${initialCount} total candidates`);
    if (allRoleEls.length > 0) {
      allRoleEls.forEach((el, i) => console.log(`[RTK] 🔍   [data-message-role] #${i}: role="${el.getAttribute('data-message-role')}" classes="${el.className.substring(0, 80)}" text="${(el.innerText||'').substring(0, 60)}"`));
    }
    if (allMsgEls.length > 0 && allMsgEls.length <= 20) {
      allMsgEls.forEach((el, i) => console.log(`[RTK] 🔍   [class*=message] #${i}: classes="${el.className.substring(0, 80)}" tag="${el.tagName}" text="${(el.innerText||'').substring(0, 40)}"`));
    }
    
    while (Date.now() - startTime < timeout) {
      await this.sleep(1500);
      
      // Strategy 1: Specific assistant selectors
      let assistantMessages = Array.from(document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="assistant"]'))
        .filter(m => {
          const role = m.getAttribute('data-message-role');
          if (role === 'assistant') return true;
          return m.classList.contains('assistant') || m.querySelector('.assistant');
        });
      
      // Strategy 2: Fallback - find the newest message that isn't the user's
      if (assistantMessages.length === 0) {
        const allMessages = document.querySelectorAll('.ds-message-container, [data-message-role], .message, [class*="message"]');
        if (allMessages.length > initialCount) {
          const latest = allMessages[allMessages.length - 1];
          // It's likely the assistant if it's not marked as user
          if (latest.getAttribute('data-message-role') !== 'user' && !latest.classList.contains('user')) {
            assistantMessages = [latest];
          }
        }
      }
      
      if (assistantMessages.length > 0) {
        const latestResponse = assistantMessages[assistantMessages.length - 1];
        const responseText = latestResponse.innerText || latestResponse.textContent || '';
        const currentLength = responseText.length;
        
        if (currentLength > lastLength && currentLength > 10) {
          lastLength = currentLength;
          lastContent = responseText;
          stableCount = 0;
          console.log(`[RTK] 📥 Receiving response... (${currentLength} chars)`);
          
          this.notifySidePanel({ 
            type: 'responseProgress', 
            length: currentLength,
            preview: responseText.substring(0, 100)
          });
        } else if (currentLength === lastLength && lastLength > 10) {
          stableCount++;
          if (stableCount >= 4) {
            console.log('[RTK] ✅ Response complete');
            this.conversationHistory.push({ 
              role: 'assistant', 
              content: lastContent, 
              timestamp: Date.now() 
            });
            
            this.notifySidePanel({ 
              type: 'responseComplete', 
              content: lastContent 
            });
            
            await this.sleep(3000);
            return lastContent;
          }
        }
      }

      // Strategy 3: Emergency Fallback - if the send button is enabled, the AI is likely done
      const sendButton = document.querySelector('button[type="submit"]') || document.querySelector('.ds-button--primary');
      if (sendButton && !sendButton.disabled && !sendButton.classList.contains('ds-button--disabled') && sendButton.getAttribute('aria-disabled') !== 'true') {
          if (lastLength > 10) {
              console.log('[RTK] ✓ AI finished (Send button re-enabled)');
              return lastContent;
          }
      }
    }
    
    console.warn('[RTK] ⚠️ Timeout waiting for response');
    return lastContent || null;
  }

  /**
   * Notify side panel of events
   */
  notifySidePanel(data) {
    chrome.runtime.sendMessage({ source: 'content', ...data }).catch(() => {
      // Side panel may not be open, silent fail
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract insights from response
   */
  extractInsights(response) {
    let responseText = typeof response === 'string' ? response : String(response || '');
    
    const insights = {
      keyPoints: [],
      questions: [],
      topics: [],
      summary: responseText.substring(0, 200)
    };
    
    if (!responseText) return insights;
    
    const sentences = responseText.split(/[.!?]+/);
    const importantKeywords = ['import', 'key', 'note', 'significant', 'critical', 'essential', 'workflow', 'claude'];
    
    sentences.forEach(sentence => {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length > 20 && importantKeywords.some(kw => cleanSentence.toLowerCase().includes(kw))) {
        insights.keyPoints.push(cleanSentence);
      }
    });
    
    insights.keyPoints = insights.keyPoints.slice(0, 5);
    
    const questionMatches = responseText.match(/[^.!?]*\?/g);
    if (questionMatches) {
      insights.questions = questionMatches.map(q => q.trim()).slice(0, 3);
    }
    
    return insights;
  }

  /**
   * Deep research with multiple iterations
   */
  async deepResearch(initialQuery, options = {}) {
    const {
      maxIterations = 3,
      autoContinue = true,
      verbose = true,
      delayBetweenMessages = 5000,
      queries = []
    } = options;
    
    console.log('\n' + '='.repeat(60));
    console.log('[RTK] 🔬 DEEP RESEARCH LOOP');
    console.log('='.repeat(60));
    console.log(`[RTK] 📋 Query: ${initialQuery}`);
    console.log(`[RTK] 🔄 Max Iterations: ${maxIterations}`);
    console.log(`[RTK] ⏱️ Delay between messages: ${delayBetweenMessages}ms`);
    console.log('='.repeat(60) + '\n');
    
    this.notifySidePanel({ 
      type: 'researchStart', 
      query: initialQuery, 
      maxIterations 
    });
    
    let currentQuery = initialQuery;
    let iteration = 0;
    let researchData = { iterations: [] };
    
    while (iteration < maxIterations +1) {
      iteration++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`[RTK] 🔁 ITERATION ${iteration}/${maxIterations}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`[RTK] 💭 Question: ${currentQuery}`);
      
      this.notifySidePanel({ 
        type: 'iterationStart', 
        iteration, 
        maxIterations, 
        query: currentQuery 
      });
      
      // Send message and wait for response
      const response = await this.sendMessage(currentQuery, {
        simulateEnter: true,
        clickSend: true,
        delayBeforeClick: 300,
        waitForResponse: true,
        realisticTyping: iteration > 1,
        responseTimeout: 120000,
        waitForReady: iteration > 1
      });
      
      if (!response) {
        console.error('[RTK] ❌ No response received');
        this.notifySidePanel({ type: 'error', message: 'No response received' });
        break;
      }
      
      const insights = this.extractInsights(response);
      researchData.iterations.push({
        iteration,
        query: currentQuery,
        response: response.substring(0, 800),
        insights
      });
      
      if (verbose) {
        console.log(`\n[RTK] 📊 Response length: ${response.length} chars`);
        console.log(`[RTK] 📝 Preview: ${response.substring(0, 200)}...`);
      }
      
      this.notifySidePanel({ 
        type: 'iterationComplete', 
        iteration, 
        responseLength: response.length,
        insights 
      });
      
      // Determine next question: prioritize query set, then fallback to hardcoded
      let nextQuery = null;

      if (queries.length > 0) {
        // Use queries from the selected set: iteration 1 (initialQuery sent) → queries[0], iteration 2 → queries[1], etc.
        const queryIndex = iteration - 1;
        if (queryIndex < queries.length + 1) {
          nextQuery = queries[queryIndex];
          console.log(`[RTK] 📋 Using query set question ${queryIndex + 1}/${queries.length}`);
        } else {
          console.log(`[RTK] ✅ All ${queries.length} queries from set exhausted`);
        }
      } else {
        // Fallback to hardcoded questions if no query set provided
        if (iteration === 1) {
          nextQuery = 'Can you provide specific examples or implementation details?';
        } else if (iteration === 2) {
          nextQuery = 'What are the best practices and common pitfalls?';
        } else if (iteration < maxIterations) {
          nextQuery = 'What are the key recommendations and next steps?';
        }
      }
      
      // Continue loop if: (1) we have a next question, (2) autoContinue is on, (3) haven't hit maxIterations
      if (autoContinue && nextQuery) {
        currentQuery = nextQuery;
        console.log(`\n[RTK] ➡️ Next question: ${currentQuery}`);
        console.log(`[RTK] ⏱️ Waiting ${delayBetweenMessages/1000}s for button to re-enable...`);
        
        // Wait for button to become enabled
        const buttonReady = await this.waitForSendButtonEnabled(delayBetweenMessages);
        if (buttonReady) {
          console.log('[RTK] ✓ Button is ready, proceeding...');
        } else {
          console.log('[RTK] ⚠️ Button not ready, waiting additional time...');
          await this.sleep(3000);
        }
        
        // Additional wait to ensure everything is settled
        await this.sleep(2000);
      } else {
        console.log(`[RTK] 🛑 Loop terminating: nextQuery=${!!nextQuery}, autoContinue=${autoContinue}, iteration=${iteration}/${maxIterations}`);
        break;
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('[RTK] 📊 RESEARCH SUMMARY');
    console.log('='.repeat(60));
    researchData.iterations.forEach((iter, i) => {
      console.log(`\n${i + 1}. Q: ${iter.query.substring(0, 80)}...`);
      console.log(`   Key points: ${iter.insights.keyPoints.length}`);
      if (iter.insights.keyPoints.length > 0) {
        iter.insights.keyPoints.slice(0, 2).forEach(point => {
          console.log(`   • ${point.substring(0, 100)}...`);
        });
      }
    });
    
    console.log('\n[RTK] ✅ Deep research completed!');
    
    this.notifySidePanel({ 
      type: 'researchComplete', 
      data: researchData 
    });
    
    return researchData;
  }

  /**
   * Quick research - one question
   */
  async quickResearch(query) {
    console.log('\n' + '='.repeat(60));
    console.log(`[RTK] 🔍 RESEARCH: ${query}`);
    console.log('='.repeat(60) + '\n');
    
    this.notifySidePanel({ type: 'quickResearchStart', query });
    
    const response = await this.sendMessage(query, {
      simulateEnter: true,
      clickSend: true,
      delayBeforeClick: 300,
      realisticTyping: false,
      waitForResponse: true,
      responseTimeout: 90000,
      waitForReady: true
    });
    
    if (response) {
      console.log('\n[RTK] 📝 RESPONSE:');
      console.log('─'.repeat(40));
      console.log(response);
      console.log('─'.repeat(40));
      
      const insights = this.extractInsights(response);
      if (insights.keyPoints.length > 0) {
        console.log('\n[RTK] 🔍 KEY INSIGHTS:');
        insights.keyPoints.forEach((point, i) => {
          console.log(`${i + 1}. ${point}`);
        });
      }
      
      this.notifySidePanel({ 
        type: 'quickResearchComplete', 
        response, 
        insights 
      });
      
      return response;
    }
    
    console.error('[RTK] ❌ Failed to get response');
    this.notifySidePanel({ type: 'error', message: 'Failed to get response' });
    return null;
  }
}

// Initialize bot
const researchBot = new DeepSeekResearchBot();

// Listen for messages from sidepanel/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'content') return;
  
  console.log('[RTK] 📨 Received message:', message);
  
  (async () => {
    try {
      switch (message.action) {
        case 'quickResearch':
          const quickResult = await researchBot.quickResearch(message.query);
          sendResponse({ success: true, result: quickResult });
          break;
          
        case 'deepResearch':
          const deepResult = await researchBot.deepResearch(message.query, {
            maxIterations: message.iterations || 3,
            delayBetweenMessages: message.delay || 6000,
            queries: message.queries || []
          });
          sendResponse({ success: true, result: deepResult });
          break;
          
        case 'sendMessage':
          const sent = await researchBot.sendMessage(message.text, message.options || {});
          sendResponse({ success: sent });
          break;
          
        case 'getStatus':
          sendResponse({ 
            success: true, 
            isProcessing: researchBot.isProcessing,
            historyLength: researchBot.conversationHistory.length
          });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[RTK] ❌ Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

console.log('[RTK] ✅ DeepSeek Research Bot content script loaded');
