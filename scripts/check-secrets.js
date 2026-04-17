const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = process.cwd();
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "data/backups"
]);
const IGNORED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production"
]);

const SECRET_PATTERNS = [
  {
    name: "Discord Token Assignment",
    regex: /DISCORD_TOKEN\s*=\s*(?!your_discord_bot_token\b)(?!\s*$)[^\s#][^\r\n]*/i
  },
  {
    name: "Discord Bot Token Format",
    regex: /(?:^|[^A-Za-z0-9_-])[MN][A-Za-z\d_-]{20,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}(?:$|[^A-Za-z0-9_-])/g
  },
  {
    name: "OpenAI API Key",
    regex: /sk-[A-Za-z0-9]{20,}/g
  }
];

function shouldIgnorePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized) {
    return false;
  }

  if (IGNORED_FILES.has(path.basename(normalized))) {
    return true;
  }

  for (const directory of IGNORED_DIRECTORIES) {
    if (normalized === directory || normalized.startsWith(`${directory}/`)) {
      return true;
    }
  }

  return false;
}

async function walkFiles(directory, result = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(ROOT_DIR, fullPath);

    if (shouldIgnorePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkFiles(fullPath, result);
      continue;
    }

    if (entry.isFile()) {
      result.push(fullPath);
    }
  }

  return result;
}

function scanFileContent(content, filePath) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (!matches?.length) {
      continue;
    }

    findings.push({
      filePath,
      pattern: pattern.name,
      sample: String(matches[0]).slice(0, 140)
    });
  }

  return findings;
}

async function main() {
  const files = await walkFiles(ROOT_DIR);
  const findings = [];

  for (const filePath of files) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
    const content = await fs.readFile(filePath, "utf8").catch(() => null);

    if (content === null) {
      continue;
    }

    findings.push(...scanFileContent(content, relativePath));
  }

  if (!findings.length) {
    console.log("Secret scan clean.");
    return;
  }

  console.error("Secret scan menemukan kemungkinan credential sensitif:");
  for (const finding of findings) {
    console.error(`- ${finding.filePath} | ${finding.pattern} | ${finding.sample}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Secret scan gagal dijalankan.", error);
  process.exitCode = 1;
});
