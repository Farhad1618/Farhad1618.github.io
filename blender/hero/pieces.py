"""Geometry for the six project pieces and their plinths. No materials, no lights.

Every builder returns an object named piece-<id>, origin at the base centre,
standing on z=0, between 1.0 and 1.3 m tall, smooth-shaded and UV-unwrapped.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

PIECE_IDS = ["cyrus", "zagros", "onepharma", "pearl", "falah", "nids"]
PLINTH_SIZE = (0.9, 0.9, 0.35)


# ---------- primitives (all add into an existing bmesh) ----------

def _T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def lathe(bm, profile, segs=48, matrix=None):
    """Surface of revolution about Z from (radius, z) points. r == 0 closes to a pole."""
    matrix = matrix or Matrix.Identity(4)
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new(matrix @ Vector((0, 0, z)))])
        else:
            rings.append([bm.verts.new(matrix @ Vector((r * math.cos(2 * math.pi * i / segs),
                                                        r * math.sin(2 * math.pi * i / segs), z)))
                          for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if len(ring) > 1:
            bm.faces.new(list(reversed(ring)) if flip else ring)


def box(bm, sx, sy, sz, loc, rot=None):
    m = _T(*loc) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def prism(bm, r1, r2, h, loc, segs=6, rot=None):
    """Cone/cylinder/prism along Z, base at loc."""
    m = _T(loc[0], loc[1], loc[2] + h / 2) @ (rot or Matrix.Identity(4))
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r1, radius2=r2, depth=h, matrix=m)


def sphere(bm, r, loc, u=24, v=14):
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r, matrix=_T(*loc))


def rod(bm, a, b, r, segs=10):
    a, b = Vector(a), Vector(b)
    d = b - a
    m = _T(*((a + b) / 2)) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r, depth=d.length, matrix=m)


def torus(bm, R, r, matrix, seg_major=28, seg_minor=10):
    rings = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        ring = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            ring.append(bm.verts.new(matrix @ Vector(((R + r * math.cos(b)) * math.cos(a),
                                                      (R + r * math.cos(b)) * math.sin(a),
                                                      r * math.sin(b)))))
        rings.append(ring)
    for i in range(seg_major):
        a, b = rings[i], rings[(i + 1) % seg_major]
        for j in range(seg_minor):
            k = (j + 1) % seg_minor
            bm.faces.new((a[j], b[j], b[k], a[k]))


def shell(bm, R, depth, thick, matrix, ribs=13, na=30, nr=8):
    """A ribbed fan-shaped half shell, hinge at the origin, opening along +X, concave up."""
    def pt(i, j, off):
        th = math.radians(-80 + 160 * i / na)
        t = 0.07 + 0.93 * j / nr
        rr = R * t * (0.80 + 0.20 * math.cos(th))
        z = -depth * (4 * t * (1 - t)) ** 0.75 - 0.012 * t * math.cos(ribs * th) + off
        return bm.verts.new(matrix @ Vector((rr * math.cos(th), rr * math.sin(th) * 0.92, z)))
    top = [[pt(i, j, thick) for j in range(nr + 1)] for i in range(na + 1)]
    bot = [[pt(i, j, 0.0) for j in range(nr + 1)] for i in range(na + 1)]
    for i in range(na):
        for j in range(nr):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
    for j in range(nr):
        bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j]))
        bm.faces.new((top[na][j], bot[na][j], bot[na][j + 1], top[na][j + 1]))
    for i in range(na):
        bm.faces.new((top[i][nr], top[i + 1][nr], bot[i + 1][nr], bot[i][nr]))
        bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]))


# ---------- finishing ----------

def _finish(bm, name, bevel=0.006, bevel_angle=38.0, unwrap=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(bevel_angle)
    w = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
    w.keep_sharp = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    ob.modifiers.clear()
    old = ob.data
    ob.data = baked
    baked.name = name
    bpy.data.meshes.remove(old)
    if unwrap:
        _unwrap(ob)
    return ob


def _unwrap(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)


def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def height(ob):
    return max(v.co.z for v in ob.data.vertices) - min(v.co.z for v in ob.data.vertices)


# ---------- the six pieces ----------

def build_cyrus():
    """The Cyrus Cylinder: a barrel of incised text bands lying on a cradle and stand."""
    bm = bmesh.new()
    # stand: round foot, waisted stem
    lathe(bm, [(0.0, 0.0), (0.27, 0.0), (0.27, 0.035), (0.22, 0.06), (0.09, 0.09), (0.055, 0.16),
               (0.05, 0.30), (0.07, 0.40), (0.11, 0.44), (0.0, 0.44)], segs=40)
    # cradle: slab and two saddles
    box(bm, 0.74, 0.20, 0.05, (0, 0, 0.455))
    for x in (-0.25, 0.25):
        box(bm, 0.05, 0.30, 0.20, (x, 0, 0.56))
    # barrel along X, widest in the middle, with shallow grooves between text bands
    L, bands, rmax, rend = 1.0, 17, 0.285, 0.165
    prof = [(0.0, -L / 2), (rend * 0.72, -L / 2), (rend, -L / 2 + 0.02)]
    for i in range(bands + 1):
        t = i / bands
        x = -L / 2 + 0.03 + t * (L - 0.06)
        r = rend + (rmax - rend) * math.sin(math.pi * (0.08 + 0.84 * t)) ** 0.9
        if 0 < i < bands:
            prof += [(r, x - 0.006), (r - 0.010, x), (r, x + 0.006)]
        else:
            prof.append((r, x))
    prof += [(rend, L / 2 - 0.02), (rend * 0.72, L / 2), (0.0, L / 2)]
    cz = 0.48 + 0.10 + 0.275
    v0 = len(bm.verts)
    lathe(bm, prof, segs=40, matrix=_T(0, 0, cz) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    # Age it. The real cylinder is cracked and has lost a piece: the surface is uneven and
    # one end is broken away in a rough bite.
    bm.verts.ensure_lookup_table()
    for v in bm.verts[v0:]:
        ry, rz = v.co.y, v.co.z - cz
        rad = math.hypot(ry, rz)
        if rad < 1e-5:
            continue
        ang = math.atan2(rz, ry)
        k = 1.0 + 0.018 * noise.noise(v.co * 7.0) + 0.008 * noise.noise(v.co * 23.0)
        fx = min(1.0, max(0.0, (v.co.x - 0.16) / 0.22))
        fa = min(1.0, max(0.0, 1.0 - abs(ang - math.radians(118)) / math.radians(62)))
        bite = (fx * fx * (3 - 2 * fx)) * (fa * fa * (3 - 2 * fa))
        k *= 1.0 - 0.46 * bite * (0.75 + 0.25 * noise.noise(v.co * 15.0))
        v.co.y, v.co.z = ry * k, cz + rz * k
    return _finish(bm, "piece-cyrus", bevel=0.005, bevel_angle=55.0)


def build_zagros():
    """A sealed hexagonal vault with five keys, three turned."""
    bm = bmesh.new()
    prism(bm, 0.43, 0.43, 0.07, (0, 0, 0.0))           # step
    prism(bm, 0.37, 0.37, 0.66, (0, 0, 0.07))          # body
    prism(bm, 0.345, 0.345, 0.02, (0, 0, 0.73))        # seam recess
    prism(bm, 0.39, 0.39, 0.07, (0, 0, 0.75))          # lid
    prism(bm, 0.33, 0.10, 0.16, (0, 0, 0.82))          # lid slope
    prism(bm, 0.10, 0.10, 0.03, (0, 0, 0.98))
    sphere(bm, 0.07, (0, 0, 1.06), u=20, v=12)         # seal knob
    apothem = 0.37 * math.cos(math.pi / 6)
    for k in range(5):                                  # sixth face stays empty
        ang = math.radians(30 + 60 * k)
        out = Vector((math.cos(ang), math.sin(ang), 0))
        base = out * apothem + Vector((0, 0, 0.42))
        # escutcheon plate
        plate = _T(*(base + out * 0.006)) @ out.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.075, radius2=0.075, depth=0.014, matrix=plate)
        rod(bm, base, base + out * 0.12, 0.02)
        turned = k in (0, 2, 3)
        # bow: a ring whose plane contains the shaft; vertical when unturned, flat when turned
        side = Vector((0, 0, 1)) if not turned else out.cross(Vector((0, 0, 1)))
        centre = base + out * 0.19
        normal = out.cross(side).normalized()
        m = Matrix.Translation(centre) @ normal.to_track_quat("Z", "Y").to_matrix().to_4x4()
        torus(bm, 0.07, 0.018, m, seg_major=24, seg_minor=8)
    return _finish(bm, "piece-zagros", bevel=0.007)


def build_onepharma():
    """A knowledge graph: spheres joined by rods, on a slim stem."""
    bm = bmesh.new()
    lathe(bm, [(0.0, 0.0), (0.24, 0.0), (0.24, 0.03), (0.19, 0.055), (0.06, 0.085), (0.032, 0.14),
               (0.026, 0.50), (0.0, 0.50)], segs=36)
    rng = random.Random(7)
    centre = Vector((0, 0, 0.84))
    nodes = [(centre, 0.105)]
    # points on a squashed shell around the hub, rejected when too close together
    while len(nodes) < 11:
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if d.length < 0.3:
            continue
        d.normalize()
        p = centre + Vector((d.x * 0.36, d.y * 0.26, d.z * 0.33))
        if all((p - q).length > 0.20 for q, _ in nodes):
            nodes.append((p, 0.075 if len(nodes) % 3 else 0.055))
    for p, r in nodes:
        sphere(bm, r, p, u=22, v=12)
    rod(bm, (0, 0, 0.48), centre, 0.022)
    for i, (p, _) in enumerate(nodes[1:], 1):
        rod(bm, centre, p, 0.013, segs=8)
        # one extra link to the nearest other outer node
        j = min((k for k in range(1, len(nodes)) if k != i), key=lambda k: (nodes[k][0] - p).length)
        if j > i:
            rod(bm, p, nodes[j][0], 0.010, segs=8)
    return _finish(bm, "piece-onepharma", bevel=0.0)


def build_pearl():
    """Black Pearl: a milled block (terraces from the roughing passes) holding an open shell and its pearl.
    Material slots: 0 block, 1 shell, 2 pearl."""
    bm = bmesh.new()
    box(bm, 0.64, 0.64, 0.50, (0, 0, 0.25))
    prof = [(0.0, 0.50)]
    r, z = 0.305, 0.50
    prof.append((r, z))
    for _ in range(5):
        z += 0.02
        prof.append((r, z))
        r -= 0.018
        prof.append((r, z))
    prof.append((0.0, z))
    lathe(bm, prof, segs=56)
    n0 = len(bm.faces)
    hinge = (-0.27, 0, 0.715)
    shell(bm, 0.54, 0.105, 0.016, _T(*hinge))
    up = _T(hinge[0], 0, hinge[2] + 0.012) @ Matrix.Rotation(math.radians(-62), 4, "Y") @ Matrix.Diagonal((1, 1, -1, 1))
    shell(bm, 0.54, 0.105, 0.016, up)
    n1 = len(bm.faces)
    sphere(bm, 0.135, (0.0, 0, 0.775), u=40, v=24)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[n0:n1]:
        f.material_index = 1
    for f in bm.faces[n1:]:
        f.material_index = 2
    return _finish(bm, "piece-pearl", bevel=0.006, bevel_angle=50.0)


def build_falah():
    """A balance scale, pans level."""
    bm = bmesh.new()
    lathe(bm, [(0.0, 0.0), (0.25, 0.0), (0.25, 0.03), (0.20, 0.055), (0.07, 0.09), (0.04, 0.16),
               (0.032, 0.50), (0.045, 0.56), (0.03, 0.62), (0.026, 1.02), (0.0, 1.02)], segs=40)
    sphere(bm, 0.05, (0, 0, 1.08), u=20, v=12)
    lathe(bm, [(0.0, 1.11), (0.022, 1.12), (0.0, 1.19)], segs=16)
    half, tilt = 0.36, math.radians(13)
    box(bm, 2 * half + 0.06, 0.04, 0.058, (0, 0, 0.99), rot=Matrix.Rotation(tilt, 4, "Y"))
    sphere(bm, 0.04, (0, 0, 0.99), u=16, v=10)
    for sx in (-1, 1):
        # the beam tips: the left pan is weighed down, the right one rides up
        x = sx * half * math.cos(tilt)
        top = Vector((x, 0, 0.985 + sx * half * math.sin(tilt)))
        sphere(bm, 0.034, top, u=14, v=8)
        pan_z = top.z - 0.50
        pr = 0.155
        lathe(bm, [(0.0, pan_z - 0.045), (pr * 0.55, pan_z - 0.04), (pr * 0.9, pan_z - 0.015), (pr, pan_z),
                   (pr - 0.012, pan_z), (pr * 0.86, pan_z - 0.008), (pr * 0.5, pan_z - 0.028), (0.0, pan_z - 0.032)],
              segs=36, matrix=_T(x, 0, 0))
        for k in range(3):
            a = math.radians(90 + 120 * k)
            rim = Vector((x + (pr - 0.008) * math.cos(a), (pr - 0.008) * math.sin(a), pan_z))
            rod(bm, top, rim, 0.0115, segs=8)
        if sx < 0:
            # the heavy pan: coins, stacked a little carelessly
            for i in range(6):
                prism(bm, 0.052, 0.052, 0.013, (x - 0.035 + 0.008 * math.sin(i * 2.1), 0.02 + 0.008 * math.cos(i * 1.7),
                                               pan_z - 0.034 + i * 0.0135), segs=20)
            for i in range(3):
                prism(bm, 0.045, 0.045, 0.013, (x + 0.065, -0.045 + 0.006 * i, pan_z - 0.03 + i * 0.0135), segs=20)
    return _finish(bm, "piece-falah", bevel=0.004)


def build_nids():
    """Network Intrusion Detection: a round shield that has taken arrows. The attack that did not get through.
    The shield faces -Y and leans back on a prop."""
    bm = bmesh.new()
    box(bm, 0.66, 0.40, 0.07, (0, 0.06, 0.035))
    box(bm, 0.52, 0.30, 0.05, (0, 0.06, 0.095))
    M = _T(0, 0, 0.12) @ Matrix.Rotation(math.radians(-13), 4, "X") @ _T(0, 0, 0.49) @ Matrix.Rotation(math.pi / 2, 4, "X")
    lathe(bm, [(0.0, -0.035), (0.455, -0.035), (0.478, -0.012), (0.478, 0.014), (0.452, 0.024), (0.44, 0.014),
               (0.315, 0.040), (0.308, 0.054), (0.290, 0.054), (0.283, 0.044),
               (0.165, 0.066), (0.135, 0.072), (0.125, 0.10), (0.085, 0.135), (0.0, 0.152)], segs=56, matrix=M)
    for k in range(10):
        a = 2 * math.pi * k / 10
        sphere(bm, 0.019, M @ Vector((0.385 * math.cos(a), 0.385 * math.sin(a), 0.030)), u=10, v=6)
    rod(bm, (0, 0.24, 0.12), M @ Vector((0, 0.16, -0.035)), 0.026)
    # arrows: where they struck (on the face), where they came from, how much shaft is left
    for (hx, hy), d, length, whole in (((0.13, 0.17), (-0.28, -1.0, 0.36), 0.56, True),
                                       ((-0.21, -0.04), (0.30, -1.0, 0.16), 0.50, True),
                                       ((0.04, -0.23), (0.10, -1.0, 0.50), 0.17, False)):
        d = Vector(d).normalized()
        p = M @ Vector((hx, hy, 0.02))
        end = p + d * length
        rod(bm, p - d * 0.03, end, 0.016, segs=8)
        if not whole:
            continue                                  # snapped off: no fletching
        Q = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        for k in range(3):
            R = Q @ Matrix.Rotation(2 * math.pi * k / 3, 4, "Z")
            box(bm, 0.05, 0.005, 0.13, (end - d * 0.08) + (R @ Vector((0.03, 0, 0))), rot=R)
    return _finish(bm, "piece-nids", bevel=0.004)


def build_plinth(piece_id):
    bm = bmesh.new()
    sx, sy, sz = PLINTH_SIZE
    box(bm, sx, sy, sz * 0.2, (0, 0, sz * 0.1))
    box(bm, sx * 0.92, sy * 0.92, sz * 0.64, (0, 0, sz * 0.52))
    box(bm, sx, sy, sz * 0.16, (0, 0, sz * 0.92))
    return _finish(bm, "plinth-" + piece_id, bevel=0.012, bevel_angle=30.0)


BUILDERS = {
    "cyrus": build_cyrus,
    "zagros": build_zagros,
    "onepharma": build_onepharma,
    "pearl": build_pearl,
    "falah": build_falah,
    "nids": build_nids,
}
