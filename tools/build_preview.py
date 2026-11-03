#!/usr/bin/env python3
"""Build a single-file version of a page (the game's index.html, or human-test.html): every ES module it
uses is bundled in its own scope, stylesheets are inlined, and the body data (data/human) is embedded
compressed and decompressed in the browser with DecompressionStream.

The targets file is mostly 16-bit numbers; storing all low bytes, then all high bytes ("byte shuffle")
before gzip makes it compress far better. The page undoes the shuffle after decompressing.

usage: python3 tools/build_preview.py index.html out.html [title]
"""
import base64, gzip, json, re, sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
IMPORT_RE = re.compile(r'import\s*\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]\s*;?', re.S)
EXPORT_RE = re.compile(r'^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)', re.M)

def resolve(from_key, spec):
    base = PurePosixPath(from_key).parent
    parts = []
    for p in (base / spec).parts:
        if p == '..': parts.pop()
        elif p != '.': parts.append(p)
    return '/'.join(parts)

def bindings(names):
    out = []
    for n in names.split(','):
        n = n.strip()
        if not n: continue
        a = re.split(r'\s+as\s+', n)
        out.append(a[0] if len(a) == 1 else f'{a[0]}: {a[1]}')
    return ', '.join(out)

def bundle(entry_src, entry_key):
    """entry_src: the entry module's source; entry_key: its path relative to ROOT (for resolving imports)."""
    order, seen = [], set()
    def visit(key):
        if key in seen: return
        seen.add(key)
        for _, spec in IMPORT_RE.findall((ROOT / key).read_text()): visit(resolve(key, spec))
        order.append(key)
    for _, spec in IMPORT_RE.findall(entry_src): visit(resolve(entry_key, spec))
    out = ['const __mod = {};']
    def rewrite(src, key):
        return IMPORT_RE.sub(lambda m: f'const {{ {bindings(m.group(1))} }} = __mod[{json.dumps(resolve(key, m.group(2)))}];', src)
    for key in order:
        src = (ROOT / key).read_text()
        names = EXPORT_RE.findall(src)
        src = re.sub(r'^export\s+', '', rewrite(src, key), flags=re.M)
        out.append(f'__mod[{json.dumps(key)}] = (() => {{\n{src}\nreturn {{ {", ".join(names)} }};\n}})();')
    out.append('(async () => {\n' + rewrite(entry_src, entry_key) + '\n})();')
    return '\n'.join(out)

def main():
    page_path, out = ROOT / sys.argv[1], Path(sys.argv[2])
    title = sys.argv[3] if len(sys.argv) > 3 else None
    page = page_path.read_text()
    # stylesheets
    page = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: f'<style>\n{(ROOT / m.group(1)).read_text()}\n</style>', page)
    # the body data, compressed
    meta = (ROOT / 'data/human/human.json').read_bytes()
    binb = (ROOT / 'data/human/human-targets.bin').read_bytes()
    m = len(binb) // 2 * 2
    shuffled = binb[0:m:2] + binb[1:m:2] + binb[m:]
    data = (f'<script id="human-meta" type="text/plain">{base64.b64encode(gzip.compress(meta, 9)).decode()}</script>\n'
            f'<script id="human-bin" type="text/plain">{base64.b64encode(gzip.compress(shuffled, 9)).decode()}</script>\n')
    loader = '''
globalThis.__embeddedHuman = (async () => {
  const gunzip = async b64 => {
    const raw = atob(b64.trim()), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  };
  const metaEl = document.getElementById('human-meta'), binEl = document.getElementById('human-bin');
  const meta = JSON.parse(new TextDecoder().decode(await gunzip(metaEl.textContent)));
  const sh = await gunzip(binEl.textContent), n = sh.length, half = n >> 1, bytes = new Uint8Array(n);
  for (let i = 0; i < half; i++) { bytes[2 * i] = sh[i]; bytes[2 * i + 1] = sh[half + i]; }
  if (n & 1) bytes[n - 1] = sh[n - 1];
  metaEl.remove(); binEl.remove();
  return { meta, bin: bytes.buffer };
})();
'''
    # the page's module script: either inline, or src="..."
    mod = re.search(r'<script type="module"( src="([^"]+)")?>(.*?)</script>', page, re.S)
    if mod.group(2): entry_key, entry_src = mod.group(2), (ROOT / mod.group(2)).read_text()
    else: entry_key, entry_src = page_path.name, mod.group(3)
    js = loader + bundle(entry_src, entry_key)
    page = page[:mod.start()] + data + '<script>\n' + js + '\n</script>' + page[mod.end():]
    if title: page = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', page)
    out.write_text(page)
    print(f'{out}: {len(page) / 1e6:.2f} MB')

main()
