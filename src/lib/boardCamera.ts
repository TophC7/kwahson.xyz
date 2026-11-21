import * as THREE from 'three';

interface BoardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoardCameraOptions {
  viewport: HTMLElement;
  renderer: THREE.WebGLRenderer;
  offset: THREE.Vector3;
  pad: { x: number; z: number };
  maxZoom: number;
  /** HUD elements whose size feeds insets(). */
  chrome: Element[];
  insets(width: number, height: number): Insets;
  signal: AbortSignal;
  onTap(clientX: number, clientY: number): void;
  onHover?(clientX: number, clientY: number, event: PointerEvent): void;
  onPress?(event: PointerEvent): void;
  onRelease?(): void;
  onZoomedChange(zoomed: boolean): void;
}

export interface BoardCamera {
  readonly camera: THREE.OrthographicCamera;
  setBounds(bounds: BoardBounds, focusY: number): void;
  refit(): void;
  snapHome(): void;
  resetView(): void;
  update(dt: number): void;
  setRay(raycaster: THREE.Raycaster, clientX: number, clientY: number): boolean;
}

export function createBoardCamera(options: BoardCameraOptions): BoardCamera {
  const { renderer, viewport, offset, pad, signal } = options;
  const canvas = renderer.domElement;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 80);
  const center = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  let bounds: BoardBounds | undefined;
  let fitOffsetX = 0;
  let fitOffsetY = 0;
  let fitHalfW = 8;
  let fitHalfH = 6;
  let zoom = 1;
  let targetZoom = 1;
  // Pan lives in screen-aligned ground axes, so drags and clamps work for any camera yaw.
  const pan = new THREE.Vector2(0, 0);
  const targetPan = new THREE.Vector2(0, 0);
  const screenRight = new THREE.Vector3(offset.z, 0, -offset.x).normalize();
  const screenDown = new THREE.Vector3(offset.x, 0, offset.z).normalize();

  function refit() {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    renderer.setSize(width, height, false);
    if (!bounds) return;

    camera.position.copy(center).add(offset);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    // Project the padded box's spans onto the camera's horizontal and vertical axes.
    const { elements: m } = camera.matrixWorldInverse;
    const spanX = bounds.maxX - bounds.minX + 2 * pad.x;
    const spanZ = bounds.maxZ - bounds.minZ + 2 * pad.z;
    const spanY = bounds.maxY + 0.3 - (-0.5);
    const projW = Math.abs(m[0]) * spanX + Math.abs(m[4]) * spanY + Math.abs(m[8]) * spanZ;
    const projH = Math.abs(m[1]) * spanX + Math.abs(m[5]) * spanY + Math.abs(m[9]) * spanZ;
    const { top, right, bottom, left } = options.insets(width, height);
    const pxPerWorld = Math.min(Math.max(1, width - left - right) / projW, Math.max(1, height - top - bottom) / projH);
    fitHalfW = width / 2 / pxPerWorld;
    fitHalfH = height / 2 / pxPerWorld;
    fitOffsetX = (right - left) / 2 / pxPerWorld;
    fitOffsetY = (top - bottom) / 2 / pxPerWorld;
    applyCameraTransform();
  }

  function clampPan(p: THREE.Vector2, z: number) {
    const maxPanX = Math.max(0, fitHalfW * (1 - 1 / z) + 0.5);
    const maxPanZ = Math.max(0, fitHalfH * (1 - 1 / z) + 0.5);
    p.x = THREE.MathUtils.clamp(p.x, -maxPanX, maxPanX);
    p.y = THREE.MathUtils.clamp(p.y, -maxPanZ, maxPanZ);
  }

  function setTargetZoom(next: number) {
    targetZoom = THREE.MathUtils.clamp(next, 1, options.maxZoom);
    clampPan(targetPan, targetZoom);
    options.onZoomedChange(targetZoom > 1.06);
  }

  function applyCameraTransform() {
    const ox = fitOffsetX / zoom;
    const oy = fitOffsetY / zoom;
    camera.left = -fitHalfW / zoom + ox;
    camera.right = fitHalfW / zoom + ox;
    camera.top = fitHalfH / zoom + oy;
    camera.bottom = -fitHalfH / zoom + oy;
    camera.updateProjectionMatrix();
    focus.copy(center).addScaledVector(screenRight, pan.x).addScaledVector(screenDown, pan.y);
    camera.position.copy(focus).add(offset);
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);
  }

  const activePointers = new Map<number, { x: number; y: number }>();
  let downX = 0;
  let downY = 0;
  let dragged = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let lastPanX = 0;
  let lastPanY = 0;

  function screenDeltaToWorldPan(dxPx: number, dyPx: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const worldPerPxX = (fitHalfW * 2) / zoom / rect.width;
    const worldPerPxY = (fitHalfH * 2) / zoom / rect.height;
    targetPan.x -= dxPx * worldPerPxX;
    targetPan.y -= dyPx * worldPerPxY;
    clampPan(targetPan, targetZoom);
  }

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      options.onPress?.(e);
      canvas.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        downX = e.clientX;
        downY = e.clientY;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        dragged = false;
      } else if (activePointers.size === 2) {
        dragged = true;
        const pts = Array.from(activePointers.values());
        pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchStartZoom = targetZoom;
        lastPanX = (pts[0].x + pts[1].x) / 2;
        lastPanY = (pts[0].y + pts[1].y) / 2;
      }
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
          const pts = Array.from(activePointers.values());
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          if (pinchStartDist > 10) setTargetZoom(pinchStartZoom * (dist / pinchStartDist));
          screenDeltaToWorldPan(midX - lastPanX, midY - lastPanY);
          lastPanX = midX;
          lastPanY = midY;
          return;
        }

        if (activePointers.size === 1) {
          const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
          if (moveDist > 9 && targetZoom > 1.04) {
            dragged = true;
            screenDeltaToWorldPan(e.clientX - lastPanX, e.clientY - lastPanY);
            lastPanX = e.clientX;
            lastPanY = e.clientY;
          } else if (moveDist > 14) {
            dragged = true;
          }
        }
        return;
      }

      options.onHover?.(e.clientX, e.clientY, e);
    },
    { signal },
  );

  function release(e: PointerEvent) {
    options.onRelease?.();
    const wasSingle = activePointers.size === 1;
    if (!activePointers.delete(e.pointerId)) return;
    if (e.type === 'pointerup' && wasSingle && !dragged && e.button !== 2) {
      options.onTap(e.clientX, e.clientY);
    }
    if (activePointers.size === 1) {
      for (const remaining of activePointers.values()) {
        lastPanX = remaining.x;
        lastPanY = remaining.y;
      }
    }
  }
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setTargetZoom(targetZoom * factor);
    },
    { passive: false, signal },
  );

  if (!signal.aborted) {
    const observer = new ResizeObserver(refit);
    observer.observe(viewport);
    for (const el of options.chrome) observer.observe(el);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }

  return {
    camera,
    setBounds(next, focusY) {
      bounds = next;
      center.set((next.minX + next.maxX) / 2, focusY, (next.minZ + next.maxZ) / 2);
      refit();
    },
    refit,
    snapHome() {
      zoom = 1;
      pan.set(0, 0);
      targetPan.set(0, 0);
      setTargetZoom(1);
      applyCameraTransform();
    },
    resetView() {
      targetPan.set(0, 0);
      setTargetZoom(1);
    },
    update(dt) {
      const camLerp = 1 - Math.exp(-dt * 12);
      const prevZoom = zoom;
      zoom = THREE.MathUtils.lerp(zoom, targetZoom, camLerp);
      pan.lerp(targetPan, camLerp);
      if (Math.abs(zoom - targetZoom) > 0.0005 || Math.abs(zoom - prevZoom) > 0.0005 || pan.distanceTo(targetPan) > 0.0005) {
        applyCameraTransform();
      }
    },
    setRay(raycaster, clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return true;
    },
  };
}
