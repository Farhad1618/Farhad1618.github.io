import importlib.util,math,json
spec=importlib.util.spec_from_file_location('mg','make-mark-grow.py');mg=importlib.util.module_from_spec(spec);spec.loader.exec_module(mg)
mi=mg.mi;R=90.0
L={l['name']:l for l in mi.lines}
ang=lambda p:math.degrees(math.atan2(p[1]-100,p[0]-100))%360
con=sorted((ang(L[n]['pts'][-1]),L[n]['at']+L[n]['L']) for n in ['arcL','arcR','limbU','limbD'])
def arcpts(a0,span):
    n=max(2,int(abs(span)/2));return [[round(100+R*math.cos(math.radians(a0+span*i/n)),2),round(100+R*math.sin(math.radians(a0+span*i/n)),2)] for i in range(n+1)]
P=[]
for k in range(len(con)):
    a,Ta=con[k];b,Tb=con[(k+1)%len(con)]
    Ls=math.radians((b-a)%360)*R
    s=min(max((Ls+(Tb-Ta))/2,0),Ls)
    if s>1:P.append(dict(pts=arcpts(a,s/R*180/math.pi),s0=round(Ta,2),len=round(s,2)))
    if Ls-s>1:P.append(dict(pts=arcpts(b,-(Ls-s)/R*180/math.pi),s0=round(Tb,2),len=round(Ls-s,2)))
Dtot=max([l['at']+l['L'] for l in mi.lines]+[p['s0']+p['len'] for p in P])
h=mg.h
a=h.index('<div class="grid">');b=h.index('<script>')
cells=[('G','Previous','Each line has its own speed and timing.'),('H','One timeline, slowing down','Everything is driven by one clock: all lines and ring pieces grow together, fast at first, then slower and slower as the mark closes. The wobble fades on the same clock.')]
h=h[:a]+'<div class="grid">'+''.join(f'<figure><div id="{k}"></div><h3>{t}</h3><p>{d}</p><button data-p="{k}">Replay</button></figure>' for k,t,d in cells)+'</div>\n'+h[b:]
js='''
V.p2=__P__;V.Dtot=__D__;
let raf=0;
play.H=function(el){
  cancelAnimationFrame(raf);
  const T=5.4, EX=2.3;
  const rp=V.p2.map(p=>`<path class="g" style="stroke-width:6" pathLength="1" d="${pd(p.pts)}"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <filter id="fH" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap id="hd" in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur id="hb" in="d" stdDeviation="2"/></filter>
   <filter id="fS2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
   <mask id="mH" ${MU}><g id="hl" filter="url(#fS2)">${lines()}</g><g id="hr">${rp}</g></mask></defs>
   <g filter="url(#fH)"><path d="${V.D}" fill="#ECE7DC" mask="url(#mH)" fill-rule="evenodd"/></g></svg>`;
  const s=el.firstChild,hd=s.querySelector('#hd'),hb=s.querySelector('#hb');
  const items=[...[...s.querySelectorAll('#hl .g')].map((e,i)=>({e,s0:V.lines[i].at,len:V.lines[i].L})),
               ...[...s.querySelectorAll('#hr .g')].map((e,i)=>({e,s0:V.p2[i].s0,len:V.p2[i].len}))];
  const clamp=x=>Math.min(1,Math.max(0,x));
  const t0=performance.now();
  const tick=now=>{
    const t=clamp((now-t0)/(T*1000)), P=1-Math.pow(1-t,EX), D=P*V.Dtot, w=Math.pow(1-P,1.3);
    items.forEach(it=>it.e.style.strokeDashoffset=1-clamp((D-it.s0)/it.len));
    hd.setAttribute('scale',(18*w).toFixed(3));hb.setAttribute('stdDeviation',(2*w).toFixed(3));
    if(t<1)raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
};
'''.replace('__P__',json.dumps(P)).replace('__D__',str(round(Dtot,2)))
h=h.replace('const run=',js+'const run=',1).replace("['L1','G']","['G','H']")
open('mark-grow2.html','w').write(h)
print(round(Dtot,1))
