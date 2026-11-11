#!/usr/bin/env python3
"""One-off official NASA GIBS transport diagnostic; maximum five image requests."""
import io
import json
import math
import urllib.parse
import urllib.request
from PIL import Image, ImageStat

def merc(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y

def probe(name, url):
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"RegionalWatch/1.0 (science-data check)","Accept":"image/jpeg"})
        with urllib.request.urlopen(req,timeout=17) as r:
            raw=r.read(500000)
            ctype=r.headers.get("Content-Type")
        im=Image.open(io.BytesIO(raw)).convert("RGB")
        var=ImageStat.Stat(im).var
        mean=ImageStat.Stat(im).mean
        return {"name":name,"content_type":ctype,"bytes":len(raw),"size":list(im.size),
                "variance":[round(i,1) for i in var],
                "mean":[round(i,1) for i in mean],
                "sample_pixel":im.getpixel((im.width//2, im.height//2))}
    except Exception as e:
        return {"name":name,"error":type(e).__name__+": "+str(e)[:140]}

date="2026-11-09"
layer="VIIRS_NOAA20_CorrectedReflectance_TrueColor"
x,y=merc(55.5,26.3,7)
url=f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/7/{y}/{x}.jpeg"
print(json.dumps(probe("WMTS NOAA20 2026",url)))
date="2025-11-09"
url=f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/7/{y}/{x}.jpeg"
print(json.dumps(probe("WMTS NOAA20 2025",url)))
layer="MODIS_Terra_CorrectedReflectance_TrueColor"
date="2026-11-09"
url=f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/7/{y}/{x}.jpeg"
print(json.dumps(probe("WMTS MODIS 2026",url)))
q={"SERVICE":"WMS","VERSION":"1.1.1","REQUEST":"GetMap","LAYERS":"MODIS_Terra_CorrectedReflectance_TrueColor","STYLES":"","FORMAT":"image/jpeg","SRS":"EPSG:4326","BBOX":"54,24.5,59.5,28.2","WIDTH":"320","HEIGHT":"256","TIME":"2026-11-09"}
url="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?"+urllib.parse.urlencode(q)
print(json.dumps(probe("WMS MODIS 2026",url)))
