"""Draw a clean labeled floor plan used as the in-app sample sheet."""

from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 1120
im = Image.new("RGB", (W, H), "#fbf8f3")
dr = ImageDraw.Draw(im)
font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 44)
small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 22)
ink = "#1a1f2b"
wall = 8

rooms = {
    "LIVING ROOM": (80, 90, 620, 430),
    "LOBBY": (620, 90, 1040, 430),
    "KITCHEN": (1040, 90, 1520, 430),
    "BEDROOM 1": (80, 430, 620, 740),
    "STUDIO": (620, 430, 1040, 740),
    "STORAGE": (1040, 430, 1280, 740),
    "GARDEN": (1280, 430, 1520, 740),
    "BEDROOM 2": (80, 740, 800, 1040),
    "GARAGE": (800, 740, 1520, 1040),
}


def center(box, text, face):
    x0, y0, x1, y1 = box
    bbox = dr.textbbox((0, 0), text, font=face)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    dr.text(((x0 + x1 - tw) / 2, (y0 + y1 - th) / 2 - 4), text, fill=ink, font=face)


def vwall(x, y0, y1, gap=None):
    if gap is None:
        dr.rectangle((x, y0, x + wall, y1), fill=ink)
        return
    a, b = gap
    dr.rectangle((x, y0, x + wall, a), fill=ink)
    dr.rectangle((x, b, x + wall, y1), fill=ink)


def hwall(y, x0, x1, gap=None):
    if gap is None:
        dr.rectangle((x0, y, x1, y + wall), fill=ink)
        return
    a, b = gap
    dr.rectangle((x0, y, a, y + wall), fill=ink)
    dr.rectangle((b, y, x1, y + wall), fill=ink)


for text, box in rooms.items():
    center(box, text, font)

hwall(90, 80, 1520)
hwall(430, 80, 1520, gap=(300, 360))
hwall(740, 80, 1520, gap=(900, 970))
hwall(1040, 80, 1520)
vwall(80, 90, 1040)
vwall(620, 90, 740, gap=(220, 280))
vwall(1040, 90, 740, gap=(540, 600))
vwall(1280, 430, 740, gap=(540, 590))
vwall(800, 740, 1040, gap=(860, 930))
vwall(1520, 90, 1048)

dr.polygon([(90, 58), (102, 78), (114, 58), (102, 64)], fill="#1a5f59")
dr.text((124, 48), "NORTH", fill="#1a5f59", font=small)
im.save("/workspace/public/sample-plan.png", "PNG")
print("wrote sample", im.size)
