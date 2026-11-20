<script lang="ts">
  const CELL = 26;
  const RADIUS_SQ = 185 * 185;
  const COLOR_OCHRE = '#9f8665';
  const COLOR_SAGE_CREST = '#8ea28a';
  const COLOR_SAGE = '#7a8d76';
  const COLOR_ASH = '#d5d7cf';

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    const canvas = canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;

    let width = 0;
    let height = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;
    let vignette = new Float32Array(0);

    const pointer = { x: -9999, y: -9999, active: false, strength: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasLeft = rect.left;
      canvasTop = rect.top;
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      offsetX = (width - (cols - 1) * CELL) * 0.5;
      offsetY = (height - (rows - 1) * CELL) * 0.5;

      const invW = 1 / Math.max(width, 1);
      const invH = 1 / Math.max(height, 1);
      vignette = new Float32Array(rows * cols);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const ny = (offsetY + r * CELL) * invH;
        const edgeY = Math.sin(Math.min(1, Math.max(0, ny)) * Math.PI);
        for (let c = 0; c < cols; c++) {
          const nx = (offsetX + c * CELL) * invW;
          const edgeX = Math.sin(Math.min(1, Math.max(0, nx)) * Math.PI);
          vignette[idx++] = 0.25 + 0.75 * Math.pow(edgeX * edgeY, 0.45);
        }
      }

      draw(time);
    };

    let time = 0;
    let last = -1;
    let raf = 0;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const gy = offsetY + r * CELL;

        for (let c = 0; c < cols; c++) {
          const gx = offsetX + c * CELL;
          const v = vignette[idx++];

          // Layered slow traveling interference waves
          const w1 = Math.sin(gx * 0.011 + gy * 0.007 - t * 0.65);
          const w2 = Math.cos(gx * 0.006 - gy * 0.013 + t * 0.42);
          const w3 = Math.sin((gx - gy) * 0.0085 + t * 0.28);
          const wave = (w1 * 0.48 + w2 * 0.34 + w3 * 0.18) * 0.5 + 0.5;

          // Crisp pointer ripple wake
          let wake = 0;
          let pushX = 0;
          let pushY = 0;
          if (pointer.strength > 0.01) {
            const dx = gx - pointer.x;
            const dy = gy - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < RADIUS_SQ && d2 > 0.01) {
              const dist = Math.sqrt(d2);
              const falloff = (1 - dist / 185) * pointer.strength;
              wake = falloff * falloff;
              const shift = wake * 4.5;
              pushX = (dx / dist) * shift;
              pushY = (dy / dist) * shift;
            }
          }

          const energy = Math.min(1, wave * 0.85 + wake * 0.75);
          const x = Math.round((gx + pushX) * 2) * 0.5;
          const y = Math.round((gy + pushY) * 2) * 0.5;

          // Subtle muted color shift: ash baseline -> dusty sage crests -> faint ochre accent peaks
          if (energy > 0.74 || wake > 0.35) {
            const isOchrePeak = w2 > 0.48 && wake < 0.25;
            ctx.globalAlpha = (0.14 + (energy - 0.5) * 0.56) * v;
            ctx.fillStyle = isOchrePeak ? COLOR_OCHRE : COLOR_SAGE_CREST;

            // Razor-sharp 1px crosshair at wave crests
            const arm = energy > 0.86 || wake > 0.5 ? 3 : 2;
            const rx = Math.round(x);
            const ry = Math.round(y);
            ctx.fillRect(rx - arm, ry, arm * 2 + 1, 1);
            ctx.fillRect(rx, ry - arm, 1, arm * 2 + 1);
          } else {
            ctx.globalAlpha = (0.045 + energy * 0.16) * v;
            ctx.fillStyle = energy > 0.54 ? COLOR_SAGE : COLOR_ASH;
            const size = energy > 0.56 ? 2 : 1.5;
            const half = size * 0.5;
            ctx.fillRect(x - half, y - half, size, size);
          }
        }
      }

      ctx.globalAlpha = 1;
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = -1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (reduced || document.hidden) {
        last = -1;
        return;
      }
      const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      time = (time + dt) % 10000;
      const targetStrength = pointer.active ? 1 : 0;
      pointer.strength += (targetStrength - pointer.strength) * 0.08;
      draw(time);
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      if (reduced || document.hidden) {
        stop();
      } else if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    };

    const abort = new AbortController();
    const { signal } = abort;

    const onMotionChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      sync();
      if (reduced) draw(time);
    };
    motionQuery.addEventListener('change', onMotionChange, { signal });

    window.addEventListener(
      'pointermove',
      (event) => {
        pointer.x = event.clientX - canvasLeft;
        pointer.y = event.clientY - canvasTop;
        pointer.active = true;
      },
      { passive: true, signal },
    );

    document.documentElement.addEventListener(
      'pointerleave',
      () => {
        pointer.active = false;
      },
      { passive: true, signal },
    );

    document.addEventListener('visibilitychange', sync, { signal });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    sync();

    return () => {
      stop();
      ro.disconnect();
      abort.abort();
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  class="pointer-events-none fixed inset-0 top-11 h-[calc(100%-2.75rem)] w-full"
  aria-hidden="true"
></canvas>
