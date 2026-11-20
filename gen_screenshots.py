"""Generate 3 B2 SnippetVault screenshots (VS Code mockups) + icon.png"""
from PIL import Image, ImageDraw
import os

out = os.path.join(os.path.dirname(__file__), 'materials')
os.makedirs(out, exist_ok=True)
root = os.path.dirname(__file__)

def vscode_bg(w, h, title_text):
    img = Image.new('RGB', (w, h), '#1e1e1e')
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 30], fill='#252526')
    d.text((10, 8), title_text, fill='#cccccc')
    d.rectangle([0, 30, 48, h], fill='#333333')
    d.rectangle([48, 30, 280, h], fill='#252526')
    return img, d

# ---- Screenshot 1: Tree view with search ----
img, d = vscode_bg(1366, 768, 'SnippetVault - Local Snippet Manager')
d.rectangle([280, 30, 1366, 768], fill='#1e1e1e')

# Search box
d.rectangle([55, 40, 270, 62], fill='#3c3c3c')
d.text((62, 44), '(search snippets...)', fill='#888888')

# Group tree items
groups = [
    ('javascript', True, ['console.log', 'fetch-call', 'promise-chain']),
    ('python',     True, ['if-main', 'list-comp', 'dict-merge']),
    ('react',      True, ['use-effect', 'component-func']),
    ('sql',        False, ['select-limit', 'insert-values']),
]
y = 80
for gname, expanded, pfxs in groups:
    arrow = 'v' if expanded else '>'
    d.text((60, y), arrow + '  ' + gname, fill='#e0e0e0')
    y += 24
    if expanded:
        for pfx in pfxs:
            d.text((80, y), '$ ' + pfx, fill='#9cdcfe')
            y += 20
    y += 8

d.text((55, 600), '12 groups / 47 snippets', fill='#6e7781')

# Editor area hint
d.text((300, 60), '// Click a snippet to preview and edit', fill='#6a9955')
code_lines = [
    ('keyword', 'export'),
    ('func', ' async function'),
    ('var', ' fetchData(url)'),
    ('paren', '('),
    ('param', '),'),
    ('bracket', ' {'),
    ('comment', '  // snippet body here'),
    ('bracket', '}'),
]
colors_map = {'keyword': '#c586c0', 'func': '#dcdcaa', 'var': '#9cdcfe',
              'paren': '#ffd700', 'param': '#ce9178', 'bracket': '#808080', 'comment': '#6a9955'}
y = 90
for label, txt in code_lines:
    d.text((300, y), txt, fill=colors_map[label])
    y += 22

img.save(os.path.join(out, 'screenshot-tree.png'))

# ---- Screenshot 2: Before/After contrast ----
img2, d2 = vscode_bg(1366, 768, 'SnippetVault - Before / After')
d2.rectangle([0, 0, 683, 768], fill='#1e1e1e')
d2.rectangle([683, 0, 1366, 768], fill='#1e1e1e')

# Left side: raw JSON chaos
d2.text((30, 60), 'BEFORE: raw .code-snippets JSON', fill='#f48771')
json_sample = [
    '{"scope": "javascript",',
    ' "prefix": ["cl","conlog"],',
    ' "body": [',
    '   "console.log($1);"',
    '  ],',
    ' "description": "Log output"',
]
for i, ln in enumerate(json_sample):
    d2.text((30, 100 + i * 22), ln, fill='#ce9178')
d2.text((30, 260), '... 470 more lines of tangled JSON ...', fill='#6e7781')

# Right side: clean GUI
d2.text((700, 60), 'AFTER: SnippetVault GUI', fill='#6a9955')
d2.rectangle([700, 85, 1340, 110], fill='#3c3c3c')
d2.text((710, 89), '(search: conl...)', fill='#aaaaaa')

right_groups = [
    ('javascript', ['console.log', 'fetch-call', 'promise-ch']),
    ('python',     ['if-main', 'list-comp', 'dict-merge']),
    ('react',      ['useEffect', 'useState']),
]
ry = 130
for gname, pfxs in right_groups:
    d2.text((710, ry), '>  ' + gname, fill='#e0e0e0')
    ry += 22
    for p in pfxs:
        d2.text((730, ry), '$  ' + p, fill='#9cdcfe')
        ry += 20
    ry += 8

d2.text((700, 350), 'Clean tree view + Instant search + One-click insert', fill='#cccccc')

img2.save(os.path.join(out, 'screenshot-before-after.png'))

# ---- Screenshot 3: Edit panel ----
img3, d3 = vscode_bg(1366, 768, 'SnippetVault - Edit Panel')
d3.rectangle([280, 30, 1366, 768], fill='#1e1e1e')
d3.rectangle([280, 30, 1366, 60], fill='#252526')
d3.text((290, 38), 'Edit: console.log', fill='#e0e0e0')
d3.text((1100, 38), '[Delete]       [Save]', fill='#aaaaaa')

d3.text((300, 100), 'Description', fill='#cccccc')
d3.rectangle([300, 120, 900, 145], fill='#3c3c3c')
d3.text((310, 124), 'Log output to console', fill='#d4d4d4')

d3.text((300, 175), 'Body', fill='#cccccc')
d3.rectangle([300, 195, 1000, 420], fill='#1e1e1e')
editor_sample = [
    'console.log($1);',
    '',
    '$2',
    '',
    '// $0 - cursor final position',
]
for i, ln in enumerate(editor_sample):
    d3.text((310, 210 + i * 24), ln, fill='#d4d4d4')

d3.text((300, 480), 'Status: Free plan - Upgrade to Pro for unlimited snippets ->', fill='#0969da')

img3.save(os.path.join(out, 'screenshot-editor.png'))

# ---- Icon: 128x128 vault-like ----
icon = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
ic = ImageDraw.Draw(icon)
for r in range(64, 0, -1):
    alpha = int(40 + (64 - r) * 2)
    ic.ellipse([64-r, 64-r, 64+r, 64+r], fill=(30, alpha, 80, 200))
ic.ellipse([10, 10, 118, 118], fill='#1a3a5c')
ic.ellipse([14, 14, 114, 114], fill='#1e4a7a')
ic.rectangle([35, 35, 93, 93], outline='#4a90d9', width=3)
ic.line([(64, 35), (64, 93)], fill='#4a90d9', width=2)
ic.arc([50, 50, 78, 78], 0, 360, fill='#ffcc00', width=3)
ic.ellipse([60, 60, 68, 68], fill='#ffcc00')

icon.save(os.path.join(root, 'icon.png'))
print('Done: 3 screenshots + icon saved to', root)
