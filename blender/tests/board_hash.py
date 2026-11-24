"""Refactor guard: prints a SHA-1 of the hero scene's board vertices (rounded to 1e-5), the light and camera
transforms, and a SHA-1 of the layout.json that write_layout would produce.
Run: blender --background --factory-startup --python blender/tests/board_hash.py
Optional: -- <dir>  keeps the layout.json there (default: a temp dir)."""
import hashlib
import os
import sys
import tempfile

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "blender"))

from hero import output, scene  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
objs = scene.build_scene()


def r(v):
    return [round(float(x), 5) for x in v]


h = hashlib.sha1()
for v in objs["board"].data.vertices:
    h.update(repr(r(objs["board"].matrix_world @ v.co)).encode())
board = h.hexdigest()

h = hashlib.sha1()
for key in ("lights", "cam_landscape", "cam_portrait", "haze"):
    items = objs[key] if isinstance(objs[key], list) else [objs[key]]
    for ob in items:
        h.update(repr((ob.name, r(ob.location), r(ob.rotation_euler), r(ob.scale))).encode())
        if ob.type == "LIGHT":
            h.update(repr((ob.data.energy, ob.data.shadow_soft_size, r(ob.data.color), ob.visible_camera)).encode())
        if ob.type == "CAMERA":
            d = ob.data
            h.update(repr((d.lens, d.sensor_width, d.sensor_fit, d.dof.use_dof, d.dof.focus_object.name, d.dof.aperture_fstop)).encode())
xf = h.hexdigest()

h = hashlib.sha1()
for pid in objs["pieces"]:
    for ob in (objs["pieces"][pid], objs["plinths"][pid]):
        h.update(repr((ob.name, r(ob.location), r(ob.rotation_euler), [m.name for m in ob.data.materials])).encode())
        h.update(repr(len(ob.data.vertices)).encode())
placed = h.hexdigest()

# materials: node count and socket defaults per material
h = hashlib.sha1()
for m in sorted(bpy.data.materials, key=lambda m: m.name):
    h.update(m.name.encode())
    for n in sorted(m.node_tree.nodes, key=lambda n: n.name):
        h.update(n.bl_idname.encode())
        for i in n.inputs:
            dv = getattr(i, "default_value", None)
            try:
                h.update(repr(tuple(round(float(x), 5) for x in dv)).encode())
            except (TypeError, ValueError):
                try:
                    h.update(repr(round(float(dv), 5)).encode())
                except (TypeError, ValueError):
                    pass
    h.update(str(len(m.node_tree.links)).encode())
mats = h.hexdigest()

d = argv[0] if argv else tempfile.mkdtemp()
os.makedirs(d, exist_ok=True)
output.write_layout(objs, d)
layout = hashlib.sha1(open(os.path.join(d, "layout.json"), "rb").read()).hexdigest()
print("LAYOUT_PATH", os.path.join(d, "layout.json"))
print("BOARD_HASH", board, "XF", xf, "PLACED", placed, "MATS", mats, "LAYOUT", layout)
