import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { NPCS } from "@/constants/npcs";

import grassUrl from "@/assets/game/grass.png";
import stoneUrl from "@/assets/game/stone.jpg";
import mageUrl from "@/assets/game/mage.jpg";
import woodUrl from "@/assets/game/wood.jpg";
import roofUrl from "@/assets/game/roof.jpg";
import tree1Url from "@/assets/game/tree1.png";
import tree4Url from "@/assets/game/tree4.png";

interface Props {
  paused: boolean;
  onNearbyChange: (npcId: string | null) => void;
  onInteract: (npcId: string) => void;
}

export function GameCanvas({ paused, onNearbyChange, onInteract }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const nearbyRef = useRef<string | null>(null);
  const interactRef = useRef(onInteract);
  const nearbyCbRef = useRef(onNearbyChange);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { interactRef.current = onInteract; }, [onInteract]);
  useEffect(() => { nearbyCbRef.current = onNearbyChange; }, [onNearbyChange]);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = () => mount.clientWidth;
    const h = () => mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7a8e9e);
    scene.fog = new THREE.FogExp2(0x8fa0ae, 0.022);

    const camera = new THREE.PerspectiveCamera(72, w() / h(), 0.1, 200);
    camera.position.set(0, 1.7, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w(), h());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Loader
    const texLoader = new THREE.TextureLoader();
    const loadTex = (url: string, repeat = 1) => {
      const t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      return t;
    };

    // Procedural cloud texture factory
    function makeCloudTex(seed: number): THREE.CanvasTexture {
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 512, 256);
      const rng = (n: number) => Math.abs(Math.sin(seed * 127.1 + n * 311.7) * 43758.5453) % 1;
      for (let i = 0; i < 10; i++) {
        const gx = 40 + rng(i * 2) * 430;
        const gy = 30 + rng(i * 2 + 1) * 200;
        const rw = 50 + rng(i + 0.3) * 90;
        const rh = 25 + rng(i + 0.7) * 45;
        const darkness = 155 + Math.floor(rng(i + 1.5) * 50);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(rw, rh));
        grad.addColorStop(0, `rgba(${darkness},${darkness + 5},${darkness + 8},0.92)`);
        grad.addColorStop(0.55, `rgba(${darkness - 15},${darkness - 10},${darkness - 8},0.55)`);
        grad.addColorStop(1, `rgba(130,135,140,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(gx, gy, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return new THREE.CanvasTexture(canvas);
    }

    // Cloud planes
    const cloudMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i++) {
      const rng = (n: number) => Math.abs(Math.sin(i * 92.3 + n * 47.1) * 9999.1) % 1;
      const mat = new THREE.MeshBasicMaterial({
        map: makeCloudTex(i),
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const w = 38 + rng(1) * 35;
      const h = 14 + rng(2) * 10;
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.set((rng(3) - 0.5) * 110, 28 + rng(4) * 18, (rng(5) - 0.5) * 110);
      cloud.userData.speed = 0.4 + rng(6) * 0.7;
      scene.add(cloud);
      cloudMeshes.push(cloud);
    }

    // Rain particles
    const RAIN_COUNT = 3000;
    const rainPositions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPositions[i * 3]     = (Math.random() - 0.5) * 110;
      rainPositions[i * 3 + 1] = Math.random() * 55;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0x9ab0c0, size: 0.07, transparent: true, opacity: 0.35, sizeAttenuation: true });
    const rain = new THREE.Points(rainGeo, rainMat);
    scene.add(rain);

    // Ground
    const groundTex = loadTex(grassUrl, 20);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Lighting — overcast daytime
    const ambient = new THREE.AmbientLight(0xc8d8e4, 1.05);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xb8ccd8, 0.55);
    sun.position.set(-30, 70, 20);
    scene.add(sun);
    // Soft fill from below (bounced light off wet ground)
    const fill = new THREE.DirectionalLight(0x8899aa, 0.18);
    fill.position.set(0, -10, 0);
    scene.add(fill);

    // Helper to build a building
    interface BuildingOpts {
      pos: [number, number, number];
      size: [number, number, number]; // w, h, d
      wallTex: THREE.Texture;
      roofTex: THREE.Texture;
      torchColor: number;
      label: string;
    }
    const buildings: THREE.Object3D[] = [];

    function makeBuilding({ pos, size, wallTex, roofTex, torchColor }: BuildingOpts) {
      const group = new THREE.Group();
      group.position.set(pos[0], 0, pos[2]);
      const [bw, bh, bd] = size;

      const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
      const walls = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
      walls.position.y = bh / 2;
      group.add(walls);

      // Door (dark inset plane)
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x110805, roughness: 1 })
      );
      door.position.set(0, 1.2, bd / 2 + 0.01);
      group.add(door);

      // Roof (pyramid)
      const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85 });
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(bw, bd) * 0.78, bh * 0.55, 4),
        roofMat
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = bh + bh * 0.275;
      group.add(roof);

      // Torches (two flanking the door)
      for (const offset of [-bw / 2 + 0.4, bw / 2 - 0.4]) {
        const torchBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 1 })
        );
        torchBase.position.set(offset, 2.0, bd / 2 + 0.2);
        group.add(torchBase);

        const flame = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 8),
          new THREE.MeshBasicMaterial({ color: torchColor })
        );
        flame.position.set(offset, 2.4, bd / 2 + 0.2);
        group.add(flame);

        const light = new THREE.PointLight(torchColor, 1.1, 10, 1.8);
        light.position.set(offset, 2.5, bd / 2 + 0.3);
        group.add(light);

        // Store for flicker
        (light as any).userData.base = 1.1;
        flickerLights.push(light);
      }

      scene.add(group);
      buildings.push(group);
    }

    const flickerLights: THREE.PointLight[] = [];

    const stoneTex = loadTex(stoneUrl, 3);
    const mageTex  = loadTex(mageUrl, 3);
    const woodTex  = loadTex(woodUrl, 3);
    const roofTex  = loadTex(roofUrl, 4);

    // Temple (left)
    makeBuilding({
      pos: [-18, 0, 0], size: [9, 6, 8], wallTex: stoneTex, roofTex,
      torchColor: 0xff6a1c, label: "Temple",
    });
    // Mages Guild (right)
    makeBuilding({
      pos: [18, 0, 0], size: [9, 7, 8], wallTex: mageTex, roofTex,
      torchColor: 0xb070ff, label: "Mages Guild",
    });
    // Market stall (back)
    makeBuilding({
      pos: [0, 0, -20], size: [10, 4, 6], wallTex: woodTex, roofTex,
      torchColor: 0xffb060, label: "Market",
    });

    // Tree billboard sprites — green only, clustered
    const treeUrls = [tree1Url, tree4Url];
    const treeTex = treeUrls.map((url) => {
      const t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    const treePositions: [number, number, number][] = [
      // left cluster
      [-28,-8,0],[-30,-6,1],[-26,-9,1],[-29,-11,0],[-31,-7,1],
      // left-back cluster
      [-26,14,0],[-28,16,1],[-24,15,0],[-27,12,1],[-25,17,0],
      // right cluster
      [ 28,-8,0],[ 30,-6,1],[ 26,-9,0],[ 29,-11,1],[ 31,-7,0],
      // right-back cluster
      [ 26,14,1],[ 28,16,0],[ 24,15,1],[ 27,12,0],[ 25,17,1],
      // back cluster around market
      [-10,24,0],[ 0,26,1],[ 10,24,0],[-6,27,1],[ 6,27,0],[ 12,22,1],[-12,22,0],
      // front sides
      [-24,-18,0],[-22,-20,1],[ 24,-18,1],[ 22,-20,0],
    ];
    for (const [tx, tz, variant] of treePositions) {
      const mat = new THREE.SpriteMaterial({ map: treeTex[variant], transparent: true, alphaTest: 0.1, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      const scale = 6.5 + Math.abs(Math.sin(tx * 0.7 + tz)) * 2;
      sprite.scale.set(scale * 0.65, scale, 1);
      sprite.position.set(tx, scale / 2, tz);
      scene.add(sprite);
    }

    // NPC sprites + glow lights
    interface NpcEntry { id: string; sprite: THREE.Sprite; light: THREE.PointLight; }
    const npcEntries: NpcEntry[] = [];

    for (const npc of NPCS) {
      const tex = texLoader.load(npc.sprite);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.2, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.8, 3.6, 1);
      sprite.position.set(npc.position[0], 1.8, npc.position[2]);
      sprite.userData.npcId = npc.id;
      scene.add(sprite);

      // Make sprite face the door (rotate so they look outward)
      // Glow light
      const light = new THREE.PointLight(npc.glow, 1.4, 6, 2);
      light.position.set(npc.position[0], 1.4, npc.position[2]);
      scene.add(light);

      // Ground glow disc
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 24),
        new THREE.MeshBasicMaterial({ color: npc.glow, transparent: true, opacity: 0.25, depthWrite: false })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(npc.position[0], 0.02, npc.position[2]);
      scene.add(disc);

      npcEntries.push({ id: npc.id, sprite, light });
    }

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.object);

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "KeyE" && nearbyRef.current && !pausedRef.current) {
        interactRef.current(nearbyRef.current);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onCanvasClick = () => {
      if (pausedRef.current) return;
      if (!controls.isLocked) {
        controls.lock();
      } else if (nearbyRef.current) {
        interactRef.current(nearbyRef.current);
      }
    };
    renderer.domElement.addEventListener("click", onCanvasClick);

    // Raycaster for NPC detection
    const raycaster = new THREE.Raycaster();
    const centerNDC = new THREE.Vector2(0, 0);
    const npcSprites = npcEntries.map((n) => n.sprite);

    // Resize
    const onResize = () => {
      camera.aspect = w() / h();
      camera.updateProjectionMatrix();
      renderer.setSize(w(), h());
    };
    window.addEventListener("resize", onResize);

    // Loop
    const playerVel = new THREE.Vector3();
    const playerDir = new THREE.Vector3();
    const clock = new THREE.Clock();
    let frame = 0;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);

      // Movement
      if (!pausedRef.current && controls.isLocked) {
        const speed = 5;
        playerVel.set(0, 0, 0);
        if (keys["KeyW"]) playerVel.z -= 1;
        if (keys["KeyS"]) playerVel.z += 1;
        if (keys["KeyA"]) playerVel.x -= 1;
        if (keys["KeyD"]) playerVel.x += 1;
        if (playerVel.lengthSq() > 0) {
          playerVel.normalize().multiplyScalar(speed * dt);
          controls.moveRight(playerVel.x);
          controls.moveForward(-playerVel.z);
        }
      }

      // Keep within bounds
      const p = controls.object.position;
      p.x = Math.max(-55, Math.min(55, p.x));
      p.z = Math.max(-55, Math.min(55, p.z));
      p.y = 1.7;

      // Torch flicker
      const t = clock.elapsedTime;
      for (const l of flickerLights) {
        const base = (l as any).userData.base ?? 2;
        l.intensity = base * (0.85 + Math.sin(t * 8 + l.position.x) * 0.08 + Math.random() * 0.05);
      }

      // NPC light pulse
      for (const n of npcEntries) {
        n.light.intensity = 1.2 + Math.sin(t * 2 + n.sprite.position.x) * 0.25;
      }

      // Cloud drift
      for (const c of cloudMeshes) {
        c.position.x += dt * (c.userData.speed as number);
        if (c.position.x > 70) c.position.x = -70;
      }

      // Rain fall
      const rPos = rain.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        rPos[i * 3 + 1] -= dt * 14;
        if (rPos[i * 3 + 1] < 0) rPos[i * 3 + 1] = 55;
      }
      rain.geometry.attributes.position.needsUpdate = true;

      // Nearby NPC raycast (look ray from camera)
      camera.getWorldDirection(playerDir);
      raycaster.setFromCamera(centerNDC, camera);
      const hits = raycaster.intersectObjects(npcSprites, false);
      let near: string | null = null;
      if (hits.length) {
        const hit = hits[0];
        const dist = hit.point.distanceTo(camera.position);
        if (dist <= 3.5) near = (hit.object as THREE.Sprite).userData.npcId;
      }
      // Also allow proximity-only detection within 2.2 units even without looking
      if (!near) {
        let best: { id: string; d: number } | null = null;
        for (const n of npcEntries) {
          const d = n.sprite.position.distanceTo(camera.position);
          if (d < 2.2 && (!best || d < best.d)) best = { id: n.id, d };
        }
        if (best) near = best.id;
      }
      if (near !== nearbyRef.current) {
        nearbyRef.current = near;
        nearbyCbRef.current(near);
      }

      renderer.render(scene, camera);
    };
    loop();

    // Pointer lock state sync
    const onLockChange = () => {
      // If paused state forced unlock, that's fine
    };
    document.addEventListener("pointerlockchange", onLockChange);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rainGeo.dispose();
      rainMat.dispose();
      for (const c of cloudMeshes) {
        (c.material as THREE.MeshBasicMaterial).map?.dispose();
        (c.material as THREE.MeshBasicMaterial).dispose();
        c.geometry.dispose();
      }
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if ((m as any).material) {
          const mat = (m as any).material;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat.dispose();
        }
      });
    };
  }, []);

  // When paused, exit pointer lock
  useEffect(() => {
    if (paused && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paused]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
