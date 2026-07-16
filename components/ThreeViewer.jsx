"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ThreeViewer({ sceneType }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth,
      height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 1.8;
    controls.maxDistance = 14;
    controls.enablePan = false;

    scene.add(new THREE.AmbientLight(0xf5f3ef, 0.55));
    const point = new THREE.PointLight(0xf5f3ef, 1.3);
    point.position.set(5, 5, 5);
    scene.add(point);

    const group = new THREE.Group();
    scene.add(group);

    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff6b35, metalness: 0.3, roughness: 0.35 });
    const dimMat = new THREE.MeshStandardMaterial({ color: 0xb34e27, metalness: 0.5, roughness: 0.3 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f3ef, wireframe: true, transparent: true, opacity: 0.2 });

    const animators = [];
    let camDistance = 4.5;

    if (sceneType === "solar-system") {
      camDistance = 8;
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff6b35 }));
      group.add(sun);
      const planets = [
        { r: 0.14, dist: 1.6, speed: 1.6, color: 0xf5f3ef },
        { r: 0.2, dist: 2.3, speed: 1.1, color: 0xb34e27 },
        { r: 0.17, dist: 3.0, speed: 0.8, color: 0x8c8a8a },
        { r: 0.28, dist: 3.9, speed: 0.5, color: 0xff6b35 },
      ];
      planets.forEach((p) => {
        group.add(new THREE.Mesh(new THREE.TorusGeometry(p.dist, 0.005, 8, 72), lineMat));
        const planet = new THREE.Mesh(new THREE.SphereGeometry(p.r, 24, 24), new THREE.MeshStandardMaterial({ color: p.color }));
        group.add(planet);
        animators.push((t) => planet.position.set(Math.cos(t * p.speed) * p.dist, 0, Math.sin(t * p.speed) * p.dist));
      });
    } else if (sceneType === "atom") {
      const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), accentMat);
      group.add(nucleus);
      [new THREE.Euler(0, 0, 0), new THREE.Euler(Math.PI / 3, 0, 0), new THREE.Euler(0, 0, Math.PI / 3)].forEach((rot, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.01, 8, 90), lineMat);
        ring.rotation.copy(rot);
        group.add(ring);
        const electron = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), dimMat);
        group.add(electron);
        animators.push((t) => {
          const a = t * (1.2 + i * 0.3);
          const v = new THREE.Vector3(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
          v.applyEuler(rot);
          electron.position.copy(v);
        });
      });
    } else if (sceneType === "dna") {
      camDistance = 5.2;
      const turns = 3,
        pointsPerTurn = 12,
        radius = 0.85;
      for (let i = 0; i < turns * pointsPerTurn; i++) {
        const t = i / pointsPerTurn;
        const angle = t * Math.PI * 2;
        const y = t * 1.05 - (turns * 1.05) / 2;
        const p1 = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        const p2 = new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius);
        const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), accentMat);
        s1.position.copy(p1);
        group.add(s1);
        const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), dimMat);
        s2.position.copy(p2);
        group.add(s2);
        if (i % 2 === 0) {
          const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, p1.distanceTo(p2), 6), lineMat);
          rung.position.copy(p1).add(p2).multiplyScalar(0.5);
          rung.lookAt(p2);
          rung.rotateX(Math.PI / 2);
          group.add(rung);
        }
      }
    } else {
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.85, 0.26, 140, 18), accentMat);
      group.add(knot);
      const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65, 0), lineMat);
      group.add(cage);
      animators.push((t) => {
        knot.rotation.x = t * 0.5;
        knot.rotation.y = t * 0.35;
        cage.rotation.y = -t * 0.12;
      });
    }

    camera.position.set(camDistance * 0.6, camDistance * 0.4, camDistance * 0.7);
    controls.update();

    let raf;
    const clock = new THREE.Clock();
    function tick() {
      const t = clock.getElapsedTime();
      animators.forEach((fn) => fn(t));
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    function onResize() {
      const w = mount.clientWidth,
        h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [sceneType]);

  return <div ref={mountRef} className="w-full h-full" style={{ touchAction: "none" }} />;
}
