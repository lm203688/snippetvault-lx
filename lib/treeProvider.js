/**
 * SnippetVault — lib/treeProvider.js
 *
 * TreeDataProvider for the SnippetVault sidebar view.
 * Groups snippets with collapsible nodes per group.
 */

const vscode = require('vscode');
const { filterSnippets, groupBy } = require('./snippets');

class SnippetTreeItem extends vscode.TreeItem {
  constructor(label, snippet) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.snippet = snippet;
    this.iconPath = new vscode.ThemeIcon('paste');
    this.tooltip = `${snippet.prefix}\n${snippet.description || ''}\nGroup: ${snippet.group}`;
    this.command = {
      command: 'snippetvault.openPanel',
      title: 'SnippetVault: Open Snippet Editor',
      arguments: [snippet.id]
    };
  }
}

class GroupTreeItem extends vscode.TreeItem {
  constructor(groupName, count) {
    super(groupName, vscode.TreeItemCollapsibleState.Collapsed);
    this.count = count;
    this.iconPath = new vscode.ThemeIcon('folder');
    this.tooltip = `${groupName} (${count} snippets)`;
  }
}

class SnippetTreeProvider {
  constructor(snippets) {
    this._snippets = snippets || [];
    this._onDidChangeTreeData = new vscode.EventEmitter();
  }

  get onDidChangeTreeData() {
    return this._onDidChangeTreeData.event;
  }

  refresh(snippets) {
    this._snippets = snippets || [];
    this._onDidChangeTreeData.fire();
  }

  updateSearch(query) {
    this._searchQuery = query;
    this.refresh(this._filteredSnippets());
  }

  _filteredSnippets() {
    if (!this._searchQuery) return this._snippets;
    return filterSnippets(this._snippets, this._searchQuery);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element instanceof GroupTreeItem) {
      const grouped = groupBy(this._filteredSnippets());
      const groupItems = grouped.find(([name]) => name === element.label);
      if (!groupItems) return [];
      return groupItems[1].map(s => new SnippetTreeItem(this._itemLabel(s), s));
    }
    // Top level: groups
    const grouped = groupBy(this._filteredSnippets());
    return grouped.map(([name, items]) => new GroupTreeItem(name, items.length));
  }

  _itemLabel(snippet) {
    const desc = snippet.description ? ` (${snippet.description})` : '';
    return `${snippet.prefix}${desc}`;
  }
}

module.exports = { SnippetTreeProvider, SnippetTreeItem, GroupTreeItem };
