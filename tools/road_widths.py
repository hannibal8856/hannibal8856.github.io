"""Convert Taipei road-width open data to a compact JSON for build_map.py.

Inputs (data.taipei, 政府資料開放授權條款-第1版):
  - 臺北市寬度超過8公尺道路GIS圖資（工務局新建工程處）: road surface polygons with ROADWIDTH, ROADNAME, TT (0 = road, 1 = junction)
  - 臺北市道路寬度（都市發展局）: short width markers ("6M", "8M", ...)
Both are TWD97 TM2 (EPSG:3826). Output lat/lon so build_map.py can project them like OSM.

usage: python3 tools/road_widths.py Road.shp roadsize2.shp out.json [minlat minlon maxlat maxlon]
"""
import json, sys, re
import shapefile                     # pip install pyshp
from pyproj import Transformer       # pip install pyproj

poly_shp, label_shp, dst = sys.argv[1:4]
box = list(map(float, sys.argv[4:8])) if len(sys.argv) >= 8 else [24.95, 121.50, 25.07, 121.66]
tr = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
def ll(x, y):
    lon, lat = tr.transform(x, y)
    return round(lat, 6), round(lon, 6)
inside = lambda lat, lon: box[0] <= lat <= box[2] and box[1] <= lon <= box[3]

polys = []
r = shapefile.Reader(poly_shp, encoding='utf-8')
names = [f[0] for f in r.fields[1:]]
for sr in r.iterShapeRecords():
    rec = dict(zip(names, sr.record))
    if rec['TT'] != 0 or not rec['ROADWIDTH'] or rec['ROADWIDTH'] <= 0:
        continue
    pts = sr.shape.points
    parts = list(sr.shape.parts) + [len(pts)]
    ring = pts[parts[0]:parts[1]]          # outer ring only
    c = ll(*ring[len(ring) // 2])
    if not inside(*c):
        continue
    flat = []
    for x, y in ring[::max(1, len(ring) // 80)]:   # at most ~80 points per polygon
        flat += ll(x, y)
    # ROADWIDTH includes the sidewalks: subtract them (sidewalk area / segment length = both sidewalks together)
    walk = rec['SWALK_AREA'] / rec['ROADLENGHT'] if rec['ROADLENGHT'] else 0
    width = rec['ROADWIDTH'] - min(walk, 0.4 * rec['ROADWIDTH'])
    polys.append([round(width, 1), rec['ROADNAME'] or '', flat])

labels = []
r = shapefile.Reader(label_shp, encoding='utf-8')
for sr in r.iterShapeRecords():
    m = re.match(r'([\d.]+)\s*M', str(sr.record[0]).upper())
    if not m:
        continue
    (x1, y1), (x2, y2) = sr.shape.points[0], sr.shape.points[-1]
    lat, lon = ll((x1 + x2) / 2, (y1 + y2) / 2)
    if inside(lat, lon):
        w = float(m.group(1))
        labels.append([lat, lon, w - 3 if w >= 12 else w])   # planned widths of 12 m and up include ~3 m of sidewalks

json.dump({'polys': polys, 'labels': labels}, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print('polygons', len(polys), 'labels', len(labels))
