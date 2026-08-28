from pathlib import Path

from PIL import Image


source = Path("public/assets/puya-logo.png")
target = Path("public/assets/puya-logo-transparent.png")
image = Image.open(source).convert("RGBA")
out = Image.new("RGBA", image.size, (0, 0, 0, 0))
pixels = image.load()
result = out.load()

for y in range(image.height):
    for x in range(image.width):
        r, g, b, _ = pixels[x, y]
        chroma = max(r, g, b) - min(r, g, b)
        # Keep saturated orange/yellow logo pixels; discard white/gray background
        # and the faint gray watermark from the supplied source image.
        alpha = max(0, min(255, int((chroma - 8) * 5.2)))
        if alpha:
            result[x, y] = (r, g, b, alpha)

bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)
out.save(target, "PNG", optimize=True)
print(f"saved {target} {out.size}")
