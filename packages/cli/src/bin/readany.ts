import { runCommand, parseCommand } from "../commands.js";
import { formatJson, formatText } from "../format.js";

const parsed = parseCommand(process.argv.slice(2));

if (parsed.name === "mcp" && parsed.args[0] === "serve") {
  const { serveMcp } = await import("../mcp.js");
  await serveMcp(parsed.profile);
} else {
  const result = await runCommand(process.argv.slice(2));
  const output = parsed.json ? formatJson(result) : formatText(result);

  if (result.ok) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}
