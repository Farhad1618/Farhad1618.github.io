import importlib.util,re,sys
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
spec=importlib.util.spec_from_file_location('mm','make-mark.py');mm=importlib.util.module_from_spec(spec);spec.loader.exec_module(mm)
def pts(d):return [tuple(map(float,p)) for p in re.findall(r'([\d.]+) ([\d.]+)',d)]
def build(k,rw,r,ws=1,right=None):
    sc=lambda f:(lambda t:f(t)*ws)
    right=right or mm.a_right
    W=[(mm.a_arc,sc(mm.bell(1.2,4.2))),(mm.a_stem,sc(mm.lin(4.2,4.2))),(right,sc(mm.ease(4.2,0.7))),(mm.a_ld,sc(mm.lin(2.6,1.6))),(mm.a_limb,sc(mm.bell(1.2,2.8)))]
    shapes=[Polygon(pts(mm.poly(p,f,k))).buffer(0) for p,f in W]
    ring=Point(100,100).buffer(90+rw/2,resolution=96).difference(Point(100,100).buffer(90-rw/2,resolution=96))
    u=unary_union(shapes+[ring])
    u=u.buffer(r*k,resolution=24).buffer(-r*k,resolution=24)
    def rp(c):return 'M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in c.coords)+'Z'
    geoms=u.geoms if hasattr(u,'geoms') else [u]
    d=''.join(rp(g.exterior)+''.join(rp(i) for i in g.interiors) for g in geoms)
    return d
def svg(k,rw,r,cls='',**kw):
    return f'<svg {cls} viewBox="0 0 200 200"><path fill="#ECE7DC" fill-rule="evenodd" d="{build(k,rw,r,**kw)}"/></svg>'
R=4.0
long_right=mm.cr([(103.8,89.5),(115,94),(130,97),(150,96.5),(172,90)])
V=[('4 (longer arm), a bit bolder',3.7,dict(right=long_right,ws=1.18)),
   ('3 (bolder)',4.2,dict(ws=1.35))]
fig=''.join(f'<figure>{svg(1,rw,R,**kw)}<div class="row">{svg(2.2,rw*2.2,R,**kw)}{svg(3.2,rw*3.4,R,"class=s",**kw)}</div><figcaption>{n}</figcaption></figure>' for n,rw,kw in V)
s2=open('mark-options.html').read()
a=s2.index('<div class="grid">')+len('<div class="grid">');b=s2.index('</div></body>')
open('mark-options.html','w').write(s2[:a]+fig+s2[b:])
open('mark-smooth.svg','w').write(svg(1,3.7,R,right=long_right,ws=1.18).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '))
