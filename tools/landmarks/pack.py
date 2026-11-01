import json, base64, struct, sys
d = json.load(open(sys.argv[1]))
out = []
for m in d:
    parts = []
    for p in m['parts']:
        pos, uv = p['pos'], p.get('uv')
        idx, verts, key = [], [], {}
        n = len(pos) // 3
        for i in range(n):
            k = (pos[i*3], pos[i*3+1], pos[i*3+2]) + ((round(uv[i*2]*256), round(uv[i*2+1]*256)) if uv else ())
            j = key.get(k)
            if j is None:
                j = key[k] = len(verts); verts.append(k)
            idx.append(j)
        clamp = lambda v: max(-32768, min(32767, v))
        P = b''.join(struct.pack('<3h', *[clamp(c) for c in v[:3]]) for v in verts)
        q = {'n': len(verts), 'p': base64.b64encode(P).decode(), 'c': p['color']}
        if uv:
            q['u'] = base64.b64encode(b''.join(struct.pack('<2h', clamp(v[3]), clamp(v[4])) for v in verts)).decode()
        I = struct.pack('<%d%s' % (len(idx), 'H' if len(verts) < 65536 else 'I'), *idx)
        q['i'] = base64.b64encode(I).decode(); q['i32'] = len(verts) >= 65536
        if p.get('tex'): q['t'] = p['tex']; q['a'] = bool(p.get('alpha')); q['fy'] = p.get('flipY', True)
        parts.append(q)
    out.append({k: m[k] for k in ('id', 'name', 'lon', 'lat', 'heading')} | {'parts': parts})
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(sys.argv[2], 'w').write(s)
for m in out:
    print(m['name'], sum(len(json.dumps(p)) for p in m['parts']))
print('total', len(s))
