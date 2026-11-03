#!/usr/bin/env python3
"""
convert_mh.py — converts the MakeHuman CC0 base mesh, morph targets and skin
weights into two compact files the game loads:

    data/human/human.json          mesh, clothing regions, eye helpers, target index
    data/human/human-targets.bin   all morph targets (quantized, sparse)

Usage:
    git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git mh
    cd mh && git sparse-checkout set makehuman/data/3dobjs makehuman/data/rigs makehuman/data/targets/macrodetails makehuman/data/targets/breast && cd ..
    python3 tools/convert_mh.py mh/makehuman/data data/human

Only the assets (released by the MakeHuman project as CC0) are used; no MakeHuman code.
"""
import json, os, struct, sys

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- base mesh
verts, groups, cur = [], {}, None
for line in open(os.path.join(SRC, '3dobjs/base.obj')):
    if line.startswith('v '):
        verts.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        cur = line.split()[1]; groups.setdefault(cur, [])
    elif line.startswith('f '):
        groups[cur].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])

# ---------------------------------------------------------------- head subdivision
# The head gets one level of subdivision so species shapes (muzzles, beaks, crests) have enough
# geometry to form. New vertices are inserted right after the original body vertices (so every
# body vertex stays in one block) and helpers shift up. Every target, skin weight and skeleton
# joint is carried over: a new vertex is the average of its parents, for position and offsets.
HEAD_Y = 6.35                                           # neutral height where the subdivided region starts
old_body = 1 + max(i for f in groups['body'] for i in f)
old_n = len(verts)
new_parents = []                                        # for each new vertex: [(old index, weight)]
edge_mid = {}
def mid(a, b):
    k = (min(a, b), max(a, b))
    if k not in edge_mid: edge_mid[k] = old_n + len(new_parents); new_parents.append([(a, 0.5), (b, 0.5)])
    return edge_mid[k]
def center(face):
    new_parents.append([(i, 1 / len(face)) for i in face]); return old_n + len(new_parents) - 1
in_head = lambda f: all(verts[i][1] > HEAD_Y for i in f)
new_body = []
for f in groups['body']:
    if not in_head(f): continue
    c = center(f); m = [mid(f[k], f[(k + 1) % len(f)]) for k in range(len(f))]
    for k in range(len(f)): new_body.append([f[k], m[k], c, m[k - 1]])
for f in groups['body']:
    if in_head(f): continue
    split = [edge_mid.get((min(f[k], f[(k + 1) % len(f)]), max(f[k], f[(k + 1) % len(f)]))) for k in range(len(f))]
    if not any(x is not None for x in split): new_body.append(f); continue
    # a face next to the subdivided region: fan around its center so no cracks open
    poly = []
    for k in range(len(f)):
        poly.append(f[k])
        if split[k] is not None: poly.append(split[k])
    c = center(f)
    for k in range(len(poly)): new_body.append([poly[k], poly[(k + 1) % len(poly)], c])
n_new = len(new_parents)
def remap(i):                                           # old or temporary index -> final index
    if i >= old_n: return old_body + (i - old_n)
    return i if i < old_body else i + n_new
# resolve new vertices' parents to final positions (parents may themselves be new vertices: none are,
# since every new vertex is made from original vertices only)
new_pos = [[sum(verts[a][k] * w for a, w in par) for k in range(3)] for par in new_parents]
verts = verts[:old_body] + new_pos + verts[old_body:]
groups = {g: [[remap(i) for i in f] for f in (new_body if g == 'body' else fs)] for g, fs in groups.items()}
def carry(d):
    """Remap a {old index: (dx,dy,dz)} target and give new vertices their parents' average offset."""
    out = {remap(i): v for i, v in d.items()}
    for k, par in enumerate(new_parents):
        dx = dy = dz = 0.0; hit = False
        for a, w in par:
            v = d.get(a)
            if v: dx += v[0] * w; dy += v[1] * w; dz += v[2] * w; hit = True
        if hit and (dx or dy or dz): out[old_body + k] = (dx, dy, dz)
    return out

