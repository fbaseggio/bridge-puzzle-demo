/// <reference types="node" />

import { executePolicyRequest, type PolicyCliRequest } from './policy_io';

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const parsed = JSON.parse(raw) as PolicyCliRequest;
    process.stdout.write(`${JSON.stringify(executePolicyRequest(parsed))}\n`);
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

void main();
