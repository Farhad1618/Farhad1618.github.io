import importlib.util,math,json
spec=importlib.util.spec_from_file_location('mi','make-mark-intros.py');mi=importlib.util.module_from_spec(spec);spec.loader.exec_module(mi)
V=52.0;VR=75.0;R=90.0
L={l['name']:l for l in mi.lines}
ang=lambda p:math.degrees(math.atan2(p[1]-100,p[0]-100))%360
contacts=[]
for n in ['arcL','arcR','limbU','limbD']:
    l=L[n];contacts.append((ang(l['pts'][-1]),(l['at']+l['L'])/V,n))
contacts.sort()
def arcpts(a0,span):
    n=max(2,int(abs(span)/2));return [[round(100+R*math.cos(math.radians(a0+span*i/n)),2),round(100+R*math.sin(math.radians(a0+span*i/n)),2)] for i in range(n+1)]
pieces=[]
for k in range(len(contacts)):
    a,ta,_=contacts[k];b,tb,_=contacts[(k+1)%len(contacts)]
    d=(b-a)%360;Ls=math.radians(d)*R
    s=min(max((Ls+VR*(tb-ta))/2,0),Ls)
    if s>2:pieces.append(dict(pts=arcpts(a,s/R*180/math.pi),d=round(ta,3),dur=round(s/VR,3)))
    if Ls-s>2:pieces.append(dict(pts=arcpts(b,-(Ls-s)/R*180/math.pi),d=round(tb,3),dur=round((Ls-s)/VR,3)))
h=mi.html
a=h.index('<div class="grid">');b=h.index('<script>')
cells=[('L1','Before','Ring draws round in one go.'),('G','Grows and connects','The lines grow outward at one steady speed, and the circle grows only where a line touches it, from each touch point both ways until the pieces meet.')]
h=h[:a]+'<div class="grid">'+''.join(f'<figure><div id="{k}"></div><h3>{t}</h3><p>{d}</p><button data-p="{k}">Replay</button></figure>' for k,t,d in cells)+'</div>\n'+h[b:]
js='''
V.ringPieces=__RP__;V.v=__V__;
function ink(id,sc,bl,dur){return function(el){
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <filter id="f${id}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="d"><animate attributeName="scale" values="${sc};${sc};0" keyTimes="0;.2;1" dur="${dur}s" fill="freeze"/></feDisplacementMap>
    <feGaussianBlur in="d" stdDeviation="${bl}"><animate attributeName="stdDeviation" values="${bl};${bl};0" keyTimes="0;.2;1" dur="${dur}s" fill="freeze"/></feGaussianBlur></filter>
   <mask id="m${id}" ${MU}>${lines()}${ring()}</mask></defs>
   <g filter="url(#f${id})"><path d="${V.D}" fill="#ECE7DC" mask="url(#m${id})" fill-rule="evenodd"/></g></svg>`;
  anim(el.firstChild.querySelector('#m'+id),42,0.2,'cubic-bezier(.3,0,.3,1)');
}}
play.L1=ink('L1',18,2,4);
play.G=function(el){
  const T=6.4, sp=(a,b)=>`calcMode="spline" keySplines=".35 0 .25 1; .35 0 .25 1" values="${a};${a};${b}" keyTimes="0;.25;1" dur="${T}s" fill="freeze"`;
  const rp=V.ringPieces.map(p=>`<path class="g" style="stroke-width:6" pathLength="1" d="${pd(p.pts)}"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <filter id="fG" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" result="d"><animate attributeName="scale" ${sp(18,0)}/></feDisplacementMap>
    <feGaussianBlur in="d" stdDeviation="2"><animate attributeName="stdDeviation" ${sp(2,0)}/></feGaussianBlur></filter>
   <filter id="fS" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
   <mask id="mG" ${MU}><g id="gl" filter="url(#fS)">${lines()}</g><g id="gr">${rp}</g></mask></defs>
   <g filter="url(#fG)"><path d="${V.D}" fill="#ECE7DC" mask="url(#mG)" fill-rule="evenodd"/></g></svg>`;
  const s=el.firstChild;
  s.querySelectorAll('#gl .g').forEach((e,i)=>{const l=V.lines[i];
    e.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:l.L/V.v*1000,delay:(0.3+l.at/V.v)*1000,easing:'linear',fill:'both'})});
  s.querySelectorAll('#gr .g').forEach((e,i)=>{const p=V.ringPieces[i];
    e.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:p.dur*1000,delay:(0.3+p.d)*1000,easing:'cubic-bezier(.3,.1,.5,1)',fill:'both'})});
};
'''.replace('__RP__',json.dumps(pieces)).replace('__V__',str(V))
h=h.replace('const run=',js+'const run=',1).replace("['A','B','C']","['L1','G']")
open('mark-grow.html','w').write(h)
print(contacts)