def tris(faces):
    out = []
    for f in faces:
        for i in range(1, len(f) - 1): out += [f[0], f[i], f[i + 1]]
    return out

body_faces = groups['body']
body_count = 1 + max(i for f in body_faces for i in f)

def group_verts(name): return sorted({i for f in groups[name] for i in f})

# ---------------------------------------------------------------- skin weights -> clothing regions
W = json.load(open(os.path.join(SRC, 'rigs/default_weights.mhw')))['weights']
_W = {}
for bone, pairs in W.items():
    _W[bone] = [[remap(i), w] for i, w in pairs]
_by = {}
for bone, pairs in W.items():
    for i, w in pairs: _by.setdefault(i, {})[bone] = w
for k, par in enumerate(new_parents):
    acc = {}
    for a, pw in par:
        for bone, w in _by.get(a, {}).items(): acc[bone] = acc.get(bone, 0) + w * pw
    for bone, w in acc.items():
        if w > 1e-4: _W.setdefault(bone, []).append([old_body + k, w])
W = _W
vw = {}
for bone, pairs in W.items():
    for i, w in pairs: vw.setdefault(i, {})[bone] = w

def share(i, bones):
    d = vw.get(i, {}); return sum(w for b, w in d.items() if any(b.startswith(x) for x in bones))

# Clothing regions are cut with level lines on the neutral base mesh (decimeters),
# with the arms left out using the skin weights. Membership is per vertex index,
# so the cuts stay in the same place on every body shape.
ARMS = ['shoulder01', 'upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal']
region = {'top': [], 'shorts': [], 'shoes': []}
for i in range(body_count):
    x, y, z = verts[i]
    arm = share(i, ARMS) > 0.3
    if y < -7.25 or share(i, ['foot', 'toe']) > 0.5:
        region['shoes'].append(i)
    if not arm and -2.1 < y < 1.75:
        region['shorts'].append(i)
    if not arm and 0.45 < y < 5.35 and abs(x) < 1.75:
        region['top'].append(i)

def region_faces(vs):
    s = set(vs); return tris([f for f in body_faces if all(i in s for i in f)])

# ---------------------------------------------------------------- morph targets
def read_target(path):
    d = {}
    for line in open(path):
        if line.startswith('#') or not line.strip(): continue
        p = line.split(); d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    # new (subdivided) vertices are filled in at load from their parents, so targets only store originals
    return {remap(i): v for i, v in d.items()}

T = os.path.join(SRC, 'targets')
targets = {}
for g in ['female', 'male']:
    for a in ['young', 'old']:
        for m in ['minmuscle', 'averagemuscle', 'maxmuscle']:
            for w in ['minweight', 'averageweight', 'maxweight']:
                targets[f'universal-{g}-{a}-{m}-{w}'] = read_target(f'{T}/macrodetails/universal-{g}-{a}-{m}-{w}.target')
        # the three ethnic shapes averaged: a neutral human the races are built on
        mix = {}
        for e in ['african', 'asian', 'caucasian']:
            for i, d in read_target(f'{T}/macrodetails/{e}-{g}-{a}.target').items():
                o = mix.get(i, (0, 0, 0)); mix[i] = (o[0] + d[0] / 3, o[1] + d[1] / 3, o[2] + d[2] / 3)
        targets[f'ethnic-{g}-{a}'] = mix
        for h in ['minheight', 'maxheight']:
            targets[f'height-{g}-{a}-{h}'] = read_target(f'{T}/macrodetails/height/{g}-{a}-averagemuscle-averageweight-{h}.target')
        for pr in ['idealproportions', 'uncommonproportions']:
            targets[f'proportions-{g}-{a}-{pr}'] = read_target(f'{T}/macrodetails/proportions/{g}-{a}-averagemuscle-averageweight-{pr}.target')
