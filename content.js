// ============================================================
// Manifesto — Content Script
// Own mic button → Chrome Speech API → Edit → Send
// ============================================================

(function () {
  'use strict';

  // ---- SVG Icons ----
  const MIC_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
  const STOP_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const MIC_SMALL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg" style="fill:currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
  const STOP_SMALL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg" style="fill:currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  // ---- State ----
  let sentences = [];
  let polishedText = '';
  let activeTab = 'sentences';
  let isPolishing = false;
  let dragIdx = null;
  let recognition = null;
  let isRecording = false;
  let finalTranscript = '';
  let interimTranscript = '';

  // ---- Site Configs ----
  const SITE_CONFIGS = {
    'claude.ai': {
      inputSelector: '[contenteditable="true"].ProseMirror, div[contenteditable="true"]',
      sendSelector: 'button[aria-label="Send Message"], button[data-testid="send-button"]',
      getText(el) { return el.innerText.trim(); },
      setText(el, text) {
        el.focus();
        el.innerHTML = '';
        document.execCommand('insertText', false, text);
      },
    },
    'chat.openai.com': {
      inputSelector: '#prompt-textarea, textarea[data-id="root"]',
      sendSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
      getText(el) { return (el.value ?? el.innerText).trim(); },
      setText(el, text) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) { nativeSetter.call(el, text); } else { el.value = text; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
    },
    'chatgpt.com': {
      inputSelector: '#prompt-textarea, div[contenteditable="true"][id="prompt-textarea"]',
      sendSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
      getText(el) { return (el.value ?? el.innerText).trim(); },
      setText(el, text) {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (s) s.call(el, text); else el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.focus(); el.innerHTML = '';
          document.execCommand('insertText', false, text);
        }
      },
    },
    'gemini.google.com': {
      inputSelector: '.ql-editor, div[contenteditable="true"]',
      sendSelector: 'button.send-button, button[aria-label="Send message"]',
      getText(el) { return el.innerText.trim(); },
      setText(el, text) { el.focus(); el.innerHTML = ''; document.execCommand('insertText', false, text); },
    },
    'copilot.microsoft.com': {
      inputSelector: '#searchbox, textarea',
      sendSelector: 'button[aria-label="Submit"]',
      getText(el) { return (el.value ?? el.innerText).trim(); },
      setText(el, text) { el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); },
    },
  };

  function getSiteConfig() {
    const host = location.hostname;
    for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
      if (host.includes(domain.replace('www.', ''))) return config;
    }
    return null;
  }

  // ---- Sentence splitting ----
  function splitIntoSentences(text) {
    let raw = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 0);
    if (raw.length <= 1 && text.length > 100) {
      raw = text.split(/,\s+(?:and |but |so |then |because |or )?|;\s+/).map(s => s.trim()).filter(s => s.length > 0);
    }
    return raw;
  }

  // ---- Utility ----
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ============================================================
  // PHASE 1: Floating Mic Button
  // ============================================================

  function createMicButton() {
    const fab = document.createElement('button');
    fab.className = 'vp-mic-fab';
    fab.id = 'vp-mic-fab';
    fab.innerHTML = MIC_SVG;
    fab.title = 'Manifesto — Click to speak';
    fab.addEventListener('click', onMicClick);
    document.body.appendChild(fab);
  }

  function onMicClick() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // ============================================================
  // PHASE 2: Recording with Chrome Speech API
  // ============================================================

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Manifesto: Your browser does not support speech recognition. Please use Chrome.');
      return;
    }

    finalTranscript = '';
    interimTranscript = '';
    isRecording = true;

    // Update FAB
    const fab = document.getElementById('vp-mic-fab');
    fab.classList.add('recording');
    fab.innerHTML = STOP_SVG;
    fab.title = 'Click to stop recording';

    // Show listening overlay
    showListeningOverlay();

    // Start recognition
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      updateListeningTranscript();
    };

    recognition.onerror = (event) => {
      console.warn('Manifesto: Speech recognition error', event.error);
      if (event.error === 'no-speech') {
        // Keep going, user might just be pausing
        return;
      }
      stopRecording();
    };

    recognition.onend = () => {
      // If we're still supposed to be recording (continuous mode sometimes stops), restart
      if (isRecording) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };

    recognition.start();
  }

  function stopRecording() {
    isRecording = false;

    if (recognition) {
      recognition.onend = null; // prevent restart
      recognition.stop();
      recognition = null;
    }

    // Reset FAB
    const fab = document.getElementById('vp-mic-fab');
    fab.classList.remove('recording');
    fab.innerHTML = MIC_SVG;
    fab.title = 'Manifesto — Click to speak';

    // Remove listening overlay
    removeListeningOverlay();

    // If we got text, show the editor
    const text = (finalTranscript + interimTranscript).trim();
    if (text.length > 0) {
      sentences = splitIntoSentences(text);
      polishedText = '';
      activeTab = 'sentences';
      buildEditorOverlay();
    }
  }

  // ============================================================
  // Listening Overlay (live transcript while recording)
  // ============================================================

  function showListeningOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'vp-listen-overlay';
    overlay.id = 'vp-listen-overlay';

    overlay.innerHTML = `
      <div class="vp-listen-box">
        <div class="vp-waveform">
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
        </div>
        <div class="vp-listen-status">Listening...</div>
        <div class="vp-listen-hint">Speak naturally. Click stop or press Esc when done.</div>
        <div class="vp-listen-transcript" id="vp-live-transcript">
          <span style="color: var(--vp-text-faint); font-style: italic;">Waiting for speech...</span>
        </div>
        <div class="vp-listen-actions">
          <button class="vp-btn vp-btn-danger" id="vp-stop-btn">${STOP_SVG.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" width="14" height="14" style="fill:currentColor;margin-right:4px"')} Stop & Edit</button>
          <button class="vp-btn vp-btn-ghost" id="vp-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('vp-stop-btn').addEventListener('click', stopRecording);
    document.getElementById('vp-cancel-btn').addEventListener('click', () => {
      finalTranscript = '';
      interimTranscript = '';
      stopRecording();
    });

    // Esc to stop
    document.addEventListener('keydown', onListenKey);
  }

  function onListenKey(e) {
    if (e.key === 'Escape') {
      stopRecording();
    }
  }

  function removeListeningOverlay() {
    document.getElementById('vp-listen-overlay')?.remove();
    document.removeEventListener('keydown', onListenKey);
  }

  function updateListeningTranscript() {
    const el = document.getElementById('vp-live-transcript');
    if (!el) return;
    const final = escapeHtml(finalTranscript);
    const interim = escapeHtml(interimTranscript);
    el.innerHTML = final + (interim ? '<span class="interim">' + interim + '</span>' : '');
    el.scrollTop = el.scrollHeight;
  }

  // ============================================================
  // PHASE 3: Sentence Editor Overlay
  // ============================================================

  function buildEditorOverlay() {
    const backdrop = document.createElement('div');
    backdrop.className = 'vp-backdrop';
    backdrop.addEventListener('click', closeEditor);

    const modal = document.createElement('div');
    modal.className = 'vp-modal';
    modal.addEventListener('click', e => e.stopPropagation());

    modal.innerHTML = `
      <div class="vp-header">
        <h2>Manifesto <span class="vp-badge">${sentences.length} segments</span></h2>
        <button class="vp-close-btn" id="vp-close" title="Close (Esc)">✕</button>
      </div>
      <div class="vp-tabs">
        <button class="vp-tab active" data-tab="sentences">Edit Sentences</button>
        <button class="vp-tab" data-tab="polished">Polished Preview</button>
      </div>
      <div class="vp-body" id="vp-body"></div>
      <div class="vp-footer">
        <div class="vp-footer-left">
          <span class="vp-hint"><span class="vp-kbd">Esc</span> cancel &nbsp; Drag to reorder</span>
        </div>
        <div class="vp-footer-right">
          <button class="vp-btn vp-btn-polish" id="vp-polish">✦ Auto-Clean</button>
          <button class="vp-btn vp-btn-ghost" id="vp-ai-polish" title="Uses API key">AI Polish</button>
          <button class="vp-btn vp-btn-primary" id="vp-send">Send →</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    modal.querySelector('#vp-close').addEventListener('click', closeEditor);
    modal.querySelectorAll('.vp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        renderBody();
      });
    });

    modal.querySelector('#vp-polish').addEventListener('click', handleLocalPolish);
    modal.querySelector('#vp-ai-polish').addEventListener('click', handleAIPolish);
    modal.querySelector('#vp-send').addEventListener('click', handleSend);

    document.addEventListener('keydown', onEditorKey);
    renderBody();
  }

  function renderBody() {
    const body = document.getElementById('vp-body');
    if (!body) return;
    if (activeTab === 'sentences') renderSentences(body);
    else renderPolished(body);
  }

  function renderSentences(body) {
    body.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'vp-sentences';

    sentences.forEach((text, i) => {
      const chip = document.createElement('div');
      chip.className = 'vp-chip';
      chip.draggable = true;
      chip.dataset.index = i;

      chip.innerHTML = `
        <span class="vp-chip-num">${i + 1}</span>
        <span class="vp-chip-text" contenteditable="false">${escapeHtml(text)}</span>
        <span class="vp-chip-actions">
          <button class="vp-chip-btn clean" title="Auto-clean this sentence">✦</button>
          <button class="vp-chip-btn mic" title="Re-record this sentence">${MIC_SMALL_SVG}</button>
          <button class="vp-chip-btn edit" title="Edit">✎</button>
          <button class="vp-chip-btn delete" title="Delete">✕</button>
        </span>
      `;

      // Clean — run smart polish on just this sentence
      chip.querySelector('.clean').addEventListener('click', () => {
        const cleaned = smartLocalPolish(sentences[i]);
        sentences[i] = cleaned;
        polishedText = '';
        renderBody();
      });

      // Mic — record speech directly into this chip
      chip.querySelector('.mic').addEventListener('click', () => {
        startChipRecording(i, chip);
      });

      // Edit toggle
      chip.querySelector('.edit').addEventListener('click', () => {
        const span = chip.querySelector('.vp-chip-text');
        if (span.contentEditable === 'true') {
          span.contentEditable = 'false';
          chip.classList.remove('editing');
          sentences[i] = span.innerText.trim();
        } else {
          span.contentEditable = 'true';
          chip.classList.add('editing');
          span.focus();
          const range = document.createRange();
          range.selectNodeContents(span);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });

      // Enter to finish editing
      chip.querySelector('.vp-chip-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const span = chip.querySelector('.vp-chip-text');
          span.contentEditable = 'false';
          chip.classList.remove('editing');
          sentences[i] = span.innerText.trim();
        }
      });

      // Delete
      chip.querySelector('.delete').addEventListener('click', () => {
        sentences.splice(i, 1);
        polishedText = '';
        renderBody();
        updateBadge();
      });

      // Drag & drop
      chip.addEventListener('dragstart', (e) => { dragIdx = i; chip.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      chip.addEventListener('dragend', () => { chip.classList.remove('dragging'); dragIdx = null; document.querySelectorAll('.vp-chip').forEach(c => c.classList.remove('drag-over')); });
      chip.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; chip.classList.add('drag-over'); });
      chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        chip.classList.remove('drag-over');
        if (dragIdx !== null && dragIdx !== i) {
          const [moved] = sentences.splice(dragIdx, 1);
          sentences.splice(i, 0, moved);
          polishedText = '';
          renderBody();
        }
      });

      container.appendChild(chip);
    });

    // Add sentence buttons
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

    const addTypeBtn = document.createElement('button');
    addTypeBtn.className = 'vp-add-btn';
    addTypeBtn.style.cssText = 'flex:1;';
    addTypeBtn.innerHTML = '+ Type a sentence';
    addTypeBtn.addEventListener('click', () => {
      sentences.push('New sentence...');
      polishedText = '';
      renderBody();
      updateBadge();
      setTimeout(() => {
        const chips = document.querySelectorAll('.vp-chip');
        const last = chips[chips.length - 1];
        if (last) last.querySelector('.edit')?.click();
      }, 50);
    });

    const addSpeakBtn = document.createElement('button');
    addSpeakBtn.className = 'vp-add-btn';
    addSpeakBtn.style.cssText = 'flex:1;';
    addSpeakBtn.innerHTML = MIC_SMALL_SVG + ' Speak a sentence';
    addSpeakBtn.addEventListener('click', () => {
      sentences.push('');
      polishedText = '';
      renderBody();
      updateBadge();
      setTimeout(() => {
        const chips = document.querySelectorAll('.vp-chip');
        const last = chips[chips.length - 1];
        const idx = sentences.length - 1;
        if (last) startChipRecording(idx, last);
      }, 50);
    });

    addRow.appendChild(addTypeBtn);
    addRow.appendChild(addSpeakBtn);
    container.appendChild(addRow);
    body.appendChild(container);
  }

  // ---- Inline Chip Recording ----
  // Records speech into a specific sentence chip
  let chipRecognition = null;
  let chipRecordingIdx = null;
  let chipSilenceTimer = null;
  const SILENCE_TIMEOUT_MS = 2500; // auto-stop after 2.5s of silence

  function startChipRecording(idx, chipEl) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Manifesto: Speech recognition not supported in this browser.');
      return;
    }

    // If already recording into a chip, stop that first
    if (chipRecognition) {
      stopChipRecording();
    }

    chipRecordingIdx = idx;
    let chipFinal = '';
    let chipInterim = '';
    let hasGottenAnyResult = false;

    const textSpan = chipEl.querySelector('.vp-chip-text');
    const micBtn = chipEl.querySelector('.mic');

    // Visual feedback
    chipEl.classList.add('editing');
    chipEl.style.borderColor = 'var(--vp-danger)';
    chipEl.style.boxShadow = '0 0 0 1px var(--vp-danger), 0 0 16px rgba(248,113,113,0.1)';
    micBtn.innerHTML = STOP_SMALL_SVG;
    micBtn.title = 'Stop recording';
    micBtn.style.color = 'var(--vp-danger)';

    textSpan.innerHTML = '<span style="color:var(--vp-text-faint);font-style:italic">Listening... (auto-stops after pause)</span>';

    chipRecognition = new SpeechRecognition();
    chipRecognition.continuous = true;
    chipRecognition.interimResults = true;
    chipRecognition.lang = navigator.language || 'en-US';

    // Reset silence timer whenever we get new speech
    function resetSilenceTimer() {
      if (chipSilenceTimer) clearTimeout(chipSilenceTimer);
      // Only auto-stop if we've actually gotten some speech
      if (hasGottenAnyResult) {
        chipSilenceTimer = setTimeout(() => {
          finishChipRecording(idx, chipEl, chipFinal, chipInterim);
        }, SILENCE_TIMEOUT_MS);
      }
    }

    chipRecognition.onresult = (event) => {
      chipInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          chipFinal += transcript + ' ';
          hasGottenAnyResult = true;
        } else {
          chipInterim += transcript;
          hasGottenAnyResult = true;
        }
      }
      const displayFinal = escapeHtml(chipFinal);
      const displayInterim = escapeHtml(chipInterim);
      textSpan.innerHTML = displayFinal + (displayInterim ? '<span style="color:var(--vp-text-faint);font-style:italic">' + displayInterim + '</span>' : '');

      // Reset the silence auto-stop timer
      resetSilenceTimer();
    };

    chipRecognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      finishChipRecording(idx, chipEl, chipFinal, chipInterim);
    };

    chipRecognition.onend = () => {
      // If still supposed to be recording, restart (continuous mode can stop)
      if (chipRecognition && chipRecordingIdx === idx) {
        try { chipRecognition.start(); } catch (e) { /* ignore */ }
      }
    };

    chipRecognition.start();

    // Replace mic button click to stop manually
    const newMicBtn = micBtn.cloneNode(true);
    newMicBtn.innerHTML = STOP_SMALL_SVG;
    newMicBtn.style.color = 'var(--vp-danger)';
    newMicBtn.title = 'Stop recording';
    micBtn.parentNode.replaceChild(newMicBtn, micBtn);
    newMicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finishChipRecording(idx, chipEl, chipFinal, chipInterim);
    });
  }

  function finishChipRecording(idx, chipEl, chipFinal, chipInterim) {
    // Clear silence timer
    if (chipSilenceTimer) { clearTimeout(chipSilenceTimer); chipSilenceTimer = null; }

    if (chipRecognition) {
      chipRecognition.onend = null;
      chipRecognition.stop();
      chipRecognition = null;
    }

    const finalText = (chipFinal + chipInterim).trim();
    if (finalText.length > 0) {
      sentences[idx] = finalText;
    } else if (sentences[idx] === '') {
      // Empty recording on a new empty chip — remove it
      sentences.splice(idx, 1);
    }

    chipRecordingIdx = null;
    polishedText = '';
    renderBody();
    updateBadge();
  }

  function stopChipRecording() {
    if (chipSilenceTimer) { clearTimeout(chipSilenceTimer); chipSilenceTimer = null; }
    if (chipRecognition) {
      chipRecognition.onend = null;
      chipRecognition.stop();
      chipRecognition = null;
    }
    chipRecordingIdx = null;
  }

  function renderPolished(body) {
    body.innerHTML = '';
    if (polishedText) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:var(--vp-text-faint);margin-bottom:8px;';
      hint.textContent = 'Click below to edit the cleaned text before sending.';
      body.appendChild(hint);

      const div = document.createElement('div');
      div.className = 'vp-preview';
      div.contentEditable = 'true';
      div.style.cssText = 'outline:none;cursor:text;border:1px solid var(--vp-border);border-radius:var(--vp-radius);padding:12px 14px;min-height:60px;transition:border-color 0.15s;';
      div.textContent = polishedText;
      div.addEventListener('focus', () => {
        div.style.borderColor = 'var(--vp-accent)';
        div.style.boxShadow = '0 0 0 1px var(--vp-accent), 0 0 16px rgba(110,231,183,0.08)';
      });
      div.addEventListener('blur', () => {
        div.style.borderColor = 'var(--vp-border)';
        div.style.boxShadow = 'none';
        polishedText = div.innerText.trim();
      });
      body.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.className = 'vp-preview vp-preview-placeholder';
      div.textContent = 'Click "✦ Auto-Clean" to remove filler words, fix grammar, and merge fragments — no API needed.';
      body.appendChild(div);
    }
  }

  function updateBadge() {
    const badge = document.querySelector('.vp-badge');
    if (badge) badge.textContent = `${sentences.length} segments`;
  }

  // ---- Smart Local Polish (free, no API) ----

  // Filler words and phrases to remove
  const FILLERS = [
    // Single-word fillers
    'um', 'uh', 'uhh', 'umm', 'hmm', 'hm', 'er', 'ah', 'eh',
    // Multi-word fillers (order matters — longer first)
    'you know what I mean', 'if that makes sense', 'or something like that',
    'or whatever', 'and stuff like that', 'and things like that',
    'at the end of the day', 'to be honest', 'to be fair',
    'I would say', 'I guess',
    'you know', 'I mean', 'kind of', 'sort of', 'so yeah',
    'basically', 'literally', 'actually', 'obviously', 'honestly',
    'right so', 'okay so', 'so anyway', 'anyway so', 'but anyway',
    'like I said', 'as I said',
  ];

  // False starts: "I want to — I need to do X" → "I need to do X"
  function removeFalseStarts(text) {
    // Pattern: repeated subject with different verb → keep the last one
    // "I want to I need to" → "I need to"
    // "we should we could" → "we could"
    return text.replace(
      /\b(I|we|you|they|he|she|it)\s+\w+\s+(?:to\s+)?(?:—|--|-|,)?\s*\1\s+/gi,
      (match, subject) => subject + ' '
    );
  }

  // Remove duplicate/near-duplicate phrases
  function removeRepetition(text) {
    const words = text.split(/\s+/);
    const result = [];
    let i = 0;

    while (i < words.length) {
      // Check for repeated phrases of length 2-6
      let foundRepeat = false;
      for (let len = 6; len >= 2; len--) {
        if (i + len * 2 > words.length) continue;
        const phrase1 = words.slice(i, i + len).join(' ').toLowerCase();
        const phrase2 = words.slice(i + len, i + len * 2).join(' ').toLowerCase();
        if (phrase1 === phrase2) {
          // Keep only one copy
          result.push(...words.slice(i, i + len));
          i += len * 2;
          foundRepeat = true;
          break;
        }
      }
      if (!foundRepeat) {
        result.push(words[i]);
        i++;
      }
    }
    return result.join(' ');
  }

  // Fix punctuation
  function fixPunctuation(text) {
    let t = text;

    // Remove orphan punctuation
    t = t.replace(/\s+([.,!?;:])/g, '$1');

    // Ensure space after punctuation
    t = t.replace(/([.,!?;:])([A-Za-z])/g, '$1 $2');

    // Remove double punctuation
    t = t.replace(/([.!?])\1+/g, '$1');
    t = t.replace(/[,;:]\s*([.!?])/g, '$1');

    // Capitalize after sentence-ending punctuation
    t = t.replace(/([.!?])\s+([a-z])/g, (_, p, c) => p + ' ' + c.toUpperCase());

    // Capitalize first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);

    // Ensure ends with punctuation
    t = t.trim();
    if (t.length > 0 && !/[.!?]$/.test(t)) {
      t += '.';
    }

    return t;
  }

  // Merge short fragments that should be one sentence
  function mergeFragments(sents) {
    if (sents.length <= 1) return sents;
    const merged = [];
    let buffer = '';

    for (const s of sents) {
      const trimmed = s.trim();
      if (!trimmed) continue;

      // If this fragment is very short (< 5 words) and doesn't end with punctuation,
      // it's probably a fragment — attach it to the buffer
      const wordCount = trimmed.split(/\s+/).length;
      const endsWithPunct = /[.!?]$/.test(trimmed);

      if (wordCount < 5 && !endsWithPunct && buffer.length > 0) {
        buffer += ', ' + trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
      } else if (buffer.length > 0 && wordCount < 4 && !endsWithPunct) {
        buffer += ' ' + trimmed;
      } else {
        if (buffer) merged.push(buffer);
        buffer = trimmed;
      }
    }
    if (buffer) merged.push(buffer);
    return merged;
  }

  // Remove hedging/softening words at sentence start that add no meaning
  function removeHedging(text) {
    const hedges = [
      /^(so,?\s+)/i,
      /^(well,?\s+)/i,
      /^(okay,?\s+)/i,
      /^(ok,?\s+)/i,
      /^(right,?\s+)/i,
      /^(yeah,?\s+)/i,
      /^(yes,?\s+so,?\s+)/i,
      /^(no,?\s+but,?\s+)/i,
      /^(and,?\s+)/i,
      /^(but,?\s+like,?\s+)/i,
    ];
    let t = text;
    for (const h of hedges) {
      t = t.replace(h, '');
    }
    // Re-capitalize
    if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  }

  function smartLocalPolish(text) {
    let t = text;

    // 1. Remove filler words/phrases (longer phrases first)
    for (const filler of FILLERS) {
      // Match filler as whole word/phrase, optionally followed by comma
      const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b,?\\s*', 'gi');
      t = t.replace(regex, ' ');
    }

    // 2. Remove "like" when used as filler (not "I like X" or "looks like")
    // Heuristic: "like" preceded by a comma or space+verb is filler
    t = t.replace(/,\s*like,?\s+/gi, ', ');
    t = t.replace(/\s+like\s+(a|an|the|maybe|probably|I|we|you|some|three|two|four|five)\b/gi, ' $1');

    // 3. Remove false starts
    t = removeFalseStarts(t);

    // 4. Remove repeated phrases
    t = removeRepetition(t);

    // 5. Collapse multiple spaces
    t = t.replace(/\s{2,}/g, ' ').trim();

    // 6. Split into sentences, merge fragments, then rejoin
    let sents = t.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    if (sents.length <= 1 && t.length > 80) {
      sents = t.split(/,\s+(?:and then |and |but |so |then |because )/).map(s => s.trim()).filter(s => s.length > 0);
    }
    sents = mergeFragments(sents);

    // 7. Remove hedging from each sentence start
    sents = sents.map(s => removeHedging(s));

    // 8. Rejoin and fix punctuation
    t = sents.join('. ');
    t = fixPunctuation(t);

    // 9. Final cleanup
    t = t.replace(/\s{2,}/g, ' ').trim();

    return t;
  }

  // ---- Handle Local Polish (primary, free) ----
  function handleLocalPolish() {
    const btn = document.getElementById('vp-polish');
    if (sentences.length === 0) return;

    // Commit in-progress edits
    document.querySelectorAll('.vp-chip-text[contenteditable="true"]').forEach((span, i) => {
      if (sentences[i] !== undefined) {
        sentences[i] = span.innerText.trim();
        span.contentEditable = 'false';
      }
    });

    const raw = sentences.join(' ');
    polishedText = smartLocalPolish(raw);

    // Switch to polished tab
    document.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.vp-tab[data-tab="polished"]').classList.add('active');
    activeTab = 'polished';
    renderBody();
  }

  // ---- Handle AI Polish (optional, needs API key) ----
  async function handleAIPolish() {
    const btn = document.getElementById('vp-ai-polish');
    if (isPolishing || sentences.length === 0) return;
    isPolishing = true;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.innerHTML = '<span class="vp-spinner"></span> …';

    // Commit in-progress edits
    document.querySelectorAll('.vp-chip-text[contenteditable="true"]').forEach((span, i) => {
      if (sentences[i] !== undefined) {
        sentences[i] = span.innerText.trim();
        span.contentEditable = 'false';
      }
    });

    const raw = sentences.join(' ');

    try {
      polishedText = await polishWithAPI(raw);
    } catch (err) {
      console.warn('Manifesto: AI polish failed, falling back to local', err);
      polishedText = smartLocalPolish(raw);
    }

    isPolishing = false;
    btn.disabled = false;
    btn.textContent = origText;

    // Switch to polished tab
    document.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.vp-tab[data-tab="polished"]').classList.add('active');
    activeTab = 'polished';
    renderBody();
  }

  async function polishWithAPI(text) {
    const apiKey = await new Promise(resolve => {
      try {
        chrome.storage.sync.get(['voicePolish_apiKey'], (data) => {
          resolve(data.voicePolish_apiKey || '');
        });
      } catch { resolve(''); }
    });

    if (!apiKey) throw new Error('No API key configured');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a speech-to-text editor. The user spoke the following text aloud, and it was transcribed. Your job is to restructure it into clean, well-written text that preserves the user's EXACT meaning and intent. Rules:
- Fix grammar, remove filler words (um, uh, like, you know, basically, so yeah)
- Remove repetition and circular phrasing
- Restructure into clear, logical sentences
- Do NOT add new ideas or change the meaning
- Do NOT make it more formal than the speaker intended
- Keep the person's voice and style
- Return ONLY the polished text, nothing else`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    return data.content.map(b => b.text || '').join('').trim();
  }

  // ---- Send to Chat ----
  function handleSend() {
    const config = getSiteConfig();
    if (!config) { closeEditor(); return; }

    // Grab latest text from the editable polished preview if it exists
    const editablePreview = document.querySelector('.vp-preview[contenteditable="true"]');
    if (editablePreview) {
      polishedText = editablePreview.innerText.trim();
    }

    const finalText = polishedText || sentences.join(' ');
    const input = document.querySelector(config.inputSelector);
    if (!input) { closeEditor(); return; }

    config.setText(input, finalText);
    closeEditor();

    setTimeout(() => {
      const sendBtn = document.querySelector(config.sendSelector);
      if (sendBtn) sendBtn.click();
    }, 250);
  }

  // ---- Close Editor ----
  function closeEditor() {
    document.querySelector('.vp-backdrop')?.remove();
    document.querySelector('.vp-modal')?.remove();
    document.removeEventListener('keydown', onEditorKey);
    sentences = [];
    polishedText = '';
    activeTab = 'sentences';
  }

  function onEditorKey(e) {
    if (e.key === 'Escape') closeEditor();
  }

  // ============================================================
  // Init
  // ============================================================

  function init() {
    const config = getSiteConfig();
    if (!config) {
      console.log('Manifesto: site not supported');
      return;
    }

    console.log('Manifesto: active on', location.hostname);
    createMicButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
