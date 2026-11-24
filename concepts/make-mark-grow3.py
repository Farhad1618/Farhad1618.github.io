import importlib.util
spec=importlib.util.spec_from_file_location('g2','make-mark-grow2.py');g2=importlib.util.module_from_spec(spec);spec.loader.exec_module(g2)
h=g2.h
a=h.index('<div class="grid">');b=h.index('<script>')
cells=[('H','Previous (uses blur and ripple filters)','Looks right but the filters are recomputed every frame, which is the likely cause of the glitching.'),('S','Smooth (no filters)','Same look and timing. The wobble moves the outline itself and the soft tips are layered, so nothing heavy is recomputed per frame.')]
h=h[:a]+'<div class="grid">'+''.join(f'<figure><div id="{k}"></div><h3>{t}</h3><p>{d}</p><button data-p="{k}">Replay</button></figure>' for k,t,d in cells)+'</div>\n'+h[b:]
js='''
let rafS=0;
play.S=function(el){
  cancelAnimationFrame(rafS);
  const T=5.4,EX=2.3,AMP=9,CLAMP=x=>Math.min(1,Math.max(0,x));
  const rings=V.D.split('M').filter(Boolean).map(r=>r.replace('Z','').split('L').map(p=>p.trim().split(' ').map(Number)));
  const hs=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)};
  const lp=(a,b,t)=>a+(b-a)*t;
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return lp(lp(hs(xi,yi),hs(xi+1,yi),u),lp(hs(xi,yi+1),hs(xi+1,yi+1),u),v)};
  const fb=(x,y,o)=>vn(x*.035+o,y*.035)*.7+vn(x*.08+o,y*.08+9)*.3;
  const off=rings.map(r=>r.map(([x,y])=>[(fb(x,y,13)-.5)*2,(fb(x,y,57)-.5)*2]));
  const build=w=>rings.map((r,i)=>'M'+r.map(([x,y],j)=>(x+off[i][j][0]*AMP*w).toFixed(2)+' '+(y+off[i][j][1]*AMP*w).toFixed(2)).join('L')+'Z').join('');
  const LAYERS=[[14,1],[7,.5],[0,.25]];  // soft front: three stacked reveals, each a bit behind the last
  const mk=(cls,pre)=>LAYERS.map(([lag,op],k)=>`<g data-lag="${lag}" style="opacity:${op}">${pre()}</g>`).join('');
  const rp=()=>V.p2.map(p=>`<path class="g" style="stroke-width:6" pathLength="1" d="${pd(p.pts)}"/>`).join('');
  el.innerHTML=`<svg viewBox="0 0 200 200"><defs>
   <mask id="mS" ${MU}>${LAYERS.map(([lag,op])=>`<g data-lag="${lag}" style="opacity:${op}">${lines()}${rp()}</g>`).join('')}</mask></defs>
   <g mask="url(#mS)"><path id="sh" fill="#ECE7DC" fill-rule="evenodd"/><path id="sk" fill="none" stroke="#ECE7DC" stroke-width="2.6" stroke-linejoin="round"/></g></svg>`;
  const s=el.firstChild,sh=s.querySelector('#sh'),sk=s.querySelector('#sk');
  const items=[];
  s.querySelectorAll('#mS > g').forEach(g=>{const lag=+g.dataset.lag;const gs=g.querySelectorAll('.g');
    gs.forEach((e,i)=>{const src=i<V.lines.length?V.lines[i]:{at:V.p2[i-V.lines.length].s0,L:V.p2[i-V.lines.length].len};items.push({e,s0:src.at,len:src.L,lag})})});
  const t0=performance.now();
  const tick=now=>{
    const t=CLAMP((now-t0)/(T*1000)),P=1-Math.pow(1-t,EX),D=P*V.Dtot,w=Math.pow(1-P,1.3);
    items.forEach(it=>it.e.style.strokeDashoffset=1-CLAMP((D-it.lag*(1-P)-it.s0)/it.len));
    const d=build(w);sh.setAttribute('d',d);sk.setAttribute('d',d);sk.style.strokeOpacity=(.35*w).toFixed(3);
    if(t<1)rafS=requestAnimationFrame(tick);
  };
  rafS=requestAnimationFrame(tick);
};
window.measure=function(k){return new Promise(res=>{play[k](document.getElementById(k));const d=[];const t00=performance.now();let l=t00;const f=n=>{d.push(n-l);l=n;if(n-t00<6000)requestAnimationFrame(f);else res(d)};requestAnimationFrame(f)})};
'''
h=h.replace('const run=',js+'const run=',1).replace("['G','H']","['H','S']")
open('mark-grow3.html','w').write(h)
