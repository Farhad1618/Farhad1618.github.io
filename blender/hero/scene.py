"""Board, materials, lights and the two cameras for the chessboard hero."""
import math

import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from . import pieces

# x, y (metres, +y is away from the camera), yaw in degrees
PLACEMENT = {
    "cyrus": (0.0, 0.0, 14.0),          # centre: the piece everything else stands around
    # Each piece stands on the centre of one tile (multiples of TILE), or astride two where the picture
    # needs it between tiles: so one tile, at most two, rises with it on hover. Never four.
    "pearl": (-1.5, 1.5, -62.0),
    "onepharma": (1.5, 4.5, 15.0),
    "falah": (2.25, 1.5, -18.0),         # astride two tiles, side by side
    "nids": (3.0, -0.75, -22.0),         # astride two, front and back
    "zagros": (-3.0, -0.75, 12.0),       # astride two, front and back
}
FOCUS_ID = "cyrus"
# The board is not a flat floor: every tile is its own block, standing at its own height.
# Each piece stands on a platform of tiles raised to the height given here.
PLATFORM = {"cyrus": 0.36, "pearl": 0.34, "onepharma": 0.46, "falah": 0.26, "nids": 0.38, "zagros": 0.20}
TILE_GAP = 0.05
BOARD_CENTER = (0.0, -2.0)
BOARD_SIZE = (20.0, 20.0)
TILE = 1.5
REACH = TILE / 2 + 0.05      # a tile belongs to a piece's platform if its centre is this near (hero.js REACH)
PLINTH_H = pieces.PLINTH_SIZE[2]

CAMERAS = {
    # position, target, lens (mm), resolution
    "landscape": ((0.0, -10.0, 1.3), (0.0, 0.0, 1.05), 45.0, (1920, 1080)),
    "portrait": ((0.0, -13.0, 1.9), (0.0, 0.0, 1.45), 30.0, (1080, 1920)),
}
FSTOP = 0.28


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    return nt, nt.nodes, nt.links, nt.nodes["Principled BSDF"]


def _set(bsdf, **kw):
    for k, v in kw.items():
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v


