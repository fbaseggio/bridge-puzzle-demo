/// <reference types="node" />

import { demoProblems } from '../demo/problems';

type Request = { id: string };

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const req = JSON.parse(raw) as Request;
    const found = demoProblems.find((p) => p.id === req.id);
    if (!found) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message: `Unknown problem id: ${req.id}` } })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, problem: found.problem })}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`
    );
  }
}

void main();
