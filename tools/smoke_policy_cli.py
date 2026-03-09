import json
import subprocess
from pathlib import Path

sample = Path("examples/policy_cli.sample.json").read_text()

proc = subprocess.run(
    ["npm", "run", "-s", "policy:cli"],
    input=sample,
    text=True,
    capture_output=True,
)

print("STDOUT:")
print(proc.stdout)

print("STDERR:")
print(proc.stderr)

print("Return code:", proc.returncode)

data = json.loads(proc.stdout)
print("Chosen card:", data["result"]["chosenCardId"])
