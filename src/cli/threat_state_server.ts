import { handleThreatStateRequest, type ThreatStateRequest } from './threat_state_io';

async function main(): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const req = JSON.parse(line) as ThreatStateRequest;
        process.stdout.write(`${JSON.stringify(handleThreatStateRequest(req))}\n`);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`);
      }
    }
  }
}

void main();
