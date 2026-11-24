import math
def cr(P,n=40):
    """Catmull-Rom (centripetal-ish uniform) through points P, dense samples."""
    Q=[P[0]]+P+[P[-1]];out=[]
    for i in range(1,len(Q)-2):
        p0,p1,p2,p3=Q[i-1],Q[i],Q[i+1],Q[i+2]
        for j in range(n):
            t=j/n
            out.append(tuple(0.5*((2*p1[c])+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t*t+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t**3) for c in (0,1)))
    out.append(P[-1]);return out
def smooth(vals,r=3):
    n=len(vals);return [sum(vals[max(0,i-r):i+r+1])/len(vals[max(0,i-r):i+r+1]) for i in range(n)]
def poly(pts,wf,k):
    n=len(pts);L=[0]
    for i in range(1,n):L.append(L[-1]+math.dist(pts[i],pts[i-1]))
    nrm=[]
    for i in range(n):
        a=pts[max(i-2,0)];b=pts[min(i+2,n-1)];dx,dy=b[0]-a[0],b[1]-a[1];m=math.hypot(dx,dy) or 1
        nrm.append((-dy/m,dx/m))
    ws=smooth([wf(L[i]/L[-1])*k/2 for i in range(n)],4)
    left=[(p[0]+nm[0]*w,p[1]+nm[1]*w) for p,nm,w in zip(pts,nrm,ws)]
    right=[(p[0]-nm[0]*w,p[1]-nm[1]*w) for p,nm,w in zip(pts,nrm,ws)]
    return 'M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in left+right[::-1])+'Z'
bell=lambda lo,hi:(lambda t:lo+(hi-lo)*math.sin(math.pi*t)**0.8)
lin=lambda a,b:(lambda t:a+(b-a)*t)
ease=lambda a,b:(lambda t:a+(b-a)*(1-(1-t)**1.6))  # tapers smoothly
arc=cr([(59.5,19.5),(78,43),(108,53.5),(135,50),(157,31)])
A=min(arc,key=lambda p:math.dist(p,(98,50)));i=arc.index(A)
tx,ty=arc[i+3][0]-arc[i-3][0],arc[i+3][1]-arc[i-3][1];m=math.hypot(tx,ty);tx,ty=tx/m,ty/m
sm=lambda x:x*x*(3-2*x)
main=cr([A,(A[0]+tx*9,A[1]+ty*9),(110.2,64),(108.4,78),(103.8,89.5),(92,102),(76,113),(67,115.5),(62.5,119.5),(64.5,125)],36)
right=cr([(108.4,78),(107.8,86),(112,93),(124,96.5),(136,97.5),(149,95.8),(161.4,89.9)],36)
limb=cr([(12,78.5),(34,90),(48,102),(60,116),(69,132),(74,152),(81.8,188.5)])
def wmain(t):
    base=4.2-3.0*sm(min(max((t-0.45)/0.55,0),1))
    start=0.55+0.45*sm(min(t/0.14,1))   # starts slim inside the arc, so no corner pokes out
    return base*start
def vein(k):
    W=[(arc,bell(1.2,4.2)),(main,wmain),(right,ease(4.0,0.7)),(limb,bell(1.2,2.8))]
    return ''.join(f'<path d="{poly(p,f,k)}"/>' for p,f in W)

# previous layout (separate lines meeting at junctions)
a_arc=cr([(59.5,19.5),(78,43),(108,53.5),(135,50),(157,31)])
a_stem=cr([(108.5,52),(110,68),(106.5,83),(103.8,89.5)],30)
a_right=cr([(103.8,89.5),(115,94),(130,97),(146,96),(161.4,89.9)])
a_ld=cr([(103.8,89.5),(92,102),(76,113),(60,115.8)],30)
a_limb=cr([(12,78.5),(34,90),(48,102),(60,116),(69,132),(74,152),(81.8,188.5)])
def vein_old(k):
    W=[(a_arc,bell(1.2,4.2)),(a_stem,lin(4.2,4.2)),(a_right,ease(4.2,0.7)),(a_ld,lin(2.6,1.6)),(a_limb,bell(1.2,2.8))]
    return ''.join(f'<path d="{poly(p,f,k)}"/>' for p,f in W)+f'<circle cx="103.8" cy="89.5" r="{2.1*k:.2f}"/>'
def mk(rw,k,cls='',fn=None):
    return f'<svg {cls} viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" fill="none" stroke="#ECE7DC" stroke-width="{rw}"/><g fill="#ECE7DC">{(fn or vein)(k)}</g></svg>'
fig=''.join(f'<figure>{mk(3.2,1,fn=f)}<div class="row">{mk(7,2.2,fn=f)}{mk(12,3.2,"class=s",fn=f)}</div><figcaption>{n}</figcaption></figure>' for n,f in [('Before (previous)',vein_old),('Now (smooth joins)',vein)])
s=open('mark-options.html').read()
a=s.index('<div class="grid">')+len('<div class="grid">');b=s.index('</div></body>')
open('mark-options.html','w').write(s[:a]+fig+s[b:])
open('mark-final.svg','w').write(mk(3.2,1).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '))
open('mark-previous.svg','w').write(mk(3.2,1,fn=vein_old).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '))