for c in ['mincup', 'maxcup']:
    targets[f'breast-cup-{c}'] = read_target(f'{T}/breast/female-young-averagemuscle-averageweight-{c}-averagefirmness.target')
for fm in ['minfirmness', 'maxfirmness']:
    targets[f'breast-firm-{fm}'] = read_target(f'{T}/breast/female-young-averagemuscle-averageweight-averagecup-{fm}.target')
for n in ['nipple-point-decr', 'nipple-size-decr', 'breast-trans-up', 'breast-trans-down', 'breast-dist-incr', 'breast-dist-decr', 'breast-point-incr', 'breast-point-decr', 'breast-volume-vert-up', 'breast-volume-vert-down']:
    targets[n] = read_target(f'{T}/breast/{n}.target')

# ---------------------------------------------------------------- detail targets -> sliders
# Paired targets (narrower/wider, up/down, ...) become one slider from -1 to 1;
# left/right versions are merged so the face and body stay symmetric.
# Sideways moves of single centered parts (nose, mouth, ...) are left out: they only make faces lopsided.
CENTERED = ('head', 'nose', 'mouth', 'neck', 'torso', 'hip', 'forehead', 'chin', 'stomach')
SECTIONS = [
    ('Head', ['head', 'forehead']), ('Brows', ['eyebrows']), ('Eyes', ['eyes']), ('Nose', ['nose']),
    ('Mouth', ['mouth']), ('Cheeks and chin', ['cheek', 'chin']), ('Ears', ['ears']), ('Neck', ['neck']),
    ('Torso', ['torso', 'stomach']), ('Hips and legs', ['hip', 'buttocks', 'armslegs:upperleg,lowerleg,leg']),
    ('Arms and hands', ['armslegs:upperarm,lowerarm,hand']), ('Feet', ['armslegs:foot']), ('Measurements', ['measure']),
]
PAIRS = [('-decr', '-incr'), ('-down', '-up'), ('-in', '-out'), ('-backward', '-forward'), ('-concave', '-convex'),
         ('-compress', '-uncompress'), ('-less', '-more')]
SKIP = {'stomach-pregnant-decr', 'stomach-pregnant-incr'}
modifiers = []
for section, folders in SECTIONS:
    for spec in folders:
        folder, _, only = spec.partition(':')
        names = sorted(f[:-7] for f in os.listdir(f'{T}/{folder}') if f.endswith('.target') and f[:-7] not in SKIP)
        if only: names = [n for n in names if n.split('-')[1] in only.split(',')]
        used = set()
        def load(n):
            if n not in targets: targets[n] = read_target(f'{T}/{folder}/{n}.target')
        for n in names:
            if n in used or n.startswith('r-'): continue
            mod = None
            for neg, pos in PAIRS:
                if n.endswith(neg) and n[: -len(neg)] + pos in names:
                    base = n[: -len(neg)]; mod = {'neg': [n], 'pos': [base + pos]}; break
                if n.endswith(pos) and n[: -len(pos)] + neg in names:
                    base = n[: -len(pos)]; mod = {'neg': [base + neg], 'pos': [n]}; break
            if mod is None: base = n; mod = {'neg': [], 'pos': [n]}
            elif base.endswith('-trans') or base.endswith('-rot'):
                base = base + '-' + mod['pos'][0].rsplit('-', 1)[1]          # nose-trans-up, nose-trans-forward, ...
            if base.split('-')[0] in CENTERED and base.endswith('-trans-out'):
                for t in mod['neg'] + mod['pos']: used.add(t)
                continue
            if base.startswith('l-'):
                twin = lambda t: 'r-' + t[2:]
                mod = {k: v + [twin(t) for t in v if twin(t) in names] for k, v in mod.items()}
                base = base[2:]
            for t in mod['neg'] + mod['pos']: used.add(t); load(t)
            if any(m['id'] == base for m in modifiers): base += '-' + mod['pos'][0].rsplit('-', 1)[1]   # eye-bag-out, stomach-navel-up, ...
            modifiers.append({'id': base, 'section': section, 'signed': bool(mod['neg']), 'neg': mod['neg'], 'pos': mod['pos']})

