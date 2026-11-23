"""Board, materials, lights and the two cameras for the chessboard hero."""
import math

import bpy
import numpy as np
from mathutils import Vector

from . import pieces

# x, y (metres, +y is away from the camera), yaw in degrees
PLACEMENT = {
    "pearl": (0.0, 0.0, -68.0),
    "cyrus": (-2.0, 2.0, -24.0),
    "onepharma": (1.35, 4.0, 15.0),
    "falah": (2.33, 1.2, -18.0),
    "nids": (2.9, -1.2, 30.0),
    "zagros": (-2.5, -2.2, 12.0),
}
BOARD_CENTER = (0.0, -2.0)
BOARD_SIZE = (20.0, 20.0)
TILE = 1.5
PLINTH_H = pieces.PLINTH_SIZE[2]

CAMERAS = {
    # position, target, lens (mm), resolution
    "landscape": ((0.0, -10.0, 1.3), (0.0, 0.0, 1.05), 45.0, (1920, 1080)),
    "portrait": ((0.0, -13.0, 1.9), (0.0, 0.0, 1.45), 30.0, (1080, 1920)),
}
FSTOP = 0.4


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    return nt, nt.nodes, nt.links, nt.nodes["Principled BSDF"]


def _set(bsdf, **kw):
    for k, v in kw.items():
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v


