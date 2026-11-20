/**
 * SnippetVault — VS Code Extension (Local Snippet Manager)
 *
 * Organizes, searches, and manages VS Code snippets locally via a GUI tree panel.
 * No cloud sync, no uploads. Files never leave your machine.
 *
 * Free tier: up to 100 snippets with basic search + group management + ZIP export.
 * Pro ($7 one-time): unlimited snippets, tag system, advanced search (fuzzy/regex),
 *                     ZIP import, cross-device sync instructions.
 */

const vscode = require('vscode');
const path = require('path');
const { loadAllSnippets, saveSnippet, deleteSnippet, filterSnippets, groupBy, exportSnippetsAsZip } = require('./lib/snippets');
const { SnippetTreeProvider } = require('./lib/treeProvider');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VERIFY_ENDPOINT = 'https://snapmark-license.61960005.workers.dev/verify';
const FREE_LIMIT = 100;
const STATE_WELCOMED = 'sv_welcomed';
const STATE_PRO = 'sv_pro';
const STATE_LICENSE = 'sv_license';
const STATE_SEARCH = 'sv_searchQuery';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function readConfig() {
  const c = vscode.workspace.getConfiguration('snippetvault');
  return {
    verifyEndpoint: (c.get('verifyEndpoint') || '').trim() || DEFAULT_VERIFY_ENDPOINT,
    buyoutLink: (c.get('buyoutLink') || '').trim()
  };
}

// ---------------------------------------------------------------------------
// License helpers
// ---------------------------------------------------------------------------

async function verifyLicense(endpoint, license) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license })
    });
    const data = await res.json();
    return { ok: !!data.valid, error: data.valid ? '' : (data.error || 'License is not active.') };
  } catch (e) {
    return { ok: false, error: 'Could not reach license service: ' + String(e.message || e) };
  }
}

// ---------------------------------------------------------------------------
// Panel view (preview/edit + insert/delete)
// ---------------------------------------------------------------------------

let _activeEditorPanel = null;

function openSnippetPanel(context, snippetId) {
  const allSnippets = context.snippets;
  const snippet = allSnippets.find(s => s.id === snippetId);
  if (!snippet) {
    vscode.window.showErrorMessage('SnippetVault: snippet not found.');
    return;
  }
  // Warn free-tier user about 100-snippet cap on first open
  if (!context.pro && allSnippets.length >= FREE_LIMIT) {
    vscode.window.showWarningMessage(
      `SnippetVault: You have reached the Free plan limit of ${FREE_LIMIT} snippets.`
    );
  }

  // If panel already open for this snippet, focus it
  if (_activeEditorPanel && _activeEditorPanel._snippetId === snippetId) {
    _activeEditorPanel.reveal(vscode.ViewColumn.Two);
    return;
  }
  if (_activeEditorPanel) { _activeEditorPanel.dispose(); }

  const panel = vscode.window.createWebviewPanel(
    'snippetVaultEditor',
    `Edit: ${snippet.prefix}`,
    vscode.ViewColumn.Two,
    {
      enableScripts: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    }
  );
  _activeEditorPanel = panel;
  panel._snippetId = snippetId;

  panel.webview.html = buildEditorHtml(snippet, context.pro);

  panel.onDidDispose(() => {
    if (_activeEditorPanel === panel) _activeEditorPanel = null;
  }, null, context.subscriptions);
}

