# Testing Pipeline (Verified + Tester Agents)

This repository now includes an automated testing pipeline that:

- Builds a normalized summary from outputs of Requirement and Coder agents (Verified Agent)
- Generates a JSON test plan (`outputs/test-plan.json`)
- Produces Jest tests from the plan (`tests/generated_from_plan.test.js`)
- Runs tests and writes a results report (`outputs/Test_Report.json`)

## Quick start

- Ensure `outputs/Requirement_Agent.txt` and `outputs/Coder_Agent.txt` exist (they are created by their respective agents).
- Run the pipeline:

```powershell
npm run test:pipeline
```

Artifacts:
- `outputs/verified-summary.json` – normalized features/components/routes
- `outputs/test-plan.json` – generated test plan
- `tests/generated_from_plan.test.js` – Jest tests generated from the plan
- `outputs/jest-results.json` – raw Jest output
- `outputs/Test_Report.json` – concise analysis summary

## Notes
- The existing `TesterAgent.prompt(...)` functionality remains for LLM-based test generation and is still covered by `tests/tester-agent.test.js`.
- UI/component tests avoid React rendering to keep the environment simple; they validate project structure and static content. You can extend the pipeline to include jsdom and React Testing Library if desired.
