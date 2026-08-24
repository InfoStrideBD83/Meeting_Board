import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext.jsx';
import logoLight from '../../assets/logo-light.png';
import logoDark from '../../assets/logo-dark-cropped.png';
import './Logo3D.css';

/** The rotating "InfoStride" 3D logo — ported verbatim (geometry, lights,
 *  pointer parallax, resize handling) from Login/Signup/Master.html, which
 *  each duplicated this same scene. Three.js is now an npm dependency
 *  (pinned to 0.128.0, matching the CDN r128 build those pages loaded)
 *  instead of a global <script> tag, and teardown (dispose geometry/
 *  renderer, cancel the animation frame, remove listeners) is explicit
 *  since a React unmount — not a full page navigation — is now what
 *  ends this scene's life. */
export function Logo3D({ variant = 'default', showWordmark = true }) {
  const mountRef = useRef(null);
  const themeRepaintRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return undefined;
    }
    if (!renderer || !renderer.getContext()) return undefined;

    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0.35, 9.2);
    camera.lookAt(0, 0, 0);

    // One chevron of the ">>" mark: the area between two nested V outlines.
    function chevronShape(halfH, tipX, backX, thickness) {
      const s = new THREE.Shape();
      s.moveTo(backX, halfH);
      s.lineTo(tipX, 0);
      s.lineTo(backX, -halfH);
      s.lineTo(backX - thickness, -halfH);
      s.lineTo(tipX - thickness, 0);
      s.lineTo(backX - thickness, halfH);
      s.closePath();
      return s;
    }

    const geo = new THREE.ExtrudeGeometry(
      chevronShape(1.15, 0.62, -0.52, 0.62),
      { depth: 0.46, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 1 }
    );
    geo.center();

    function themeColours() {
      const cs = getComputedStyle(document.documentElement);
      return [
        cs.getPropertyValue('--logo-a').trim() || '#e9edf6',
        cs.getPropertyValue('--logo-b').trim() || '#818cf8',
      ];
    }

    const group = new THREE.Group();
    const mats = [];
    const cols = themeColours();
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cols[i]).convertSRGBToLinear(),
        metalness: 0.42, roughness: 0.26,
      });
      mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = i * 1.34 - 0.67;
      mesh.position.z = i * 0.06;
      group.add(mesh);
    }
    group.rotation.set(-0.06, -0.5, 0);
    scene.add(group);

    // A small ring of orbiting shards around the mark — purely decorative
    // extra 3D motion, independent of the chevrons' own rotation.
    const orbGeo = new THREE.OctahedronGeometry(0.1, 0);
    const orbCount = 7;
    const orbMats = [];
    const orbs = Array.from({ length: orbCount }, (_, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cols[i % 2]).convertSRGBToLinear(),
        metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.85,
      });
      orbMats.push(mat);
      const mesh = new THREE.Mesh(orbGeo, mat);
      const radius = 2.6 + (i % 3) * 0.55;
      const heightPhase = (i / orbCount) * Math.PI * 2;
      const speed = 0.16 + (i % 4) * 0.05;
      scene.add(mesh);
      return { mesh, radius, phase: heightPhase, speed, bobPhase: i * 1.3 };
    });

    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    const fill = new THREE.DirectionalLight(0xc7d2fe, 0.42);
    const rim = new THREE.DirectionalLight(0x818cf8, 0.75);
    const amb = new THREE.HemisphereLight(0xffffff, 0x1a2130, 0.55);
    key.position.set(4.5, 6, 7);
    fill.position.set(-6, -1.5, 4);
    rim.position.set(-3, 3.5, -6);
    scene.add(key, fill, rim, amb);

    function setLights() {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      amb.groundColor.set(light ? 0xdfe4f0 : 0x1a2130);
      amb.intensity = light ? 0.72 : 0.55;
      key.intensity = light ? 0.78 : 0.85;
      rim.intensity = light ? 0.42 : 0.75;
      rim.color.set(light ? 0x6366f1 : 0x818cf8);
    }
    setLights();

    // Repaint the geometry when the theme flips (called from the effect below)
    themeRepaintRef.current = function repaint() {
      const c = themeColours();
      for (let i = 0; i < mats.length; i++) {
        mats[i].color.set(new THREE.Color(c[i]).convertSRGBToLinear());
      }
      for (let i = 0; i < orbMats.length; i++) {
        orbMats[i].color.set(new THREE.Color(c[i % 2]).convertSRGBToLinear());
      }
      setLights();
    };

    let px = 0, py = 0, tx = 0, ty = 0;
    function onPointerMove(e) {
      const r = mount.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    }
    function onPointerLeave() { tx = 0; ty = 0; }
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerleave', onPointerLeave);

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t0 = null;
    let rafId = null;

    function frame(ts) {
      if (t0 === null) t0 = ts;
      const t = (ts - t0) / 1000;

      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;

      if (reduce) {
        group.rotation.y = -0.5 + px * 0.3;
        group.rotation.x = -0.06 + py * 0.18;
      } else {
        group.rotation.y = -0.42 + Math.sin(t * 0.5) * 0.52 + px * 0.34;
        group.rotation.x = -0.05 + Math.sin(t * 0.72) * 0.1 + py * 0.2;
        group.rotation.z = Math.sin(t * 0.33) * 0.045;
        group.position.y = Math.sin(t * 1.05) * 0.11;
      }

      orbs.forEach((o) => {
        const angle = o.phase + t * o.speed * (reduce ? 0 : 1);
        o.mesh.position.set(
          Math.cos(angle) * o.radius,
          Math.sin(t * 0.6 + o.bobPhase) * 0.5,
          Math.sin(angle) * o.radius * 0.55 - 1.4,
        );
        o.mesh.rotation.x = t * 0.8 + o.bobPhase;
        o.mesh.rotation.y = t * 0.6;
      });

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    function resize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', resize);
    resize();

    return function cleanup() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);
      themeRepaintRef.current = null;
      geo.dispose();
      orbGeo.dispose();
      mats.forEach((m) => m.dispose());
      orbMats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Theme flips repaint the existing scene instead of rebuilding it.
  useEffect(() => {
    if (themeRepaintRef.current) themeRepaintRef.current();
  }, [theme]);

  return (
    <section className={`logo-stage${variant !== 'default' ? ` logo-stage--${variant}` : ''} reveal d1`}>
      <div className="logo-glow" aria-hidden="true" />
      <div className="logo-mount" ref={mountRef} role="img" aria-label="InfoStride animated logo" />
      <div className="logo-floor" aria-hidden="true" />
      {showWordmark && (
        <>
          <img className="wordmark on-light" src={logoLight} alt="InfoStride" width="2560" height="349" />
          <img className="wordmark on-dark" src={logoDark} alt="InfoStride" width="853" height="120" />
        </>
      )}
    </section>
  );
}
