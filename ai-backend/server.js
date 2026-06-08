import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ── API Config ──────────────────────────────────────────────────────────────
// Uses OpenRouter with a FREE model — no credits needed, just a free API key.
// Get yours at: https://openrouter.ai/settings/keys (no credit card required)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
// Free model fallback chain — tries each in order until one responds
// Updated June 2026 — verified stable free models on OpenRouter
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

// In-memory session store
const sessions = new Map();

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      messages: [],
      createdAt: new Date().toISOString()
    });
  }
  return sessions.get(sessionId);
}

// POST /chat - main chat endpoint
app.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const session = getOrCreateSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  try {
    let assistantMessage = null;
    let lastError = null;

    for (const model of FREE_MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai-daju.local',
            'X-Title': 'Ai Daju - Personal Big Brother Chatbot'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: BIG_BROTHER_SYSTEM_PROMPT },
              ...session.messages
            ],
            max_tokens: 1024,
            temperature: 0.85
          })
        });
        const data = await response.json();
        if (!response.ok) {
          const errMsg = data.error?.message || `API error: ${response.status}`;
          if (errMsg.includes('unavailable') || errMsg.includes('free') || response.status === 503 || response.status === 429) {
            lastError = new Error(errMsg);
            continue; // try next model
          }
          throw new Error(errMsg);
        }
        assistantMessage = data.choices?.[0]?.message?.content;
        if (assistantMessage) break;
      } catch (e) {
        lastError = e;
        if (e.message?.includes('unavailable') || e.message?.includes('free')) continue;
        throw e;
      }
    }

    if (!assistantMessage) throw lastError || new Error('All free models unavailable');

    if (!assistantMessage) {
      throw new Error('No response from model');
    }

    session.messages.push({ role: 'assistant', content: assistantMessage });

    res.json({
      reply: assistantMessage,
      sessionId,
      messageCount: session.messages.length
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message || 'Something went wrong. Try again!' });
  }
});

// POST /chat/stream - streaming endpoint using SSE
app.post('/chat/stream', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const session = getOrCreateSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-daju.local',
        'X-Title': 'Ai Daju - Personal Big Brother Chatbot'
      },
      body: JSON.stringify({
        model: FREE_MODELS[0],
        messages: [
          { role: 'system', content: BIG_BROTHER_SYSTEM_PROMPT },
          ...session.messages
        ],
        max_tokens: 1024,
        temperature: 0.85,
        stream: true
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      res.write(`data: ${JSON.stringify({ error: errData.error?.message || 'API error' })}\n\n`);
      return res.end();
    }

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              res.write(`data: ${JSON.stringify({ delta, accumulated: fullText })}\n\n`);
            }
          } catch (_) {}
        }
      }
    }

    session.messages.push({ role: 'assistant', content: fullText });
    res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// DELETE /chat/history - clear session
app.delete('/chat/history', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions.delete(sessionId);
  res.json({ success: true, message: 'Chat history cleared' });
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'Ai Daju Backend', sessions: sessions.size });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤝 Ai Daju backend running on http://localhost:${PORT}`);
  console.log(`   Your AI big brother is ready to help!`);
});