blob, index = bytearray(), {}
for name, d in targets.items():
    if not d: continue
    ids = sorted(d)
    mx = max(max(abs(c) for c in d[i]) for i in ids) or 1e-6
    scale = mx / 32767
    off = len(blob)
    blob += struct.pack(f'<{len(ids)}H', *ids)
    if len(blob) % 2: blob += b'\0'
    if len(ids) % 2: blob += b'\0\0'          # keep the Int16 block 4-byte aligned
    doff = len(blob)
    blob += struct.pack(f'<{3 * len(ids)}h', *[round(c / scale) for i in ids for c in d[i]])
    index[name] = {'offset': off, 'deltaOffset': doff, 'count': len(ids), 'scale': scale}
open(os.path.join(OUT, 'human-targets.bin'), 'wb').write(blob)

# ---------------------------------------------------------------- skeleton + skin weights
# Bone ends are defined as averages of mesh vertices, so the skeleton refits to any morph.
SK = json.load(open(os.path.join(SRC, 'rigs/default.mhskel')))
SK['joints'] = {k: [remap(i) for i in v] for k, v in SK['joints'].items()}
order, seen = [], set()
def visit(name):
    if name in seen: return
    par = SK['bones'][name]['parent']
    if par: visit(par)
    seen.add(name); order.append(name)
for name in sorted(SK['bones']): visit(name)
bone_index = {n: i for i, n in enumerate(order)}
skeleton = [{'name': n, 'parent': bone_index.get(SK['bones'][n]['parent'], -1),
             'head': SK['joints'][SK['bones'][n]['head']], 'tail': SK['joints'][SK['bones'][n]['tail']]} for n in order]
infl = [[] for _ in verts]
for bone, pairs in W.items():
    if bone not in bone_index: continue
    for i, w in pairs: infl[i].append((w, bone_index[bone]))
skin_idx, skin_w = [], []
root_i = bone_index['root']
for i in range(len(verts)):
    top = sorted(infl[i], reverse=True)[:4] or [(1.0, root_i)]
    tot = sum(w for w, _ in top)
    ws = [round(w / tot * 255) for w, _ in top]
    ws[0] += 255 - sum(ws)                      # weights add up exactly
    top += [(0, 0)] * (4 - len(top)); ws += [0] * (4 - len(ws))
    skin_idx += [b for _, b in top]; skin_w += ws

meta = {
    'license': 'Base mesh, morph targets and skin weights: MakeHuman, released as CC0 1.0 Universal.',
    'units': 'decimeters, y up, +z forward',
    'vertexCount': len(verts), 'bodyVertexCount': body_count,
    'positions': [round(c, 5) for v in verts for c in v],
    'bodyTris': tris(body_faces),
    'eyes': {'left': group_verts('helper-l-eye'), 'right': group_verts('helper-r-eye')},
    'lashes': tris(groups['helper-l-eyelashes-1'] + groups['helper-l-eyelashes-2'] + groups['helper-r-eyelashes-1'] + groups['helper-r-eyelashes-2']),
    'clothing': {k: {'tris': region_faces(v)} for k, v in region.items()},
    'targets': index,
    # subdivided head vertices: each is the weighted average of its parents (final indices)
    'subdiv': {'start': old_body, 'parents': [[remap(a) for a, w in par] for par in new_parents], 'weights': [[round(w, 5) for a, w in par] for par in new_parents]},
    'modifiers': modifiers,
    'skeleton': skeleton,
    'skinIndex': skin_idx,
    'skinWeight': skin_w,
}
json.dump(meta, open(os.path.join(OUT, 'human.json'), 'w'), separators=(',', ':'))
print('targets', len(index), 'bin', len(blob) // 1024, 'KB', 'json', os.path.getsize(os.path.join(OUT, 'human.json')) // 1024, 'KB')
print({k: len(v) for k, v in region.items()})
