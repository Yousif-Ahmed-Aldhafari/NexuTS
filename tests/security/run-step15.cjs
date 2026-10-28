/** Backward-compatible Step 1.5 entrypoint. Step 1.6 uses disposable databases. */
const { spawnSync } = require("node:child_process");

for (const script of ["tests/security/run-node-suite.cjs", "tests/security/run-http-suite.cjs"]) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
