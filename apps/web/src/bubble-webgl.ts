// Adapted from the physical materials, studio lighting and collision approach
// in the user's supplied CodePen main.js (Infinity Ribbon archive).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  bubbleRadius,
  heartRadius,
  bubbleTargets,
  type BubbleShape,
} from "./bubble-geometry";

export interface BubbleWorld {
  setShape(shape: BubbleShape): void;
  setPointer(x: number, y: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createBubbleWorld(
  canvas: HTMLCanvasElement,
  shape: BubbleShape,
): BubbleWorld {
  const mobile = matchMedia("(max-width: 650px)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 8);
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, 0.04);
  scene.environment = environment.texture;
  generator.dispose();
  room.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xff9bc5, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 6, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -7,
    right: 7,
    top: 5,
    bottom: -5,
    near: 0.1,
    far: 25,
  });
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.3);
  rim.position.set(5, 2, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(1, -3, 6);
  scene.add(fill);
  const geometry = new THREE.SphereGeometry(
    1,
    mobile ? 24 : 32,
    mobile ? 20 : 24,
  );
  const colors = [0xff7bb3, 0xee4b94, 0xffa5cf, 0xf96ba7, 0xffffff, 0xffc1dc];
  let currentShape = shape;
  let targets = bubbleTargets(shape, mobile ? 48 : 80);
  let scale = 1,
    width = 1,
    height = 1,
    frame = 0,
    last = 0,
    visible = true,
    disposed = false,
    burstUntil = 0;
  const balls = targets.map((point, i) => {
    const glass = i % 7 === 5;
    const material = new THREE.MeshPhysicalMaterial({
      color: colors[i % colors.length],
      roughness: glass ? 0.16 : 0.3,
      metalness: 0,
      clearcoat: glass ? 1 : 0.45,
      clearcoatRoughness: glass ? 0.06 : 0.22,
      transmission: glass ? 0.4 : 0,
      thickness: glass ? 0.4 : 0,
      ior: 1.45,
      envMapIntensity: glass ? 0.8 : 0.6,
      attenuationColor: new THREE.Color(0xffc1dc),
      attenuationDistance: 1.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    scene.add(mesh);
    return {
      mesh,
      material,
      radius: bubbleRadius(i),
      visualRadius: bubbleRadius(i),
      mass: Math.pow(bubbleRadius(i), 3),
      position: new THREE.Vector3(point.x, point.y, point.z),
      velocity: new THREE.Vector3(),
      target: new THREE.Vector3(),
    };
  });
  const pointer = new THREE.Vector2(99, 99),
    ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const mouse = new THREE.Vector3(),
    diff = new THREE.Vector3(),
    relative = new THREE.Vector3();
  function assignTargets() {
    scale = Math.min(1, width / 10, height / 5.5);
    balls.forEach((ball, i) => {
      const target = targets[i];
      ball.target.set(target.x * scale, target.y * scale, target.z * scale);
      const colorIndex = currentShape === "heart" ? Math.floor(i / 2) : i;
      ball.material.color.setHex(colors[colorIndex % colors.length]);
    });
  }
  function render(time: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (!reduced.matches && last && time - last < 15) {
      frame = requestAnimationFrame(render);
      return;
    }
    const dt = Math.min(1.5, (time - (last || time - 16.67)) / 16.67);
    last = time;
    const active = Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1;
    if (active) {
      ray.setFromCamera(pointer, camera);
      ray.ray.intersectPlane(plane, mouse);
    }
    balls.forEach((ball, i) => {
      const desiredRadius =
        (currentShape === "heart" ? heartRadius(i) : ball.radius) * scale;
      ball.visualRadius = reduced.matches
        ? desiredRadius
        : THREE.MathUtils.lerp(ball.visualRadius, desiredRadius, 0.12 * dt);
      ball.mesh.scale.setScalar(ball.visualRadius);
      if (reduced.matches) ball.position.copy(ball.target);
      else {
        if (time > burstUntil) {
          if (currentShape === "heart")
            ball.velocity.addScaledVector(
              diff.subVectors(ball.target, ball.position),
              0.07 * dt,
            );
          else {
            // The reference's anisotropic center attraction forms a natural
            // volume; no sphere is pinned to a flat per-sphere destination.
            ball.velocity.x -= ball.position.x * 0.0035 * 0.38 * dt;
            ball.velocity.y -= ball.position.y * 0.0035 * 1.85 * dt;
            ball.velocity.z -= ball.position.z * 0.0035 * 1.8 * dt;
          }
        }
        ball.velocity.x +=
          Math.sin(time * 0.0004 + i * 1.5) * 0.0004 * ball.radius * dt;
        ball.velocity.y +=
          Math.cos(time * 0.0005 + i * 1.2) * 0.0004 * ball.radius * dt;
        ball.velocity.z += Math.sin(time * 0.00035 + i) * 0.0001 * dt;
        if (active) {
          diff.subVectors(ball.position, mouse);
          const distance = diff.length(),
            range = scale * 2.1;
          if (distance < range && distance > 0.001)
            ball.velocity.addScaledVector(
              diff.normalize(),
              (1 - distance / range) * 0.035 * scale * dt,
            );
        }
        ball.velocity.multiplyScalar(
          Math.pow(currentShape === "heart" ? 0.72 : 0.91, dt),
        );
        ball.position.addScaledVector(ball.velocity, dt);
      }
    });
    // The supplied reference uses mass-weighted separation and impulses.
    for (let pass = 0; pass < (currentShape === "heart" ? 0 : 4); pass++)
      for (let i = 0; i < balls.length; i++)
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i],
            b = balls[j];
          diff.subVectors(b.position, a.position);
          const distance = diff.length(),
            minimum = a.visualRadius + b.visualRadius;
          if (distance >= minimum || distance < 0.0001) continue;
          diff.multiplyScalar(1 / distance);
          const correction = (minimum - distance) * 0.4,
            total = a.mass + b.mass;
          a.position.addScaledVector(diff, (-correction * b.mass) / total);
          b.position.addScaledVector(diff, (correction * a.mass) / total);
          const along = relative.subVectors(b.velocity, a.velocity).dot(diff);
          if (along < 0) {
            const impulse = (-1.06 * along) / (1 / a.mass + 1 / b.mass);
            a.velocity.addScaledVector(diff, -impulse / a.mass);
            b.velocity.addScaledVector(diff, impulse / b.mass);
          }
        }
    balls.forEach((ball) => {
      ball.position.x = THREE.MathUtils.clamp(
        ball.position.x,
        -width / 2 + ball.visualRadius,
        width / 2 - ball.visualRadius,
      );
      ball.position.y = THREE.MathUtils.clamp(
        ball.position.y,
        -height / 2 + ball.visualRadius,
        height / 2 - ball.visualRadius,
      );
      ball.position.z = THREE.MathUtils.clamp(
        ball.position.z,
        -2 * scale,
        2 * scale,
      );
      ball.mesh.position.copy(ball.position);
    });
    renderer.render(scene, camera);
    if (!reduced.matches) frame = requestAnimationFrame(render);
  }
  function wake() {
    last = 0;
    if (!frame && visible && !document.hidden && !disposed)
      frame = requestAnimationFrame(render);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    height =
      2 *
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
      camera.position.z;
    width = height * camera.aspect;
    const oldScale = scale;
    assignTargets();
    balls.forEach((ball) => {
      ball.position.multiplyScalar(scale / oldScale);
      ball.visualRadius *= scale / oldScale;
    });
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const visibility = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    wake();
  };
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", visibility);
  resize();
  return {
    setShape(next) {
      currentShape = next;
      targets = bubbleTargets(next, balls.length);
      assignTargets();
      burstUntil = performance.now() + 260;
      balls.forEach((ball, i) =>
        ball.velocity.set(
          Math.cos(i * 2.399) * 0.24,
          Math.sin(i * 2.399) * 0.24,
          Math.sin(i) * 0.12,
        ),
      );
      pointer.set(99, 99);
      wake();
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    setVisible(next) {
      visible = next;
      cancelAnimationFrame(frame);
      frame = 0;
      if (next) wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", visibility);
      balls.forEach((ball) => ball.material.dispose());
      geometry.dispose();
      key.shadow.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
