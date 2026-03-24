#!/usr/bin/env node

// Bump patch version across package.json, tauri.conf.json, Cargo.toml
// Usage: node scripts/bump-version.mjs [major|minor|patch]

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const type = process.argv[2] || "patch";

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

// 1. package.json
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, type);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 2. tauri.conf.json
const tauriConfPath = resolve(root, "src-tauri/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

// 3. Cargo.toml
const cargoPath = resolve(root, "src-tauri/Cargo.toml");
let cargo = readFileSync(cargoPath, "utf-8");
cargo = cargo.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${newVersion}"`
);
writeFileSync(cargoPath, cargo);

console.log(`${oldVersion} → ${newVersion}`);
