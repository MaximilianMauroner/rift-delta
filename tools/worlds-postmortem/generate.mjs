import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templateDirectory = new URL("./templates/", import.meta.url);
const outputDirectory = new URL(
  "../../.agents/artifacts/design/worlds-postmortem/",
  import.meta.url,
);
const definitions = [
  {
    id: "A",
    label: "Team report cards",
    model: "Claude Opus 5.5",
    template: "lineup.html",
    artifact: "a-team-report.html",
    description: "Find each team's best and lowest player at a glance.",
  },
  {
    id: "B",
    label: "Outlier map",
    model: "GPT-6.1 Terra",
    template: "outliers.html",
    artifact: "b-outlier-map.html",
    description: "Compare all ten players on one score scale.",
  },
  {
    id: "C",
    label: "Guided recap",
    model: "DeepSeek V4.1 Flash Free",
    template: "recap.html",
    artifact: "c-guided-recap.html",
    description: "Read the team story, then inspect the players behind it.",
  },
];

await mkdir(outputDirectory, { recursive: true });
const concepts = {};
for (const definition of definitions) {
  const html = await readFile(
    new URL(definition.template, templateDirectory),
    "utf8",
  );
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)[1];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  concepts[definition.id] = {
    label: definition.label,
    model: definition.model,
    description: definition.description,
    styles: [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((match) => match[1])
      .join("\n"),
    body: body.replace(scriptPattern, ""),
    script: [...body.matchAll(scriptPattern)]
      .map((match) => match[1])
      .join("\n"),
  };
  await writeFile(new URL(definition.artifact, outputDirectory), html);
}

const initialNode = "A";
const replacements = {
  STYLE: concepts[initialNode].styles,
  DESCRIPTION: concepts[initialNode].description,
  BODY: concepts[initialNode].body,
  DATA: JSON.stringify(concepts).replaceAll("<", "\\u003c"),
  FIRSTKEY: initialNode,
  BUTTONS: definitions
    .map(
      ({ id, label, model }) => `
    <button type="button" class="review-choice" data-review-node="${id}" aria-pressed="${id === initialNode}">
      <strong>${id} &nbsp; ${label}</strong><span>${model}</span>
    </button>`,
    )
    .join(""),
  BRANCHES: definitions
    .map(
      ({ id, label }) => `
    <button type="button" data-review-node="${id}">${id} &nbsp; ${label}</button>`,
    )
    .join(""),
};
const template = await readFile(
  new URL("comparison.html", templateDirectory),
  "utf8",
);
const comparison = template.replace(
  /\{\{(\w+)\}\}/g,
  (_, key) => replacements[key],
);
const output = new URL("review.html", outputDirectory);
await writeFile(output, comparison);
process.stdout.write(`${fileURLToPath(output)}\n`);
