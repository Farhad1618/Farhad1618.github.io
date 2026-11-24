"""Detailed pieces for the solo close-ups (one per project chapter).

These are separate builders from the hero minis in pieces.py. They keep the minis' size, origin (base centre,
standing on z=0), rig pivots and part tags, so a piece reads as the same object up close, the procedural
materials (in object coordinates) keep their scale, and hero.js's rig code works unchanged.

BUILDERS[pid]() returns the object piece-<id>, with material slots filled by materials(pid, M) in that order.
Moving parts: COLOR_0 red = part / 8 (parts 1..3), and the rig JSON in ob["rig"], as in pieces.py.
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

from . import pieces
from .pieces import _part_colours, _rig, _tag, box

# ---------------------------------------------------------------- numpy noise (vectorised, periodic in one axis)


def _vnoise(x, y, nx, py, seed):
    """Smooth value noise in [-1, 1] on cell coordinates 0 <= x < nx - 1 and y, periodic in y with py cells.
    The table depends only on (nx, py, seed), so the mesh and the map see the same noise."""
    rng = np.random.default_rng(seed)
    x = np.clip(x, 0, nx - 1.001)
    tab = rng.uniform(-1.0, 1.0, (nx, py)).astype(np.float32)
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    fx, fy = x - xi, y - yi
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    y0, y1 = yi % py, (yi + 1) % py
    a = tab[xi, y0] * (1 - sx) + tab[xi + 1, y0] * sx
    b = tab[xi, y1] * (1 - sx) + tab[xi + 1, y1] * sx
    return a * (1 - sy) + b * sy


def _fbm(x, th, freq, seed, octaves=4, r_ref=0.25):
    """Fractal noise over the barrel surface: x in metres, th in radians (periodic). freq: cells per metre,
    measured at radius r_ref round the barrel. Roughly in [-1, 1]."""
    out = np.zeros(np.shape(x), dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = freq * 2 ** o
        py = max(3, int(round(2 * math.pi * r_ref * f)))
        out += amp * _vnoise((np.asarray(x) + 0.75) * f, (np.asarray(th) + math.pi) / (2 * math.pi) * py,
                             int(1.5 * f) + 3, py, seed + o)
        tot += amp
        amp *= 0.5
    return out / tot * 1.6


def _sstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _blur(a, r, wrap_axis=None):
    """Three box passes (about a gaussian of sigma r) along both axes; wrap_axis wraps round."""
    for axis in (0, 1):
        if r[axis] < 1:
            continue
        for _ in range(3):
            k = r[axis]
            pad = [(0, 0)] * a.ndim
            pad[axis] = (k + 1, k)
            c = np.cumsum(np.pad(a, pad, mode="wrap" if axis == wrap_axis else "edge"), axis=axis, dtype=np.float64)
            n = a.shape[axis]
            hi = np.take(c, np.arange(2 * k + 1, 2 * k + 1 + n), axis=axis)
            lo = np.take(c, np.arange(0, n), axis=axis)
            a = ((hi - lo) / (2 * k + 1)).astype(np.float32)
    return a


# ---------------------------------------------------------------- Cyrus: the barrel's surface

CZ = pieces.CYRUS_AXIS_Z
L, RMAX, REND = 1.0, 0.285, 0.165
RINGS, SEGS = 160, 256
NU, NV = 2048, 4096          # the writing map: along the barrel (x) by round it (theta); about 0.5 mm a texel
TH_BITE = math.radians(-28)  # where the break is: the hero mini's bite (front, high up), in this theta
LINES = 44                   # lines of writing round the barrel (the clay_lines count of the hero clay)


def radius(t):
    """The barrel's swell, t 0..1 along its length (the hero mini's profile)."""
    return REND + (RMAX - REND) * math.sin(math.pi * (0.08 + 0.84 * t)) ** 0.9


def _radius_np(x):
    t = np.clip((np.asarray(x) + L / 2) / L, 0, 1)
    return REND + (RMAX - REND) * np.sin(np.pi * (0.08 + 0.84 * t)) ** 0.9


def theta_of(ry, rz):
    """Angle round the barrel: 0 on top, +pi/2 toward +y (away from the camera), seam underneath."""
    return np.arctan2(ry, rz)


def _wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


# Small spalls elsewhere on the surface (x, theta, radius m, depth m): old knocks where the writing is gone.
SPALLS = ((-0.31, 0.95, 0.030, 0.0035), (0.04, -2.05, 0.022, 0.0028), (-0.40, -0.62, 0.018, 0.0025),
          (-0.12, -0.18, 0.012, 0.0020))


def damage(x, th, r):
    """Where the clay is broken, and how deep. Shared by the mesh and the writing map so they line up.
    x, th: arrays; r: the barrel radius there. Returns (loss in metres, broken mask 0/1, fine fracture weight)."""
    x = np.asarray(x, dtype=np.float32)
    th = np.asarray(th, dtype=np.float32)
    # the hero mini's bite: the +x end, front and high, out to 62 degrees either side
    fx = _sstep((x - 0.04) / 0.30)
    fa = _sstep(1.15 - np.abs(_wrap(th - TH_BITE)) / math.radians(80))
    b = fx * fa
    # a jagged edge: the break line wanders, and it is a clean drop, not a slope
    bb = b + 0.30 * _fbm(x, th, 6.0, 101, octaves=5)
    broken = bb > 0.5
    # the fracture: deeper toward the end, uneven, and in shelves where fired clay splits along its layers
    depth = (0.09 + 0.40 * np.clip((bb - 0.5) / 0.5, 0, 1) ** 0.7) * r + 0.010 * _fbm(x, th, 9.0, 111, octaves=3)
    depth = depth + _facets(x, th * r)
    step = 0.0065
    q = depth / step
    fq = q - np.floor(q)
    depth = (np.floor(q) + _sstep((fq - 0.55) / 0.45) ** 1.5) * step + 0.0015 * _fbm(x, th, 45.0, 113, octaves=2)
    # flakes: just outside the break, the outer skin of the clay has come away in patches
    fl_n = _fbm(x, th, 11.0, 121, octaves=4)
    flake = (~broken) & (bb > 0.25) & (fl_n > 0.10 - (bb - 0.25) * 1.8)
    fl_depth = 0.0050 + 0.0010 * _fbm(x, th, 70.0, 141, octaves=2)
    loss = np.where(broken, depth, np.where(flake, fl_depth, 0.0))
    mask = (broken | flake).astype(np.float32)
    # a few old knocks elsewhere
    for k, (sx, sth, sr, sd) in enumerate(SPALLS):
        dx = x - sx
        ds = _wrap(th - sth) * r
        rr = np.sqrt(dx * dx + ds * ds) / sr + 0.35 * _fbm(x, th, 60.0, 151 + k, octaves=2)
        sp = rr < 1.0
        loss = np.where(sp & (loss < sd), sd * (0.75 + 0.25 * np.clip(1 - rr, 0, 1)), loss)
        mask = np.maximum(mask, sp.astype(np.float32))
    return loss.astype(np.float32), mask, broken.astype(np.float32)


_FACETS = None


def _facets(x, s):
    """Fired clay breaks in angular, shell-like facets: each cell of a Voronoi pattern over the break is a
    tilted plane. x, s: metres along and round the barrel. Returns extra depth in metres (>= 0)."""
    global _FACETS
    if _FACETS is None:
        rng = np.random.default_rng(29)
        n = 70
        sx = rng.uniform(0.0, 0.52, n)
        ss = rng.uniform(-0.30, 0.20, n)                         # round the break's centre (TH_BITE * r)
        tilt = rng.uniform(-0.30, 0.30, (n, 2))
        off = rng.uniform(0.0, 0.010, n)
        _FACETS = (sx.astype(np.float32), ss.astype(np.float32), tilt.astype(np.float32), off.astype(np.float32))
    sx, ss, tilt, off = _FACETS
    x = np.asarray(x, dtype=np.float32)
    s = np.asarray(s, dtype=np.float32)
    best = np.full(x.shape, np.inf, dtype=np.float32)
    out = np.zeros(x.shape, dtype=np.float32)
    for i in range(len(sx)):
        d = (x - sx[i]) ** 2 + (s - ss[i]) ** 2
        near = d < best
        best = np.where(near, d, best)
        out = np.where(near, off[i] + tilt[i, 0] * (x - sx[i]) + tilt[i, 1] * (s - ss[i]), out)
    return np.clip(out + 0.006, 0, 0.02)


def _wedge(H, x0, th0, ang, length, head, depth, rr):
    """Press one wedge into the height map H (metres, <= 0). The stylus's triangular corner makes a deep
    triangular head; its edge drags a shallow tail that tapers away. x0, th0: the head; ang: direction of the
    tail on the surface (0 = along +x, pi/2 = toward +theta); sizes in metres; rr: barrel radius there."""
    du = L / NU                                    # metres per texel along x
    dv = 2 * math.pi * rr / NV                     # metres per texel round, at this radius
    ext = length + head
    iu0, iv0 = (x0 + L / 2) / du, (th0 + math.pi) / (2 * math.pi) * NV
    ru, rv = int(ext / du) + 2, int(ext / dv) + 2
    us = np.arange(int(iu0) - ru, int(iu0) + ru + 1)
    vs = np.arange(int(iv0) - rv, int(iv0) + rv + 1)
    us = us[(us >= 0) & (us < NU)]
    if not len(us):
        return
    U, V = np.meshgrid(us, vs)
    px = (U + 0.5 - iu0) * du
    py = (V + 0.5 - iv0) * dv
    c, s = math.cos(ang), math.sin(ang)
    a = px * c + py * s                            # along the wedge, from the head
    b = -px * s + py * c                           # across
    hh = head * 0.8                                # length of the triangular head
    w = np.maximum(head / 2 * (1 - a / hh), head * 0.11 * (1 - a / length))
    a0 = 0.18 * hh
    g = np.where(a < a0, np.clip(a / a0, 0, 1) ** 0.55,
                 np.where(a < hh, 1.0 - 0.5 * (a - hh * 0.18) / (hh * 0.82),
                          0.5 * np.clip(1 - (a - hh) / max(length - hh, 1e-4), 0, 1) ** 0.7))
    inside = (a >= 0) & (a <= length) & (np.abs(b) < w)
    d = np.where(inside, depth * g * np.clip(1 - np.abs(b) / np.maximum(w, 1e-5), 0, 1) ** 0.9, 0.0)
    rows = V % NV
    H[rows, U] = np.minimum(H[rows, U], -d)


def writing(seed=7):
    """The writing map. Returns (H_tex, H_low, broken_mask, wedge_floor), each (NV, NU) float32, row = theta.
    H_tex: full height detail in metres (<= 0), H_low: the part the mesh carries (blurred to vertex scale)."""
    rng = random.Random(seed)
    H = np.zeros((NV, NU), dtype=np.float32)
    # lines run along the barrel, stacked round it at uneven spacing, as a hand would rule them
    gaps = np.array([1.0 + 0.22 * (rng.random() * 2 - 1) for _ in range(LINES)])
    gaps *= 2 * math.pi / gaps.sum()
    edges = np.concatenate([[0.0], np.cumsum(gaps)]) - math.pi + math.radians(4)
    n_w = 0
    for li in range(LINES):
        t0, t1 = edges[li], edges[li + 1]
        tc = (t0 + t1) / 2
        band = (t1 - t0)
        slope = (rng.random() * 2 - 1) * 0.012           # a line drifts a little up or down along its length
        x = -0.455 + rng.random() * 0.02
        x_end = 0.455 - (rng.random() * 0.25 if rng.random() < 0.18 else rng.random() * 0.015)
        while x < x_end:
            rr = float(_radius_np(x))
            lh = band * rr * 0.86                           # line height in metres here
            sw = lh * rng.uniform(0.40, 1.10)               # sign width
            if x + sw > x_end:
                break
            th_mid = tc + slope * (x + 0.5) + (rng.random() - 0.5) * band * 0.06
            k = rng.random()
            wedges = []
            if k < 0.08:                                    # a single small corner wedge (a divider)
                wedges.append(("W", 0.3, 0.0))
            else:
                n = rng.choice((2, 3, 3, 4, 4, 4, 5, 5, 6, 7))
                for _ in range(n):
                    kind = rng.choices("HVWD", (0.42, 0.30, 0.18, 0.10))[0]
                    wedges.append((kind, rng.random(), rng.choice((-0.26, 0.0, 0.0, 0.26))))
            for kind, fa, fc in wedges:
                hd = lh * rng.uniform(0.27, 0.35)           # head width
                dep = hd * rng.uniform(0.36, 0.46)
                if kind == "H":                             # horizontal: head left, tail along the line
                    ln = sw * rng.uniform(0.55, 0.95)
                    ax = x + fa * max(sw - ln, 0.0)
                    _wedge(H, ax, th_mid + fc * band, rng.uniform(-0.06, 0.06), ln, hd, dep, rr)
                elif kind == "V":                           # vertical: head on top, tail down across the line
                    ln = lh * rng.uniform(0.62, 0.86)
                    _wedge(H, x + fa * sw, th_mid + 0.36 * band, -math.pi / 2 + rng.uniform(-0.08, 0.08),
                           ln, hd, dep, rr)
                elif kind == "W":                           # Winkelhaken: a short broad corner wedge
                    _wedge(H, x + fa * sw * 0.8, th_mid + fc * band * 0.8 + 0.12 * band, -math.pi / 4 +
                           rng.uniform(-0.15, 0.15), hd * 1.1, hd * 1.15, dep * 1.1, rr)
                else:                                       # diagonal
                    ln = lh * rng.uniform(0.45, 0.7)
                    _wedge(H, x + fa * sw * 0.7, th_mid + 0.3 * band, -math.pi / 2 + rng.choice((-0.6, 0.6)),
                           ln, hd * 0.9, dep, rr)
                n_w += 1
            x += sw + lh * rng.uniform(0.05, 0.13)
    print(f"cyrus writing: {n_w} wedges in {LINES} lines")

    # sample grid in (x, theta) and the damage there
    xs = ((np.arange(NU) + 0.5) / NU - 0.5) * L
    ths = (np.arange(NV) + 0.5) / NV * 2 * math.pi - math.pi
    X, TH = np.meshgrid(xs.astype(np.float32), ths.astype(np.float32))
    R = _radius_np(X).astype(np.float32)
    loss, mask, broken = damage(X, TH, R)
    # worn: in places the writing is crisp, in others nearly rubbed away
    wear = 0.40 + 0.60 * _sstep(0.5 + 0.9 * _fbm(X, TH, 3.0, 61, octaves=3))
    ends = _sstep((0.47 - np.abs(X)) / 0.02)
    H *= wear * ends * (1.0 - mask)
    # a hairline crack running from the break round the barrel
    crack = np.zeros_like(H)
    cx, cth = 0.17, math.radians(-75)
    d_ang = math.pi + 0.25
    rr_ = random.Random(seed + 1)
    for _ in range(420):
        r_ = float(_radius_np(cx))
        cx += math.cos(d_ang) * 0.0012
        cth += math.sin(d_ang) * 0.0012 / r_
        d_ang += rr_.uniform(-0.18, 0.18) + 0.02 * math.sin(cx * 40)
        d_ang = min(max(d_ang, math.pi - 0.7), math.pi + 0.7)
        iu = int((cx + L / 2) / L * NU)
        iv = int((cth + math.pi) / (2 * math.pi) * NV) % NV
        for du in range(-2, 3):
            for dv in range(-2, 3):
                q = math.hypot(du, dv)
                if q <= 2.2 and 0 <= iu + du < NU:
                    crack[(iv + dv) % NV, iu + du] = min(crack[(iv + dv) % NV, iu + du], -0.0016 * (1 - q / 2.6))
    H = np.minimum(H, crack * (1.0 - mask))
    H_low = _blur(H, (6, 5), wrap_axis=0)               # rows are theta: they wrap round
    # inside the break the clay is granular: fine roughness for the bump only
    H_tex = H + mask * 0.0007 * _fbm(X, TH, 160.0, 171, octaves=3)
    floor = np.clip(-H / 0.0025, 0, 1)
    return H_tex, H_low, mask, floor, (loss, X, TH)


def _sample(img, x, th):
    """Bilinear sample of a (NV, NU) map at barrel coordinates."""
    u = np.clip((np.asarray(x) + L / 2) / L * NU - 0.5, 0, NU - 1.001)
    v = (np.asarray(th) + math.pi) / (2 * math.pi) * NV - 0.5
    u0 = np.floor(u).astype(np.int64)
    v0 = np.floor(v).astype(np.int64)
    fu, fv = u - u0, v - v0
    a = img[v0 % NV, u0] * (1 - fu) + img[v0 % NV, u0 + 1] * fu
    b = img[(v0 + 1) % NV, u0] * (1 - fu) + img[(v0 + 1) % NV, u0 + 1] * fu
    return a * (1 - fv) + b * fv


_WRITING = {}


def cyrus_writing():
    if "w" not in _WRITING:
        _WRITING["w"] = writing()
    return _WRITING["w"]


def writing_image():
    """The writing map as a float image for the clay material: R = height detail the mesh does not carry
    (cm), G = broken clay (no writing, fresher colour), B = how deep in a wedge (old dirt sits there)."""
    if "img" in _WRITING:
        return _WRITING["img"]
    H_tex, H_low, mask, floor, _ = cyrus_writing()
    px = np.empty((NV, NU, 4), dtype=np.float32)
    px[..., 0] = (H_tex - H_low) * 100.0
    px[..., 1] = _blur(mask, (1, 1), wrap_axis=0)
    px[..., 2] = floor
    px[..., 3] = 1.0
    img = bpy.data.images.new("cyrus-writing", NU, NV, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(px.ravel())
    img.pack()
    _WRITING["img"] = img
    return img


# ---------------------------------------------------------------- Cyrus: the mount, with chips


def _chip_cutter(bm, centre, axes, rot, seed):
    """A lumpy ellipsoid: what a knock takes out of a stone edge (a shell-shaped scoop)."""
    m = Matrix.Translation(centre) @ rot.to_matrix().to_4x4() @ Matrix.Diagonal((*axes, 1))
    res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0, matrix=Matrix.Identity(4))
    for v in res["verts"]:
        n = v.co.normalized()
        v.co = n * (1.0 + 0.22 * noise.noise(n * 2.3 + Vector((seed, seed * 0.7, 0))) +
                    0.08 * noise.noise(n * 6.0 + Vector((0, seed, 0))))
        v.co = m @ v.co


def _edge_chips(rng, size, loc, n, rmin, rmax, weight=(3.0, 1.0, 0.5)):
    """Chip cutters along a box's edges (size, loc: the box), picked by weight (top edges, upright edges,
    bottom edges). Returns [(centre, axes, rot)], axes in the chip's frame (x along the edge)."""
    sx, sy, sz = (s / 2 for s in size)
    edges = []
    for a in (-1, 1):
        for b in (-1, 1):
            edges.append(((0, a * sy, b * sz), (1, 0, 0), sx, (0, a, b)))       # along x
            edges.append(((a * sx, 0, b * sz), (0, 1, 0), sy, (a, 0, b)))       # along y
            edges.append(((a * sx, b * sy, 0), (0, 0, 1), sz, (a, b, 0)))       # upright
    weights = [weight[0] if e[3][2] > 0 else (weight[1] if e[3][2] == 0 else weight[2]) for e in edges]
    out = []
    for _ in range(n):
        p, d, half, outv = rng.choices(edges, weights)[0]
        t = rng.choice((-1, 1)) if rng.random() < 0.2 else rng.uniform(-0.88, 0.88)   # some at the corners
        R = rng.uniform(rmin, rmax)
        o = Vector(outv).normalized()
        c = Vector(loc) + Vector(p) + Vector(d) * (t * half) + o * (R * rng.uniform(0.35, 0.6))
        axes = (R * rng.uniform(1.2, 1.8), R, R * rng.uniform(0.8, 1.1))
        rot = Vector(d).to_track_quat("X", "Z") @ Matrix.Rotation(rng.uniform(-0.4, 0.4), 4, "X").to_quaternion()
        out.append((c, axes, rot))
    return out


