"""Turn an Overpass JSON dump into a compact road graph + building list for the game.

Output (JSON):
  names:  list of street / building names
  nodes:  [[x, z, radius, signal(0/1)], ...]          metres, x east, z south
  edges:  [[a, b, cls, nameIdx, oneway, lanes, hw, [x,z,x,z,...]], ...]
          oneway 1 = only a->b allowed; lanes = lanes per allowed direction; hw = half width
  blds:   [[height, nameIdx, [x,z,...]], ...]
  start:  [x, z, heading]
  bounds: [minx, minz, maxx, maxz]
"""
import json, math, sys, collections

src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
# map extent: the bounding box of any administrative boundary relations in the dump (the districts asked for),
# otherwise the original 信義區 box around Taipei 101
rels = [e for e in d['elements'] if e['type'] == 'relation' and 'bounds' in e]
if rels:
    minlat = min(r['bounds']['minlat'] for r in rels); maxlat = max(r['bounds']['maxlat'] for r in rels)
    minlon = min(r['bounds']['minlon'] for r in rels); maxlon = max(r['bounds']['maxlon'] for r in rels)
    lat0, lon0 = (minlat + maxlat) / 2, (minlon + maxlon) / 2
else:
    lat0, lon0 = 25.0355, 121.56375
KX = math.cos(math.radians(lat0)) * 111320.0
KZ = 110540.0
def proj(lat, lon):
    return ((lon - lon0) * KX, (lat0 - lat) * KZ)

nodes = {e['id']: proj(e['lat'], e['lon']) for e in d['elements'] if e['type'] == 'node'}
ways = [e for e in d['elements'] if e['type'] == 'way']

CLS = {'trunk': 0, 'primary': 0, 'secondary': 0, 'tertiary': 1, 'unclassified': 2, 'residential': 2}
names = []
name_idx = {}
def nid(n):
    if not n:
        return -1
    if n not in name_idx:
        name_idx[n] = len(names); names.append(n)
    return name_idx[n]

