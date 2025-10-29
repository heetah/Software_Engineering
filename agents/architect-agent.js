import BaseAgent from "./agent-base.js";

export default class ArchitectAgent extends BaseAgent {
  constructor() {
    super("Architect Agent", "JSON", "architect");
  }

  prompt(requirementOutput) {
    return `
Based on the following requirement specification, generate a detailed system architecture:
${requirementOutput}

Output JSON with:
{
  "modules": [],
  "api_routes": [],
  "database_schema": [],
  "tech_stack": [],
  "integration_points": []
}`;
  }
}
