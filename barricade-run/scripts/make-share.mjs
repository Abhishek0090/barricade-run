#!/usr/bin/env node
// Builds barricade-run-share/setup-barricade-run.mjs: one self-contained script that creates
// or updates the whole project on another machine (code, config, package-lock.json).
// Run: npm run share
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "barricade-run-share");
const SKIP_DIRS = new Set(["node_modules", ".next", "out", ".git", "barricade-run-share", ".sync-backup", ".vercel"]);
const SKIP_FILES = [/\.tsbuildinfo$/, /^next-env\.d\.ts$/, /^\.env(?!\.example)/, /\.log$/];
const BINARY = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"]);
/** Files from older versions to delete when updating. Add paths here when you remove or rename a file. */
const OBSOLETE = [];
/** Drawn by scripts/generate-icons.mjs on the target machine instead of being embedded (keeps the script small). */
const GENERATED = [
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-maskable-512.png",
  "src/app/icon.png",
  "src/app/apple-icon.png",
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...walk(full));
    } else if (!SKIP_FILES.some((re) => re.test(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT)
  .map((full) => relative(ROOT, full).split("\\").join("/"))
  .filter((p) => !GENERATED.includes(p))
  .sort()
  .map((p) => {
    const data = readFileSync(join(ROOT, p));
    const binary = BINARY.has(extname(p).toLowerCase());
    return {
      p,
      e: binary ? "base64" : "utf8",
      c: data.toString(binary ? "base64" : "utf8"),
      h: createHash("sha256").update(data).digest("hex").slice(0, 16),
    };
  });

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const payload = gzipSync(JSON.stringify({ files }), { level: 9 }).toString("base64");
const payloadHash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
const built = new Date().toISOString().slice(0, 16).replace("T", " ");

// The payload sits in comment lines at the end of the script. A paste that gets cut off is still
// valid JavaScript, so the script can report the damage instead of failing with a syntax error.
const payloadLines = payload.match(/.{1,100}/g).map((line) => "//~ " + line);

// Runtime of the generated scripts. Kept as a plain function so it is syntax-checked here too;
// it is serialised with Function.prototype.toString().
//   mode "setup": creates the project (in ./barricade-run) or updates it in place.
//   mode "sync":  only updates an existing project and makes it identical to this version:
//                 files that are no longer part of the project are moved to .sync-backup/.
function run(req, opts, scriptPath) {
  const { PROJECT, OBSOLETE, GENERATED, PAYLOAD_HASH, MODE } = opts;
  const { spawnSync } = req("node:child_process");
  const { createHash } = req("node:crypto");
  const { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } = req("node:fs");
  const { dirname, join, relative, resolve } = req("node:path");
  const { gunzipSync } = req("node:zlib");
  const sha = (data) => createHash("sha256").update(data).digest("hex").slice(0, 16);

  const damaged = () => {
    console.error("This script is damaged (the paste was probably cut off or changed). Copy it again in full.");
    process.exit(1);
  };
  const lines = readFileSync(scriptPath, "utf8").split(/\r?\n/);
  if (!lines.some((l) => l.trim() === "//~END")) damaged();
  const payload = lines
    .filter((l) => l.startsWith("//~ "))
    .map((l) => l.slice(4).trim())
    .join("");
  if (sha(payload) !== PAYLOAD_HASH) damaged();
  let files = [];
  try {
    files = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8")).files;
  } catch {
    damaged();
  }

  const isProject = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === PROJECT;
    } catch {
      return false;
    }
  };
  const base = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const target = isProject(base) ? base : join(base, PROJECT);
  const fresh = !isProject(target);
  if (fresh && MODE === "sync") {
    console.error("Could not find the " + PROJECT + " project in: " + base);
    console.error("Run this inside the project folder (the one with package.json), or pass the path as an argument.");
    console.error("For a new laptop use setup-" + PROJECT + ".mjs instead.");
    process.exit(1);
  }
  if (fresh && existsSync(join(target, "package.json"))) {
    console.error("A different project already exists in " + target + ". Run this somewhere else.");
    process.exit(1);
  }
  console.log("Barricade Run - " + (MODE === "sync" ? "FULL SYNC" : fresh ? "creating project" : "updating project"));
  console.log("Folder: " + target + "\n");
  const hashOf = (p) => (existsSync(join(target, p)) ? sha(readFileSync(join(target, p))) : "none");
  const depsBefore = hashOf("package.json") + hashOf("package-lock.json");

  // Old files are moved, never deleted, so local work can be recovered.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stash = (p) => {
    const dest = join(target, ".sync-backup", stamp, p);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(join(target, p), dest);
    console.log("  moved    " + p + "  ->  .sync-backup/" + stamp + "/");
  };

  let written = 0;
  let unchanged = 0;
  let removed = 0;
  let iconScriptChanged = false;
  for (const f of files) {
    const dest = join(target, f.p);
    const data = Buffer.from(f.c, f.e);
    if (existsSync(dest) && readFileSync(dest).equals(data)) {
      unchanged++;
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    written++;
    if (f.p === "scripts/generate-icons.mjs") iconScriptChanged = true;
    console.log("  wrote    " + f.p);
  }
  const stale = new Set(OBSOLETE.filter((p) => existsSync(join(target, p))));
  if (MODE === "sync") {
    const keep = new Set([...files.map((f) => f.p), ...GENERATED]);
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const p = relative(target, full).split("\\").join("/");
          if (!keep.has(p)) stale.add(p);
        }
      }
    };
    for (const dir of ["src", "public", "scripts"]) walk(join(target, dir));
  }
  for (const p of stale) {
    stash(p);
    removed++;
  }
  if (iconScriptChanged || GENERATED.some((p) => !existsSync(join(target, p)))) {
    console.log("  drawing app icons...");
    const run = spawnSync(process.execPath, ["scripts/generate-icons.mjs"], { cwd: target, encoding: "utf8" });
    if (run.status !== 0) console.error(run.stderr);
  }

  const bad = files.filter((f) => {
    const dest = join(target, f.p);
    return !existsSync(dest) || sha(readFileSync(dest)) !== f.h;
  });
  const missing = [...bad.map((f) => f.p), ...GENERATED.filter((p) => !existsSync(join(target, p)))];
  console.log("\nDone: " + written + " written, " + unchanged + " already up to date, " + removed + " old files moved to .sync-backup.");
  if (missing.length) {
    console.error("WARNING: these files are missing or did not verify: " + missing.join(", "));
    process.exit(1);
  }
  console.log("All " + files.length + " files verified, " + GENERATED.length + " icons present.\n");
  console.log("Next:");
  if (base !== target) console.log('  cd "' + target + '"');
  const depsChanged = depsBefore !== hashOf("package.json") + hashOf("package-lock.json");
  if (!existsSync(join(target, "node_modules")) || depsChanged) {
    console.log("  npm install" + (depsChanged && !fresh ? "      (dependencies changed)" : ""));
  }
  console.log("  npm run dev      -> http://localhost:3000");
}

