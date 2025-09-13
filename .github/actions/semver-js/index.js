// Pure Node (no deps)
const fs = require("fs");
const cp = require("child_process");

const env = (k, d = "") => (process.env[k] ?? d);
const MODE = env("INPUT_MODE", "config-change").toLowerCase();
const CONFIG_FILE = env("INPUT_CONFIG_FILE", "version.txt");
const OVERRIDE = env("INPUT_MAJOR_MINOR", ""); // "X.Y" or "X.Y.Z"
const TAG_PREFIX = env("INPUT_TAG_PREFIX", "v");

function sh(cmd) {
  try { return cp.execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
function ensureHistory() {
  sh("git fetch --prune --unshallow || true");
  sh("git fetch --tags || true");
}
function parseSemver(src) {
  const m = (src || "").match(/^\s*(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) throw new Error(`Cannot parse semver from "${(src || "").split(/\r?\n/)[0] || ""}"`);
  return { major: m[1], minor: m[2], patch: Number.parseInt(m[3] ?? "0", 10) || 0 };
}
function readSemverFromFile(p) {
  if (!fs.existsSync(p)) throw new Error(`Config file not found: ${p}`);
  return parseSemver(fs.readFileSync(p, "utf8"));
}
function getIncrementBranch() {
  const n = sh("git rev-list --count HEAD");
  return Number.parseInt(n || "0", 10) || 0;
}
function getIncrementSinceTag(major, minor, prefix) {
  const match = `${prefix}${major}.${minor}.*`;
  const base = sh(`git describe --tags --match "${match}" --abbrev=0`);
  if (!base) return 0;
  const n = sh(`git rev-list --count ${base}..HEAD`);
  return Number.parseInt(n || "0", 10) || 0;
}
// Find commit where version.txt first became the current MAJOR.MINOR
function findBaseCommitForCurrentMM(file, currentMM) {
  const list = sh(`git log --format=%H --follow -- "${file}"`);
  if (!list) return "";
  const shas = list.split("\n").filter(Boolean);
  let lastShaWithCurrent = "";
  for (const sha of shas) {
    const content = sh(`git show ${sha}:"${file}"`);
    if (!content) break;
    let mmAtSha = "";
    try { const { major, minor } = parseSemver(content); mmAtSha = `${major}.${minor}`; } catch {}
    if (mmAtSha === currentMM) lastShaWithCurrent = sha; else break;
  }
  return lastShaWithCurrent;
}
function getIncrementSinceMMChange(file, currentMM) {
  const base = findBaseCommitForCurrentMM(file, currentMM);
  if (!base) return getIncrementBranch();
  const n = sh(`git rev-list --count ${base}..HEAD`);
  return Number.parseInt(n || "0", 10) || 0;
}
function getBranch() {
  // Prefer GitHub-provided names (work on PRs & detached HEAD)
  const ghHead = env("GITHUB_HEAD_REF", "");   // PR source branch
  const ghRef = env("GITHUB_REF_NAME", "");    // push/PR target ref name
  if (ghHead) return ghHead;
  if (ghRef) return ghRef;
  // Fallback to git; may be empty/HEAD in detached state
  const b = sh("git branch --show-current") || sh("git rev-parse --abbrev-ref HEAD");
  return b === "HEAD" ? "" : b;
}
function setOutputs(map) {
  const outFile = env("GITHUB_OUTPUT", "");
  const lines = Object.entries(map).map(([k, v]) => `${k}=${v}`).join("\n");
  if (outFile) fs.appendFileSync(outFile, lines + "\n"); else console.log(lines);
}

(async function main() {
  try {
    ensureHistory();

    // Capture SHAs and branch
    const fullSha = sh("git rev-parse HEAD");
    const shortSha = sh("git rev-parse --short=7 HEAD") || (fullSha ? fullSha.slice(0, 7) : "");
    const branch = getBranch();

    // Build date in UTC (ISO 8601, no milliseconds)
    const buildDateUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // Load semver from override or version.txt
    const base = OVERRIDE ? parseSemver(OVERRIDE) : readSemverFromFile(CONFIG_FILE);
    const baseMM = `${base.major}.${base.minor}`;
    const basePatch = Number.isFinite(base.patch) ? Math.max(0, Math.trunc(base.patch)) : 0;

    // Compute increment per mode
    let inc = 0;
    switch (MODE) {
      case "branch":        inc = getIncrementBranch(); break;
      case "config-change": inc = getIncrementSinceMMChange(CONFIG_FILE, baseMM); break;
      case "tag":           inc = getIncrementSinceTag(base.major, base.minor, TAG_PREFIX); break;
      default: throw new Error(`Unknown mode "${MODE}" (use: branch | config-change | tag)`);
    }
    inc = Number.isFinite(inc) ? Math.max(0, Math.trunc(inc)) : 0;

    // Final PATCH = file.patch + increment
    const patch = basePatch + inc;
    const version = `${base.major}.${base.minor}.${patch}`;
    const tag = `${TAG_PREFIX}${version}`;

    setOutputs({
      version,
      major: base.major,
      minor: base.minor,
      patch: String(patch),
      tag,
      sha: fullSha,
      short_sha: shortSha,
      branch,
      build_date_utc: buildDateUtc
    });
  } catch (err) {
    console.error(`[semver-js] ${err?.message || err}`);
    process.exit(1);
  }
})();
