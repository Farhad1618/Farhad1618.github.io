"""The solo close-ups: one detailed piece alone on its raised tile, in the hero's world and light.

SOLO[pid] holds what differs per piece. Positions are in Blender world metres; the piece's base (the top of
its plinth) is at (ox, oy, PLATFORM[pid] + PLINTH_H), where (ox, oy) keeps its hero offset inside a tile
(centred, or astride two), so a patch of the hero's board fits round it.
  tiles   patch size in tiles (x, y): one row in front of the piece's tile, the rest behind
  light   the one point light, relative to the piece base: a little behind (+y), to one side, about
          0.7-0.9 of the piece's height up, so a lit edge wraps onto the front
  energy  watts: 900 * (d / 1.5)^2, d the light's distance to the piece's centre (the hero's irradiance)
  cam     pos and target (world), lens mm, fstop, res: a long lens a few metres off, as in the hero world
  tex     bake sizes; samples for renders and bakes; tilt the live view's yaw and pitch range (degrees)
"""
import math
import zlib

import bpy

from . import pieces, scene, solo_pieces

TILE = scene.TILE

SOLO = {
    "cyrus": dict(
        tiles=(5, 4),
        # behind and to the right, 0.88 of its 1.085 m height. From the camera the light sits just inside the
        # barrel's broken right end, as in the hero (the cylinder dark with a lit outline, the halo round it),
        # while from the side it lights that end, the break, and the right of the front
        light=(0.80, 1.05, 0.95),
        energy=763,                          # d = 1.381 m to the centre of the piece (bounding box)
        # low, as in the hero, so the tile tops are seen at a slant and stay dark; from the front left
        cam=dict(pos=(-1.00, -4.00, 1.38), target=(0.04, 0.0, 1.04), lens=62.0, fstop=2.0, res=(1600, 1400)),
        # the fog lies behind and beside the piece, as the hero's banks do from its camera: the box starts
        # just in front of the piece and runs back, so the foreground keeps its blacks
        # and lower than the hero's (top 1.9 m, not 2.9): up close the camera looks into the banks, and the
        # hero's height filled the upper frame with grey
        haze=dict(front=-0.9, depth=9.0, width=12.0, top=1.9, dens=0.75),
        tex=dict(piece=4096, mask=1024, plinth=1024, board=2048),
        samples=256,
        tilt=(20, 6),
    ),
}


def energy_for(light_offset, centre_offset):
    """900 W at 1.5 m in the hero; keep that irradiance at the piece."""
    d = math.dist(light_offset, centre_offset)
    return 900.0 * (d / 1.5) ** 2


def solo_pieces_height(ob):
    return max(v.co.z for v in ob.data.vertices) - min(v.co.z for v in ob.data.vertices)


def offset_in_tile(pid):
    """The piece's hero position inside its tile: (0, 0) when it stands on a tile's centre, half a tile off
    where it stands astride two."""
    x, y, _ = scene.PLACEMENT[pid]
    return x - TILE * math.floor(x / TILE + 0.5), y - TILE * math.floor(y / TILE + 0.5)


def patch(pid):
    """Centre and size for build_board so it makes exactly tiles[0] x tiles[1] tiles round the piece,
    and the patch's real extent (centre, size) for layout.json."""
    nx, ny = SOLO[pid]["tiles"]
    ox, oy = offset_in_tile(pid)
    ci, cj = round(ox / TILE), round(oy / TILE)
    i0, i1 = ci - (nx - 1) // 2, ci + nx // 2
    j0, j1 = cj - 1, cj + ny - 2                     # one row in front of the piece, the rest behind it
    centre = ((i0 + i1) / 2 * TILE, (j0 + j1) / 2 * TILE)
    # build_board spans floor(x0 / TILE) .. ceil((x0 + size) / TILE): tile centres on both ends
    size = ((i1 - i0) * TILE, (j1 - j0) * TILE)
    return centre, size, (nx * TILE, ny * TILE)


