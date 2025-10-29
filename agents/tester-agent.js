import BaseAgent from "./agent-base.js";

export default class TesterAgent extends BaseAgent {
  constructor() {
    super("Tester Agent", "Markdown code", "tester");
  }

  prompt(coderOutput) {
    return `
Write automated tests for the following code:
${coderOutput}

Output unit tests or integration test scripts.`;
  }
}
