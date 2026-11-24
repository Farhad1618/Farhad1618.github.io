import importlib.util
spec=importlib.util.spec_from_file_location('mi','make-mark-intros.py');mi=importlib.util.module_from_spec(spec);spec.loader.exec_module(mi)
h=mi.html
a=h.index('<div class="grid">');b=h.index('<script>')
cells=[('B','Before (your pick)','Distortion 34, blur 3.'),('L1','Less out of shape','Distortion 18, blur 2. Still wobbly, but the lines keep their shape.'),('L2','Much less','Distortion 8, blur 1.2. The mark stays recognisable the whole time and only the edges are soft.')]
grid='<div class="grid">'+''.join(f'<figure><div id="{k}"></div><h3>{t}</h3><p>{d}</p><button data-p="{k}">Replay</button></figure>' for k,t,d in cells)+'</div>\n'
h=h[:a]+grid+h[b:]
fn='''
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
play.L2=ink('L2',8,1.2,4);
'''
h=h.replace('const run=',fn+'const run=',1).replace("['A','B','C']","['B','L1','L2']")
open('mark-ink.html','w').write(h)
