const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8765/conv.html');
  const list = [
    ['110001', 'x110001/models/model.dae', '奉天宮', 121.5847, 25.037359, 359.400743931974],
    ['110002', 'x110002/models/untitled.dae', '慈惠堂', 121.587552, 25.03685, 359.4019632829],
    ['106001', 'x106001/models/model.dae', '台北清真寺', 121.534029, 25.027891, 359.379501005101],
    ['106002', 'x106002/models/model.dae', '福佑宮', 121.542503, 25.044134, 359.382714694945],
  ];
  const out = [];
  for (const [id, dae, name, lon, lat, heading] of list) {
    const r = await p.evaluate(([path]) => convert(path, 256), [dae]);
    const bytes = JSON.stringify(r.parts).length;
    console.log(id, name, 'tris', r.tris, 'parts', r.parts.length, 'tex', r.parts.filter(x => x.tex).length, 'bytes', bytes, 'missing', r.missing.length, r.missing.slice(0, 3));
    out.push({ id, name, lon, lat, heading, parts: r.parts });
  }
  fs.writeFileSync('landmarks_raw.json', JSON.stringify(out));
  await b.close();
})();
