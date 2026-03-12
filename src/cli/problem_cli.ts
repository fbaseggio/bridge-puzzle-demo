/// <reference types="node" />

import { demoProblems } from '../demo/problems';
import type { ProblemStatus } from '../core';

type GetRequest = { mode?: 'get'; id: string };
type ListRequest = { mode: 'list' };
type Request = GetRequest | ListRequest;

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
    if (req.mode === 'list') {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          problemIds: demoProblems.map((p) => p.id),
          problems: demoProblems.map((p) => ({
            id: p.id,
            status: (p.problem.status ?? 'active') as ProblemStatus
          }))
        })}\n`
      );
      return;
    }
    const id = req.id;
    const found = demoProblems.find((p) => p.id === id);
    if (!found) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message: `Unknown problem id: ${id}` } })}\n`);
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