function buildEditorHtml(snippet, isProStatus) {
  const bodyText = snippet.body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const proBadgeHtml = isProStatus
    ? '<span class="pro-badge" style="margin-left:8px;">Pro active</span>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; color: #24292f; background: #ffffff; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .header { padding: 12px 16px; border-bottom: 1px solid #eaeaea; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .header .prefix { font-weight: 600; font-size: 14px; color: #0969da; }
    .header .group { font-size: 12px; color: #6e7781; margin-left: 4px; }
    .header .actions { margin-left: auto; display: flex; gap: 6px; }
    .btn { padding: 4px 12px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 12px; cursor: pointer; background: #f6f8fa; color: #24292f; }
    .btn:hover { background: #eaeaea; }
    .btn-primary { background: #2da44e; color: #fff; border-color: #2da44e; }
    .btn-primary:hover { background: #268543; }
    .btn-danger { color: #cf222e; border-color: #cf222e; }
    .btn-danger:hover { background: #fff0ef; }
    .editor-area { flex: 1; display: flex; flex-direction: column; padding: 12px 16px; overflow: hidden; }
    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 12px; font-weight: 600; color: #6e7781; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
    .field input, .field textarea { width: 100%; border: 1px solid #d0d7de; border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: inherit; color: #24292f; background: #fafbfc; }
    .field input:focus, .field textarea:focus { outline: none; border-color: #0969da; background: #fff; }
    .field textarea { flex: 1; min-height: 200px; resize: vertical; font-family: 'SF Mono', Monaco, Consolas, monospace; white-space: pre; }
    .footer { padding: 8px 16px; border-top: 1px solid #eaeaea; font-size: 11px; color: #6e7781; flex-shrink: 0; }
    .pro-badge { background: #ddf4ff; color: #0969da; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <span class="prefix">${escapeHtml(snippet.prefix)}</span>
    <span class="group">${escapeHtml(snippet.group)}</span>
    <div class="actions">
      <button class="btn btn-danger" id="deleteBtn">Delete</button>
      <button class="btn btn-primary" id="saveBtn">Save</button>
    </div>
  </div>
  <div class="editor-area">
    <div class="field">
      <label for="descInput">Description</label>
      <input type="text" id="descInput" value="${escapeHtml(snippet.description)}">
    </div>
    <div class="field">
      <label for="bodyInput">Body (code)</label>
      <textarea id="bodyInput">${bodyText}</textarea>
    </div>
  </div>
  <div class="footer">
    SnippetVault &mdash; Your snippets, organized locally. Nothing leaves your machine.
    ${proBadgeHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('saveBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'save', snippetId: '${escapeHtml(snippet.id)}', description: document.getElementById('descInput').value, body: document.getElementById('bodyInput').value });
    });
    document.getElementById('deleteBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'delete', snippetId: '${escapeHtml(snippet.id)}' });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isPro(ctx) { return !!(ctx && ctx.globalState && ctx.globalState.get(STATE_PRO)); }

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function registerCommands(context) {
  // Open manager panel
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.openPanel', async (snippetId) => {
    if (snippetId) {
      openSnippetPanel(context, snippetId);
    } else {
      // Focus the tree view instead
      vscode.commands.executeCommand('snippetvault-tree.focus');
    }
  }));

  // Save edited snippet from webview
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.saveSnippet', async (snippetId) => {
    // Called when save button clicked in panel
    vscode.commands.executeCommand('snippetvault.openPanel', snippetId);
  }));

  // Insert snippet into editor
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.insertSnippet', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('SnippetVault: open a file first to insert a snippet.');
      return;
    }
    // Use the currently selected snippet or prompt to pick one
    const allSnippets = context.snippets || [];
    if (!allSnippets.length) {
      vscode.window.showInformationMessage('SnippetVault: no snippets found.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      allSnippets.map(s => ({ label: `${s.prefix}`, description: `${s.description} [${s.group}]` })),
      { placeHolder: 'Select a snippet to insert…' }
    );
    if (!picked) return;
    const snippet = allSnippets.find(s => s.prefix === picked.label);
    if (!snippet) return;
    const lines = snippet.body.split('\n');
    const insertPos = editor.selection.active;
    await editor.edit(editBuilder => {
      editBuilder.insert(insertPos, lines.join('\n') + '\n');
    });
    vscode.window.showInformationMessage(`SnippetVault: inserted "${snippet.prefix}".`);
  }));

  // Export as ZIP
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.exportZip', async () => {
    const allSnippets = context.snippets || [];
    if (!allSnippets.length) {
      vscode.window.showInformationMessage('SnippetVault: no snippets to export.');
      return;
    }
    if (!context.pro && allSnippets.length > FREE_LIMIT) {
      vscode.window.showWarningMessage(
        `SnippetVault: Free plan allows up to ${FREE_LIMIT} snippets for export. Upgrade to Pro for unlimited export.`
      );
      return;
    }
    try {
      const zipBuffer = await exportSnippetsAsZip(allSnippets);
      const uri = vscode.Uri.file(
        path.join(vscode.env.appRoot, '..', 'SnippetVault_Export.zip').replace(/\\/g, '/')
      );
      // Simpler: use showSaveDialog
      const saveUri = await vscode.window.showSaveDialog({
        filters: { 'ZIP Archive': ['zip'] },
        defaultUri: vscode.Uri.file(`SnippetVault_Export_${new Date().toISOString().slice(0,10)}.zip`)
      });
      if (!saveUri) return;
      await vscode.workspace.fs.writeFile(saveUri, zipBuffer);
      vscode.window.showInformationMessage('SnippetVault: exported snippets as ZIP.');
    } catch (e) {
      vscode.window.showErrorMessage(`SnippetVault: export failed — ${String(e.message || e)}`);
    }
  }));

  // Upgrade to Pro
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.upgradeToPro', async () => {
    const cfg = readConfig();
    if (!cfg.buyoutLink) {
      vscode.window.showWarningMessage(
        'SnippetVault: set snippetvault.buyoutLink in settings before upgrading.'
      );
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(cfg.buyoutLink));
  }));

  // Activate Pro (paste license key)
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.activatePro', async () => {
    const license = await vscode.window.showInputBox({
      prompt: 'Enter your SnippetVault Pro license key',
      placeHolder: 'e.g. sv-xxxxxxxxxxxxxxxxxxxx',
      ignoreFocusOut: true
    });
    if (!license) return;
    const cfg = readConfig();
    const result = await verifyLicense(cfg.verifyEndpoint, license.trim());
    if (result.ok) {
      await context.globalState.update(STATE_PRO, true);
      await context.globalState.update(STATE_LICENSE, license.trim());
      context.pro = true;
      vscode.window.showInformationMessage('SnippetVault: Pro license active! Unlimited snippets unlocked.');
    } else {
      vscode.window.showErrorMessage(`SnippetVault: ${result.error || 'Invalid license key.'}`);
    }
  }));

  // Delete snippet command (triggered from panel)
  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.deleteSnippet', async (snippetId) => {
    const ok = await deleteSnippet(snippetId);
    if (ok) {
      context.snippets = (context.snippets || []).filter(s => s.id !== snippetId);
      if (context.treeProvider) {
        const query = context.searchQuery || '';
        context.treeProvider.updateSearch(query);
      }
      vscode.window.showInformationMessage('SnippetVault: snippet deleted.');
    } else {
      vscode.window.showErrorMessage('SnippetVault: failed to delete snippet.');
    }
  }));
}

