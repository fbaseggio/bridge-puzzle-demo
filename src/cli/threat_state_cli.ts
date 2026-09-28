import { handleThreatStateRequest, type ThreatStateRequest } from './threat_state_io';

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(): Promise<void> {
  try {
    const req = JSON.parse(await readStdin()) as ThreatStateRequest;
    process.stdout.write(`${JSON.stringify(handleThreatStateRequest(req))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
}

void main();
