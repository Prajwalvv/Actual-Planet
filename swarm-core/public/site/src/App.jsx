import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Html } from "@react-three/drei";
import * as THREE from "three";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";

/* ─────────────────────────────────────────────
   Canvas-drawn ant texture generator
   Draws a top-down ant silhouette: 3 body segments,
   6 jointed legs, 2 curved antennae, mandibles
   ───────────────────────────────────────────── */
function createAntTexture(color, size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const s = size / 128; // scale factor

  ctx.clearRect(0, 0, size, size);

  // Helper: draw an ellipse
  const ellipse = (x, y, rx, ry) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Helper: draw a leg (line with a joint)
  const leg = (x1, y1, jx, jy, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(cx + x1 * s, cy + y1 * s);
    ctx.lineTo(cx + jx * s, cy + jy * s);
    ctx.lineTo(cx + x2 * s, cy + x2 === 0 ? cy + y2 * s : cy + y2 * s);
    ctx.stroke();
  };

  // Legs (6 total, 3 per side) — drawn first so body overlaps
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Front legs
  leg(-8, -6, -22, -18, -28, -26);
  leg(8, -6, 22, -18, 28, -26);
  // Middle legs
  leg(-10, 4, -26, 2, -32, -8);
  leg(10, 4, 26, 2, 32, -8);
  // Back legs
  leg(-8, 16, -24, 22, -30, 14);
  leg(8, 16, 24, 22, 30, 14);

  // Antennae (curved lines from head)
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 4 * s, cy - 26 * s);
  ctx.quadraticCurveTo(cx - 14 * s, cy - 40 * s, cx - 22 * s, cy - 44 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 4 * s, cy - 26 * s);
  ctx.quadraticCurveTo(cx + 14 * s, cy - 40 * s, cx + 22 * s, cy - 44 * s);
  ctx.stroke();

  // Antenna tips (small dots)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - 22 * s, cy - 44 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 22 * s, cy - 44 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();

  // Body fill
  ctx.fillStyle = color;

  // Abdomen (large, rear) — with slight point at back
  ctx.beginPath();
  ctx.ellipse(cx, cy + 22 * s, 12 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Petiole (narrow waist connecting abdomen to thorax)
  ellipse(cx, cy + 4, 4, 4);

  // Thorax (middle segment)
  ellipse(cx, cy - 4, 9, 10);

  // Head (front, slightly smaller)
  ellipse(cx, cy - 22, 8, 8);

  // Mandibles (small triangular shapes at front of head)
  ctx.beginPath();
  ctx.moveTo(cx - 6 * s, cy - 28 * s);
  ctx.lineTo(cx - 10 * s, cy - 34 * s);
  ctx.lineTo(cx - 2 * s, cy - 30 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 6 * s, cy - 28 * s);
  ctx.lineTo(cx + 10 * s, cy - 34 * s);
  ctx.lineTo(cx + 2 * s, cy - 30 * s);
  ctx.fill();

  // Eyes (tiny highlights)
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.arc(cx - 4 * s, cy - 24 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4 * s, cy - 24 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Subtle body segment lines for detail
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.8 * s;
  // Abdomen stripes
  ctx.beginPath();
  ctx.moveTo(cx - 10 * s, cy + 16 * s);
  ctx.lineTo(cx + 10 * s, cy + 16 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 11 * s, cy + 24 * s);
  ctx.lineTo(cx + 11 * s, cy + 24 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 9 * s, cy + 32 * s);
  ctx.lineTo(cx + 9 * s, cy + 32 * s);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/* ─────────────────────────────────────────────
   Ant Caste — Instanced mesh with ant textures
   ───────────────────────────────────────────── */
function AntCaste({ meshRef, ants, texture, antSize, opacity = 0.9 }) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [texture, opacity],
  );

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(antSize, antSize),
    [antSize],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, ants.length]}
      frustumCulled={false}
    />
  );
}

/* ─────────────────────────────────────────────
   Pheromone trail particles (fading dots along
   forager paths to simulate chemical trails)
   ───────────────────────────────────────────── */