roads = []
for w in ways:
    t = w.get('tags', {})
    if t.get('highway') not in CLS:
        continue
    ug = '地下道' in t.get('name', '')
    if ug and t['highway'] != 'secondary':
        continue
    if not ug and t.get('tunnel') in ('yes', 'building_passage'):
        continue
    layer = int(t.get('layer', '0')) if t.get('layer', '0').lstrip('-').isdigit() else 0
    if not ug and layer < 0:
        continue
    if layer >= 1 or t.get('bridge') == 'viaduct':
        continue  # elevated expressways (建國高架, 市民大道高架) would sit on top of the streets below
    if t['highway'].endswith('_link') and t.get('bridge'):
        continue
    pts = [n for n in w['nodes'] if n in nodes]
    if len(pts) < 2:
        continue
    oneway = 1 if t.get('oneway') in ('yes', '1', 'true') else (-1 if t.get('oneway') == '-1' else 0)
    if oneway == -1:
        pts = pts[::-1]; oneway = 1
    cls = CLS[t['highway']]
    try:
        lanes_total = int(t.get('lanes', '0').split(';')[0])
    except ValueError:
        lanes_total = 0
    if not lanes_total:
        lanes_total = {0: 3 if oneway else 4, 1: 2, 2: 1 if oneway else 2}[cls]
    lanes_total = max(1, min(lanes_total, 5 if oneway else 8))
    per_dir = lanes_total if oneway else max(1, lanes_total // 2)
    hw = lanes_total * 3.2 / 2 + 0.6
    roads.append(dict(pts=pts, oneway=oneway, cls=cls, name=t.get('name', ''), per_dir=per_dir, hw=hw, ug=ug))

# graph nodes: way ends + nodes shared by more than one road
use = collections.Counter()
for r in roads:
    for n in r['pts']:
        use[n] += 1
    use[r['pts'][0]] += 1; use[r['pts'][-1]] += 1
gnodes = {n for n, c in use.items() if c >= 2}

segs = []
for r in roads:
    cur = [r['pts'][0]]
    for n in r['pts'][1:]:
        cur.append(n)
        if n in gnodes:
            segs.append(dict(r, pts=cur)); cur = [n]

# cluster graph nodes closer than CL metres (dual carriageway junctions)
CL = 20.0
gl = sorted({s['pts'][0] for s in segs} | {s['pts'][-1] for s in segs})
surface_node = set()
for sg in segs:
    if not sg['ug']:
        surface_node.add(sg['pts'][0]); surface_node.add(sg['pts'][-1])
parent = {n: n for n in gl}
def find(n):
    while parent[n] != n:
        parent[n] = parent[parent[n]]; n = parent[n]
    return n
cgrid = collections.defaultdict(list)
for a in gl:
    cgrid[(int(nodes[a][0] // CL), int(nodes[a][1] // CL))].append(a)
for a in gl:
    ax, az = nodes[a]; gx, gz = int(ax // CL), int(az // CL)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for b in cgrid[(gx + i, gz + j)]:
                if b <= a or (a in surface_node) != (b in surface_node):
                    continue
                bx, bz = nodes[b]
                if math.hypot(ax - bx, az - bz) < CL:
                    parent[find(a)] = find(b)
clusters = collections.defaultdict(list)
for n in gl:
    clusters[find(n)].append(n)
cid = {}
cnodes = []
for root, mem in clusters.items():
    x = sum(nodes[m][0] for m in mem) / len(mem); z = sum(nodes[m][1] for m in mem) / len(mem)
    spread = max(math.hypot(nodes[m][0] - x, nodes[m][1] - z) for m in mem)
    for m in mem:
        cid[m] = len(cnodes)
    cnodes.append(dict(x=x, z=z, spread=spread, edges=[]))

def simplify(pts, eps=0.8):
    if len(pts) < 3:
        return pts
    (x1, z1), (x2, z2) = pts[0], pts[-1]
    L = math.hypot(x2 - x1, z2 - z1) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        x, z = pts[i]
        dd = abs((x2 - x1) * (z1 - z) - (x1 - x) * (z2 - z1)) / L
        if dd > best:
            best, bi = dd, i
    if best < eps:
        return [pts[0], pts[-1]]
    return simplify(pts[:bi + 1], eps)[:-1] + simplify(pts[bi:], eps)

edges = []
for s in segs:
    a, b = cid[s['pts'][0]], cid[s['pts'][-1]]
    if a == b:
        continue
    poly = [nodes[n] for n in s['pts']]
    poly[0] = (cnodes[a]['x'], cnodes[a]['z']); poly[-1] = (cnodes[b]['x'], cnodes[b]['z'])
    poly = simplify(poly)
    edges.append(dict(a=a, b=b, cls=s['cls'], name=s['name'], oneway=s['oneway'], lanes=s['per_dir'], hw=s['hw'], poly=poly, ug=s['ug']))
    cnodes[a]['edges'].append(len(edges) - 1); cnodes[b]['edges'].append(len(edges) - 1)

# clip to the requested box
if rels:
    (BX0, BZ1), (BX1, BZ0) = proj(minlat, minlon), proj(maxlat, maxlon)
    BX0, BX1, BZ0, BZ1 = round(BX0), round(BX1), round(BZ0), round(BZ1)
else:
    BX0, BX1, BZ0, BZ1 = -535.0, 535.0, -445.0, 445.0
def inside(p):
    return BX0 <= p[0] <= BX1 and BZ0 <= p[1] <= BZ1
def cross(p, q):
    t0, t1 = 0.0, 1.0
    dx, dz = q[0] - p[0], q[1] - p[1]
    for pp, qq in ((-dx, p[0] - BX0), (dx, BX1 - p[0]), (-dz, p[1] - BZ0), (dz, BZ1 - p[1])):
        if pp == 0:
            continue
        t = qq / pp
        if pp < 0: t0 = max(t0, t)
        else: t1 = min(t1, t)
    return t0, t1
clipped = []
for e in edges:
    pieces, cur = [], []
    poly = e['poly']
    for i in range(len(poly) - 1):
        p, q = poly[i], poly[i + 1]
        t0, t1 = cross(p, q)
        if t0 > t1:
            if cur: pieces.append(cur); cur = []
            continue
        a = (p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0)
        b = (p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1)
        if not cur:
            cur = [a]
        cur.append(b)
        if t1 < 1.0:
            pieces.append(cur); cur = []
    if cur: pieces.append(cur)
    for pc in pieces:
        if len(pc) < 2 or sum(math.hypot(pc[i+1][0]-pc[i][0], pc[i+1][1]-pc[i][1]) for i in range(len(pc)-1)) < 6:
            continue
        ends = []
        for end, orig in ((pc[0], e['a']), (pc[-1], e['b'])):
            o = cnodes[orig]
            if math.hypot(end[0] - o['x'], end[1] - o['z']) < 0.5:
                ends.append(orig)
            else:
                cnodes.append(dict(x=end[0], z=end[1], spread=0, edges=[])); ends.append(len(cnodes) - 1)
        clipped.append(dict(e, a=ends[0], b=ends[1], poly=pc))
for n in cnodes:
    n['edges'] = []
edges = clipped
for i, e in enumerate(edges):
    cnodes[e['a']]['edges'].append(i); cnodes[e['b']]['edges'].append(i)

# the two one-way underpass carriageways are mapped only a few metres apart (they even overlap),
# so merge them into one two-way corridor: centre line halfway between them, 2 lanes each way
def merge_underpass(name):
    global edges
    ug = [i for i, e in enumerate(edges) if e['ug'] and e['name'] == name]
    if not ug:
        return
    only_ug = lambda n: all(edges[j]['ug'] for j in cnodes[n]['edges'])
    taken = set()
    def chain(start_edge):
        out, e = [start_edge], edges[start_edge]
        while only_ug(e['b']):
            nxt = [j for j in cnodes[e['b']]['edges'] if j not in out and j not in taken and edges[j]['ug'] and edges[j]['name'] == name and edges[j]['a'] == e['b']
                   and not (edges[j]['b'] == e['a'])]
            if not nxt:
                break
            out.append(nxt[0]); e = edges[nxt[0]]
        taken.update(out)
        return out
    starts = [i for i in ug if not only_ug(edges[i]['a']) or len(cnodes[edges[i]['a']]['edges']) == 1]
    starts.sort(key=lambda i: only_ug(edges[i]['a']))  # the carriageway leaving the surface junction first
    chains = [chain(i) for i in starts]
    if all(not edges[i]['oneway'] for i in ug):
        print('underpass %s: already two-way' % name); return
    if len(chains) != 2:
        # an odd shape we cannot pair up: leave it out rather than draw overlapping walls
        print('underpass %s: %d one-way pieces, left out' % (name, len(chains)))
        drop = set(ug)
        edges = [e for i, e in enumerate(edges) if i not in drop]
        for n in cnodes:
            n['edges'] = []
        for i, e in enumerate(edges):
            cnodes[e['a']]['edges'].append(i); cnodes[e['b']]['edges'].append(i)
        return
    def poly_of(ch):
        pts = []
        for j in ch:
            pts += edges[j]['poly'] if not pts else edges[j]['poly'][1:]
        return pts
    A, B = poly_of(chains[0]), poly_of(chains[1])[::-1]
    def nearest(p, poly):
        best, bp = 1e18, poly[0]
        for i in range(1, len(poly)):
            (x1, z1), (x2, z2) = poly[i - 1], poly[i]
            dx, dz = x2 - x1, z2 - z1; L2 = dx * dx + dz * dz or 1e-9
            u = max(0.0, min(1.0, ((p[0] - x1) * dx + (p[1] - z1) * dz) / L2))
            q = (x1 + dx * u, z1 + dz * u); d = math.hypot(p[0] - q[0], p[1] - q[1])
            if d < best: best, bp = d, q
        return bp
    mid = []
    for p in densify(A, 5.0):
        q = nearest(p, B); mid.append(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
    first, last = edges[chains[0][0]], edges[chains[0][-1]]
    a_node = first['a']                       # surface junction, shared by both carriageways
    other_end = edges[chains[1][0]]['a']      # where the opposite carriageway starts
    ex = (cnodes[last['b']]['x'] + cnodes[other_end]['x']) / 2; ez = (cnodes[last['b']]['z'] + cnodes[other_end]['z']) / 2
    cnodes.append(dict(x=ex, z=ez, spread=0, edges=[])); b_node = len(cnodes) - 1
    mid[0] = (cnodes[a_node]['x'], cnodes[a_node]['z']); mid[-1] = (ex, ez)
    lanes = 2
    merged = dict(first, a=a_node, b=b_node, oneway=0, lanes=lanes, hw=lanes * 3.2 + 0.6, poly=simplify(mid, 0.4))
    drop = set(chains[0]) | set(chains[1])
    edges = [e for i, e in enumerate(edges) if i not in drop] + [merged]
    for n in cnodes:
        n['edges'] = []
    for i, e in enumerate(edges):
        cnodes[e['a']]['edges'].append(i); cnodes[e['b']]['edges'].append(i)
    print(name, 'merged: length %.0f m, carriageways %d+%d edges' % (sum(math.hypot(mid[i][0]-mid[i-1][0], mid[i][1]-mid[i-1][1]) for i in range(1, len(mid))), len(chains[0]), len(chains[1])))

# underpass depth: 0 where it meets surface streets, down to DEEP metres, back to 0 at the map edge
DEEP, DOWN, UP = -7.0, 220.0, 90.0
def densify(poly, step=10.0):
    out = [poly[0]]
    for i in range(1, len(poly)):
        (x1, z1), (x2, z2) = poly[i - 1], poly[i]
        n = max(1, int(math.hypot(x2 - x1, z2 - z1) // step))
        for k in range(1, n + 1):
            out.append((x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n))
    return out
for nm in sorted({e['name'] for e in edges if e['ug']}):
    merge_underpass(nm)
for e in edges:
    if e['ug']:
        e['poly'] = densify(e['poly'])
key = lambda p: (round(p[0], 1), round(p[1], 1))
adj = collections.defaultdict(list)
for e in edges:
    if not e['ug']:
        continue
    for i in range(1, len(e['poly'])):
        a, b = key(e['poly'][i - 1]), key(e['poly'][i])
        d = math.hypot(a[0] - b[0], a[1] - b[1])
        adj[a].append((b, d)); adj[b].append((a, d))
def dijkstra(srcs):
    import heapq
    dist = {s: 0.0 for s in srcs}; pq = [(0.0, s) for s in srcs]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w; heapq.heappush(pq, (d + w, v))
    return dist
surf_keys, edge_keys = set(), set()
for i, e in enumerate(edges):
    for end, n in ((e['poly'][0], e['a']), (e['poly'][-1], e['b'])):
        if e['ug']:
            if any(not edges[j]['ug'] for j in cnodes[n]['edges']):
                surf_keys.add(key(end))
            if abs(end[0] - BX0) < 1 or abs(end[0] - BX1) < 1 or abs(end[1] - BZ0) < 1 or abs(end[1] - BZ1) < 1:
                edge_keys.add(key(end))
dS, dB = dijkstra(surf_keys), dijkstra(edge_keys)
ss = lambda t: 0.0 if t <= 0 else 1.0 if t >= 1 else t * t * (3 - 2 * t)
for e in edges:
    if e['ug']:
        e['ys'] = [round(DEEP * ss(dS.get(key(p), 1e9) / DOWN) * ss(dB.get(key(p), 1e9) / UP), 2) for p in e['poly']]

# node radius and signals
for n in cnodes:
    hws = [edges[e]['hw'] for e in n['edges'] if not edges[e]['ug']] or [edges[e]['hw'] for e in n['edges']]
    n['r'] = max(4.0, min(26.0, (max(hws) if hws else 4) + n['spread'] + 1.0))
    major = any(edges[e]['cls'] <= 1 for e in n['edges'])
    n['sig'] = 1 if (len(n['edges']) >= 3 and major) else 0
    if all(edges[e]['ug'] for e in n['edges']):
        n['sig'] = 0
    inb = BX0 + 1 < n['x'] < BX1 - 1 and BZ0 + 1 < n['z'] < BZ1 - 1
    if not inb: n['sig'] = 0

# drop unused nodes, reindex
used = sorted({e['a'] for e in edges} | {e['b'] for e in edges})
remap = {o: i for i, o in enumerate(used)}
out_nodes = [[round(cnodes[o]['x'], 1), round(cnodes[o]['z'], 1), round(cnodes[o]['r'], 1), cnodes[o]['sig']] for o in used]
out_edges = []
for e in edges:
    flat = []
    for x, z in e['poly']:
        flat += [round(x, 1), round(z, 1)]
    out_edges.append([remap[e['a']], remap[e['b']], e['cls'], nid(e['name']), e['oneway'], e['lanes'], round(e['hw'], 1), flat, 1 if e['ug'] else 0, e.get('ys', 0)])

# buildings
def area(poly):
    return 0.5 * abs(sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly))))
def num(v):
    try:
        return float(str(v).split()[0].replace('m', ''))
    except (ValueError, IndexError):
        return None
blds = []
import random
random.seed(7)
for w in ways:
    t = w.get('tags', {})
    if 'building' not in t:
        continue
    pts = [nodes[n] for n in w['nodes'] if n in nodes]
    if len(pts) < 4:
        continue
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    ded = [pts[0]]
    for q in pts[1:]:
        if math.hypot(q[0] - ded[-1][0], q[1] - ded[-1][1]) > 0.5:
            ded.append(q)
    pts = ded
    if len(pts) < 3:
        continue
    cx = sum(q[0] for q in pts) / len(pts); cz = sum(q[1] for q in pts) / len(pts)
    if not (BX0 < cx < BX1 and BZ0 < cz < BZ1):
        continue
    A = area(pts)
    if A < 25:
        continue
    h = num(t.get('height'))
    if h is None and num(t.get('building:levels')):
        h = num(t.get('building:levels')) * 3.4
    flat = []
    for x, z in pts:
        flat += [round(x, 1), round(z, 1)]
    blds.append([None if h is None else round(h, 1), nid(t.get('name', '')), flat, cx, cz, A, t.get('building', 'yes')])

# buildings without a height or floor count: estimate from their type, footprint and the known heights nearby
known = collections.defaultdict(list)
for b in blds:
    if b[0] is not None:
        known[(int(b[3] // 150), int(b[4] // 150))].append(b[0])
TYPE_H = {'roof': 4.5, 'garage': 3.5, 'garages': 3.5, 'shed': 3.5, 'kiosk': 3.5, 'hut': 3.5, 'carport': 3.5, 'toilets': 4,
          'house': 8, 'detached': 8, 'temple': 11, 'church': 14, 'school': 14, 'kindergarten': 10}
def area_h(A):
    return 12 if A < 120 else 15 if A < 300 else 20 if A < 800 else 30 if A < 2000 else 40
filled = 0
for b in blds:
    if b[0] is not None:
        continue
    cx, cz, A, kind = b[3], b[4], b[5], b[6]
    if kind in TYPE_H:
        h = TYPE_H[kind]
    else:
        near = []
        gx, gz = int(cx // 150), int(cz // 150)
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                near += known.get((gx + i, gz + j), [])
        h = area_h(A)
        if len(near) >= 3:
            near.sort(); med = near[len(near) // 2]
            h = 0.5 * h + 0.5 * min(med, h * 2.5)
    b[0] = round(max(3.5, min(80, h * (0.9 + random.random() * 0.2))), 1)
    filled += 1
blds = [b[:3] for b in blds]
print('estimated heights for', filled, 'buildings')

# start: on 和平東路三段, heading east toward the 基隆路 junction, middle lane, a few metres before the stop line
# (falls back to the westmost eastbound 信義路五段 edge, the old start near Taipei 101)
start = None
for e in edges:
    if e['ug'] or not e['oneway'] or not e['name'].startswith('和平東路三段'):
        continue
    nb = cnodes[e['b']]
    if not any(edges[j]['name'].startswith('基隆路') and not edges[j]['ug'] for j in nb['edges']):
        continue
    (x1, z1), (x2, z2) = e['poly'][0], e['poly'][-1]
    if x2 <= x1:
        continue  # want the eastbound carriageway
    poly = e['poly']; L = sum(math.hypot(poly[i+1][0]-poly[i][0], poly[i+1][1]-poly[i][1]) for i in range(len(poly)-1))
    back = nb['r'] + 4.6 + 6            # distance from the junction centre
    s_ = max(1.0, L - back)
    acc = 0.0
    for i in range(len(poly) - 1):
        (ax, az), (bx, bz) = poly[i], poly[i + 1]; seg = math.hypot(bx - ax, bz - az)
        if acc + seg >= s_ or i == len(poly) - 2:
            u = min(1.0, (s_ - acc) / seg) if seg else 0
            sx, sz = ax + (bx - ax) * u, az + (bz - az) * u
            start = [round(sx, 1), round(sz, 1), round(math.atan2(bx - ax, bz - az), 4)]
            break
        acc += seg
    break
if start is None:
    best = None
    for e in edges:
        if e['name'] == '信義路五段' and e['oneway'] and e['poly'][-1][0] > e['poly'][0][0]:
            if best is None or e['poly'][0][0] < best['poly'][0][0]:
                best = e
    if best is None:
        best = max(edges, key=lambda e: e['hw'])
    (x1, z1), (x2, z2) = best['poly'][0], best['poly'][1]
    L = math.hypot(x2 - x1, z2 - z1)
    k = min(0.5, 30 / L)
    sx, sz = x1 + (x2 - x1) * k, z1 + (z2 - z1) * k
    rx, rz = -(z2 - z1) / L, (x2 - x1) / L
    start = [round(sx + rx * (best['hw'] - 2.2) * 0.5, 1), round(sz + rz * (best['hw'] - 2.2) * 0.5, 1), round(math.atan2(x2 - x1, z2 - z1), 4)]

xs = [n[0] for n in out_nodes]; zs = [n[1] for n in out_nodes]
out = dict(names=names, nodes=out_nodes, edges=out_edges, blds=blds, start=start, origin=[lat0, lon0],
           bounds=[round(min(xs), 1), round(min(zs), 1), round(max(xs), 1), round(max(zs), 1)])
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print('nodes', len(out_nodes), 'signals', sum(n[3] for n in out_nodes), 'edges', len(out_edges), 'blds', len(blds),
      'bytes', len(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode()), 'start', start, 'bounds', out['bounds'])