def marble(name, base, vein, vein_scale=2.2, rough=0.35, sss=0.3, text_bump=False):
    mat = bpy.data.materials.new(name)
    nt, N, L, bsdf = _nodes(mat)
    tc = N.new("ShaderNodeTexCoord")
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 6.0
    L.new(tc.outputs["Object"], noise.inputs["Vector"])
    warp = N.new("ShaderNodeMixRGB")
    warp.blend_type = "ADD"
    warp.inputs["Fac"].default_value = 0.55
    L.new(tc.outputs["Object"], warp.inputs["Color1"])
    L.new(noise.outputs["Color"], warp.inputs["Color2"])
    wave = N.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.inputs["Scale"].default_value = vein_scale
    wave.inputs["Distortion"].default_value = 9.0
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Detail Scale"].default_value = 1.4
    L.new(warp.outputs["Color"], wave.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*vein, 1)
    ramp.color_ramp.elements[1].position = 0.07
    ramp.color_ramp.elements[1].color = (*base, 1)
    L.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    _set(bsdf, Roughness=rough)
    if sss:
        _set(bsdf, **{"Subsurface Weight": sss, "Subsurface Scale": 0.04})
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.75, 0.55)
    if text_bump:
        # wedge-like incisions in rows: reads as lines of text, says nothing
        brick = N.new("ShaderNodeTexBrick")
        brick.inputs["Scale"].default_value = 26.0
        brick.inputs["Mortar Size"].default_value = 0.035
        brick.inputs["Brick Width"].default_value = 0.22
        brick.inputs["Row Height"].default_value = 0.34
        brick.offset = 0.37
        L.new(warp.outputs["Color"], brick.inputs["Vector"])
        bump = N.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.5
        bump.inputs["Distance"].default_value = 0.01
        bump.invert = True
        L.new(brick.outputs["Fac"], bump.inputs["Height"])
        L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def inlay_image(size=1024):
    """An eight-point star-and-frame line pattern for one tile. Original, generated."""
    v, u = np.mgrid[0:size, 0:size].astype(np.float32)
    u = u / (size - 1) * 2 - 1
    v = v / (size - 1) * 2 - 1
    au, av = np.abs(u), np.abs(v)
    w = 0.012
    sq = np.maximum(au, av)
    di = (au + av) / math.sqrt(2)
    r = np.sqrt(u * u + v * v)

    def line(d, at, width=w):
        return np.clip(1 - np.abs(d - at) / width, 0, 1)

    m = np.zeros_like(u)
    for at in (0.86, 0.80):
        m = np.maximum(m, line(sq, at))                    # double border
    star = np.minimum(sq, di)                              # 8-point star (two squares)
    m = np.maximum(m, line(np.maximum(sq, di), 0.56))      # octagon around it
    m = np.maximum(m, line(star, 0.40) * (np.maximum(sq, di) < 0.57))
    m = np.maximum(m, line(r, 0.20))
    m = np.maximum(m, line(r, 0.07, w * 1.5))
    # corner kites
    cu, cv = au - 0.80, av - 0.80
    m = np.maximum(m, line(np.abs(cu) + np.abs(cv), 0.16) * (sq < 0.80))
    # spokes from the centre ring to the star points
    ang = np.arctan2(v, u)
    spoke = np.abs(((ang / (math.pi / 4)) + 0.5) % 1.0 - 0.5) * r * (math.pi / 4)
    m = np.maximum(m, np.clip(1 - spoke / (w * 0.8), 0, 1) * (r > 0.20) * (r < 0.40))
    img = bpy.data.images.new("inlay", size, size, alpha=False)
    px = np.empty((size, size, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = m
    px[..., 3] = 1
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def board_material():
    mat = bpy.data.materials.new("board")
    nt, N, L, bsdf = _nodes(mat)
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / TILE, 1 / TILE, 1 / TILE)
    mp.inputs["Location"].default_value = (0.5, 0.5, 0.0)   # tile centres land on whole metres/TILE
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    chk = N.new("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 1.0
    chk.inputs["Color1"].default_value = (1, 1, 1, 1)
    chk.inputs["Color2"].default_value = (0, 0, 0, 1)
    L.new(mp.outputs["Vector"], chk.inputs["Vector"])
    tex = N.new("ShaderNodeTexImage")
    tex.image = inlay_image()
    tex.extension = "REPEAT"
    L.new(mp.outputs["Vector"], tex.inputs["Vector"])
    mask = N.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    L.new(tex.outputs["Color"], mask.inputs[0])
    L.new(chk.outputs["Fac"], mask.inputs[1])
    # stone: two near-blacks that separate mostly by reflection
    stone = N.new("ShaderNodeMixRGB")
    stone.inputs["Color1"].default_value = (0.006, 0.006, 0.007, 1)
    stone.inputs["Color2"].default_value = (0.05, 0.034, 0.02, 1)
    L.new(chk.outputs["Fac"], stone.inputs["Fac"])
    col = N.new("ShaderNodeMixRGB")
    col.inputs["Color2"].default_value = (0.62, 0.36, 0.10, 1)   # brass, toward --sig
    L.new(mask.outputs[0], col.inputs["Fac"])
    L.new(stone.outputs["Color"], col.inputs["Color1"])
    L.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    L.new(mask.outputs[0], bsdf.inputs["Metallic"])
    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.34
    rough.inputs["To Max"].default_value = 0.5
    L.new(chk.outputs["Fac"], rough.inputs["Value"])
    L.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def _look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def _area(name, loc, target, energy, size, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    _look_at(ob, target)
    ob.visible_camera = False
    return ob


def set_camera(objs, which):
    sc = bpy.context.scene
    cam = objs["cam_" + which]
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = CAMERAS[which][3]
    sc.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    return cam


def fov_y_deg(which):
    _, _, lens, (w, h) = CAMERAS[which]
    half = 18.0 / lens                       # sensor 36 mm fits the longer side
    return math.degrees(2 * math.atan(half / (w / h) if w >= h else half))


def build_scene():
    sc = bpy.context.scene
    # ivory with only a whisper of veining: the reference statues are almost plain
    pale = marble("marble-pale", (0.84, 0.79, 0.69), (0.70, 0.655, 0.57), vein_scale=0.9, sss=0.45)
    pale_text = marble("marble-text", (0.84, 0.79, 0.69), (0.70, 0.655, 0.57), vein_scale=0.9, sss=0.45, text_bump=True)
    gem = bpy.data.materials.new("pearl-black")
    gem.use_nodes = True
    _set(gem.node_tree.nodes["Principled BSDF"], **{"Base Color": (0.006, 0.006, 0.009, 1), "Roughness": 0.08,
                                                     "Coat Weight": 1.0, "Coat Roughness": 0.03})
    dark = marble("marble-dark", (0.012, 0.012, 0.014), (0.42, 0.40, 0.36), vein_scale=0.9, rough=0.16, sss=0.0)
    dark.node_tree.nodes["Color Ramp"].color_ramp.elements[1].position = 0.025
    plinth_mat = marble("plinth", (0.02, 0.019, 0.018), (0.035, 0.032, 0.03), vein_scale=1.0, rough=0.3, sss=0.0)

    out = {"pieces": {}, "plinths": {}}
    for pid in pieces.PIECE_IDS:
        x, y, yaw = PLACEMENT[pid]
        pl = pieces.build_plinth(pid)
        pl.location = (x, y, 0)
        pl.data.materials.append(plinth_mat)
        ob = pieces.BUILDERS[pid]()
        ob.location = (x, y, PLINTH_H)
        ob.rotation_euler = (0, 0, math.radians(yaw))
        if pid == "pearl":
            for m in (dark, pale, gem):
                ob.data.materials.append(m)
        else:
            ob.data.materials.append(pale_text if pid == "cyrus" else pale)
        out["pieces"][pid], out["plinths"][pid] = ob, pl

    bpy.ops.mesh.primitive_plane_add(size=1, location=(BOARD_CENTER[0], BOARD_CENTER[1], 0))
    board = bpy.context.object
    board.name = "board"
    board.scale = (BOARD_SIZE[0], BOARD_SIZE[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # object coords are offset by the board centre; shift the pattern back onto world tiles
    bm = board_material()
    bm.node_tree.nodes["Mapping"].inputs["Location"].default_value = (
        0.5 + BOARD_CENTER[0] / TILE, 0.5 + BOARD_CENTER[1] / TILE, 0)
    board.data.materials.append(bm)
    out["board"] = board

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.0006, 0.0008, 0.0016, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world

    # Each piece has its own soft spot from above and in front, so the marble glows out of
    # the dark and the board is lit only in pools around the plinths. No broad key light.
    lights = []
    for pid in pieces.PIECE_IDS:
        x, y, _yaw = PLACEMENT[pid]
        ld = bpy.data.lights.new("spot-" + pid, "SPOT")
        ld.energy = 1250 if pid == "pearl" else 850
        ld.spot_size = math.radians(40)
        ld.spot_blend = 0.9
        ld.shadow_soft_size = 0.45
        ld.color = (1.0, 0.87, 0.68)
        lo = bpy.data.objects.new("spot-" + pid, ld)
        lo.location = (x * 0.8 - 1.8, y - 2.8, 5.6)     # upper left, so each piece has a lit side and a shadow side
        sc.collection.objects.link(lo)
        _look_at(lo, (x, y, 1.0))
        lo.visible_camera = False
        lights.append(lo)
    lights.append(_area("moon", (-3.0, 9.0, 5.0), (0.0, 0.0, 1.0), 70, 5.0, (0.55, 0.66, 1.0)))   # cool rim from behind
    lights.append(_area("fill", (0.0, -9.0, 3.0), (0.0, 0.0, 1.0), 10, 8.0, (0.60, 0.70, 1.0)))
    out["lights"] = lights

    # haze: used for posters only (bakes hide it)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 4))
    haze = bpy.context.object
    haze.name = "haze"
    haze.scale = (40, 44, 8)
    hm = bpy.data.materials.new("haze")
    hm.use_nodes = True
    hn = hm.node_tree
    hn.nodes.remove(hn.nodes["Principled BSDF"])
    vol = hn.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.0016
    vol.inputs["Color"].default_value = (0.62, 0.70, 0.9, 1)
    hn.links.new(vol.outputs["Volume"], hn.nodes["Material Output"].inputs["Volume"])
    haze.data.materials.append(hm)
    out["haze"] = haze

    for which, (pos, target, lens, _res) in CAMERAS.items():
        cd = bpy.data.cameras.new("cam-" + which)
        cd.lens = lens
        cd.sensor_width = 36.0
        cd.sensor_fit = "AUTO"
        cd.dof.use_dof = True
        cd.dof.focus_object = out["pieces"]["pearl"]
        cd.dof.aperture_fstop = FSTOP
        cam = bpy.data.objects.new("cam-" + which, cd)
        cam.location = pos
        sc.collection.objects.link(cam)
        _look_at(cam, target)
        out["cam_" + which] = cam

    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception as e:
        print("view transform:", e)
    bpy.context.view_layer.update()
    return out
