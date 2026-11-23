"""Posters, layout.json, bakes and the GLB export."""
import json
import os

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from . import pieces, scene

POSTER_MAX = 150 * 1024


def _save_webp(png_path, webp_path, max_bytes=None, start=88):
    img = bpy.data.images.load(png_path)
    img.file_format = "WEBP"
    q = start
    while True:
        img.save(filepath=webp_path, quality=q)
        size = os.path.getsize(webp_path)
        if not max_bytes or size <= max_bytes or q <= 30:
            break
        q -= 6
    bpy.data.images.remove(img)
    print(f"wrote {os.path.basename(webp_path)} q={q} {size} bytes")


def render_posters(objs, draft, assets_dir, out_dir=None):
    sc = bpy.context.scene
    out_dir = out_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
    for which, name in (("landscape", "poster"), ("portrait", "poster-portrait")):
        scene.set_camera(objs, which)
        sc.render.resolution_percentage = 50 if draft else 100
        sc.render.image_settings.file_format = "PNG"
        png = os.path.join(out_dir, name + ".png")
        sc.render.filepath = png
        bpy.ops.render.render(write_still=True)
        _save_webp(png, os.path.join(assets_dir, name + ".webp"), POSTER_MAX)
    sc.render.resolution_percentage = 100


def _gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def write_layout(objs, assets_dir):
    sc = bpy.context.scene
    data = {
        "focusId": "pearl",
        "board": {"center": [scene.BOARD_CENTER[0], -scene.BOARD_CENTER[1]], "size": list(scene.BOARD_SIZE)},
    }
    for which in ("landscape", "portrait"):
        cam = scene.set_camera(objs, which)
        pos, target, _lens, (w, h) = scene.CAMERAS[which]
        boxes = {}
        for pid in pieces.PIECE_IDS:
            xs, ys = [], []
            for ob in (objs["pieces"][pid], objs["plinths"][pid]):
                for c in ob.bound_box:
                    p = world_to_camera_view(sc, cam, ob.matrix_world @ Vector(c))
                    xs.append(p.x)
                    ys.append(1.0 - p.y)
            boxes[pid] = {
                "cx": round((min(xs) + max(xs)) / 2, 4), "cy": round((min(ys) + max(ys)) / 2, 4),
                "w": round(max(xs) - min(xs), 4), "h": round(max(ys) - min(ys), 4),
            }
        data[which] = {
            "aspect": round(w / h, 4),
            "camera": {"position": _gltf(pos), "target": _gltf(target), "fovY": round(scene.fov_y_deg(which), 3)},
            "pieces": boxes,
        }
    with open(os.path.join(assets_dir, "layout.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote layout.json")
