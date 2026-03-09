/// <reference types="node" />

import { executePolicyRequest, type PolicyCliRequest } from './policy_io';

async function main(): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as PolicyCliRequest;
        process.stdout.write(`${JSON.stringify(executePolicyRequest(req))}\n`);
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({
            schemaVersion: 1,
            policyVersion: 1,
            ok: false,
            error: { message: error instanceof Error ? error.message : String(error) }
          })}\n`
        );
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      const req = JSON.parse(tail) as PolicyCliRequest;
      process.stdout.write(`${JSON.stringify(executePolicyRequest(req))}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          schemaVersion: 1,
          policyVersion: 1,
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        })}\n`
      );
    }
  }
}

void main();