function PheromoneTrails({ trailPoints }) {
  const pointsRef = useRef();

  const { positions, opacities } = useMemo(() => {
    const maxTrails = 2000;
    const pos = new Float32Array(maxTrails * 3);
    const opa = new Float32Array(maxTrails);
    return { positions: pos, opacities: opa };
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const pts = trailPoints.current;
    for (let i = 0; i < 2000; i++) {
      if (pts[i]) {
        positions[i * 3] = pts[i].x;
        positions[i * 3 + 1] = pts[i].y;
        positions[i * 3 + 2] = pts[i].z;
        opacities[i] = pts[i].life || 0;
      } else {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = -100;
        opacities[i] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2000}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#1d1d1d"
        size={0.06}
        transparent
        opacity={0.12}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ─────────────────────────────────────────────
   Main Swarm Simulation
   ───────────────────────────────────────────── */
function BiomimeticSwarm() {
  const { viewport, pointer, camera } = useThree();

  // Data Nodes (5 sources)
  const nodes = useMemo(() => {
    const seed = [
      [-8, 5, -2],
      [9, -4, -1],
      [-5, -7, -3],
      [7, 7, -2],
      [-10, 0, -1],
    ];
    return seed.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  }, []);

  const nodeLabels = useMemo(
    () => ["REDDIT_API", "SEC_EDGAR", "NEWS_FEED", "SOCIAL_X", "MARKET_WS"],
    [],
  );

  const scoutMesh = useRef();
  const foragerMesh = useRef();
  const processorMesh = useRef();
  const guardMesh = useRef();
  const coreTarget = useRef(new THREE.Vector3(0, 0, 0));
  const trailPoints = useRef([]);

  // Create ant textures for each caste
  const scoutTex = useMemo(() => createAntTexture("#0891b2", 128), []);
  const foragerTex = useMemo(() => createAntTexture("#2d2d2d", 128), []);
  const processorTex = useMemo(() => createAntTexture("#d97706", 128), []);
  const guardTex = useMemo(() => createAntTexture("#dc2626", 128), []);

  // 1. SCOUTS (Cyan — erratic explorers)
  const scouts = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 4,
        ),
        vel: new THREE.Vector3(0, 0, 0),
        target: new THREE.Vector3(
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 18,
          0,
        ),
        speed: 0.03 + Math.random() * 0.03,
        heading: Math.random() * Math.PI * 2,
      })),
    [],
  );

  // 2. FORAGERS (Dark — stigmergic trails between core and nodes)
  const foragers = useMemo(
    () =>
      Array.from({ length: 300 }, () => {
        const targetNode = nodes[Math.floor(Math.random() * nodes.length)];
        return {
          pos: new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            0,
          ),
          vel: new THREE.Vector3(0, 0, 0),
          targetNode,
          state: Math.random() > 0.5 ? "outbound" : "inbound",
          speed: 0.04 + Math.random() * 0.03,
          wobble: Math.random() * Math.PI * 2,
          heading: Math.random() * Math.PI * 2,
          trailTimer: 0,
        };
      }),
    [nodes],
  );

  // 3. PROCESSORS (Amber — orbit the core)
  const processors = useMemo(
    () =>
      Array.from({ length: 80 }, () => ({
        pos: new THREE.Vector3(0, 0, 0),
        angle: Math.random() * Math.PI * 2,
        radius: 1.5 + Math.random() * 2,
        speed: 0.008 + Math.random() * 0.02,
        zOffset: (Math.random() - 0.5) * 2,
        heading: 0,
      })),
    [],
  );

  // 4. GUARDS (Red — patrol perimeter around core)
  const guards = useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        pos: new THREE.Vector3(0, 0, 0),
        angle: Math.random() * Math.PI * 2,
        radius: 3.5 + Math.random() * 1.5,
        speed: 0.005 + Math.random() * 0.008,
        heading: 0,
        patrolDir: Math.random() > 0.5 ? 1 : -1,
      })),
    [],
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _euler = useMemo(() => new THREE.Euler(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Core follows mouse smoothly
    const mousePos = new THREE.Vector3(
      (pointer.x * viewport.width) / 2,
      (pointer.y * viewport.height) / 2,
      0,
    );
    coreTarget.current.lerp(mousePos, 0.04);

    // Billboard quaternion (face camera)
    const camQ = camera.quaternion.clone();

    // ── SCOUTS ──
    if (scoutMesh.current) {
      scouts.forEach((ant, i) => {
        if (ant.pos.distanceTo(ant.target) < 1.5) {
          ant.target.set(
            (Math.random() - 0.5) * 28,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 6,
          );
        }
        const dir = ant.target
          .clone()
          .sub(ant.pos)
          .normalize()
          .multiplyScalar(ant.speed);
        ant.vel.lerp(dir, 0.08);
        ant.pos.add(ant.vel);

        // Compute heading angle from velocity (on XY plane)
        if (ant.vel.lengthSq() > 0.0001) {
          ant.heading = Math.atan2(ant.vel.x, -ant.vel.y);
        }

        dummy.position.copy(ant.pos);
        dummy.quaternion.copy(camQ);
        // Rotate around camera-facing axis to show travel direction
        _euler.set(0, 0, ant.heading);
        _q.setFromEuler(_euler);
        dummy.quaternion.multiply(_q);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        scoutMesh.current.setMatrixAt(i, dummy.matrix);
      });
      scoutMesh.current.instanceMatrix.needsUpdate = true;
    }

    // ── FORAGERS ──
    let trailIdx = 0;
    if (foragerMesh.current) {
      foragers.forEach((ant, i) => {
        const target =
          ant.state === "outbound" ? ant.targetNode : coreTarget.current;

        if (ant.pos.distanceTo(target) < 1.2) {
          ant.state = ant.state === "outbound" ? "inbound" : "outbound";
          if (ant.state === "outbound" && Math.random() < 0.15) {
            ant.targetNode = nodes[Math.floor(Math.random() * nodes.length)];
          }
        }

        const dir = target.clone().sub(ant.pos).normalize();
        ant.wobble += 0.15;
        const wobbleStrength = 0.3;
        dir.x += Math.sin(ant.wobble) * wobbleStrength;
        dir.y += Math.cos(ant.wobble * 0.7) * wobbleStrength;
        dir.normalize().multiplyScalar(ant.speed);

        ant.vel.lerp(dir, 0.12);
        ant.pos.add(ant.vel);

        // Drop pheromone trail particles
        ant.trailTimer += 1;
        if (ant.trailTimer > 8 && trailIdx < 2000) {
          ant.trailTimer = 0;
          trailPoints.current[trailIdx] = {
            x: ant.pos.x,
            y: ant.pos.y,
            z: ant.pos.z - 0.1,
            life: 0.5,
          };
          trailIdx++;
        }

        if (ant.vel.lengthSq() > 0.0001) {
          ant.heading = Math.atan2(ant.vel.x, -ant.vel.y);
        }

        dummy.position.copy(ant.pos);
        dummy.quaternion.copy(camQ);
        _euler.set(0, 0, ant.heading);
        _q.setFromEuler(_euler);
        dummy.quaternion.multiply(_q);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        foragerMesh.current.setMatrixAt(i, dummy.matrix);
      });
      foragerMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Fade old trail points
    for (let i = 0; i < trailPoints.current.length; i++) {
      if (trailPoints.current[i]) {
        trailPoints.current[i].life -= 0.005;
        if (trailPoints.current[i].life <= 0) trailPoints.current[i] = null;
      }
    }

    // ── PROCESSORS ──
    if (processorMesh.current) {
      processors.forEach((ant, i) => {
        ant.angle += ant.speed;
        const tx = coreTarget.current.x + Math.cos(ant.angle) * ant.radius;
        const ty =
          coreTarget.current.y + Math.sin(ant.angle) * ant.radius * 0.85;
        const tz =
          coreTarget.current.z + ant.zOffset + Math.sin(ant.angle * 2) * 0.8;
        const prev = ant.pos.clone();
        ant.pos.lerp(new THREE.Vector3(tx, ty, tz), 0.1);

        const delta = ant.pos.clone().sub(prev);
        if (delta.lengthSq() > 0.0001) {
          ant.heading = Math.atan2(delta.x, -delta.y);
        }

        dummy.position.copy(ant.pos);
        dummy.quaternion.copy(camQ);
        _euler.set(0, 0, ant.heading);
        _q.setFromEuler(_euler);
        dummy.quaternion.multiply(_q);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        processorMesh.current.setMatrixAt(i, dummy.matrix);
      });
      processorMesh.current.instanceMatrix.needsUpdate = true;
    }

    // ── GUARDS ──
    if (guardMesh.current) {
      guards.forEach((ant, i) => {
        ant.angle += ant.speed * ant.patrolDir;
        const tx = coreTarget.current.x + Math.cos(ant.angle) * ant.radius;
        const ty = coreTarget.current.y + Math.sin(ant.angle) * ant.radius;
        const tz = 0;
        const prev = ant.pos.clone();
        ant.pos.lerp(new THREE.Vector3(tx, ty, tz), 0.08);

        const delta = ant.pos.clone().sub(prev);
        if (delta.lengthSq() > 0.0001) {
          ant.heading = Math.atan2(delta.x, -delta.y);
        }

        dummy.position.copy(ant.pos);
        dummy.quaternion.copy(camQ);
        _euler.set(0, 0, ant.heading);
        _q.setFromEuler(_euler);
        dummy.quaternion.multiply(_q);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        guardMesh.current.setMatrixAt(i, dummy.matrix);
      });
      guardMesh.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Data Source Nodes */}
      {nodes.map((pos, i) => (
        <Float
          key={`node-${i}`}
          speed={1.5}
          rotationIntensity={0.2}
          floatIntensity={0.5}
        >
          <group position={pos}>
            <mesh>
              <circleGeometry args={[0.18, 32]} />
              <meshBasicMaterial color="#16a34a" transparent opacity={0.9} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.3, 0.35, 32]} />
              <meshBasicMaterial
                color="#16a34a"
                transparent
                opacity={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            <Html distanceFactor={18} center zIndexRange={[100, 0]}>
              <div className="node-label">
                <div className="node-dot"></div>
                <span className="mono">{nodeLabels[i]}</span>
              </div>
            </Html>
          </group>
        </Float>
      ))}

      {/* Pheromone trail particles */}
      <PheromoneTrails trailPoints={trailPoints} />

      {/* Ant Castes — proper ant-shaped sprites */}
      <AntCaste
        meshRef={scoutMesh}
        ants={scouts}
        texture={scoutTex}
        antSize={0.7}
        opacity={0.85}
      />
      <AntCaste
        meshRef={foragerMesh}
        ants={foragers}
        texture={foragerTex}
        antSize={0.5}
        opacity={0.7}
      />
      <AntCaste
        meshRef={processorMesh}
        ants={processors}
        texture={processorTex}
        antSize={0.55}
        opacity={0.85}
      />
      <AntCaste
        meshRef={guardMesh}
        ants={guards}
        texture={guardTex}
        antSize={0.65}
        opacity={0.9}
      />
    </group>
  );
}

