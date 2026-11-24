import importlib.util,math,json
spec=importlib.util.spec_from_file_location('ms','make-mark-smooth.py');ms=importlib.util.module_from_spec(spec);spec.loader.exec_module(ms)
mm=ms.mm
D=ms.build(1,3.7,4.0,ws=1.18,right=ms.long_right)
near=lambda pts,p:min(range(len(pts)),key=lambda i:math.dist(pts[i],p))
ln=lambda pts:sum(math.dist(pts[i],pts[i-1]) for i in range(1,len(pts)))
arc=mm.a_arc;i=near(arc,(108.6,53.6));limb=mm.a_limb;j=near(limb,(60,116))
stemUp=mm.a_stem[::-1];Ls=ln(stemUp);Lld=ln(mm.a_ld)
raw=[('stemUp',stemUp,0),('right',ms.long_right,0),('ld',mm.a_ld,0),
     ('arcL',arc[:i+1][::-1],Ls),('arcR',arc[i:],Ls),('limbU',limb[:j+1][::-1],Lld),('limbD',limb[j:],Lld)]
lines=[dict(name=n,pts=[[round(x,2),round(y,2)] for x,y in p[::2]]+[[round(p[-1][0],2),round(p[-1][1],2)]],L=round(ln(p),2),at=round(a,2)) for n,p,a in raw]
ringFrom=[l['name'] for l in lines].index('arcL')
a0=arc[0];ringRot=round(math.degrees(math.atan2(a0[1]-100,a0[0]-100)),1)
data=json.dumps(dict(D=D,lines=lines,ringFrom=ringFrom,ringRot=ringRot))
html='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mark intros</title>
<style>
:root{--ink:#0C0C0E;--bone:#ECE7DC;--dim:#A8A49C;--rule:#26262A}
body{margin:0;background:var(--ink);color:var(--bone);font:14px system-ui,sans-serif;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;max-width:1100px;margin:0 auto}
figure{margin:0;border:1px solid var(--rule);border-radius:10px;padding:16px;text-align:center;background:#101013}
svg{width:100%;max-width:280px;height:auto;display:block;margin:0 auto 12px}
.g,.rg{fill:none;stroke:#fff;stroke-linecap:round;stroke-dasharray:1 3;stroke-dashoffset:1}
.g{stroke-width:13}.rg{stroke-width:4.6}
h3{margin:6px 0 4px;font-weight:600}p{margin:0 0 12px;color:var(--dim);font-size:13px;line-height:1.45}
button{background:#18181C;color:var(--bone);border:1px solid var(--rule);border-radius:6px;padding:7px 14px;font:inherit;cursor:pointer}
.all{display:block;margin:0 auto 20px}
</style></head><body>
<button class="all" id="all">Replay all</button>
<div class="grid">
<figure><div id="A"></div><h3>A. Kintsugi</h3><p>Hairline cracks jump through dark stone from one point. Molten amber floods in behind the crack, then cools to bone.</p><button data-p="A">Replay</button></figure>
<figure><div id="B"></div><h3>B. Ink in water</h3><p>The mark bleeds out slowly like ink on wet paper: soft and wobbling at first, then it settles and sharpens.</p><button data-p="B">Replay</button></figure>
<figure><div id="C"></div><h3>C. By torchlight</h3><p>The mark is already carved into the stone, invisible. A moving light finds it, then the light grows and leaves it lit.</p><button data-p="C">Replay</button></figure>
</div>
<script>
const V=__DATA__;
const MU='maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"';
const pd=p=>'M'+p.map(q=>q.join(' ')).join(' L');
const lines=(st)=>V.lines.map(l=>`<path class="g" pathLength="1" d="${pd(l.pts)}" ${st?`style="${st}"`:''}/>`).join('');
const ring=(st)=>`<circle class="rg" pathLength="1" cx="100" cy="100" r="90" transform="rotate(${V.ringRot} 100 100)" ${st?`style="${st}"`:''}/>`;
function anim(root,v,t0,easing,kf){
  root.querySelectorAll('.g').forEach((el,i)=>{const l=V.lines[i];
    el.animate(kf||[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:l.L/v*1000,delay:(t0+l.at/v)*1000,easing:easing||'linear',fill:'both'})});
  const r=root.querySelector('.rg');
  if(r){const a=V.lines[V.ringFrom];r.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:1000,delay:(t0+(a.at+a.L)/v)*1000,easing:'cubic-bezier(.5,0,.2,1)',fill:'both'})}
}
const STUT=[{strokeDashoffset:1,offset:0},{strokeDashoffset:.8,offset:.15},{strokeDashoffset:.8,offset:.28},{strokeDashoffset:.42,offset:.55},{strokeDashoffset:.42,offset:.66},{strokeDashoffset:0,offset:1}];
const play={
A(el){
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <mask id="a2" ${MU}>${lines()}${ring()}</mask><mask id="a3" ${MU}>${lines()}${ring()}</mask></defs>
   <circle cx="100" cy="100" r="90" fill="#141417"/>
   <g>${lines('stroke:#74747c;stroke-width:.9')}${ring('stroke:#74747c;stroke-width:.9')}</g>
   <path d="${V.D}" fill="#E9A03B" mask="url(#a2)" fill-rule="evenodd"/>
   <path d="${V.D}" fill="#ECE7DC" mask="url(#a3)" fill-rule="evenodd"/></svg>`;
  const s=el.firstChild;
  anim(s.querySelector('g'),95,0,'linear',STUT);
  anim(s.querySelector('#a2'),150,0.95,'cubic-bezier(.4,0,.2,1)');
  anim(s.querySelector('#a3'),150,1.6,'cubic-bezier(.4,0,.2,1)');
},
B(el){
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <filter id="fB" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d"><animate attributeName="scale" values="34;34;0" keyTimes="0;.2;1" dur="4s" fill="freeze"/></feDisplacementMap>
    <feGaussianBlur in="d" stdDeviation="3"><animate attributeName="stdDeviation" values="3;3;0" keyTimes="0;.2;1" dur="4s" fill="freeze"/></feGaussianBlur></filter>
   <mask id="b1" ${MU}>${lines()}${ring()}</mask></defs>
   <g filter="url(#fB)"><path d="${V.D}" fill="#ECE7DC" mask="url(#b1)" fill-rule="evenodd"/></g></svg>`;
  anim(el.firstChild.querySelector('#b1'),42,0.2,'cubic-bezier(.3,0,.3,1)');
},
C(el){
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <radialGradient id="rg"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
   <mask id="c1" ${MU}><rect x="-20" y="-20" width="240" height="240" fill="#000"/><circle id="sp" r="1" fill="url(#rg)"/></mask></defs>
   <path d="${V.D}" fill="#1f1f23" fill-rule="evenodd"/>
   <path d="${V.D}" fill="#ECE7DC" mask="url(#c1)" fill-rule="evenodd"/></svg>`;
  const T=(x,y,s)=>`translate(${x}px,${y}px) scale(${s})`;
  el.querySelector('#sp').animate([
    {transform:T(10,20,36),offset:0},{transform:T(60,45,40),offset:.25},{transform:T(105,90,46),offset:.5},
    {transform:T(160,130,46),offset:.72},{transform:T(100,100,190),offset:1}],
    {duration:4200,delay:200,easing:'cubic-bezier(.45,0,.35,1)',fill:'both'});
}};
const run=k=>play[k](document.getElementById(k));
document.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>run(b.dataset.p));
document.getElementById('all').onclick=()=>['A','B','C'].forEach(run);
['A','B','C'].forEach(run);
</script></body></html>'''.replace('__DATA__',data)
open('mark-intros.html','w').write(html)
