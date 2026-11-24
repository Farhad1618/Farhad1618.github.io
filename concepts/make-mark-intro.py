import importlib.util,math
spec=importlib.util.spec_from_file_location('ms','make-mark-smooth.py');ms=importlib.util.module_from_spec(spec);spec.loader.exec_module(ms)
mm=ms.mm
D=ms.build(1,3.7,4.0,ws=1.18,right=ms.long_right)
near=lambda pts,p:min(range(len(pts)),key=lambda i:math.dist(pts[i],p))
arc=mm.a_arc;i=near(arc,(108.6,53.6))
limb=mm.a_limb;j=near(limb,(60,116))
# (name, polyline, start delay s, duration s) every line grows away from where it joins its parent
LINES=[('stem',mm.a_stem,0.85,0.55),
       ('arcR',arc[i:],1.35,0.7),('arcL',arc[:i+1][::-1],1.35,0.7),
       ('right',ms.long_right,1.4,0.95),('ld',mm.a_ld,1.4,0.7),
       ('limbD',limb[j:],1.95,0.8),('limbU',limb[:j+1][::-1],1.95,0.6)]
pd=lambda pts:'M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in pts)
masks=''.join(f'<path class="g" pathLength="1" style="--d:{d}s;--t:{t}s" d="{pd(p)}"/>' for n,p,d,t in LINES)
html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mark intro</title>
<style>
:root{{--ink:#0C0C0E;--bone:#ECE7DC;--dim:#716E68}}
body{{margin:0;min-height:100vh;background:var(--ink);color:var(--bone);display:grid;place-items:center;font:13px system-ui,sans-serif}}
main{{text-align:center}}
svg{{width:min(60vw,60vh,360px);height:auto;display:block;margin:0 auto 28px}}
.g,.ring{{fill:none;stroke:#fff;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}}
.g{{stroke-width:13}}
.ring{{stroke-width:4.6}}
.go .ring{{animation:draw 1.15s cubic-bezier(.65,0,.25,1) .1s forwards}}
.go .g{{animation:draw var(--t) cubic-bezier(.5,0,.2,1) var(--d) forwards}}
@keyframes draw{{to{{stroke-dashoffset:0}}}}
button{{background:#18181C;color:var(--bone);border:1px solid #26262A;border-radius:6px;padding:8px 16px;font:inherit;cursor:pointer}}
@media (prefers-reduced-motion:reduce){{.ring,.g{{stroke-dashoffset:0!important;animation:none!important}}}}
</style></head><body><main>
<svg id="m" class="go" viewBox="0 0 200 200" aria-label="Mark">
 <defs><mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
  <circle class="ring" pathLength="1" cx="100" cy="100" r="90" transform="rotate(-90 100 100)"/>
  {masks}
 </mask></defs>
 <path mask="url(#k)" fill="#ECE7DC" fill-rule="evenodd" d="{D}"/>
</svg>
<button id="r">Replay</button>
</main>
<script>
const m=document.getElementById('m');
document.getElementById('r').onclick=()=>{{m.classList.remove('go');void m.getBoundingClientRect();m.classList.add('go')}};
setTimeout(()=>document.getElementById('r').click(),300);
</script></body></html>'''
open('mark-intro.html','w').write(html)