def seed_for(pid):
    """A stable seed per piece (Python's own hash of a str changes every run)."""
    return zlib.crc32(pid.encode()) & 0xFFFF


def _clear_round(haze, at, radii):
    """Thin the fog close to the light. Up close a point light inside a bank burns a wide white blot into the
    frame (the hero hides its light behind the cylinder from 11 m off). The hero's live fog has a shoulder
    for the same reason (uKnee)."""
    nt = haze.data.materials[0].node_tree
    N, Lk = nt.nodes, nt.links
    vol = next(n for n in N if n.bl_idname == "ShaderNodeVolumePrincipled")
    src = vol.inputs["Density"].links[0].from_socket
    geo = N.new("ShaderNodeNewGeometry")
    dist = N.new("ShaderNodeVectorMath"); dist.operation = "DISTANCE"
    dist.inputs[1].default_value = tuple(at)
    Lk.new(geo.outputs["Position"], dist.inputs[0])
    k = N.new("ShaderNodeMapRange"); k.interpolation_type = "SMOOTHSTEP"
    k.inputs["From Min"].default_value, k.inputs["From Max"].default_value = radii
    k.inputs["To Min"].default_value = 0.08
    Lk.new(dist.outputs["Value"], k.inputs["Value"])
    mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    Lk.new(src, mul.inputs[0]); Lk.new(k.outputs["Result"], mul.inputs[1])
    Lk.new(mul.outputs[0], vol.inputs["Density"])


def build_solo(pid, draft=False):
    S = SOLO[pid]
    M = scene.make_materials()
    platform = scene.PLATFORM[pid]
    yaw = scene.PLACEMENT[pid][2]
    ox, oy = offset_in_tile(pid)
    base = (ox, oy, platform + scene.PLINTH_H)

    pl = pieces.build_plinth(pid)
    pl.location = (ox, oy, platform)
    ob = solo_pieces.BUILDERS[pid]()
    ob.location = base
    ob.rotation_euler = (0, 0, math.radians(yaw))
    slots, plinth_mat = solo_pieces.materials(pid, M)
    for m in slots:
        ob.data.materials.append(m)
    pl.data.materials.append(plinth_mat)

    centre, size, extent = patch(pid)
    board = scene.build_board(center=centre, size=size, placement={pid: (ox, oy, yaw)}, platform={pid: platform},
                              seed=seed_for(pid), back=True)
    # the inlay's own glow is for the far hero board; at a few metres it reads too hot
    for n in M["board"].node_tree.nodes:
        if n.bl_idname == "ShaderNodeMath" and n.operation == "MULTIPLY" and abs(n.inputs[1].default_value - 0.04) < 1e-6:
            n.inputs[1].default_value = 0.012
    # the warm tiles: the hero sees them from 10 m at a slant; here they fill the foreground and outshone the piece
    for n in M["board"].node_tree.nodes:
        if n.bl_idname == "ShaderNodeMixRGB" and tuple(round(c, 3) for c in n.inputs["Color2"].default_value[:3]) == (0.1, 0.058, 0.028):
            n.inputs["Color2"].default_value = (0.055, 0.032, 0.016, 1)
    # honed stone seen close and low: less sheen, or the tops mirror the lit fog to white
    scene._set(M["board"].node_tree.nodes["Principled BSDF"], **{"Specular IOR Level": 0.15})
    board.data.materials.append(M["board"])
    board.data.materials.append(M["tile-side"])

    sc = bpy.context.scene
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.0011, 0.0019, 0.0055, 1)     # the hero's night
    sc.world = world

    lx, ly, lz = S["light"]
    light = scene.add_light((base[0] + lx, base[1] + ly, base[2] + lz), energy=S["energy"])

    # the fog: a smaller box round the patch, with the hero's banks metre for metre. A little thinner than the
    # hero's: the camera is close to the light, and 1.6x (then 1.15x) washed the frame out round it
    hz = S["haze"]
    hloc = (centre[0], oy + hz["front"] + hz["depth"] / 2, 2.5)
    hscale = (hz["width"], hz["depth"], 5.0)
    ns, lo = scene.haze_mapping(hloc, hscale, hz["top"])
    haze = scene.build_haze(loc=hloc, scale=hscale, noise_loc=(3.1, 0.7, 0.0), dens=(0.0035 * hz["dens"], 0.15 * hz["dens"]),
                            noise_scale=ns, low_z=lo)
    _clear_round(haze, light.location, S.get("clear", (0.25, 1.0)))

    e = energy_for(S["light"], (0.0, 0.0, solo_pieces_height(ob) / 2))
    if abs(e - S["energy"]) > 0.05 * e:
        print(f"solo {pid}: energy {S['energy']} W, 900 * (d / 1.5)^2 gives {e:.0f} W")
    c = S["cam"]
    cam = scene.add_camera("cam-solo", c["pos"], c["target"], c["lens"], c["res"], ob, c["fstop"])

    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception as e:
        print("view transform:", e)
    bpy.context.view_layer.update()
    return {"id": pid, "pieces": {pid: ob}, "plinths": {pid: pl}, "board": board, "lights": [light], "haze": haze,
            "cam_solo": cam, "patch": (centre, extent), "base": base}