def _check_part(me, name, lo, hi, min_vol):
    """A mount part must come out of its cuts whole: faces, closed, outward, the size it was built."""
    bm = bmesh.new()
    bm.from_mesh(me)
    errs = []
    if not bm.faces:
        errs.append("no faces")
    else:
        open_edges = sum(1 for e in bm.edges if not e.is_manifold)
        if open_edges:
            errs.append(f"{open_edges} open or non-manifold edges")
        vol = bm.calc_volume(signed=True)
        if vol < min_vol:
            errs.append(f"volume {vol:.5f} m3 under {min_vol:.5f} (empty or inside out)")
        xs = [v.co for v in bm.verts]
        for a in range(3):
            mn, mx = min(c[a] for c in xs), max(c[a] for c in xs)
            if mn < lo[a] - 0.002 or mx > hi[a] + 0.002 or mn > lo[a] + 0.01 or mx < hi[a] - 0.01:
                errs.append(f"axis {a} spans {mn:.3f}..{mx:.3f}, expected {lo[a]:.3f}..{hi[a]:.3f}")
    bm.free()
    if errs:
        raise RuntimeError(f"mount part {name}: " + "; ".join(errs))


def _cut(build, chips, bevel, name, seed, bounds, min_vol):
    """Build one closed part in its own mesh, bevel it, then take the chips out one at a time (exact
    boolean, each cutter a single closed lumpy ellipsoid), checking the part after every step."""
    bm = bmesh.new()
    build(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

    def apply():
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        ob.modifiers.clear()
        old = ob.data
        ob.data = new
        bpy.data.meshes.remove(old)

    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width, m.segments = bevel, 3
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(30)
        apply()
    _check_part(ob.data, name, *bounds, min_vol)
    for k, (c, axes, rot) in enumerate(chips):
        cb = bmesh.new()
        _chip_cutter(cb, c, axes, rot, seed + k * 1.37)
        bmesh.ops.recalc_face_normals(cb, faces=cb.faces[:])
        cme = bpy.data.meshes.new(name + "-chip")
        cb.to_mesh(cme)
        cb.free()
        cut_ob = bpy.data.objects.new(name + "-chip", cme)
        bpy.context.scene.collection.objects.link(cut_ob)
        bo = ob.modifiers.new("chip", "BOOLEAN")
        bo.operation = "DIFFERENCE"
        bo.solver = "EXACT"
        bo.object = cut_ob
        apply()
        bpy.data.objects.remove(cut_ob)
        bpy.data.meshes.remove(cme)
        _check_part(ob.data, f"{name} after chip {k}", *bounds, min_vol)
    out = ob.data
    bpy.data.objects.remove(ob)
    bpy.context.view_layer.update()
    return out


def _on_plane(z0):
    """Faces lying in the plane z = z0 (a face another part covers)."""
    return lambda f: all(abs(v.co.z - z0) < 2e-4 for v in f.verts)


def _saddle_chips(rng, x, w, cz, R):
    zt = cz - R * 0.6
    yt = R * 0.8 + 0.05 * 0.35
    out = []
    for sgn in (-1, 1):
        for _ in range(rng.choice((1, 2))):
            r = rng.uniform(0.007, 0.013)
            c = Vector((x + rng.choice((-1, 1)) * w / 2, sgn * (yt + rng.uniform(-0.01, 0.015)),
                        zt + rng.uniform(-0.03, 0.004)))
            out.append((c + Vector((0, sgn * r * 0.3, r * 0.2)), (r, r * 1.3, r * 1.2), Matrix.Identity(3).to_quaternion()))
    return out


def _crumb(bm, rng, at, size):
    """A shard of clay that fell from the break: a few flat facets, flattened, resting on its broad side."""
    pts = []
    for _ in range(16):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        pts.append(Vector((v.x * size * rng.uniform(0.8, 1.15), v.y * size * rng.uniform(0.6, 1.0),
                           v.z * size * rng.uniform(0.35, 0.55))))
    vs = [bm.verts.new(p) for p in pts]
    hull = bmesh.ops.convex_hull(bm, input=vs)
    used = set(hull["geom"])
    for v in vs:
        if v not in used:
            bm.verts.remove(v)
    rot = Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Z") @ Matrix.Rotation(rng.uniform(-0.25, 0.25), 4, "X")
    hv = [g for g in hull["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in hv:
        v.co = rot @ v.co
    lo = min(v.co.z for v in hv)
    for v in hv:
        v.co += Vector((at[0], at[1], at[2] - lo - 0.0004))
    return [g for g in hull["geom"] if isinstance(g, bmesh.types.BMFace)]


def build_cyrus():
    """The Cyrus Cylinder up close: fired clay pressed with wedge-shaped writing in uneven lines along its
    length, worn smooth in places, one end broken away with flaking edges and a hairline crack, a few crumbs
    of it lying on the mount. The mount is veined marble, its edges and saddles chipped and worn.
    Material 0 the clay, 1 the mount, 2 the crumbs. Part 1 (the barrel) rolls 9 degrees, as on the mini."""
    rng = random.Random(1618)
    parts = []
    R_SAD = 0.266
    # (size, centre, chips, weights for top / upright / bottom edges): the body's top edges are under the slab
    mount_boxes = (((0.80, 0.50, 0.06), (0, 0, 0.03), 6, (3.0, 1.0, 0.3)),
                   ((0.70, 0.42, 0.30), (0, 0, 0.21), 7, (0.0, 3.0, 0.8)),
                   ((0.76, 0.48, 0.05), (0, 0, 0.385), 9, (3.0, 1.0, 0.6)))
    # faces nobody sees are dropped after the cut, so the bake spends its texels on the rest: the base's
    # underside, the body's top and bottom (under the slab, on the base), the slab's and saddles' undersides.
    # Picked by position (the plane they lie in), never by normal sign.
    hidden = ((0.0,), (0.06, 0.36), (0.36,))
    for k, (size, loc, n, wts) in enumerate(mount_boxes):
        chips = _edge_chips(rng, size, loc, n, 0.007, 0.022, wts)
        lo = tuple(l - s_ / 2 for l, s_ in zip(loc, size))
        hi = tuple(l + s_ / 2 for l, s_ in zip(loc, size))
        vol = size[0] * size[1] * size[2]
        parts.append((_cut(lambda bm, s=size, l=loc: box(bm, *s, l), chips, 0.005, f"mount-{k}", 11 + k * 7,
                           (lo, hi), 0.85 * vol), [_on_plane(z) for z in hidden[k]]))
    for k, x in enumerate((-0.25, 0.25)):
        chips = _saddle_chips(rng, x, 0.026, CZ, R_SAD)
        parts.append((_cut(lambda bm, xx=x: pieces._saddle(bm, xx, 0.026, 0.2, 0.41, CZ, R_SAD), chips, 0.003,
                           f"saddle-{k}", 40 + k * 5, ((x - 0.013, -0.25, 0.41), (x + 0.013, 0.25, CZ - R_SAD * 0.6)),
                           0.0015), [_on_plane(0.41)]))

    bm = bmesh.new()
    for me, rules in parts:
        pb = bmesh.new()
        pb.from_mesh(me)
        n0 = len(pb.faces)
        gone = [f for f in pb.faces if any(r(f) for r in rules)]
        bmesh.ops.delete(pb, geom=gone, context="FACES")
        if not pb.faces:
            raise RuntimeError(f"mount part {me.name}: nothing left after dropping hidden faces")
        print(f"  {me.name}: {n0} faces, {len(gone)} hidden dropped")
        pb.to_mesh(me)
        pb.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for f in bm.faces:
        f.material_index = 1
    # crumbs of the broken end, on the mount under it and one on the bottom step
    crumb_start = len(bm.faces)
    for at, size in (((0.315, -0.150, 0.41), 0.016), ((0.352, -0.095, 0.41), 0.010), ((0.290, -0.205, 0.41), 0.007),
                     ((0.338, 0.120, 0.41), 0.009), ((0.37, -0.232, 0.06), 0.008)):
        for f in _crumb(bm, rng, at, size):
            f.material_index = 2
    bm.faces.ensure_lookup_table()
    n_mount = len(bm.faces)
    print(f"cyrus mount + crumbs: {n_mount} faces ({n_mount - crumb_start} crumb faces)")

    # ---- the barrel along X: rings of SEGS vertices, theta 0 on top, the seam underneath
    _, H_low, _, _, _ = cyrus_writing()
    prof = [(0.0, -L / 2), (REND * 0.72, -L / 2), (REND, -L / 2 + 0.02)]
    for i in range(RINGS):
        t = 0.03 + 0.94 * i / (RINGS - 1)
        prof.append((radius(t), -L / 2 + t * L))
    prof += [(REND, L / 2 - 0.02), (REND * 0.72, L / 2), (0.0, L / 2)]
    ths = np.array([-math.pi + 2 * math.pi * j / SEGS for j in range(SEGS)], dtype=np.float32)
    # displacement of every ring vertex at once
    rings_r = np.array([p[0] for p in prof], dtype=np.float32)
    rings_x = np.array([p[1] for p in prof], dtype=np.float32)
    X, TH = np.meshgrid(rings_x, ths, indexing="ij")
    R0 = np.repeat(rings_r[:, None], SEGS, axis=1)
    Rref = _radius_np(X)
    loss, _mask, _brk = damage(X, TH, Rref)
    dent = _sample(H_low, X, TH)
    side = np.zeros_like(R0)
    side[2:-2] = 1.0                                         # the written face (not the end caps)
    r_new = R0 - loss * (R0 / np.maximum(Rref, 1e-4)) + dent * side
    # the mini's low, uneven swell (same noise as the hero), so the two read as one object
    for i in range(len(prof)):
        for j in range(SEGS):
            if R0[i, j] <= 0:
                continue
            p = Vector((X[i, j], R0[i, j] * math.sin(TH[i, j]), CZ + R0[i, j] * math.cos(TH[i, j])))
            r_new[i, j] *= 1.0 + 0.014 * noise.noise(p * 7.0) + 0.004 * noise.noise(p * 14.0)
    r_new = np.maximum(r_new, 0.02)

    barrel_start = len(bm.faces)
    uv = bm.loops.layers.uv.verify()
    flag = bm.faces.layers.int.get("written") or bm.faces.layers.int.new("written")
    rings = []
    for i, (r, x) in enumerate(prof):
        if r <= 1e-6:
            rings.append([bm.verts.new((x, 0.0, CZ))])
        else:
            rings.append([bm.verts.new((x, r_new[i, j] * math.sin(ths[j]), CZ + r_new[i, j] * math.cos(ths[j])))
                          for j in range(SEGS)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(SEGS):
            k = (j + 1) % SEGS
            if len(a) == 1:
                f = bm.faces.new((a[0], b[k], b[j]))
            elif len(b) == 1:
                f = bm.faces.new((a[j], a[k], b[0]))
            else:
                f = bm.faces.new((a[j], a[k], b[k], b[j]))
            f.material_index = 0
            if 2 <= i < len(rings) - 3:
                # the written side: a cylinder unwrap in metres (x along, arc at RMAX round), seam underneath
                f[flag] = 1
                xa, xb = prof[i][1] + L / 2, prof[i + 1][1] + L / 2
                va, vb = 2 * math.pi * j / SEGS * RMAX, 2 * math.pi * (j + 1) / SEGS * RMAX
                for loop, q in zip(f.loops, ((xa, va), (xa, vb), (xb, vb), (xb, va))):
                    loop[uv].uv = q
    # every barrel face rolls
    _tag(bm, barrel_start, 1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("piece-cyrus")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("piece-cyrus", me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(48))          # chips, crumbs and the break's edge stay crisp
    _part_colours(me)
    _unwrap_rest(ob, density=1.7)
    return _rig(ob, [{"part": 1, "mode": "turn", "pivot": (0, 0, CZ), "axis": (1, 0, 0), "angle": 9, "k": 9, "c": 5}])


def _uv_area(me, polys):
    uvl = me.uv_layers.active.data
    a3 = auv = 0.0
    for p in polys:
        a3 += p.area
        pts = [uvl[li].uv for li in p.loop_indices]
        s = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            s += x1 * y2 - x2 * y1
        auv += abs(s) / 2
    return a3, auv


def _unwrap_rest(ob, density):
    """The written side keeps its cylinder unwrap; everything else is smart-projected. Then the written side
    is scaled to `density` times the texels per metre of the rest, and all islands are packed together."""
    me = ob.data
    written = [0] * len(me.polygons)
    me.attributes["written"].data.foreach_get("value", written)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for p, w in zip(me.polygons, written):
        p.select = not w
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    rest = [p for p, w in zip(me.polygons, written) if not w]
    side = [p for p, w in zip(me.polygons, written) if w]
    a3r, auvr = _uv_area(me, rest)
    rho = math.sqrt(auvr / a3r) * density                    # uv units per metre for the written side
    uvl = me.uv_layers.active.data
    for p in side:
        for li in p.loop_indices:
            uvl[li].uv = uvl[li].uv * rho
    for p in me.polygons:
        p.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)
    a3s, auvs = _uv_area(me, side)
    a3r, auvr = _uv_area(me, rest)
    print(f"uv: written side {math.sqrt(auvs / a3s):.1f} uv/m, rest {math.sqrt(auvr / a3r):.1f} uv/m "
          f"(x2048 = texels/m); filled {auvs + auvr:.2f}")


# ---------------------------------------------------------------- materials


def _clay_solo(M):
    """The Cyrus clay for the close-up: the hero clay's colour, veining and age, but the writing is the real
    wedge map (geometry plus a bump of what the mesh cannot carry), and the break shows fresher clay."""
    from . import scene
    mat = scene.marble("clay-solo", (0.58, 0.47, 0.34), (0.45, 0.36, 0.25), vein_scale=1.6, rough=0.78, sss=0.0,
                       text_bump=False, aged=True)
    nt = mat.node_tree
    N, Lk = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    Lk.new(tc.outputs["Object"], sep.inputs["Vector"])
    zc = N.new("ShaderNodeMath"); zc.operation = "SUBTRACT"; zc.inputs[1].default_value = CZ
    Lk.new(sep.outputs["Z"], zc.inputs[0])
    th = N.new("ShaderNodeMath"); th.operation = "ARCTAN2"                 # atan2(y, z - cz)
    Lk.new(sep.outputs["Y"], th.inputs[0]); Lk.new(zc.outputs[0], th.inputs[1])
    v = N.new("ShaderNodeMath"); v.operation = "MULTIPLY_ADD"
    v.inputs[1].default_value = 1 / (2 * math.pi); v.inputs[2].default_value = 0.5
    Lk.new(th.outputs[0], v.inputs[0])
    u = N.new("ShaderNodeMath"); u.operation = "MULTIPLY_ADD"
    u.inputs[1].default_value = 1 / L; u.inputs[2].default_value = 0.5
    Lk.new(sep.outputs["X"], u.inputs[0])
    uvc = N.new("ShaderNodeCombineXYZ")
    Lk.new(u.outputs[0], uvc.inputs["X"]); Lk.new(v.outputs[0], uvc.inputs["Y"])
    tex = N.new("ShaderNodeTexImage")
    tex.image = writing_image()
    tex.interpolation = "Cubic"
    tex.extension = "REPEAT"
    Lk.new(uvc.outputs["Vector"], tex.inputs["Vector"])
    ch = N.new("ShaderNodeSeparateColor")
    Lk.new(tex.outputs["Color"], ch.inputs["Color"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.01                          # R is in cm
    Lk.new(ch.outputs["Red"], bump.inputs["Height"])
    prev = bsdf.inputs["Normal"].links[0].from_socket if bsdf.inputs["Normal"].is_linked else None
    if prev is not None:
        Lk.new(prev, bump.inputs["Normal"])
    Lk.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    col = bsdf.inputs["Base Color"].links[0].from_socket
    # dirt in the wedges
    dark = N.new("ShaderNodeMix"); dark.data_type = "RGBA"; dark.blend_type = "MULTIPLY"
    df = N.new("ShaderNodeMath"); df.operation = "MULTIPLY"; df.inputs[1].default_value = 0.75
    Lk.new(ch.outputs["Blue"], df.inputs[0])
    Lk.new(df.outputs[0], dark.inputs["Factor"])
    Lk.new(col, dark.inputs["A"]); dark.inputs["B"].default_value = (0.40, 0.34, 0.27, 1)
    # the broken clay: paler, fresher, no patina
    brk = N.new("ShaderNodeMix"); brk.data_type = "RGBA"
    brk.inputs["B"].default_value = (0.70, 0.60, 0.47, 1)
    Lk.new(ch.outputs["Green"], brk.inputs["Factor"])
    Lk.new(dark.outputs["Result"], brk.inputs["A"])
    Lk.new(brk.outputs["Result"], bsdf.inputs["Base Color"])
    return mat


def _mount_solo(M):
    """The mount's veined marble with wear: dirt in the inside corners and the chips, the edges a little dulled."""
    mat = M["mount"].copy()
    mat.name = "mount-solo"
    nt = mat.node_tree
    N, Lk = nt.nodes, nt.links
    # up close the hero's bold veins read as black cracks: finer and softer here
    ramp = N["Color Ramp"].color_ramp
    ramp.elements[0].color = (0.47, 0.44, 0.39, 1)
    ramp.elements[1].position = 0.06
    bsdf = N["Principled BSDF"]
    col = bsdf.inputs["Base Color"].links[0].from_socket
    ao = N.new("ShaderNodeAmbientOcclusion")
    ao.samples = 12
    ao.inputs["Distance"].default_value = 0.05
    gr = N.new("ShaderNodeMapRange")
    gr.inputs["From Min"].default_value = 0.45
    gr.inputs["From Max"].default_value = 0.95
    gr.inputs["To Min"].default_value = 0.7
    gr.inputs["To Max"].default_value = 0.0
    Lk.new(ao.outputs["AO"], gr.inputs["Value"])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["B"].default_value = (0.22, 0.18, 0.13, 1)
    Lk.new(gr.outputs["Result"], mix.inputs["Factor"])
    Lk.new(col, mix.inputs["A"])
    Lk.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    edge = N.new("ShaderNodeAmbientOcclusion")             # inside: high on thin, convex edges
    edge.inside = True
    edge.samples = 8
    edge.inputs["Distance"].default_value = 0.008
    er = N.new("ShaderNodeMapRange")
    er.inputs["From Min"].default_value = 0.55
    er.inputs["From Max"].default_value = 0.9
    er.inputs["To Min"].default_value = 0.42                 # worn edges are dull, the faces polished
    er.inputs["To Max"].default_value = 0.2
    Lk.new(edge.outputs["AO"], er.inputs["Value"])
    Lk.new(er.outputs["Result"], bsdf.inputs["Roughness"])
    bev = N.new("ShaderNodeBevel")
    bev.samples = 8
    bev.inputs["Radius"].default_value = 0.0025
    Lk.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _crumb_mat():
    from . import scene
    return scene.marble("crumb", (0.66, 0.56, 0.43), (0.52, 0.43, 0.32), vein_scale=1.6, rough=0.85, sss=0.0,
                        aged=True)


# how strong the live highlight is, per material (the mask's B channel)
SPEC = {"clay-solo": 0.05, "crumb": 0.05, "mount-solo": 0.9, "marble-pale": 0.35, "pearl-black": 1.0,
        "marble-dark": 0.9, "plinth": 0.9}


def materials(pid, M):
    """Material slots of the detailed piece, in slot order, and of its plinth."""
    if pid == "cyrus":
        return [_clay_solo(M), _mount_solo(M), _crumb_mat()], M["plinth"]
    raise KeyError(pid)


BUILDERS = {"cyrus": build_cyrus}
