const { chatCompletion } = require('../lib/openaiClient');

const SYSTEM_PROMPT = `
You are the Architect Agent for an Electron.js + Node.js multi-agent application.

Your primary job:
- Translate high-level goals into explicit, actionable instructions directed at the Coder Agent.
- Produce a precise, implementable plan and a clear "handoff" message that tells the Coder Agent exactly what to do next.
- Keep scope focused on Backend(1): GPT integration, Architect Agent behavior, and dev-process command generation.

Output JSON schema:
{
  "coder_instructions": {
    "role": "Coder Agent",
    "summary": string,
    "directives": [
      { "do": string, "why": string }
    ],
    "files": [
      { "path": string, "purpose": string, "template": string | null }
    ],
    "commands": string[],
    "acceptance": string[],
    "notes": string[]
  },
  "plan": {
    "title": string,
    "summary": string,
    "steps": [
      {
        "id": string,
        "title": string,
        "description": string,
        "commands": string[],
        "artifacts": string[],
        "acceptance": string[]
      }
    ]
  },
  "markdown": string
}

Rules:
- Return ONLY a JSON object matching the schema (no extra prose).
- "coder_instructions" must be written as imperative tasks for the Coder Agent.
- Prefer concrete file paths, minimal templates, and runnable commands.
- Keep acceptance criteria testable and unambiguous.
- Include environment scaffolding (e.g., package.json, env files, local database stubs) whenever execution requires it and list commands to set it up.
- "markdown" should be a concise handoff addressed to the Coder Agent summarizing what to implement now.
 - Mirror the user's request language when possible; otherwise use English.
`;

class ArchitectAgent {
  constructor(options = {}) {
    this.model = options.model || process.env.MODEL_CHAT || 'gpt-4o-mini';
    this.temperature = typeof options.temperature === 'number' ? options.temperature : Number(process.env.TEMPERATURE || 0.2);
  }

  async generatePlan({ prompt, context }) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          goal: prompt,
          context: context || null,
          constraints: {
            language: 'JavaScript (Node.js)',
            storage: 'Local JSON / files',
            apis: ['OpenAI API'],
          }
        })
      },
    ];

    const { text, usage } = await chatCompletion({ messages, model: this.model, temperature: this.temperature });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = {
        plan: {
          title: 'Architect Plan',
          summary: 'Failed to parse model output; returning raw content in markdown.',
          steps: []
        },
        markdown: '```\n' + text + '\n```'
      };
    }

    return { ...parsed, usage };
  }

  async refinePlan({ previous, feedback }) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(previous) },
      { role: 'user', content: JSON.stringify({ feedback }) },
    ];

    const { text, usage } = await chatCompletion({ messages, model: this.model, temperature: this.temperature });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = {
        plan: previous.plan,
        markdown: previous.markdown + "\n\n---\nRefine (raw):\n\n```\n" + text + "\n```\n",
      };
    }
    return { ...parsed, usage };
  }
}

module.exports = ArchitectAgent;
