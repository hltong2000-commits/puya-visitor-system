from math import hypot
from random import Random

from PIL import Image, ImageDraw, ImageFilter


WIDTH, HEIGHT = 1600, 1200
rng = Random(20260828)

image = Image.new("RGB", (WIDTH, HEIGHT), "#081019")
pixels = image.load()

for y in range(HEIGHT):
    for x in range(WIDTH):
        glow = max(0.0, 1.0 - hypot(x - 430, y - 510) / 980)
        edge = max(0.0, 1.0 - hypot(x - 1320, y - 130) / 900)
        pixels[x, y] = (
            int(7 + 15 * glow + 10 * edge),
            int(13 + 22 * glow + 7 * edge),
            int(22 + 34 * glow + 18 * edge),
        )

traces = Image.new("RGBA", image.size, (0, 0, 0, 0))
trace_draw = ImageDraw.Draw(traces)
for _ in range(28):
    y = rng.randint(80, HEIGHT - 80)
    length = rng.randint(180, 600)
    x = rng.randint(0, WIDTH - length)
    color = (69, 151, 183, rng.randint(20, 50))
    trace_draw.line((x, y, x + length, y), fill=color, width=2)
    trace_draw.ellipse((x + length - 4, y - 4, x + length + 4, y + 4), fill=color)
traces = traces.filter(ImageFilter.GaussianBlur(1.2))
image = Image.alpha_composite(image.convert("RGBA"), traces)

wafer = Image.new("RGBA", image.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(wafer)
cx, cy, radius = 470, 610, 510

for r in range(radius, 0, -1):
    t = 1 - r / radius
    color = (
        int(27 + 72 * t),
        int(40 + 90 * t),
        int(55 + 105 * t),
        255,
    )
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

die = 48
gap = 5
for gy in range(cy - radius, cy + radius, die + gap):
    for gx in range(cx - radius, cx + radius, die + gap):
        mx, my = gx + die / 2, gy + die / 2
        if hypot(mx - cx, my - cy) > radius - 28:
            continue
        hue = (gx * 3 + gy * 5) % 255
        base = (44 + hue // 8, 76 + hue // 12, 105 + hue // 9, 210)
        draw.rounded_rectangle((gx, gy, gx + die, gy + die), radius=3, fill=base, outline=(155, 215, 229, 125), width=1)
        draw.line((gx + 7, gy + 10, gx + die - 8, gy + 10), fill=(205, 239, 244, 70), width=1)
        draw.line((gx + 9, gy + 18, gx + 9, gy + die - 8), fill=(40, 15, 72, 75), width=1)

draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), 200, 348, fill=(207, 247, 255, 170), width=5)
draw.arc((cx - radius + 8, cy - radius + 8, cx + radius - 8, cy + radius - 8), 12, 175, fill=(103, 62, 255, 100), width=3)
wafer = wafer.rotate(-13, center=(cx, cy), resample=Image.Resampling.BICUBIC)
image = Image.alpha_composite(image, wafer)

light = Image.new("RGBA", image.size, (0, 0, 0, 0))
light_draw = ImageDraw.Draw(light)
light_draw.ellipse((80, 160, 1040, 1020), fill=(116, 213, 235, 30))
light_draw.ellipse((230, 260, 870, 900), fill=(232, 92, 41, 18))
light = light.filter(ImageFilter.GaussianBlur(80))
image = Image.alpha_composite(image, light)

image.convert("RGB").save("public/assets/wafer-reception.jpg", quality=91, optimize=True)
