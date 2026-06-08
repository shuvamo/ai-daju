// ─────────────────────────────────────────────
//  Ai Daju — Personal Big Brother Chat Script
//  Powered by OpenRouter FREE models — zero credits needed!
// ─────────────────────────────────────────────

const OPENROUTER_API_KEY = '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';

// Free model chain — updated June 2026, tries each in order until one works
const FREE_MODELS = [
  'openrouter/owl-alpha',                        // OpenRouter's own — always available, never removed
  'nvidia/nemotron-3-super-120b-a12b:free',      // NVIDIA free — 1M context, very reliable
  'openai/gpt-oss-120b:free',                    // OpenAI open-weight free tier
  'nvidia/nemotron-3-ultra-550b-a55b:free',      // NVIDIA Ultra — strong fallback
  'openrouter/free',                             // Auto-router — always picks an available free model
];

const BIG_BROTHER_SYSTEM_PROMPT = `You are Ai Daju — the user's personal AI big brother. "Daju" means "big brother" in Nepali, and that's exactly who you are.

Your personality:
- Warm, caring, and genuinely invested in the user's wellbeing — like a protective older sibling
- Honest and direct — you tell it like it is, but always with love and respect
- Encouraging and motivating — you believe in them even when they doubt themselves
- Wise but approachable — you give real, practical advice, not generic platitudes
- Playful and funny — you tease a little, like a real big brother would
- Protective — if they're making a bad decision, you speak up (kindly but firmly)
- You remember context within the conversation and refer back to it naturally

Language & Communication Style — VERY IMPORTANT:
You speak in a natural mix of Nepali Roman (romanized Nepali) and English, exactly like Nepali young people type on social media (Facebook, Instagram, TikTok comments, Viber, WhatsApp). This is called "Roman Nepali" or "Nepali-English code-switching."

Use these naturally and freely throughout your replies:
- Greetings: "oii", "oi bhai", "yo ke ho", "haiii", "hay"
- How are you / I'm fine: "sanchai xu?", "ma sanchai xu", "k xa?", "thikai xu"
- Reactions: "hahaha", "lol", "ahahaha", "arey", "arre yaar", "wah", "waah bhai"
- Agreement/OK: "ho ni", "thik xa", "sahi xa", "exactly", "sahi bhanyo"
- Surprise/shock: "ke?!", "seriously?", "sacchai?", "no way bhai", "k bhayo?"
- Encouragement: "garna sakxas", "timi best xau", "proud xu ma timile", "jaa bhai jaa"
- Endearments: "bhai", "bahini", "yaar", "dost", "dai" (if user is older)
- Common phrases: "ramro xa", "kasto ramro", "dherai ramro", "ali ali", "ekdam", "purai"
- Questions: "k sochxas?", "k garxas?", "kasari xa life?", "ke bhairako xa?"
- Support: "tension nali", "chinta nagarnu", "hunxa hunxa", "hami xu ni"
- Fun/teasing: "haha dherai serious nabana bhai", "yo timi matra garchhau", "ahahaha bakwaas"
- Farewell: "thik xa bhai", "huss", "okay ta", "bye bhai", "take care hai"

Rules for mixing languages:
1. Write mostly in conversational English for the main advice/content so it's easy to understand
2. Sprinkle Nepali Roman naturally at the START (greeting), MIDDLE (reactions), and END (closing) of messages
3. Never write a full paragraph in Nepali — mix it in like people do on social media
4. When the user writes in Nepali Roman, mirror their energy and use MORE Nepali in reply
5. Keep it natural — don't force every sentence to have Nepali, just where it feels real
6. Use lowercase casually like social media typing — "ma sanchai xu" not "Ma Sanchai Xu"

Example style:
"oii bhai, k bhayo? tension nagarnu — I've got you! Timi capable xu, seriously. Just take it one step at a time, hunxa? What's really going on — tell me everything! 😄"

Your core mission: Be the big brother everyone deserves — someone who listens, guides, supports, and occasionally gives a gentle reality check. You are not just an AI; you are family. Hajur ko daju always here! 💪`;

// ── State ─────────────────────────────────────
let isLoading = false;
let messageHistory = [];
let activeModel = FREE_MODELS[0];

// ── DOM refs ──────────────────────────────────
const chatMessages    = document.getElementById('chatMessages');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const clearBtn        = document.getElementById('clearBtn');
const typingIndicator = document.getElementById('typingIndicator');
const charCount       = document.getElementById('charCount');
const statusDot       = document.getElementById('statusDot');
const statusText      = document.getElementById('statusText');

// ── Boot ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setStatus('online', 'Free · No Credits Needed');
  loadFromLocalStorage();

  userInput.addEventListener('input', onInputChange);
  userInput.addEventListener('keydown', onKeyDown);
  sendBtn.addEventListener('click', sendMessage);
  clearBtn.addEventListener('click', clearChat);

  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      userInput.value = chip.dataset.msg || chip.textContent.trim();
      onInputChange();
      userInput.focus();
    });
  });

  if (messageHistory.length === 0) {
    setTimeout(() => addMessage('assistant', getGreeting()), 600);
  }
});

// ── Status ────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = text;
}

