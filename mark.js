/* The Ayvan mark: a circle with a vein-like F. One export, mountMark(el, opts).
   Appears like ink in water: all lines and ring pieces grow on one clock that slows as it closes,
   under a ripple + blur that settle to nothing. Under reduced motion it is the finished mark, still.
   Data (mark-data.json) is generated from concepts/make-mark-*.py; do not hand-edit. */
export async function mountMark(el, opts){
  opts = opts || {};
  var V = await (await fetch(opts.data || "mark-data.json")).json();
  var MU = 'maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"';
  var pd = function(p){ return "M" + p.map(function(q){ return q.join(" "); }).join(" L"); };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true"><path d="' + V.D + '" fill="#ECE7DC" fill-rule="evenodd"/></svg>';
    el.classList.add("on"); return { still:true };
  }
  var T = 5.4, EX = 2.3;
  var G = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-dasharray="1 3" stroke-dashoffset="1" pathLength="1"';
  var lines = V.lines.map(function(l){ return '<path ' + G + ' stroke-width="13" d="' + pd(l.pts) + '"/>'; }).join("");
  var rp = V.p2.map(function(p){ return '<path ' + G + ' stroke-width="6" d="' + pd(p.pts) + '"/>'; }).join("");
  el.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' +
    '<filter id="mkF" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5" result="n"/>' +
    '<feDisplacementMap id="mkD" in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
    '<feGaussianBlur id="mkB" in="d" stdDeviation="2"/></filter>' +
    '<filter id="mkS" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>' +
    '<mask id="mkM" ' + MU + '><g id="mkL" filter="url(#mkS)">' + lines + '</g><g id="mkR">' + rp + '</g></mask></defs>' +
    '<g id="mkG" filter="url(#mkF)"><path d="' + V.D + '" fill="#ECE7DC" mask="url(#mkM)" fill-rule="evenodd"/></g></svg>';
  var s = el.firstChild, hd = s.querySelector("#mkD"), hb = s.querySelector("#mkB");
  var items = [].concat(
    [].slice.call(s.querySelectorAll("#mkL path")).map(function(e, i){ return { e:e, s0:V.lines[i].at, len:V.lines[i].L }; }),
    [].slice.call(s.querySelectorAll("#mkR path")).map(function(e, i){ return { e:e, s0:V.p2[i].s0, len:V.p2[i].len }; }));
  var clamp = function(x){ return Math.min(1, Math.max(0, x)); };
  el.classList.add("on");
  var t0 = performance.now(), raf = 0, t = 0;
  function tick(now){
    t = clamp((now - t0) / (T*1000));
    var P = 1 - Math.pow(1 - t, EX), D = P * V.Dtot, w = Math.pow(1 - P, 1.3);
    items.forEach(function(it){ it.e.style.strokeDashoffset = 1 - clamp((D - it.s0) / it.len); });
    hd.setAttribute("scale", (18*w).toFixed(3)); hb.setAttribute("stdDeviation", (2*w).toFixed(3));
    if (t >= 1) { s.querySelector("#mkG").removeAttribute("filter"); return; }
    raf = requestAnimationFrame(tick);
  }
  /* a hidden tab stops the clock, so the mark is not already finished when the visitor comes back */
  document.addEventListener("visibilitychange", function(){
    if (t >= 1) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else { t0 = performance.now() - t*T*1000; raf = requestAnimationFrame(tick); }
  });
  raf = requestAnimationFrame(tick);
  return { stop:function(){ cancelAnimationFrame(raf); } };
}
