const OpenAI = require('openai');
require('dotenv').config();

const client = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

function exponentialBackoff(attempt) {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = delay * 0.3 * Math.random();
  return delay + jitter;
}

async function chat(messages, options = {}) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params = {
        model: 'qwen-plus',
        messages,
        temperature: options.temperature || 0.7,
      };
      if (options.tools) params.tools = options.tools;
      if (options.tool_choice) params.tool_choice = options.tool_choice;
      if (options.response_format) params.response_format = options.response_format;

      const response = await client.chat.completions.create(params);
      const message = response.choices[0].message;
      message.usage = response.usage;
      return message;
    } catch (error) {
      console.error(`LLM call failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, error.message);

      if (attempt === MAX_RETRIES) {
        if (options.tools) {
          console.warn('Fallback: skipping tools, direct reply');
          const fallback = await client.chat.completions.create({
            model: 'qwen-plus',
            messages: messages.filter(m => m.role !== 'tool'),
            temperature: options.temperature || 0.7,
          });
          return fallback.choices[0].message;
        }
        throw error;
      }

      await new Promise(r => setTimeout(r, exponentialBackoff(attempt)));
    }
  }
}

async function chatStream(messages, options = {}) {
  return client.chat.completions.create({
    model: 'qwen-plus',
    messages,
    stream: true,
    temperature: options.temperature || 0.7,
  });
}

module.exports = { chat, chatStream };