const HEADERS = {
  setup: [
    `// Barricade Run - setup / update script (${files.length} files + ${GENERATED.length} generated icons, built ${built} UTC).`,
    "// New machine:  put this file in any folder and run  node setup-barricade-run.mjs",
    '//               it creates a "barricade-run" folder there.',
    "// Update:       run it inside the existing barricade-run folder (the one with package.json).",
    "// Then:         npm install   and   npm run dev",
  ],
  sync: [
    `// Barricade Run - FULL SYNC (${files.length} files + ${GENERATED.length} generated icons, built ${built} UTC).`,
    "// Makes an existing project identical to this version, whatever version it had before.",
    "// Run inside the project folder (the one with package.json):  node sync-barricade-run.mjs",
    "// Files that are no longer part of the project are moved to .sync-backup/ (never deleted).",
  ],
};

function buildScript(mode) {
  const opts = { PROJECT: pkg.name, OBSOLETE, GENERATED, PAYLOAD_HASH: payloadHash, MODE: mode };
  return [
    "#!/usr/bin/env node",
    ...HEADERS[mode],
    'import { createRequire } from "node:module";',
    'import { fileURLToPath } from "node:url";',
    "",
    run.toString(),
    "",
    `run(createRequire(import.meta.url), ${JSON.stringify(opts)}, fileURLToPath(import.meta.url));`,
    "",
    "// ---- compressed project files (do not edit below this line) ----",
    ...payloadLines,
    "//~END",
    "",
  ].join("\n");
}

mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, "setup-barricade-run.mjs");
writeFileSync(outFile, buildScript("setup"));
writeFileSync(join(OUT_DIR, "sync-barricade-run.mjs"), buildScript("sync"));
const sizeKb = Math.round(statSync(outFile).size / 1024);

writeFileSync(
  join(OUT_DIR, "HOW-TO-SETUP.md"),
  `# Barricade Run - set up or update on another laptop

Built ${built} UTC. Both scripts contain the whole project compressed, including \`package-lock.json\`,
check every file after writing, and redraw the app icons locally.

| Script | Use it for |
| --- | --- |
| \`setup-barricade-run.mjs\` (${sizeKb} KB) | New laptop: creates the \`barricade-run\` folder |
| \`sync-barricade-run.mjs\` (${sizeKb} KB) | Existing copy, any older version: makes it identical to this version |

## New laptop

1. Install Node.js 20.9 or newer (\`node -v\` to check).
2. Put \`setup-barricade-run.mjs\` in any folder (for example Downloads) and open a terminal there.
3. Run:

   \`\`\`bash
   node setup-barricade-run.mjs
   cd barricade-run
   npm install
   npm run dev
   \`\`\`

4. Open http://localhost:3000

## Update an existing copy (sync)

1. Copy \`sync-barricade-run.mjs\` into the \`barricade-run\` folder (the one with \`package.json\` and \`src\`).
2. Run \`node sync-barricade-run.mjs\`. It ends with \`All ${files.length} files verified, ${GENERATED.length} icons present.\`
3. If it prints \`npm install (dependencies changed)\`, run \`npm install\`. Then \`npm run dev\`.

Files in \`src\`, \`public\` or \`scripts\` that are no longer part of the project are moved to
\`.sync-backup/<date>/\`, not deleted. Delete that folder once you've checked nothing in it is yours.

If it says \`Could not find the barricade-run project\`, you are in the wrong folder: \`cd\` into it,
or pass the path: \`node sync-barricade-run.mjs "C:\\path\\to\\barricade-run"\`.

Afterwards:

\`\`\`bash
git add .
git commit -m "Sync with latest version"
\`\`\`

Delete the sync file from the project folder afterwards.

## Sharing through codeshare or chat

Paste the whole file into a new file named \`setup-barricade-run.mjs\`.
If it says \`This script is damaged\`, the paste was cut off: copy it again in full.

## Test as an installable app (PWA)

The service worker only runs in a production build:

\`\`\`bash
npm run build
npm start          # serves the out/ folder on http://localhost:3000
\`\`\`

Browsers only allow installing over HTTPS or on localhost. For phones, deploy the \`out/\` folder to
any static host (Vercel, Netlify, GitHub Pages), open it in Chrome on Android and tap "Install app",
or on iPhone use Share, then "Add to Home Screen".

## Notes

- Not included: \`node_modules\`, \`.next\`, \`out\` (rebuilt by npm) and the PNG icons (redrawn by the script).
- Rebuild this script after changes with \`npm run share\`.
`,
);
console.log(`Wrote setup-barricade-run.mjs and sync-barricade-run.mjs (${files.length} files, ${sizeKb} KB each) and HOW-TO-SETUP.md in ${relative(ROOT, OUT_DIR)}`);
