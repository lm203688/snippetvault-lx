/**
 * SnippetVault — lib/snippets.js
 *
 * Reads/writes VS Code snippet JSON files from the global or workspace snippets folder.
 * Snippet format: { scope, prefix, body, description }
 * Grouped by filename (base name without .json) within each .code-snippets file.
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

async function getSnippetsPaths() {
  const dirs = [];
  // Global snippets directory
  const globalDir = vscode.env.appRoot;
  const globalUserSnippets = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.vscode', 'extensions', 'userdata', 'globalStorage', 'ms-vscode.vscode-jsonrpc'
  );
  // Try standard VS Code snippets paths
  const candidates = [
    path.join(vscode.env.appRoot, 'data', 'User', 'snippets'),
    path.join(vscode.env.appRoot, 'resources', 'app', 'data', 'User', 'snippets')
  ];
  // Also use the known workspace snippets location
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  for (const wf of workspaceFolders) {
    candidates.push(path.join(wf.uri.fsPath, '.vscode', 'snippets'));
  }
  // Standard global user snippets location
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  candidates.unshift(path.join(userProfile, '.vscode', 'snippets'));
  // Extensions snippets dir
  candidates.push(path.join(userProfile, '.vscode', 'extensions', 'snippets'));

  const found = candidates.filter(p => {
    try { return fs.existsSync(p); } catch (_) { return false; }
  });
  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// Load snippets
// ---------------------------------------------------------------------------

/**
 * Returns array of { id, group, fileName, scope, prefix, body, description, rawText }.
 * id is unique: groupId___snippetIndex
 */
async function loadAllSnippets() {
  const snippets = [];
  const paths = await getSnippetsPaths();

  for (const dir of paths) {
    let files;
    try { files = fs.readdirSync(dir); } catch (_) { continue; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const filePath = path.join(dir, f);
      let content;
      try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }
      let parsed;
      try { parsed = JSON.parse(content); } catch (_) { continue; }

      const groupId = f.replace('.json', '');
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (let i = 0; i < entries.length; i++) {
        const s = entries[i];
        if (!s.prefix) continue;
        const prefixArr = Array.isArray(s.prefix) ? s.prefix : [s.prefix];
        for (const prefix of prefixArr) {
          snippets.push({
            id: `${groupId}___${i}`,
            group: groupId,
            fileName: f,
            filePath,
            scope: s.scope || '',
            prefix,
            body: Array.isArray(s.body) ? s.body.join('\n') : String(s.body || ''),
            description: s.description || '',
            rawText: JSON.stringify(entries[i], null, 2)
          });
        }
      }
    }
  }
  return snippets;
}

// ---------------------------------------------------------------------------
// Save individual snippet
// ---------------------------------------------------------------------------

async function saveSnippet(snippetEntry) {
  const { id, prefix, body, description, rawText } = snippetEntry;
  const [groupId, idx] = id.split('___');
  const paths = await getSnippetsPaths();
  let targetFile = null;
  for (const dir of paths) {
    const candidate = path.join(dir, `${groupId}.json`);
    if (fs.existsSync(candidate)) { targetFile = candidate; break; }
  }
  if (!targetFile) {
    // Create in global user snippets
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    const createDir = path.join(userProfile, '.vscode', 'snippets');
    try { fs.mkdirSync(createDir, { recursive: true }); } catch (_) {}
    targetFile = path.join(createDir, `${groupId}.json`);
    fs.writeFileSync(targetFile, JSON.stringify([{ scope: '', prefix, body, description }], null, 2), 'utf8');
    return true;
  }
  let content;
  try { content = JSON.parse(fs.readFileSync(targetFile, 'utf8')); } catch (_) { return false; }
  if (!Array.isArray(content)) content = [content];
  while (content.length <= parseInt(idx, 10)) content.push(null);
  content[parseInt(idx, 10)] = { scope: snippetEntry.scope || '', prefix, body: typeof body === 'string' ? body.split('\n') : body, description };
  fs.writeFileSync(targetFile, JSON.stringify(content, null, 2), 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Delete snippet
// ---------------------------------------------------------------------------

async function deleteSnippet(id) {
  const [groupId, idx] = id.split('___');
  const paths = await getSnippetsPaths();
  let targetFile = null;
  for (const dir of paths) {
    const candidate = path.join(dir, `${groupId}.json`);
    if (fs.existsSync(candidate)) { targetFile = candidate; break; }
  }
  if (!targetFile) return false;
  let content;
  try { content = JSON.parse(fs.readFileSync(targetFile, 'utf8')); } catch (_) { return false; }
  if (!Array.isArray(content)) return false;
  const i = parseInt(idx, 10);
  if (i >= 0 && i < content.length) content.splice(i, 1);
  fs.writeFileSync(targetFile, JSON.stringify(content, null, 2), 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

function filterSnippets(snippets, query) {
  if (!query || !query.trim()) return snippets;
  const q = query.toLowerCase().trim();
  return snippets.filter(s =>
    s.prefix.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.body.toLowerCase().includes(q) ||
    s.group.toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupBy(snippets) {
  const map = new Map();
  for (const s of snippets) {
    if (!map.has(s.group)) map.set(s.group, []);
    map.get(s.group).push(s);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------------------
// Export ZIP
// ---------------------------------------------------------------------------

async function exportSnippetsAsZip(snippets) {
  // JSZip is bundled locally (VS Code extensions cannot npm install at runtime)
  const JSZip = require('./jszip.min');
  const zip = new JSZip();
  const groups = {};
  for (const s of snippets) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }
  for (const [groupName, items] of Object.entries(groups)) {
    const arr = items.map(s => ({ scope: s.scope, prefix: s.prefix, body: s.body.split('\n'), description: s.description }));
    zip.file(`${groupName}.json`, JSON.stringify(arr, null, 2));
  }
  zip.file('README.md', buildExportReadme(snippets));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildExportReadme(snippets) {
  const lines = ['# SnippetVault Export\n\n'];
  const groups = groupBy(snippets);
  for (const [groupName, items] of groups) {
    lines.push(`## ${groupName}\n`);
    for (const item of items) {
      lines.push(`### ${item.prefix}`);
      if (item.description) lines.push(`Description: ${item.description}\n`);
      lines.push('```\n' + item.body + '\n```\n');
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  loadAllSnippets,
  saveSnippet,
  deleteSnippet,
  filterSnippets,
  groupBy,
  exportSnippetsAsZip
};