// ---------------------------------------------------------------------------
// Webview message handler
// ---------------------------------------------------------------------------

function registerWebViewHandler(context) {
  context.subscriptions.push(vscode.window.onDidReceiveWebviewMessage(async (event) => {
    const msg = event.message;
    if (msg.command === 'save') {
      const snippetId = msg.snippetId;
      const snippet = (context.snippets || []).find(s => s.id === snippetId);
      if (!snippet) return;
      snippet.description = msg.description || '';
      snippet.body = msg.body || '';
      const ok = await saveSnippet(snippet);
      if (ok) {
        vscode.window.showInformationMessage('SnippetVault: snippet saved.');
      } else {
        vscode.window.showErrorMessage('SnippetVault: failed to save snippet.');
      }
    } else if (msg.command === 'delete') {
      vscode.commands.executeCommand('snippetvault.deleteSnippet', msg.snippetId);
    }
  }));
}

// ---------------------------------------------------------------------------
// Search bar in status bar / command palette
// ---------------------------------------------------------------------------

function registerSearch(context) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(search) SnippetVault';
  statusBar.tooltip = 'Click to search snippets';
  statusBar.command = 'snippetvault.searchSnippets';
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(vscode.commands.registerCommand('snippetvault.searchSnippets', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search snippets by prefix, description, or body content',
      placeHolder: 'Type to search…',
      value: context.searchQuery || '',
      ignoreFocusOut: true
    });
    if (query !== undefined) {
      context.searchQuery = query || '';
      if (context.treeProvider) {
        context.treeProvider.updateSearch(query || '');
      }
    }
  }));
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

async function activate(context) {
  // Load snippets asynchronously
  context.snippets = [];
  context.searchQuery = '';
  context.pro = context.globalState.get(STATE_PRO, false);
  context.treeProvider = null;

  try {
    context.snippets = await loadAllSnippets();
  } catch (_) {}

  // Register tree view once
  context.treeProvider = new SnippetTreeProvider(context.snippets);
  const treeView = vscode.window.createTreeView('snippetvault-tree', {
    treeDataProvider: context.treeProvider
  });
  context.subscriptions.push(treeView);

  registerCommands(context);
  registerWebViewHandler(context);
  registerSearch(context);

  // Welcome message
  if (!context.globalState.get(STATE_WELCOMED, false)) {
    context.globalState.update(STATE_WELCOMED, true);
    vscode.window.showInformationMessage(
      'SnippetVault installed! Open the SnippetVault panel from the activity bar to browse, search, and manage your snippets locally. Use Ctrl+Space to insert a snippet into any file.'
    );
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