# ---------------------------------------------------------------- the clay sheet

def clay_sheet(pid, out_dir, draft=False):
    """The detailed piece in plain clay under a raking light, from three sides, plus a close-up:
    out_dir/clay.png and out_dir/clay-close.png."""
    import os
    from mathutils import Vector
    sc = bpy.context.scene
    ob = solo_pieces.BUILDERS[pid]()
    # plain clay, but with the detail the bake will carry (the writing's bump), so the sheet shows the piece
    M = scene.make_materials()
    for m in solo_pieces.materials(pid, M)[0]:
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        for sock in ("Base Color", "Roughness"):
            for lk in list(bsdf.inputs[sock].links):
                nt.links.remove(lk)
        bsdf.inputs["Base Color"].default_value = (0.80, 0.78, 0.74, 1)
        bsdf.inputs["Roughness"].default_value = 0.6
        for k in ("Coat Weight", "Subsurface Weight"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = 0.0
        ob.data.materials.append(m)
    copies = [ob]
    for k in range(2):
        o2 = ob.copy()
        sc.collection.objects.link(o2)
        copies.append(o2)
    for o, x, yaw in zip(copies, (-1.45, 0.0, 1.45), (-25.0, 14.0, 160.0)):
        o.location = (x, 0, 0)
        o.rotation_euler = (0, 0, math.radians(yaw))

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
    # a broad key from front left, and a low raking light from the right that pulls the writing out
    for loc, energy, size in (((-4, -6, 7), 2200, 5), ((7, -1.5, 1.3), 900, 1.2), ((1, 5, 4), 400, 3)):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy, ld.size = energy, size
        lo = bpy.data.objects.new("l", ld)
        lo.location = loc
        sc.collection.objects.link(lo)
        lo.rotation_euler = (Vector((0, 0, 0.6)) - lo.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.image_settings.file_format = "PNG"
    os.makedirs(out_dir, exist_ok=True)
    pct = 50 if draft else 100

    cd.lens = 50
    cam.location = (0, -6.2, 1.2)
    cam.rotation_euler = (Vector((0, 0, 0.55)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 2400, 900, pct
    sc.render.filepath = os.path.join(out_dir, "clay.png")
    bpy.ops.render.render(write_still=True)

    # close-up: the broken end and the writing beside it, on the middle copy
    for o in copies[::2]:
        o.hide_render = True
    cd.lens = 70
    cam.location = (1.30, -1.55, 1.75)
    cam.rotation_euler = (Vector((0.25, 0.0, 0.86)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    sc.render.filepath = os.path.join(out_dir, "clay-close.png")
    bpy.ops.render.render(write_still=True)
    sc.render.resolution_percentage = 100
    return {pid: ob}