// ── Input ─────────────────────────────────────
function onInputChange() {
  const len = userInput.value.length;
  charCount.textContent = len + '/500';
  charCount.style.color = len > 450 ? '#ef4444' : len > 350 ? '#f59e0b' : '';
  sendBtn.disabled = len === 0 || isLoading;
  autoResize(userInput);
}

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ── Send ──────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  setLoading(true);
  userInput.value = '';
  userInput.style.height = 'auto';
  charCount.textContent = '0/500';

  addMessage('user', text);
  showTyping();
  messageHistory.push({ role: 'user', content: text });

  try {
    const reply = await callWithFallback();
    hideTyping();
    addMessage('assistant', reply, true);
    messageHistory.push({ role: 'assistant', content: reply });
    saveToLocalStorage();
  } catch (err) {
    hideTyping();
    messageHistory.pop();
    addMessage('assistant', getErrorMessage(err.message), false, true);
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ── OpenRouter with fallback chain ────────────
async function callWithFallback() {
  const errors = [];

  for (const model of FREE_MODELS) {
    try {
      const reply = await callOpenRouter(model);
      activeModel = model;
      setStatus('online', `Free · ${model.split('/')[1]?.split(':')[0] || 'model'}`);
      return reply;
    } catch (err) {
      console.warn(`Model ${model} failed:`, err.message);
      errors.push(`${model}: ${err.message}`);
      // always try next model regardless of error type
      continue;
    }
  }

  // All models failed — throw with full detail
  throw new Error(errors.join(' | '));
}

async function callOpenRouter(model) {
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-daju.local',
        'X-Title': 'Ai Daju'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: BIG_BROTHER_SYSTEM_PROMPT },
          ...messageHistory
        ],
        max_tokens: 1024,
        temperature: 0.85
      })
    });
  } catch (networkErr) {
    throw new Error(`Network error — check your internet connection`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('Empty response from model');
  return reply;
}

// ── Render ────────────────────────────────────
function addMessage(role, content, animate = false, isError = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}${isError ? ' error' : ''}`;
  if (animate) { wrapper.style.opacity = '0'; wrapper.style.transform = 'translateY(10px)'; }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'assistant' ? formatMessage(content) : escapeHtml(content);

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = formatTime(new Date());

  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);
  chatMessages.insertBefore(wrapper, typingIndicator);

  if (animate) {
    requestAnimationFrame(() => {
      wrapper.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'translateY(0)';
    });
  }
  scrollToBottom();
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatMessage(text) {
  text = escapeHtml(text);
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Typing indicator ──────────────────────────
function showTyping() { typingIndicator.style.display = 'flex'; scrollToBottom(); }
function hideTyping()  { typingIndicator.style.display = 'none'; }

// ── Clear ─────────────────────────────────────
async function clearChat() {
  if (!confirm('Clear all messages? Daju will start fresh!')) return;
  chatMessages.innerHTML = '';
  chatMessages.appendChild(typingIndicator);
  messageHistory = [];
  localStorage.removeItem('aidaju_history');
  setTimeout(() => addMessage('assistant', getGreeting()), 300);
}

// ── Persistence ───────────────────────────────
function saveToLocalStorage() {
  try { localStorage.setItem('aidaju_history', JSON.stringify(messageHistory.slice(-40))); } catch(_) {}
}
function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('aidaju_history');
    if (!saved) return;
    const h = JSON.parse(saved);
    if (!Array.isArray(h) || !h.length) return;
    messageHistory = h;
    h.forEach(msg => addMessage(msg.role, msg.content));
  } catch(_) {}
}

// ── Helpers ───────────────────────────────────
function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;
  userInput.disabled = state;
  sendBtn.innerHTML = state
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .8s linear infinite;transform-origin:center"><circle cx="12" cy="12" r="9" stroke-dasharray="50" stroke-dashoffset="20"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
}

function scrollToBottom() {
  requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
}

function getGreeting() {
  const h = new Date().getHours();
  const time = h < 5 ? 'Hey night owl! 🌙' : h < 12 ? 'Good morning! ☀️' : h < 17 ? 'Good afternoon! 🌤️' : h < 21 ? 'Good evening! 🌆' : 'Hey! 👋';
  return `${time} I'm **Ai Daju** — your personal big brother AI! 💪\n\nI'm here to listen, advise, motivate, and occasionally give you that reality check you might need (but with love, bhai! 😄).\n\nWhat's on your mind today? Tell me anything — work, life, goals, struggles — I've got time for you.`;
}

function getErrorMessage(msg) {
  console.error('Daju error:', msg); // always log full error

  if (msg.includes('Network error') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return `oii bhai — internet connection ma samasya xa jasto lagxa! 🌐 Check your WiFi/data and try again. Ma yahii xu! 🤝`;
  }
  if (msg.includes('401') || msg.includes('Invalid API key') || msg.includes('No auth')) {
    return `API key issue bhai! 🔑 The OpenRouter key might be expired or invalid. Get a fresh one free at openrouter.ai/settings/keys and update it in script.js`;
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return `Ahahaha bhai ekdum busy xu ma aajha! 😄 Rate limit hit garyo — 20 requests/min free ma hunxa. Ek chhin wait gara ani try gara, hunxa? 🙏`;
  }
  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('All free models')) {
    return `Oii, sabai free models busy xu abhi! 😅 Yo OpenRouter ko free tier ho — ali ali wait gara ani pheri try gara bhai. Hunxa hunxa! 💪`;
  }
  if (msg.includes('credits') || msg.includes('billing') || msg.includes('payment')) {
    return `Credits issue bhai! This model needs payment. Tara tension nali — script.js ma FREE_MODELS list xa, tyo free models matra use garxa. Page refresh gara once! 🔄`;
  }
  // Show actual error so user/dev can debug
  return `Oii kasto bho — error ayeko xa: "${msg.slice(0, 120)}". Console hernu (F12) for full details. Ek chhin wait gari retry gara bhai! 💪`;
}

const s = document.createElement('style');
s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(s);