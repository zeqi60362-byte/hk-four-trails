# Hiking suitability of Hong Kong's four long-distance trails

An interactive, static dashboard for **8,847 panorama samples** along the MacLehose, Wilson,
Hong Kong and Lantau trails. It maps geometric sun exposure, canopy shade and terrain
obstruction, and lets you inspect every sampled point.

**Live site:** https://zeqi60362-byte.github.io/hk-four-trails/

---

## What the page shows

| Area | Contents |
|---|---|
| **Map** | The four trails with their 8,847 sampled points, section labels (`MacLehose 3`, `Wilson 7`, …), click to select; the full 40 m trail line is drawn underneath so stretches without a panorama are still visible. |
| **Elevation profile** | Distance against DSM elevation for the selected trail; dashed lines mark jumps in the sampling sequence. Scroll to zoom, double-click to reset. |
| **Filters** | Time window (08–10 / 10–12 / 12–14 / 14–16), trail, exposure class, GVI range, image quality, point colour. |
| **Point detail** | Panorama or Street View link, the four exposure windows, canopy by viewing direction (N/E/S/W), and the four horizon obstruction angles. `←` `→` step along the trail. |
| **Data notes** | Definitions, units and caveats, in the page itself. |

Deep links work: `?tab=detail&fid=5903` opens one point directly.

## Method in one paragraph

Each point has a 360° panorama (2011–2026). `nvidia/segformer-b5-finetuned-ade-640-640`
segments it into ADE20K classes; the sky mask gives a **directional transmittance grid**
(5° × 2°): open sky passes 100 %, a canopy cell passes the point's own gap fraction
(2–15 %), anything else (terrain, buildings, ground) passes 0 %. Exposure at a moment is
`sin(solar altitude) × transmittance`, averaged over 12 ten-minute steps per two-hour window,
for the solar geometry of **1 November**. Terrain obstruction comes from Copernicus DSM 30 m
by ray-stepping 150 m – 3 km in 72 azimuths. A point in the open reaches 0.50 / 0.75 / 0.77 /
0.56 in the four windows — those are the clear-sky ceilings, not 1.0.

## Known limitations (please read before evaluating)

- **Geometric exposure, not thermal comfort.** No air temperature, humidity, wind or radiation.
- **One solar date** (1 Nov) for all 8,847 points; seasonal variation is not modelled.
- **Gap transmission is a model**, not a measurement: a closed canopy returns 0.01–0.03 rather than 0.
- **The distance axis is the capture sequence**, not trail distance — the panoramas were driven
  in capture order, so `km` on the profile is a sequence index and the dashed jumps mark where
  that sequence skips. Section labels on the map come from a separate, correct 40 m track.
- Panorama dates differ from the solar date and from each other.

## Run locally

Double-click `index.html` (no server needed), or:

```bash
python -m http.server 8000      # http://localhost:8000
```

The basemap needs internet (OpenFreeMap). Everything else is local: MapLibre and D3 are
vendored, and the point data ships as `data/points.js`.

Panorama thumbnails are **not** in this repository (335 MB). Without them the detail panel
shows the Street View link instead of a photo. To restore them locally, put
`pano/<fid>_<trail>.jpg` (640 × 320) next to `index.html`; `serve.py` also proxies them from a
local folder if you prefer to keep the originals elsewhere.

## Rebuild the data

```
python tools/build_data.py 6_数据表_四大径_点位环境指标_v1.xlsx
```

`tools/build_data.py` rewrites `data/points.js`. The xlsx itself is not committed.

## Data sources & credits

- **Trail geometry**: official AFCD section lengths and an OSM-derived GPX (40 m resampling).
- **Elevation**: Copernicus DSM 30 m © ESA / Copernicus.
- **Panoramas**: survey imagery collected 2011–2026; check the licence of the source before
  redistributing the images — they are deliberately excluded from this repository.
- **Basemap**: OpenFreeMap (OpenMapTiles, © OpenStreetMap contributors).
- Segmentation: SegFormer (Xie et al., 2021), ADE20K weights by NVIDIA.

## Licence

Code: MIT. Data and figures: please cite the accompanying paper (in preparation).
