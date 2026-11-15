// Adapted from the physical materials, studio lighting and collision approach
// in the user's supplied CodePen main.js (Infinity Ribbon archive).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  bubbleRadius,
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
      mass: Math.pow(bubbleRadius(i), 3),
      position: new THREE.Vector3(point.x, -point.y, point.z * 0.4),
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
    const extentX = Math.max(
      ...targets.map((point, i) => Math.abs(point.x) + balls[i].radius),
    );
    const extentY = Math.max(
      ...targets.map((point, i) => Math.abs(point.y) + balls[i].radius),
    );
    scale = Math.min(width / (extentX * 2.35), height / (extentY * 2.35));
    balls.forEach((ball, i) => {
      const target = targets[i];
      ball.target.set(
        target.x * scale,
        -target.y * scale,
        target.z * scale * 0.42,
      );
      ball.mesh.scale.setScalar(ball.radius * scale);
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
      if (reduced.matches) ball.position.copy(ball.target);
      else {
        if (time > burstUntil)
          ball.velocity.addScaledVector(
            diff.subVectors(ball.target, ball.position),
            0.009 * dt,
          );
        ball.velocity.y += Math.sin(time * 0.0008 + i * 1.7) * 0.00022 * dt;
        if (active) {
          diff.subVectors(ball.position, mouse);
          const distance = diff.length(),
            range = scale * 0.8;
          if (distance < range && distance > 0.001)
            ball.velocity.addScaledVector(
              diff.normalize(),
              (1 - distance / range) * 0.035 * scale * dt,
            );
        }
        ball.velocity.multiplyScalar(Math.pow(0.91, dt));
        ball.position.addScaledVector(ball.velocity, dt);
      }
    });
    // The supplied reference uses mass-weighted separation and impulses.
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < balls.length; i++)
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i],
            b = balls[j];
          diff.subVectors(b.position, a.position);
          const distance = diff.length(),
            minimum = (a.radius + b.radius) * scale;
          if (distance >= minimum || distance < 0.0001) continue;
          diff.multiplyScalar(1 / distance);
          const correction = (minimum - distance) * 0.5,
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
        -width / 2,
        width / 2,
      );
      ball.position.y = THREE.MathUtils.clamp(
        ball.position.y,
        -height / 2 + 0.3,
        height / 2 - 0.3,
      );
      ball.position.z = THREE.MathUtils.clamp(ball.position.z, -0.9, 0.9);
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
    balls.forEach((ball) => ball.position.multiplyScalar(scale / oldScale));
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
      targets = bubbleTargets(next, balls.length);
      assignTargets();
      burstUntil = performance.now() + 260;
      balls.forEach((ball, i) =>
        ball.velocity.set(
          Math.cos(i * 2.399) * 0.15,
          Math.sin(i * 2.399) * 0.15,
          Math.sin(i) * 0.05,
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
