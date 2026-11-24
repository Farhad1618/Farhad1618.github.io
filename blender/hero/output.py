"""Posters, layout.json, bakes and the GLB export."""
import json
import os
import subprocess

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from . import pieces, scene

POSTER_MAX = 150 * 1024


def _save_webp(png_path, webp_path, max_bytes=None, start=86, extra=()):
    """Encode with cwebp (Blender's own WebP writer ignores the format when saving a loaded image)."""
    q = start
    while True:
        subprocess.run(["cwebp", "-quiet", "-m", "6", "-q", str(q), *extra, png_path, "-o", webp_path], check=True)
        size = os.path.getsize(webp_path)
        if not max_bytes or size <= max_bytes or q <= 30:
            break
        q -= 5
    print(f"wrote {os.path.basename(webp_path)} q={q} {size} bytes")


def _glow(png_path):
    """Film-like bloom: the bright marble bleeds softly into the fog. Works on the display image."""
    import numpy as np
    img = bpy.data.images.load(png_path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    rgb = px.reshape(h, w, 4)[..., :3]
    bright = np.clip(rgb - 0.38, 0, None)
    r = max(2, h // 60)
    wide = bright
    for _ in range(3):                      # three box passes ~ a gaussian
        wide = _box_blur(wide, r)
    tight = _box_blur(_box_blur(bright, max(1, r // 4)), max(1, r // 4))
    out = rgb + wide * 0.85 + tight * 0.35
    _write_png(np.clip(out, 0, 1), png_path)


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
        _glow(png)
        _save_webp(png, os.path.join(assets_dir, name + ".webp"), POSTER_MAX)
    sc.render.resolution_percentage = 100


def _smooth_rgba(png_path, r):
    """Fog has no fine detail: blur away the render grain (alpha is never denoised), premultiplied."""
    import numpy as np
    img = bpy.data.images.load(png_path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    a = px.reshape(h, w, 4)
    pre = np.concatenate([a[..., :3] * a[..., 3:], a[..., 3:]], axis=-1)
    for _ in range(2):
        pre = _box_blur(pre, r)
    al = pre[..., 3:]
    out = np.concatenate([pre[..., :3] / np.maximum(al, 1e-4), al], axis=-1)
    _write_png(np.clip(out, 0, 1), png_path)


def render_atmosphere(objs, draft, assets_dir, out_dir=None):
    """The scene with every solid thing cut out, for the live scene to lay over its own pieces. Pieces, plinths
    and board are holdouts: the camera sees through them, but they still block the light, so their shadows
    stay in the fog. Where nothing solid stands, the pixel is the full background (night and fog, alpha 1);
    over a solid thing it is only the fog in front of it (alpha = how much it hides)."""
    sc = bpy.context.scene
    out_dir = out_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
    solid = [*objs["pieces"].values(), *objs["plinths"].values(), objs["board"]]
    for ob in solid:
        ob.is_holdout = True
    sc.render.film_transparent = False
    samples = sc.cycles.samples
    sc.cycles.samples = 48 if draft else 128
    for which, name in (("landscape", "atmos"), ("portrait", "atmos-portrait")):
        scene.set_camera(objs, which)
        sc.render.resolution_percentage = 50
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGBA"
        png = os.path.join(out_dir, name + ".png")
        sc.render.filepath = png
        bpy.ops.render.render(write_still=True)
        _smooth_rgba(png, max(1, sc.render.resolution_y * sc.render.resolution_percentage // 100 // 360))
        _save_webp(png, os.path.join(assets_dir, name + ".webp"), 90 * 1024, start=80,
                   extra=("-alpha_q", "70", "-resize", "800" if which == "landscape" else "450", "0"))
    for ob in solid:
        ob.is_holdout = False
    sc.render.film_transparent = False
    sc.cycles.samples = samples
    sc.render.resolution_percentage = 100


def _gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def write_layout(objs, assets_dir):
    sc = bpy.context.scene
    data = {
        "focusId": scene.FOCUS_ID,
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


# ---------------------------------------------------------------- bakes

import math  # noqa: E402

import numpy as np  # noqa: E402

EXPOSURE = 0.85
INK_LIN = 0.0037            # --ink #0C0C0E in linear


def _tonemap(lin):
    """Scene-linear -> display sRGB, a filmic curve close to the posters' AgX look."""
    x = np.clip(lin * EXPOSURE, 0, None)
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    y = np.clip(y, 0, 1)
    return np.where(y <= 0.0031308, y * 12.92, 1.055 * np.power(y, 1 / 2.4) - 0.055)


def _write_png(arr, path):
    """arr: (h, w, 3 or 4) display-encoded floats, row 0 = bottom."""
    h, w, c = arr.shape
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :c] = arr
    img = bpy.data.images.new("out", w, h, alpha=(c == 4))
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.clip(px, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def _bake_target(mat, img):
    N = mat.node_tree.nodes
    node = N.get("BAKE") or N.new("ShaderNodeTexImage")
    node.name = "BAKE"
    node.image = img
    for n in N:
        n.select = False
    node.select = True
    N.active = node


def _bake(ob, size, glossy, from_camera=False):
    sc = bpy.context.scene
    img = bpy.data.images.new("bake-" + ob.name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    for m in ob.data.materials:
        _bake_target(m, img)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    b = sc.render.bake
    b.use_pass_direct = b.use_pass_indirect = True
    b.use_pass_diffuse = b.use_pass_emit = b.use_pass_transmission = True
    b.use_pass_glossy = glossy
    b.margin = 16
    b.view_from = "ACTIVE_CAMERA" if from_camera else "ABOVE_SURFACE"
    b.use_selected_to_active = False
    sc.cycles.bake_type = "COMBINED"
    bpy.ops.object.bake(type="COMBINED")
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(size, size, 4)[..., :3]


def _box_blur(a, r):
    if r < 1:
        return a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
        n = a.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        a = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return a


def _swap_to_baked(ob, png):
    img = bpy.data.images.load(png)
    mat = bpy.data.materials.new("baked-" + ob.name)
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = nt.nodes["Principled BSDF"]
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def _matcap(path, size=256):
    v, u = np.mgrid[0:size, 0:size].astype(np.float32)
    x = u / (size - 1) * 2 - 1
    y = v / (size - 1) * 2 - 1
    rr = x * x + y * y
    inside = rr <= 1.0
    z = np.sqrt(np.clip(1 - rr, 0, 1))

    def lobe(d, power, gain):
        d = np.array(d, dtype=np.float32)
        d /= np.linalg.norm(d)
        # reflection of the view vector (0,0,1) about the normal
        rx, ry, rz = 2 * z * x, 2 * z * y, 2 * z * z - 1
        return gain * np.power(np.clip(rx * d[0] + ry * d[1] + rz * d[2], 0, 1), power)

    warm = np.array([1.0, 0.86, 0.70], dtype=np.float32)
    cool = np.array([0.72, 0.80, 1.0], dtype=np.float32)
    s = (lobe((0.1, 0.9, 0.35), 5, 0.16) + lobe((0.1, 0.9, 0.35), 40, 0.55) + lobe((-0.9, 0.35, 0.1), 8, 0.12))
    rim = np.power(1 - z, 4) * 0.22
    out = (s + rim)[..., None] * warm + lobe((-0.5, -0.4, 0.75), 6, 0.035)[..., None] * cool
    out *= inside[..., None]
    _write_png(np.clip(out, 0, 1) ** (1 / 2.2), path)


def bake_and_export(objs, assets_dir, out_dir, draft):
    sc = bpy.context.scene
    # The fog stays in for the bakes: it is what throws the one light back onto the faces turned to the camera
    # (the lit marble fronts and their highlights in the posters). Without it those faces bake near black.
    objs["haze"].hide_render = False
    scene.set_camera(objs, "landscape")

    baked = []
    # board: full shading as seen from the landscape camera, so reflections are in the texture
    lin = _bake(objs["board"], 1024 if draft else 2048, glossy=True, from_camera=True)
    png = os.path.join(out_dir, "board.png")
    _write_png(_tonemap(lin), png)
    baked.append((objs["board"], png))

    # pieces and plinths: baked like the board, full shading as seen from the landscape camera, so the
    # subsurface glow through thin alabaster and ivory, the specular sheen and the true depth of the
    # shadows are in the texture exactly as the poster shows them (hero.js adds only a faint matcap glint,
    # uSheen 0.06 on every piece). Baked from the landscape camera only: portrait views reuse these highlights.
    for pid in pieces.PIECE_IDS:
        for ob, s in ((objs["pieces"][pid], 512 if draft else 1024), (objs["plinths"][pid], 256 if draft else 512)):
            lin = _bake(ob, s, glossy=True, from_camera=True)
            png = os.path.join(out_dir, ob.name + ".png")
            _write_png(_tonemap(lin), png)
            baked.append((ob, png))
    for ob, png in baked:
        _swap_to_baked(ob, png)

    _matcap(os.path.join(out_dir, "matcap.png"))
    _save_webp(os.path.join(out_dir, "matcap.png"), os.path.join(assets_dir, "matcap.webp"), start=90)

    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for ob, _png in baked:
        ob.select_set(True)
    raw = os.path.join(out_dir, "pieces.raw.glb")
    bpy.ops.export_scene.gltf(filepath=raw, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_normals=True, export_tangents=False,
                              export_cameras=False, export_lights=False, export_materials="EXPORT",
                              export_vertex_color="ACTIVE", export_extras=True)   # part ids (COLOR_0) and rigs (extras) for the hover moves
    mid = os.path.join(out_dir, "pieces.webp.glb")
    cli = ["npx", "--yes", "@gltf-transform/cli@4.1.0"]
    subprocess.run(cli + ["webp", raw, mid, "--quality", "82"], check=True)
    subprocess.run(cli + ["meshopt", mid, os.path.join(assets_dir, "pieces.glb")], check=True)
    print("wrote pieces.glb", os.path.getsize(os.path.join(assets_dir, "pieces.glb")), "bytes")