// Telemetry Overlay Component
function TelemetryOverlay() {
  const [logs, setLogs] = useState([
    "[SYSTEM] Initializing stigmergic matrix...",
    "[SCOUT] Discovered 5 active data nodes.",
    "[FORAGER] Chemical routing established.",
  ]);

  useEffect(() => {
    const messages = [
      "[PROCESSOR] Cross-validating signal anomaly at SEC_EDGAR...",
      "[GUARD] Filtering noise and hallucination from stream...",
      "[FORAGER] Convergence detected on payload hash...",
      "[SCOUT] Expanding perimeter search for new vectors...",
      "[SYSTEM] LLM Query target successfully updated.",
      "[GUARD] Echo-chamber pattern neutralized.",
      "[PROCESSOR] Synthesizing raw signals into context...",
    ];

    const interval = setInterval(() => {
      setLogs((prev) => {
        const newLogs = [
          ...prev,
          messages[Math.floor(Math.random() * messages.length)],
        ];
        if (newLogs.length > 5) newLogs.shift();
        return newLogs;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="telemetry-panel fade-up delay-4">
      <div className="telemetry-header">
        <div className="pulse-dot"></div>
        LIVE SWARM TELEMETRY
      </div>

      <div className="telemetry-stats">
        <div className="stat-row">
          <div
            className="stat-indicator"
            style={{ background: "#0891b2" }}
          ></div>
          <span>
            <strong>60 Scouts</strong> seeking anomalies
          </span>
        </div>
        <div className="stat-row">
          <div
            className="stat-indicator"
            style={{ background: "#2d2d2d" }}
          ></div>
          <span>
            <strong>300 Foragers</strong> extracting context
          </span>
        </div>
        <div className="stat-row">
          <div
            className="stat-indicator"
            style={{ background: "#dc2626" }}
          ></div>
          <span>
            <strong>30 Guards</strong> filtering noise
          </span>
        </div>
        <div className="stat-row">
          <div
            className="stat-indicator"
            style={{ background: "#d97706" }}
          ></div>
          <span>
            <strong>80 Processors</strong> synthesizing data
          </span>
        </div>
        <div
          className="stat-row"
          style={{
            marginTop: "4px",
            paddingTop: "8px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            className="stat-indicator"
            style={{ background: "#16a34a" }}
          ></div>
          <span>
            <strong>5 Live Nodes</strong> actively tapped
          </span>
        </div>
      </div>

      <div className="telemetry-logs">
        {logs.map((log, i) => (
          <div
            key={i}
            className="log-line"
            style={{ opacity: (i + 1) / logs.length }}
          >
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}

// Main App Component
export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    damping: 20,
    stiffness: 100,
    mass: 0.5,
  });

  const heroY = useTransform(smoothProgress, [0, 1], [0, -250]);
  const heroOpacity = useTransform(smoothProgress, [0, 0.3], [1, 0]);
  const contentY = useTransform(smoothProgress, [0, 1], [100, -100]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 1, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <div
      className="app-wrapper"
      style={{ minHeight: "100vh", background: "transparent" }}
    >
      {/* Interactive Biomimetic 3D Background */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 20], fov: 55 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor("#f3f2eb", 1);
          }}
        >
          <BiomimeticSwarm />
        </Canvas>
      </div>

      <nav className="nav">
        <div className="nav-inner">
          <a href="index.html" className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Hexagonal network representing swarm intelligence */}
              <circle cx="16" cy="16" r="2.5" fill="currentColor"/>
              <circle cx="8" cy="10" r="1.8" fill="currentColor" opacity="0.7"/>
              <circle cx="24" cy="10" r="1.8" fill="currentColor" opacity="0.7"/>
              <circle cx="8" cy="22" r="1.8" fill="currentColor" opacity="0.7"/>
              <circle cx="24" cy="22" r="1.8" fill="currentColor" opacity="0.7"/>
              <circle cx="16" cy="6" r="1.8" fill="currentColor" opacity="0.7"/>
              <circle cx="16" cy="26" r="1.8" fill="currentColor" opacity="0.7"/>
              {/* Connection lines */}
              <line x1="16" y1="16" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="16" y1="16" x2="24" y2="10" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="16" y1="16" x2="8" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="16" y1="16" x2="24" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="16" y1="16" x2="16" y2="6" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              <line x1="16" y1="16" x2="16" y2="26" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              {/* Outer connections */}
              <line x1="8" y1="10" x2="16" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
              <line x1="24" y1="10" x2="16" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
              <line x1="8" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
              <line x1="24" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
            </svg>
            <span style={{ fontWeight: '700', fontSize: '1.3rem', letterSpacing: '0.5px' }}>ACTUAL PLANET</span>
          </a>
          <div className="nav-links">
            <a href="index.html" className="active">
              Product
            </a>
            <a href="pricing.html" style={{ opacity: 0.5, pointerEvents: 'none' }}>Pricing <span style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.6 }}>Soon</span></a>
            <a href="docs.html" style={{ opacity: 0.5, pointerEvents: 'none' }}>Docs <span style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.6 }}>Soon</span></a>
            <a href="https://github.com/Prajwalvv/Actual-Planet" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
          <div className="nav-cta">
            <a href="login.html" className="btn btn-ghost" style={{ opacity: 0.5, pointerEvents: 'none' }}>
              Log in <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span>
            </a>
            <a href="signup.html" className="btn btn-primary btn-sm" style={{ opacity: 0.5, pointerEvents: 'none' }}>
              Get Started <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span>
            </a>
          </div>
          <button
            className={`burger-btn${mobileMenuOpen ? ' active' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      <div className={`mobile-menu${mobileMenuOpen ? ' open' : ''}`}>
        <a href="index.html" className="active" onClick={() => setMobileMenuOpen(false)}>Product</a>
        <a href="pricing.html" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
        <a href="docs.html" onClick={() => setMobileMenuOpen(false)}>Docs</a>
        <div className="mobile-menu-cta">
          <a href="login.html" className="btn btn-ghost" onClick={() => setMobileMenuOpen(false)}>Log in</a>
          <a href="signup.html" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>Get Started</a>
        </div>
      </div>

      <motion.section
        className="section"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          y: heroY,
          opacity: heroOpacity,
          paddingTop: "80px",
          position: "relative",
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <motion.div
          className="container text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={itemVariants}
            className="badge"
            style={{
              marginBottom: "32px",
              background: "rgba(255,255,255,0.8)",
              backdropFilter: "blur(8px)",
              pointerEvents: "auto",
            }}
          >
            Biomimetic Data Infrastructure
          </motion.div>
          <motion.h1
            variants={itemVariants}
            style={{ maxWidth: "1100px", margin: "0 auto 24px" }}
          >
            deploy an autonomous
            <br />
            intelligence swarm
          </motion.h1>
          <motion.p
            variants={itemVariants}
            style={{
              maxWidth: "680px",
              margin: "0 auto 48px",
              fontSize: "1.35rem",
            }}
          >
            Actual Planet uses stigmergy—simulating real ant colonies—to discover,
            validate, and cross-reference live data for your LLM. Thousands of
            specialized agents routing in perfect parallel.
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="hero-cta"
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              flexWrap: "wrap",
              pointerEvents: "auto",
            }}
          >
            <a href="signup.html" className="btn btn-primary btn-lg">
              Deploy agents
            </a>
            <a href="docs.html" className="btn btn-secondary btn-lg">
              Read the docs
            </a>
          </motion.div>
        </motion.div>

        {/* Swarm Live Telemetry UI */}
        <TelemetryOverlay />
      </motion.section>

      {/* Scrolling Content */}
      <motion.div
        style={{
          y: contentY,
          position: "relative",
          zIndex: 2,
          background: "var(--surface)",
          paddingTop: "140px",
          paddingBottom: "80px",
          borderTop: "1px solid var(--border)",
          boxShadow: "0 -20px 40px rgba(0,0,0,0.02)",
        }}
      >
        <div className="container section-sm">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{ marginBottom: "18px" }}
          >
            the swarm hierarchy
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{
              maxWidth: "980px",
              margin: "0 auto 60px",
              fontSize: "1.08rem",
              color: "var(--text2)",
              lineHeight: "1.7",
            }}
          >
            Each caste does one simple job. Together they produce high-trust,
            real-time intelligence your apps and LLM agents can execute on:
            discovery, validation, synthesis, and decision-ready output.
          </motion.p>
          <div className="grid-4">
            {[
              {
                title: "Scouts",
                color: "#0891b2",
                role: "Discover",
                desc: "Continuously crawl live surfaces to find new entities, unusual shifts, and fresh source nodes before they trend.",
                output: "Outputs: trail + interest signals",
              },
              {
                title: "Readers",
                color: "#2d2d2d",
                role: "Collect",
                desc: "Adaptive readers pull raw activity, mention, and sentiment context from public-web sources selected by the terrain planner.",
                output: "Outputs: raw evidence deposits",
              },
              {
                title: "Guards",
                color: "#dc2626",
                role: "Validate",
                desc: "Cross-check source consistency, suppress echo chambers, quarantine suspicious spikes, and enforce data-quality gates.",
                output: "Outputs: quality + trust signals",
              },
              {
                title: "Processors",
                color: "#d97706",
                role: "Synthesize",
                desc: "Detect convergences, divergences, and cascades, then compress noisy inputs into structured, actionable intelligence.",
                output: "Outputs: reports for humans + LLM tools",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 1,
                  delay: i * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="card"
                style={{ padding: "40px" }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: `${item.color}10`,
                    border: `1px solid ${item.color}33`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "24px",
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 64 64"
                    fill={item.color}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Abdomen */}
                    <ellipse cx="32" cy="46" rx="10" ry="14" />
                    {/* Petiole */}
                    <circle cx="32" cy="31" r="3.5" />
                    {/* Thorax */}
                    <ellipse cx="32" cy="24" rx="7" ry="8" />
                    {/* Head */}
                    <circle cx="32" cy="12" r="6" />
                    {/* Mandibles */}
                    <path d="M28 8 L24 2 L30 6Z" />
                    <path d="M36 8 L40 2 L34 6Z" />
                    {/* Antennae */}
                    <path
                      d="M29 8 Q22 -2 16 -2"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <path
                      d="M35 8 Q42 -2 48 -2"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Legs */}
                    <path
                      d="M25 20 L12 10 L6 6"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M39 20 L52 10 L58 6"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M25 26 L10 26 L4 20"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M39 26 L54 26 L60 20"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M26 38 L12 44 L6 40"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M38 38 L52 44 L58 40"
                      stroke={item.color}
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 style={{ fontSize: "1.4rem", marginBottom: "12px" }}>
                  {item.title}
                </h3>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.74rem",
                    letterSpacing: "0.45px",
                    textTransform: "uppercase",
                    color: "var(--text3)",
                    marginBottom: "12px",
                  }}
                >
                  {item.role}
                </div>
                <p
                  style={{
                    fontSize: "1.03rem",
                    color: "var(--text2)",
                    lineHeight: "1.6",
                    marginBottom: "12px",
                  }}
                >
                  {item.desc}
                </p>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text3)",
                    lineHeight: "1.55",
                    margin: 0,
                  }}
                >
                  {item.output}
                </p>
              </motion.div>
            ))}
          </div>

        </div>

        {/* ── HOW IT WORKS ─────────────────────── */}
        <div className="container section-sm" style={{ paddingTop: "100px" }}>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{ marginBottom: "72px" }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.78rem",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: "16px",
              }}
            >
              How it works
            </div>
            <h2 style={{ marginBottom: "20px" }}>
              from query to intelligence
              <br />
              in under 3 seconds
            </h2>
            <p
              style={{
                maxWidth: "720px",
                margin: "0 auto",
                fontSize: "1.15rem",
                color: "var(--text2)",
                lineHeight: "1.7",
              }}
            >
              Your request triggers a cascade through the swarm. Each caste
              operates in parallel — no bottlenecks, no single points of failure.
            </p>
          </motion.div>

          <div className="pipeline-track">
            {[
              {
                step: "01",
                label: "You query",
                detail:
                  "Send a natural-language question or structured filter via API or SDK. The adaptive planner allocates terrain, providers, and breed budget.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                ),
              },
              {
                step: "02",
                label: "Providers fan out",
                detail:
                  "Search, feed, forum, sitemap, and direct-web providers discover relevant sources, social feeds, docs, and forums in real time.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
              },
              {
                step: "03",
                label: "Foragers collect",
                detail:
                  "Raw mentions, sentiment, volume spikes, and entity data are pulled and deposited into shared memory.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                ),
              },
              {
                step: "04",
                label: "Guards validate",
                detail:
                  "Cross-source consistency checks, echo-chamber suppression, and anomaly quarantine ensure data quality.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                ),
              },
              {
                step: "05",
                label: "You receive intelligence",
                detail:
                  "Structured JSON with conviction scores, confidence intervals, source attributions, and actionable signals.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ),
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="pipeline-step"
              >
                <div className="pipeline-icon">{item.icon}</div>
                <div className="pipeline-number">{item.step}</div>
                <h3 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
                  {item.label}
                </h3>
                <p
                  style={{
                    fontSize: "0.95rem",
                    color: "var(--text2)",
                    lineHeight: "1.6",
                    margin: 0,
                  }}
                >
                  {item.detail}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── API CODE BLOCK ────────────────────── */}
        <div
          className="container section-sm code-section"
          style={{ paddingBottom: "80px", paddingTop: "60px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{ marginBottom: "40px" }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.78rem",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: "16px",
              }}
            >
              Developer-first
            </div>
            <h2 style={{ marginBottom: "16px" }}>one call. full swarm.</h2>
            <p
              style={{
                maxWidth: "600px",
                margin: "0 auto",
                fontSize: "1.08rem",
                color: "var(--text2)",
                lineHeight: "1.7",
              }}
            >
              A single API request triggers the entire colony. Get validated,
              structured intelligence back in seconds.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 40 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="code-block"
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              fontSize: "1.05rem",
              background: "var(--bg)",
            }}
          >
            <span className="comment">
              // One call gives your system live, validated swarm intelligence
            </span>
            <br />
            <span className="keyword">const</span> response ={" "}
            <span className="keyword">await</span> fetch(
            <span className="string">'https://api.actualplanet.com/api/query'</span>,{" "}
            {"{"}
            <br />
            &nbsp;&nbsp;method: <span className="string">'POST'</span>,<br />
            &nbsp;&nbsp;headers: {"{"} Authorization:{" "}
            <span className="string">`Bearer {"${API_KEY}"}`</span> {"}"},<br />
            &nbsp;&nbsp;body: JSON.stringify({"{"}
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;query:{" "}
            <span className="string">
              "What's showing unusual activity right now?"
            </span>
            ,<br />
            &nbsp;&nbsp;&nbsp;&nbsp;model:{" "}
            <span className="string">"full"</span>
            <br />
            &nbsp;&nbsp;{"}"})<br />
            {"}"});
          </motion.div>
        </div>

        {/* ── WHY ACTUAL PLANET ─────────────────────────── */}
        <div
          className="container section-sm"
          style={{ paddingTop: "80px", paddingBottom: "100px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{ marginBottom: "72px" }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.78rem",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: "16px",
              }}
            >
              Why Actual Planet
            </div>
            <h2 style={{ marginBottom: "20px" }}>
              built different from the ground up
            </h2>
            <p
              style={{
                maxWidth: "740px",
                margin: "0 auto",
                fontSize: "1.12rem",
                color: "var(--text2)",
                lineHeight: "1.7",
              }}
            >
              Traditional scrapers break. Static APIs stale. Actual Planet's stigmergic
              architecture adapts, self-heals, and scales without central
              coordination.
            </p>
          </motion.div>

          <div className="grid-3">
            {[
              {
                title: "Self-healing coverage",
                desc: "When a source goes down, the frontier and provider registry reroute discovery automatically and keep exploration moving.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6" />
                    <path d="M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                ),
              },
              {
                title: "Echo-chamber suppression",
                desc: "Guard agents detect when multiple sources trace back to a single origin. Fake consensus never reaches your output.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                ),
              },
              {
                title: "Conviction scoring",
                desc: "Every output carries a conviction score based on source diversity, recency, and cross-validation depth.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                ),
              },
              {
                title: "LLM-native outputs",
                desc: "Structured JSON designed for direct consumption by GPT-4, Claude, Gemini, or your fine-tuned models.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                ),
              },
              {
                title: "Sub-second latency",
                desc: "Parallel agent execution means results arrive in under 3 seconds, not minutes. Built for real-time pipelines.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                title: "Full source attribution",
                desc: "Every claim links back to its original sources with timestamps. Audit trails your compliance team will love.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                ),
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="card"
                style={{ padding: "36px" }}
              >
                <div
                  className="card-icon"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "20px",
                  }}
                >
                  {item.icon}
                </div>
                <h3
                  style={{
                    fontSize: "1.2rem",
                    marginBottom: "10px",
                    fontWeight: 500,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: "0.98rem",
                    color: "var(--text2)",
                    lineHeight: "1.65",
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── STATS BAR ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: "var(--text)",
            color: "var(--bg)",
            padding: "72px 0",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "32px",
                textAlign: "center",
              }}
              className="stats-grid"
            >
              {[
                { value: "12M+", label: "Signals processed daily" },
                { value: "<2.8s", label: "Avg. query-to-insight" },
                { value: "97.3%", label: "Cross-validation accuracy" },
                { value: "4 castes", label: "Operating in parallel" },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.8,
                    delay: i * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(2.2rem, 4vw, 3.2rem)",
                      fontWeight: 400,
                      letterSpacing: "-0.03em",
                      marginBottom: "8px",
                      fontFamily: "var(--sans)",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontSize: "0.95rem",
                      opacity: 0.6,
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── USE CASES ─────────────────────────── */}
        <div
          className="container section-sm"
          style={{ paddingTop: "100px", paddingBottom: "100px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{ marginBottom: "72px" }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.78rem",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: "16px",
              }}
            >
              Use cases
            </div>
            <h2 style={{ marginBottom: "20px" }}>
              intelligence that adapts
              <br />
              to your domain
            </h2>
            <p
              style={{
                maxWidth: "720px",
                margin: "0 auto",
                fontSize: "1.12rem",
                color: "var(--text2)",
                lineHeight: "1.7",
              }}
            >
              The swarm doesn't care about the vertical — it cares about
              signal quality. Point it at any domain and it discovers what
              matters.
            </p>
          </motion.div>

          <div className="grid-2">
            {[
              {
                title: "Crypto & DeFi",
                desc: "Track wallet movements, social sentiment shifts, protocol governance votes, and on-chain anomalies — all cross-validated before surfacing.",
                tags: ["On-chain", "Social", "Governance"],
              },
              {
                title: "Public equities",
                desc: "Earnings whisper signals, SEC filing anomalies, insider transaction clustering, and cross-market correlation detection.",
                tags: ["Filings", "Sentiment", "Correlation"],
              },
              {
                title: "Threat intelligence",
                desc: "Monitor dark web mentions, paste sites, code repositories, and vulnerability disclosures with echo-chamber filtering built in.",
                tags: ["OSINT", "CVEs", "Attribution"],
              },
              {
                title: "Brand & reputation",
                desc: "Real-time crisis detection across news, social, and review platforms. Know about narratives before they become trends.",
                tags: ["Media", "Reviews", "Crisis"],
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="card"
                style={{ padding: "44px" }}
              >
                <h3
                  style={{
                    fontSize: "1.35rem",
                    marginBottom: "14px",
                    fontWeight: 500,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: "1.02rem",
                    color: "var(--text2)",
                    lineHeight: "1.65",
                    marginBottom: "20px",
                  }}
                >
                  {item.desc}
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "0.75rem",
                        letterSpacing: "0.5px",
                        padding: "4px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        color: "var(--text3)",
                        background: "var(--surface2)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── INTEGRATIONS ──────────────────────── */}
        <div
          className="container section-sm"
          style={{ paddingBottom: "100px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "24px",
              background: "var(--surface2)",
              padding: "64px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "60px",
              alignItems: "center",
            }}
            className="integration-card"
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.78rem",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--text3)",
                  marginBottom: "16px",
                }}
              >
                Integrations
              </div>
              <h2
                style={{
                  fontSize: "clamp(1.8rem, 3vw, 2.8rem)",
                  marginBottom: "20px",
                }}
              >
                plugs into
                <br />
                what you already use
              </h2>
              <p
                style={{
                  fontSize: "1.05rem",
                  color: "var(--text2)",
                  lineHeight: "1.7",
                  marginBottom: "28px",
                }}
              >
                REST API, Python SDK, TypeScript SDK, or direct webhook delivery.
                Consume swarm outputs in your existing pipelines, LLM tool-call
                chains, or dashboards without rewriting anything.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <a href="docs.html" className="btn btn-primary">
                  View SDK docs
                </a>
                <a href="signup.html" className="btn btn-secondary">
                  Get API key
                </a>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              {[
                { name: "REST API", mono: "POST /api/query" },
                { name: "Python SDK", mono: "pip install actualplanet" },
                { name: "TypeScript SDK", mono: "npm i @actualplanet/sdk" },
                { name: "Webhooks", mono: "real-time push" },
                { name: "LangChain", mono: "tool integration" },
                { name: "OpenAI Tools", mono: "function calling" },
              ].map((item) => (
                <div
                  key={item.name}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "14px",
                    padding: "20px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 500,
                      marginBottom: "6px",
                      color: "var(--text)",
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.78rem",
                      color: "var(--text3)",
                    }}
                  >
                    {item.mono}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── FINAL CTA ─────────────────────────── */}
        <div
          className="container section-sm"
          style={{ paddingBottom: "120px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "28px",
              padding: "80px 40px",
            }}
          >
            <h2 style={{ marginBottom: "20px" }}>
              ready to deploy
              <br />
              your swarm?
            </h2>
            <p
              style={{
                maxWidth: "580px",
                margin: "0 auto 36px",
                fontSize: "1.12rem",
                color: "var(--text2)",
                lineHeight: "1.7",
              }}
            >
              Start with the free tier. 1,000 queries/month, all four castes,
              full API access. No credit card required.
            </p>
            <div
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a href="signup.html" className="btn btn-primary btn-lg">
                Get started free
              </a>
              <a href="pricing.html" className="btn btn-secondary btn-lg">
                See pricing
              </a>
            </div>
            <div
              style={{
                marginTop: "32px",
                display: "flex",
                gap: "32px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {[
                "No credit card required",
                "1,000 free queries/mo",
                "Full swarm access",
              ].map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        <footer
          className="footer"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "80px 0 40px",
            paddingBottom: "60px",
          }}
        >
          <div className="container">
            <div className="footer-grid">
              <div className="footer-brand">
                <div className="nav-logo" style={{ fontSize: "1.4rem", display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="2.5" fill="currentColor"/>
                    <circle cx="8" cy="10" r="1.8" fill="currentColor" opacity="0.7"/>
                    <circle cx="24" cy="10" r="1.8" fill="currentColor" opacity="0.7"/>
                    <circle cx="8" cy="22" r="1.8" fill="currentColor" opacity="0.7"/>
                    <circle cx="24" cy="22" r="1.8" fill="currentColor" opacity="0.7"/>
                    <circle cx="16" cy="6" r="1.8" fill="currentColor" opacity="0.7"/>
                    <circle cx="16" cy="26" r="1.8" fill="currentColor" opacity="0.7"/>
                    <line x1="16" y1="16" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="16" y1="16" x2="24" y2="10" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="16" y1="16" x2="8" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="16" y1="16" x2="24" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="16" y1="16" x2="16" y2="6" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="16" y1="16" x2="16" y2="26" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                    <line x1="8" y1="10" x2="16" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
                    <line x1="24" y1="10" x2="16" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
                    <line x1="8" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
                    <line x1="24" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
                  </svg>
                  <span>ACTUAL PLANET</span>
                </div>
                <p>
                  Stigmergic intelligence infrastructure. Real-time,
                  cross-validated data for AI systems.
                </p>
              </div>
              <div className="footer-col">
                <h4>Product</h4>
                <a href="index.html">Overview</a>
                <a href="pricing.html" style={{ opacity: 0.5 }}>Pricing <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span></a>
                <a href="docs.html" style={{ opacity: 0.5 }}>Documentation <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span></a>
              </div>
              <div className="footer-col">
                <h4>Resources</h4>
                <a href="https://github.com/Prajwalvv/Actual-Planet" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </a>
                <a href="https://github.com/Prajwalvv/Actual-Planet#readme" target="_blank" rel="noopener noreferrer">README</a>
                <a href="mailto:iamvv2024@gmail.com">Contact</a>
              </div>
              <div className="footer-col">
                <h4>Legal</h4>
                <a href="https://github.com/Prajwalvv/Actual-Planet/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">License (AGPL-3.0)</a>
                <a href="#" style={{ opacity: 0.5 }}>Privacy <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span></a>
                <a href="#" style={{ opacity: 0.5 }}>Terms <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>Soon</span></a>
              </div>
            </div>
            <div className="footer-bottom">
              <span>&copy; 2026 Actual Planet. All rights reserved.</span>
              <span>Built with swarm intelligence.</span>
            </div>
          </div>
        </footer>
      </motion.div>
      {/* Solid cover to prevent canvas bleed below footer */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "200px",
          background: "var(--surface)",
          marginTop: "-200px",
        }}
      />
    </div>
  );
}
