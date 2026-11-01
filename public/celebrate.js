// 勝ったときの余韻: 紙吹雪（canvas）。動きを減らす設定の端末では出さない
const COLORS = ['#ffd54f', '#ef5350', '#66bb6a', '#42a5f5', '#ab47bc', '#ffffff'];
let raf = 0;

export function confetti(big = false) {
  const cv = document.querySelector('#confetti');
  if (!cv || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  cancelAnimationFrame(raf);
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const N = big ? 220 : 90;
  const ps = Array.from({ length: N }, (_x, i) => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * (big ? 16 : 11), vy: -Math.random() * (big ? 16 : 11) - 3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: COLORS[i % COLORS.length], delay: big ? Math.random() * 40 : 0,
  }));
  const end = performance.now() + (big ? 5200 : 2800);
  const step = (now) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      if (p.delay-- > 0) continue;
      p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, Math.min(1, (end - now) / 700));
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (now < end) raf = requestAnimationFrame(step);
    else g.clearRect(0, 0, innerWidth, innerHeight);
  };
  raf = requestAnimationFrame(step);
}
