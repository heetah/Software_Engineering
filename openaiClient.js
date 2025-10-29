const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  /*const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return client;*/

  const client = new OpenAI({
    apiKey,
    baseURL: "http://140.123.105.199:32768/v1" || undefined,
  });
  return client;
}

async function chatCompletion({ messages, model, temperature }) {
  const client = createClient();
  const res = await client.chat.completions.create({
    model: "Qwen2.5-Coder-7B-Instruct",
    //model: model || process.env.MODEL_CHAT || 'gpt-4o-mini',
    temperature: typeof temperature === 'number' ? temperature : Number(process.env.TEMPERATURE || 0.2),
    messages,
    response_format: { type: 'json_object' },
  });

  const choice = res.choices?.[0];
  const content = choice?.message?.content || '';
  return {
    text: content,
    usage: res.usage || null,
    raw: res,
  };
}

module.exports = {
  chatCompletion,
};

