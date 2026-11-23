"""Builds the chessboard hero assets.

    blender --background --factory-startup --python blender/build_hero.py -- --stage <pieces|stills|export|all> [--draft]

pieces  clay contact sheet of the six pieces  -> blender/out/pieces-sheet.png
stills  posters + layout.json                 -> assets/hero/
export  baked textures, sprites, pieces.glb   -> assets/hero/
all     stills + export
"""
import argparse
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from hero import pieces  # noqa: E402

OUT = os.path.join(HERE, "out")
ASSETS = os.path.join(ROOT, "assets", "hero")
TRI_MAX, H_MIN, H_MAX = 15000, 1.0, 1.3


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["pieces", "stills", "export", "all"], default="all")
    ap.add_argument("--draft", action="store_true")
    return ap.parse_args(argv)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def use_cycles(samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:  # CPU is fine, just slower
        print("cycles: GPU unavailable, using CPU:", e)


def report(objs):
    bad = False
    for pid, ob in objs.items():
        t, h = pieces.tri_count(ob), pieces.height(ob)
        ok = t <= TRI_MAX and H_MIN <= h <= H_MAX
        bad |= not ok
        print(f"{pid} tris={t} height={h:.3f}{'' if ok else '  <-- OUT OF RANGE'}")
    return not bad


def stage_pieces():
    reset()
    sc = bpy.context.scene
    objs = {}
    for i, pid in enumerate(pieces.PIECE_IDS):
        x = (i - 2.5) * 1.6
        pl = pieces.build_plinth(pid)
        pl.location = (x, 0, 0)
        ob = pieces.BUILDERS[pid]()
        ob.location = (x, 0, pieces.PLINTH_SIZE[2])
        ob.rotation_euler = (0, 0, math.radians(-25))
        objs[pid] = ob
    ok = report(objs)

    clay = bpy.data.materials.new("clay")
    clay.use_nodes = True
    bsdf = clay.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.82, 0.80, 0.76, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    for ob in sc.objects:
        if ob.type == "MESH":
            ob.data.materials.append(clay)

    bpy.ops.mesh.primitive_plane_add(size=60)
    floor = bpy.context.object
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1)
    floor.data.materials.append(fm)

    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.02, 0.022, 1)
    sc.world = world

    for loc, energy, size in (((-4, -6, 7), 2500, 6), ((6, -3, 3), 500, 4)):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy, ld.size = energy, size
        lo = bpy.data.objects.new("l", ld)
        lo.location = loc
        sc.collection.objects.link(lo)
        lo.rotation_euler = (bpy.data.objects.new("t", None).location - lo.location).to_track_quat("-Z", "Y").to_euler()

    cd = bpy.data.cameras.new("cam")
    cd.lens = 50
    cam = bpy.data.objects.new("cam", cd)
    cam.location = (0, -14.5, 1.5)
    cam.rotation_euler = (math.radians(87.5), 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam

    use_cycles(64)
    sc.render.resolution_x, sc.render.resolution_y = 2400, 800
    sc.render.image_settings.file_format = "PNG"
    os.makedirs(OUT, exist_ok=True)
    sc.render.filepath = os.path.join(OUT, "pieces-sheet.png")
    bpy.ops.render.render(write_still=True)
    return ok


def main():
    args = parse()
    ok = True
    if args.stage == "pieces":
        ok = stage_pieces()
    else:
        from hero import output, scene
        reset()
        objs = scene.build_scene()
        ok = report(objs["pieces"])
        os.makedirs(ASSETS, exist_ok=True)
        os.makedirs(OUT, exist_ok=True)
        if args.stage in ("stills", "all"):
            use_cycles(64 if args.draft else 256)
            output.render_posters(objs, args.draft, ASSETS)
            output.write_layout(objs, ASSETS)
        if args.stage in ("export", "all"):
            use_cycles(48 if args.draft else 128)
            output.bake_and_export(objs, ASSETS, OUT, args.draft)
    if not ok:
        sys.exit(1)


main()
