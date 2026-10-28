/**
 * Prints an AUTH_USERS entry for a new user:
 *   npm run hash-password -w @jelph/api -- <username>
 * The password is read from the terminal, so it never ends up in shell history.
 */
import { createInterface } from "node:readline";
import { hashPassword } from "./auth.js";

const username = process.argv[2]?.trim().toLowerCase();
if (!username || !/^[a-z0-9_-]+$/.test(username)) {
  console.error("Usage: npm run hash-password -w @jelph/api -- <username>");
  console.error("Username: lowercase letters, digits, '-' or '_'.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Hide typed characters; prompts are written directly to stdout.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const { value } = await lines.next();
  process.stdout.write("\n");
  return value ?? "";
}

const password = await ask("Wachtwoord: ");
const repeated = await ask("Nogmaals: ");
rl.close();
if (password.length < 10) {
  console.error("Kies een wachtwoord van minimaal 10 tekens.");
  process.exit(1);
}
if (repeated !== password) {
  console.error("Wachtwoorden komen niet overeen.");
  process.exit(1);
}

console.log(`\nVoeg toe aan AUTH_USERS (gescheiden door komma's):\n${username}:${await hashPassword(password)}`);