def marble(name, base, vein, vein_scale=2.2, rough=0.35, sss=0.3, text_bump=False, aged=False, sss_scale=0.04):
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
    col_out = ramp.outputs["Color"]
    normal_out = None
    if aged:
        # nothing here is new: grime sits in the hollows, the surface is mottled and pitted,
        # and a few hairline cracks run through it
        mott = N.new("ShaderNodeTexNoise")
        mott.inputs["Scale"].default_value = 2.6
        mott.inputs["Detail"].default_value = 3.0
        L.new(tc.outputs["Object"], mott.inputs["Vector"])
        mr = N.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.3
        mr.inputs["From Max"].default_value = 0.7
        mr.inputs["To Min"].default_value = 0.74
        mr.inputs["To Max"].default_value = 1.0
        L.new(mott.outputs["Fac"], mr.inputs["Value"])
        m1 = N.new("ShaderNodeMixRGB")
        m1.blend_type = "MULTIPLY"
        m1.inputs["Fac"].default_value = 1.0
        L.new(col_out, m1.inputs["Color1"])
        L.new(mr.outputs["Result"], m1.inputs["Color2"])
        ao = N.new("ShaderNodeAmbientOcclusion")
        ao.samples = 8
        ao.inputs["Distance"].default_value = 0.16
        ar = N.new("ShaderNodeMapRange")
        ar.inputs["From Min"].default_value = 0.35
        ar.inputs["From Max"].default_value = 0.92
        ar.inputs["To Min"].default_value = 0.85
        ar.inputs["To Max"].default_value = 0.0
        L.new(ao.outputs["AO"], ar.inputs["Value"])
        m2 = N.new("ShaderNodeMixRGB")
        m2.inputs["Color2"].default_value = (0.20, 0.155, 0.10, 1)
        L.new(ar.outputs["Result"], m2.inputs["Fac"])
        L.new(m1.outputs["Color"], m2.inputs["Color1"])
        vor = N.new("ShaderNodeTexVoronoi")
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 2.3
        L.new(warp.outputs["Color"], vor.inputs["Vector"])
        cr = N.new("ShaderNodeMapRange")
        cr.inputs["From Min"].default_value = 0.0
        cr.inputs["From Max"].default_value = 0.007
        cr.inputs["To Min"].default_value = 1.0
        cr.inputs["To Max"].default_value = 0.0
        L.new(vor.outputs["Distance"], cr.inputs["Value"])
        m3 = N.new("ShaderNodeMixRGB")
        m3.inputs["Color2"].default_value = (0.36, 0.30, 0.23, 1)
        L.new(cr.outputs["Result"], m3.inputs["Fac"])
        L.new(m2.outputs["Color"], m3.inputs["Color1"])
        col_out = m3.outputs["Color"]
        pit = N.new("ShaderNodeTexNoise")
        pit.inputs["Scale"].default_value = 55.0
        pit.inputs["Detail"].default_value = 2.0
        L.new(tc.outputs["Object"], pit.inputs["Vector"])
        hsum = N.new("ShaderNodeMath")
        hsum.operation = "SUBTRACT"
        L.new(pit.outputs["Fac"], hsum.inputs[0])
        L.new(cr.outputs["Result"], hsum.inputs[1])
        b1 = N.new("ShaderNodeBump")
        b1.inputs["Strength"].default_value = 0.22
        b1.inputs["Distance"].default_value = 0.012
        L.new(hsum.outputs[0], b1.inputs["Height"])
        normal_out = b1.outputs["Normal"]
        L.new(normal_out, bsdf.inputs["Normal"])
        rough += 0.12
    L.new(col_out, bsdf.inputs["Base Color"])
    _set(bsdf, Roughness=rough)
    if sss:
        _set(bsdf, **{"Subsurface Weight": sss, "Subsurface Scale": sss_scale})
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
        if normal_out is not None:
            L.new(normal_out, bump.inputs["Normal"])
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
    stone.inputs["Color2"].default_value = (0.10, 0.058, 0.028, 1)     # warm carved tiles, as in the reference
    L.new(chk.outputs["Fac"], stone.inputs["Fac"])
    col = N.new("ShaderNodeMixRGB")
    col.inputs["Color2"].default_value = (1.0, 0.66, 0.24, 1)    # brass, toward --sig
    L.new(mask.outputs[0], col.inputs["Fac"])
    L.new(stone.outputs["Color"], col.inputs["Color1"])
    L.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    # only part metal: a full mirror shows the dark around it and the pattern disappears
    met = N.new("ShaderNodeMath")
    met.operation = "MULTIPLY"
    met.inputs[1].default_value = 0.35
    L.new(mask.outputs[0], met.inputs[0])
    L.new(met.outputs[0], bsdf.inputs["Metallic"])
    # the inlay keeps a faint glow of its own, so the designs still read on tiles the one light does not reach
    glow = N.new("ShaderNodeMath")
    glow.operation = "MULTIPLY"
    glow.inputs[1].default_value = 0.04
    L.new(mask.outputs[0], glow.inputs[0])
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.62, 0.22, 1)
    L.new(glow.outputs[0], bsdf.inputs["Emission Strength"])
    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.6       # honed stone, not polished: no mirror streaks
    rough.inputs["To Max"].default_value = 0.72
    L.new(chk.outputs["Fac"], rough.inputs["Value"])
    L.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def build_board():
    """Blocks of stone at uneven heights. Tops carry the inlay; sides are plain dark stone.
    UVs: tops are a straight top-down projection in the upper 80% of the map, the visible
    sides (front, left, right) are packed into a strip along the bottom."""
    rng = random.Random(11)
    x0, y0 = BOARD_CENTER[0] - BOARD_SIZE[0] / 2, BOARD_CENTER[1] - BOARD_SIZE[1] / 2
    kx = range(int(math.floor(x0 / TILE)), int(math.ceil((x0 + BOARD_SIZE[0]) / TILE)) + 1)
    ky = range(int(math.floor(y0 / TILE)), int(math.ceil((y0 + BOARD_SIZE[1]) / TILE)) + 1)
    W, D = len(kx) * TILE, len(ky) * TILE
    ox, oy = (kx[0] - 0.5) * TILE, (ky[0] - 0.5) * TILE
    reach = REACH
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    sides = []
    for i in kx:
        for j in ky:
            cx, cy = i * TILE, j * TILE
            h = rng.choice((0.0, 0.0, 0.07, 0.14, 0.22, 0.32, 0.44))     # steps deep enough to throw a shadow
            for pid, (px, py, _yaw) in PLACEMENT.items():
                if abs(cx - px) < reach and abs(cy - py) < reach:
                    h = PLATFORM[pid]
            a = TILE / 2 - TILE_GAP / 2
            lo = -0.6
            c = [(cx - a, cy - a), (cx + a, cy - a), (cx + a, cy + a), (cx - a, cy + a)]
            top = bm.faces.new([bm.verts.new((x, y, h)) for x, y in c])
            for loop in top.loops:
                loop[uv].uv = ((loop.vert.co.x - ox) / W, 0.2 + 0.8 * (loop.vert.co.y - oy) / D)
            for e in ((0, 1), (1, 2), (3, 0)):          # front, right, left; the back is never seen
                p, q = c[e[0]], c[e[1]]
                f = bm.faces.new([bm.verts.new((p[0], p[1], lo)), bm.verts.new((q[0], q[1], lo)),
                                  bm.verts.new((q[0], q[1], h)), bm.verts.new((p[0], p[1], h))])
                f.material_index = 1
                sides.append(f)
    cols = 64
    rows = -(-len(sides) // cols)
    cw, ch = 1.0 / cols, 0.19 / rows
    for n, f in enumerate(sides):
        u0, v0 = (n % cols) * cw, (n // cols) * ch
        for loop, (du, dv) in zip(f.loops, ((0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9))):
            loop[uv].uv = (u0 + du * cw, v0 + dv * ch)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("board")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("board", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


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


def clay_lines(mat, axis_z, lines=44, depth=0.6):
    """Lines of writing along the Cyrus barrel (object X), stacked round its circumference at uneven
    spacing, cut in as a bump on top of whatever the material already has."""
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Object"], sep.inputs["Vector"])
    zc = N.new("ShaderNodeMath"); zc.operation = "SUBTRACT"; zc.inputs[1].default_value = axis_z
    L.new(sep.outputs["Z"], zc.inputs[0])
    ang = N.new("ShaderNodeMath"); ang.operation = "ARCTAN2"
    L.new(zc.outputs[0], ang.inputs[0]); L.new(sep.outputs["Y"], ang.inputs[1])
    per = N.new("ShaderNodeMath"); per.operation = "MULTIPLY"; per.inputs[1].default_value = lines / (2 * math.pi)
    L.new(ang.outputs[0], per.inputs[0])
    # uneven: the spacing wanders along the length and round the barrel, as a hand's would
    wob = N.new("ShaderNodeTexNoise"); wob.inputs["Scale"].default_value = 1.3; wob.inputs["Detail"].default_value = 2.0
    L.new(tc.outputs["Object"], wob.inputs["Vector"])
    wobs = N.new("ShaderNodeMath"); wobs.operation = "MULTIPLY_ADD"; wobs.inputs[1].default_value = 1.6; wobs.inputs[2].default_value = -0.8
    L.new(wob.outputs["Fac"], wobs.inputs[0])
    v = N.new("ShaderNodeMath"); v.operation = "ADD"
    L.new(per.outputs[0], v.inputs[0]); L.new(wobs.outputs[0], v.inputs[1])
    fr = N.new("ShaderNodeMath"); fr.operation = "FRACT"
    L.new(v.outputs[0], fr.inputs[0])
    dist = N.new("ShaderNodeMath"); dist.operation = "PINGPONG"; dist.inputs[1].default_value = 0.5
    L.new(fr.outputs[0], dist.inputs[0])
    groove = N.new("ShaderNodeMapRange"); groove.interpolation_type = "SMOOTHSTEP"
    groove.inputs["From Min"].default_value = 0.0; groove.inputs["From Max"].default_value = 0.09
    L.new(dist.outputs[0], groove.inputs["Value"])
    # the grooves are cut to uneven depth
    dn = N.new("ShaderNodeTexNoise"); dn.inputs["Scale"].default_value = 6.0
    L.new(tc.outputs["Object"], dn.inputs["Vector"])
    dmix = N.new("ShaderNodeMapRange"); dmix.inputs["To Min"].default_value = 0.35; dmix.inputs["To Max"].default_value = 1.0
    L.new(dn.outputs["Fac"], dmix.inputs["Value"])
    h = N.new("ShaderNodeMath"); h.operation = "MULTIPLY"
    L.new(groove.outputs["Result"], h.inputs[0]); L.new(dmix.outputs["Result"], h.inputs[1])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = depth
    bump.inputs["Distance"].default_value = 0.004
    L.new(h.outputs[0], bump.inputs["Height"])
    prev = bsdf.inputs["Normal"].links[0].from_socket if bsdf.inputs["Normal"].is_linked else None
    if prev is not None:
        L.new(prev, bump.inputs["Normal"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # the cut floors hold old dirt: a touch darker
    col = bsdf.inputs["Base Color"].links[0].from_socket
    dark = N.new("ShaderNodeMix"); dark.data_type = "RGBA"; dark.blend_type = "MULTIPLY"
    inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
    L.new(groove.outputs["Result"], inv.inputs[1])
    fac = N.new("ShaderNodeMath"); fac.operation = "MULTIPLY"; fac.inputs[1].default_value = 0.55
    L.new(inv.outputs[0], fac.inputs[0])
    L.new(fac.outputs[0], dark.inputs["Factor"])
    L.new(col, dark.inputs["A"]); dark.inputs["B"].default_value = (0.45, 0.4, 0.34, 1)
    L.new(dark.outputs["Result"], bsdf.inputs["Base Color"])


def build_scene():
    sc = bpy.context.scene
    # ivory with only a whisper of veining: the reference statues are almost plain
    # ivory marble: light comes through where it is thin (wings, rims, chains) and not where it is thick
    pale = marble("marble-pale", (0.84, 0.79, 0.69), (0.60, 0.555, 0.48), vein_scale=1.1, rough=0.42, sss=0.14, aged=True, sss_scale=0.03)
    # the Cyrus Cylinder is fired clay: buff, matte, opaque, written over
    clay = marble("clay", (0.58, 0.47, 0.34), (0.45, 0.36, 0.25), vein_scale=1.6, rough=0.78, sss=0.0, text_bump=True, aged=True)
    clay_lines(clay, pieces.CYRUS_AXIS_Z)
    # its museum mount is alabaster: milky, and it glows where the saddles are thin
    # (it was translucent alabaster and read as crystal with the light behind it: now opaque veined marble)
    alabaster = marble("mount-marble", (0.66, 0.62, 0.55), (0.24, 0.22, 0.19), vein_scale=1.5, rough=0.2, sss=0.0)
    _set(alabaster.node_tree.nodes["Principled BSDF"], **{"Coat Weight": 0.6, "Coat Roughness": 0.06})
    alabaster.node_tree.nodes["Color Ramp"].color_ramp.elements[1].position = 0.10
    gem = bpy.data.materials.new("pearl-black")
    gem.use_nodes = True
    _set(gem.node_tree.nodes["Principled BSDF"], **{"Base Color": (0.006, 0.006, 0.009, 1), "Roughness": 0.08,
                                                     "Coat Weight": 1.0, "Coat Roughness": 0.03})
    dark = marble("marble-dark", (0.012, 0.012, 0.014), (0.42, 0.40, 0.36), vein_scale=0.9, rough=0.2, sss=0.0)
    dark.node_tree.nodes["Color Ramp"].color_ramp.elements[1].position = 0.025
    plinth_mat = marble("plinth", (0.02, 0.019, 0.018), (0.20, 0.19, 0.17), vein_scale=1.3, rough=0.18, sss=0.0)
    # polished marble takes the light as a clear, tight highlight: unlike the satin ivory, the matte clay or the honed tiles
    _set(plinth_mat.node_tree.nodes["Principled BSDF"], **{"Coat Weight": 0.6, "Coat Roughness": 0.06})
    plinth_mat.node_tree.nodes["Color Ramp"].color_ramp.elements[1].position = 0.04

    out = {"pieces": {}, "plinths": {}}
    for pid in pieces.PIECE_IDS:
        x, y, yaw = PLACEMENT[pid]
        pl = pieces.build_plinth(pid)
        pl.location = (x, y, PLATFORM[pid])
        pl.data.materials.append(plinth_mat)
        ob = pieces.BUILDERS[pid]()
        ob.location = (x, y, PLATFORM[pid] + PLINTH_H)
        ob.rotation_euler = (0, 0, math.radians(yaw))
        if pid == "pearl":
            for m in (dark, pale, gem):
                ob.data.materials.append(m)
        else:
            for m in ((clay, alabaster) if pid == "cyrus" else (pale,)):
                ob.data.materials.append(m)
        out["pieces"][pid], out["plinths"][pid] = ob, pl

    board = build_board()
    bmat = board_material()        # the mesh is in world coordinates, so tiles are centred on multiples of TILE
    board.data.materials.append(bmat)
    board.data.materials.append(marble("tile-side", (0.012, 0.011, 0.010), (0.03, 0.027, 0.024), vein_scale=1.0, rough=0.45, sss=0.0))
    out["board"] = board

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.0011, 0.0019, 0.0055, 1)    # a hint of dark blue in the shadows and the fog
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world

    # One light, after the reference: a single source hidden right behind the Cyrus Cylinder, at its height.
    # It lights the fog from inside, rims the cylinder, lights the faces of the pieces that turn toward the
    # centre, and falls off to nothing at the left and right edges of the board. No spots, no fill.
    cx, cy, _ = PLACEMENT[FOCUS_ID]
    ld = bpy.data.lights.new("source", "POINT")
    ld.energy = 900
    ld.shadow_soft_size = 0.12
    ld.color = (1.0, 0.92, 0.80)
    lo = bpy.data.objects.new("source", ld)
    # behind the cylinder (not in it), level with the middle of the barrel: the camera cannot see it.
    # The barrel stands dark against it with a lit outline, and its shadow runs through the air toward the camera.
    lo.location = (cx, cy + 1.5, PLATFORM[FOCUS_ID] + PLINTH_H + 0.80)
    sc.collection.objects.link(lo)
    lo.visible_camera = False
    lights = [lo]
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
    vol.inputs["Color"].default_value = (0.76, 0.81, 0.92, 1)     # smoke-grey with a cold edge
    # Not an even haze: banks of low fog that lie between the pieces, thick in places, thin in others.
    # The box is 40 x 44 x 8 m and object coordinates run -0.5..0.5 across it.
    htc = hn.nodes.new("ShaderNodeTexCoord")
    hmap = hn.nodes.new("ShaderNodeMapping")
    hmap.inputs["Scale"].default_value = (21.0, 23.0, 6.0)
    hmap.inputs["Location"].default_value = (3.1, 0.7, 0.0)
    hn.links.new(htc.outputs["Object"], hmap.inputs["Vector"])
    hnoise = hn.nodes.new("ShaderNodeTexNoise")
    hnoise.inputs["Scale"].default_value = 1.0
    hnoise.inputs["Detail"].default_value = 5.0
    hnoise.inputs["Roughness"].default_value = 0.6
    hnoise.inputs["Distortion"].default_value = 0.9
    hn.links.new(hmap.outputs["Vector"], hnoise.inputs["Vector"])
    bank = hn.nodes.new("ShaderNodeMapRange")
    bank.interpolation_type = "SMOOTHSTEP"
    bank.inputs["From Min"].default_value = 0.44
    bank.inputs["From Max"].default_value = 0.66
    hn.links.new(hnoise.outputs["Fac"], bank.inputs["Value"])
    sep = hn.nodes.new("ShaderNodeSeparateXYZ")
    hn.links.new(htc.outputs["Object"], sep.inputs["Vector"])
    low = hn.nodes.new("ShaderNodeMapRange")          # 1 at the board, 0 about 2.6 m up
    low.interpolation_type = "SMOOTHSTEP"
    low.inputs["From Min"].default_value = -0.5
    low.inputs["From Max"].default_value = -0.14
    low.inputs["To Min"].default_value = 1.0
    low.inputs["To Max"].default_value = 0.0
    hn.links.new(sep.outputs["Z"], low.inputs["Value"])
    mul = hn.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    hn.links.new(bank.outputs["Result"], mul.inputs[0])
    hn.links.new(low.outputs["Result"], mul.inputs[1])
    dens = hn.nodes.new("ShaderNodeMapRange")
    dens.inputs["To Min"].default_value = 0.0035        # thin air everywhere: enough to show light shafts
    dens.inputs["To Max"].default_value = 0.15         # the thick of a bank
    hn.links.new(mul.outputs[0], dens.inputs["Value"])
    hn.links.new(dens.outputs["Result"], vol.inputs["Density"])
    hn.links.new(vol.outputs["Volume"], hn.nodes["Material Output"].inputs["Volume"])
    haze.data.materials.append(hm)
    out["haze"] = haze

    for which, (pos, target, lens, _res) in CAMERAS.items():
        cd = bpy.data.cameras.new("cam-" + which)
        cd.lens = lens
        cd.sensor_width = 36.0
        cd.sensor_fit = "AUTO"
        cd.dof.use_dof = True
        cd.dof.focus_object = out["pieces"][FOCUS_ID]
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
