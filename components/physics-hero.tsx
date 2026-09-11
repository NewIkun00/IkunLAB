'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const modelUrl = '/Head.glb';

type ColliderSphere = {
  center: THREE.Vector3;
  radius: number;
};

type Body = {
  group: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  radius: number;
  localColliders: ColliderSphere[];
  colliders: ColliderSphere[];
  contact: number;
  kick: number;
};

function buildCompoundCollider(root: THREE.Object3D, center: THREE.Vector3, scale: number) {
  root.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(position.count / 900));
    for (let index = 0; index < position.count; index += step) {
      points.push(new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ).applyMatrix4(child.matrixWorld).sub(center).multiplyScalar(scale));
    }
  });

  if (!points.length) return [{ center: new THREE.Vector3(), radius: 1 }];
  // More, tighter spheres follow the silhouette considerably better than a
  // handful of large spheres. Large spheres made the heads collide while a
  // visible gap was still present.
  const clusterCount = Math.min(12, points.length);
  const centers = [points[0].clone()];
  while (centers.length < clusterCount) {
    let bestPoint = points[0];
    let bestDistance = -1;
    for (const point of points) {
      const nearest = Math.min(...centers.map((candidate) => point.distanceToSquared(candidate)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestPoint = point;
      }
    }
    centers.push(bestPoint.clone());
  }

  const assignments = new Array<number>(points.length).fill(0);
  for (let pass = 0; pass < 7; pass++) {
    const sums = centers.map(() => new THREE.Vector3());
    const counts = centers.map(() => 0);
    points.forEach((point, pointIndex) => {
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      centers.forEach((candidate, candidateIndex) => {
        const distance = point.distanceToSquared(candidate);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = candidateIndex;
        }
      });
      assignments[pointIndex] = nearestIndex;
      sums[nearestIndex].add(point);
      counts[nearestIndex]++;
    });
    centers.forEach((candidate, index) => {
      if (counts[index]) candidate.copy(sums[index]).multiplyScalar(1 / counts[index]);
    });
  }

  return centers.map((clusterCenter, clusterIndex) => {
    const distances = points
      .filter((_, pointIndex) => assignments[pointIndex] === clusterIndex)
      .map((point) => point.distanceTo(clusterCenter))
      .sort((a, b) => a - b);
    const radius = distances[Math.min(distances.length - 1, Math.floor(distances.length * .88))] ?? .1;
    return { center: clusterCenter, radius: Math.max(.06, radius * .9) };
  });
}

export function PhysicsHero() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x181915);
    scene.fog = new THREE.FogExp2(0x181915, .035);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(0, 0, 17);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
    camera.updateProjectionMatrix();

    scene.add(new THREE.HemisphereLight(0xdde5ff, 0x050508, .72));
    const key = new THREE.DirectionalLight(0xffffff, 5.4);
    key.position.set(-5, 7, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 38;
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -.00025;
    key.shadow.normalBias = .035;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c4ff, 1.15);
    fill.position.set(7, -3, 5);
    scene.add(fill);
    const rim = new THREE.PointLight(0x274eff, 19, 28);
    rim.position.set(7, -2, 6);
    scene.add(rim);

    // The HDR contributes image-based lighting only. Keeping scene.background
    // as the solid dark colour makes the studio itself invisible.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let environmentMap: THREE.Texture | null = null;
    new RGBELoader().load('/monochrome_studio_04_1k.hdr', (hdr) => {
      if (disposed) {
        hdr.dispose();
        return;
      }
      environmentMap = pmremGenerator.fromEquirectangular(hdr).texture;
      scene.environment = environmentMap;
      scene.environmentIntensity = .58;
      hdr.dispose();
      pmremGenerator.dispose();
    }, undefined, (error) => {
      console.error('Failed to load studio HDR', error);
    });

    const bodies: Body[] = [];
    let disposed = false;
    let headInstances: THREE.InstancedMesh | null = null;
    const instanceBaseMatrix = new THREE.Matrix4();
    const instanceWorldMatrix = new THREE.Matrix4();

    new GLTFLoader().load(modelUrl, (gltf) => {
      if (disposed) return;

      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const center = sphere.center.clone();
      // Large instances eventually form a wide, shallow pile, while their
      // initial positions begin outside that pile for a calmer entrance.
      const normalizedRadius = 2.75;
      const visualRadius = normalizedRadius * 1.14;
      const normalization = visualRadius / Math.max(sphere.radius, .001);
      const compoundCollider = buildCompoundCollider(gltf.scene, center, normalization);

      let sourceMesh: THREE.Mesh | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((child) => {
        if (!sourceMesh && child instanceof THREE.Mesh) sourceMesh = child;
      });
      if (!sourceMesh) {
        console.error('Head.glb does not contain a renderable mesh');
        return;
      }

      const sourceMaterials = Array.isArray(sourceMesh.material)
        ? sourceMesh.material
        : [sourceMesh.material];
      sourceMaterials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          // Glossy coated-plastic response: a controlled highlight rather than
          // a mirror, with enough metalness to enrich the HDR reflections.
          material.roughness = .24;
          material.metalness = .16;
          material.envMapIntensity = 1.2;
          material.needsUpdate = true;
        }
      });

      const instanceCount = 18;
      headInstances = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, instanceCount);
      headInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      headInstances.frustumCulled = false;
      headInstances.castShadow = true;
      headInstances.receiveShadow = true;
      scene.add(headInstances);

      const centeredModelMatrix = new THREE.Matrix4().compose(
        center.clone().multiplyScalar(-normalization),
        new THREE.Quaternion(),
        new THREE.Vector3(normalization, normalization, normalization),
      );
      instanceBaseMatrix.multiplyMatrices(centeredModelMatrix, sourceMesh.matrixWorld);

      for (let i = 0; i < instanceCount; i++) {
        const group = new THREE.Group();
        const instanceScale = .9 + Math.random() * .28;
        group.scale.setScalar(instanceScale);
        const initialHalfWidth = Math.max(3.2, 5.1 * camera.aspect);
        const angle = i * 2.39996323 + (Math.random() - .5) * .12;
        // Three staggered perimeter lanes keep neighbouring large heads from
        // spawning on top of one another while preserving an all-sides entry.
        const entryScale = .92 + (i % 3) * .28 + Math.random() * .08;
        const entryHalfWidth = Math.max(8.2, initialHalfWidth * 1.02);
        const entryHalfHeight = 5.15;
        group.position.set(
          Math.cos(angle) * entryHalfWidth * entryScale,
          Math.sin(angle) * entryHalfHeight * entryScale,
          (Math.random() - .5) * 2.2,
        );
        group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(group);
        bodies.push({
          group,
          velocity: new THREE.Vector3(),
          spin: new THREE.Vector3(),
          radius: visualRadius * instanceScale,
          localColliders: compoundCollider,
          colliders: compoundCollider.map(() => ({ center: new THREE.Vector3(), radius: 0 })),
          contact: 0,
          kick: 0,
        });
      }

      bodies.forEach((body) => {
        // Enter from the surrounding frame with a small tangential component,
        // so the models do not spawn interpenetrating at the centre.
        const inward = body.group.position.clone().multiplyScalar(-1);
        inward.z *= 1.5;
        inward.normalize().multiplyScalar(.014 + Math.random() * .009);
        const tangent = new THREE.Vector3(-inward.y, inward.x, 0)
          .normalize()
          .multiplyScalar((Math.random() - .5) * .006);
        body.velocity.copy(inward).add(tangent);
        body.spin.set(
          (Math.random() - .5) * .006,
          (Math.random() - .5) * .006,
          (Math.random() - .5) * .006,
        );
      });
    }, undefined, (error) => {
      console.error('Failed to load Head.glb', error);
    });

    const pointer = new THREE.Vector2(9, 9);
    const pointerWorld = new THREE.Vector3(99, 99, 0);
    const nextPointerWorld = new THREE.Vector3();
    const pointerVelocity = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    let pointerSpeed = 0;
    let pointerInside = false;
    let hasPointerSample = false;
    let visible = true;

    const projectPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      if (!raycaster.ray.intersectPlane(plane, nextPointerWorld)) return;
      if (hasPointerSample) {
        pointerVelocity.copy(nextPointerWorld).sub(pointerWorld);
        pointerSpeed = Math.min(2, pointerVelocity.length());
      } else {
        pointerVelocity.set(0, 0, 0);
        pointerSpeed = 0;
        hasPointerSample = true;
      }
      pointerWorld.copy(nextPointerWorld);
    };

    const onMove = (event: PointerEvent) => {
      pointerInside = true;
      projectPointer(event);
    };
    const onPointerDown = (event: PointerEvent) => {
      projectPointer(event);
      const shuffled = [...bodies];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.slice(0, 6).forEach((body) => {
        // A click directly excites rotation on six random bodies. Translation
        // is then created naturally when their rotating compound colliders hit
        // neighbours, producing the requested chain reaction.
        const angularImpulse = new THREE.Vector3(
          Math.random() - .5,
          Math.random() - .5,
          Math.random() - .5,
        ).normalize().multiplyScalar(.015 + Math.random() * .008);
        body.spin.add(angularImpulse);
        if (body.spin.length() > .026) body.spin.setLength(.026);
        body.kick = 1;
      });
    };
    const onLeave = () => {
      pointerInside = false;
      hasPointerSample = false;
      pointerSpeed = 0;
      pointerVelocity.set(0, 0, 0);
      pointerWorld.set(99, 99, 0);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibilityObserver.observe(mount);

    const updateColliders = (body: Body) => {
      body.group.updateMatrixWorld(true);
      const worldScale = body.group.scale.x;
      body.localColliders.forEach((local, index) => {
        body.colliders[index].center.copy(local.center).applyMatrix4(body.group.matrixWorld);
        body.colliders[index].radius = local.radius * worldScale;
      });
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible) return;
      const pointerMoving = pointerInside && pointerSpeed > .012;

      bodies.forEach((body) => {
        const p = body.group.position;
        body.contact *= .9;
        body.kick *= .72;
        const pointerDelta = new THREE.Vector3(
          p.x - pointerWorld.x,
          p.y - pointerWorld.y,
          p.z * .12,
        );
        const pointerDistance = Math.hypot(pointerDelta.x, pointerDelta.y);
        const interactionRadius = body.radius * .78 + 1.05;
        if (pointerMoving && pointerDistance < interactionRadius) {
          const falloff = 1 - pointerDistance / interactionRadius;
          // Clamp event spikes first: a fast OS pointer event should feel like
          // a firm swipe, not an explosion that clears the entire scene.
          const cappedPointerVelocity = pointerVelocity.clone();
          if (cappedPointerVelocity.length() > .9) cappedPointerVelocity.setLength(.9);
          const sweepImpulse = cappedPointerVelocity.multiplyScalar(.14 * falloff);
          const radialImpulse = pointerDelta.clone().normalize().multiplyScalar(.018 * Math.min(pointerSpeed, .9) * falloff);
          const kickImpulse = sweepImpulse.clone().add(radialImpulse);
          body.velocity.add(kickImpulse);
          if (body.velocity.length() > .19) body.velocity.setLength(.19);

          // Apply the swipe at the cursor contact point. The cross product
          // creates a screen-plane tumble, while the smaller rolling terms
          // make a horizontal swipe visibly turn the head as it travels.
          const hitLever = pointerWorld.clone().sub(p);
          hitLever.z = 0;
          const pointerTorque = hitLever.cross(kickImpulse);
          body.spin.addScaledVector(pointerTorque, .028);
          body.spin.z -= sweepImpulse.x * .038;
          body.spin.y -= sweepImpulse.x * .018;
          body.spin.x += sweepImpulse.y * .018;
          body.kick = Math.max(body.kick, falloff);
        }
        // A soft ellipsoidal enclosure returns kicked bodies to the pile, but
        // applies no force inside it. Unlike individual anchor springs this
        // cannot pull two touching models back through one another.
        const pileDistance = Math.hypot(p.x / 5.45, p.y / 2.35, p.z / 1.9);
        if (pileDistance > 1) {
          const outside = Math.min(2.5, pileDistance - 1);
          const pullDirection = new THREE.Vector3(
            -p.x / 5.45,
            -p.y / 2.35,
            -p.z / 1.45,
          ).normalize();
          body.velocity.addScaledVector(pullDirection, .0015 * outside);
        }
        body.velocity.multiplyScalar(.975);
        body.spin.multiplyScalar(.992);
        if (body.spin.length() > .026) body.spin.setLength(.026);
        p.add(body.velocity);
        body.group.rotation.x += body.spin.x;
        body.group.rotation.y += body.spin.y;
        body.group.rotation.z += body.spin.z;

        updateColliders(body);
      });

      // A few low-correction sequential passes transfer momentum through the
      // pile more reliably than one aggressive pass, without contact buzz.
      for (let solverPass = 0; solverPass < 3; solverPass++) {
        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          if (a.group.position.distanceToSquared(b.group.position) > (a.radius + b.radius) ** 2) continue;
          let overlap = 0;
          let contactWeight = 0;
          const normal = new THREE.Vector3();
          const contactPoint = new THREE.Vector3();
          for (const colliderA of a.colliders) {
            for (const colliderB of b.colliders) {
              const delta = colliderB.center.clone().sub(colliderA.center);
              const distance = delta.length();
              const penetration = colliderA.radius + colliderB.radius - distance;
              if (penetration > .008 && distance > 1e-5) {
                overlap = Math.max(overlap, penetration);
                const weight = penetration * penetration;
                normal.addScaledVector(delta, weight / distance);
                contactPoint.addScaledVector(
                  colliderA.center.clone().add(colliderB.center).multiplyScalar(.5),
                  weight,
                );
                contactWeight += weight;
              }
            }
          }
          if (overlap <= .008 || contactWeight <= 0) continue;
          if (normal.lengthSq() < 1e-8) normal.copy(b.group.position).sub(a.group.position);
          normal.normalize();
          contactPoint.multiplyScalar(1 / contactWeight);
          a.contact = 1;
          b.contact = 1;
          const collisionActivity = Math.max(a.kick, b.kick);
          a.kick = Math.max(a.kick, b.kick * .55);
          b.kick = Math.max(b.kick, a.kick * .55);
          {
            const correction = Math.min(
              .035,
              Math.max(0, overlap - .012) * .18,
            );
            a.group.position.addScaledVector(normal, -correction);
            b.group.position.addScaledVector(normal, correction);
            a.colliders.forEach((collider) => collider.center.addScaledVector(normal, -correction));
            b.colliders.forEach((collider) => collider.center.addScaledVector(normal, correction));
            const leverA = contactPoint.clone().sub(a.group.position);
            const leverB = contactPoint.clone().sub(b.group.position);
            const velocityAtA = a.velocity.clone().add(a.spin.clone().cross(leverA));
            const velocityAtB = b.velocity.clone().add(b.spin.clone().cross(leverB));
            const relative = velocityAtB.sub(velocityAtA).dot(normal);
            if (relative < 0) {
              const restitution = THREE.MathUtils.lerp(.12, .28, collisionActivity);
              const impulseStrength = Math.min(.2, -(1 + restitution) * relative * .5);
              a.velocity.addScaledVector(normal, -impulseStrength);
              b.velocity.addScaledVector(normal, impulseStrength);

              // Apply the collision impulse at the actual compound-collider
              // contact point. Off-centre impacts now rotate both models and
              // propagate a much more convincing rigid-body response.
              const impulseVector = normal.clone().multiplyScalar(impulseStrength);
              a.spin.add(leverA.cross(impulseVector.clone().negate()).multiplyScalar(.009));
              b.spin.add(leverB.cross(impulseVector).multiplyScalar(.009));
              if (a.spin.length() > .026) a.spin.setLength(.026);
              if (b.spin.length() > .026) b.spin.setLength(.026);

              // A small tangential impulse prevents endless sliding without
              // destroying the visible transfer of momentum through the pile.
              const relativeVelocity = b.velocity.clone().sub(a.velocity);
              const tangent = relativeVelocity.addScaledVector(normal, -relativeVelocity.dot(normal));
              if (tangent.lengthSq() > 1e-8) {
                tangent.normalize();
                const friction = Math.min(impulseStrength * .1, relativeVelocity.length() * .08);
                a.velocity.addScaledVector(tangent, friction);
                b.velocity.addScaledVector(tangent, -friction);
              }
            }
          }
          }
        }
      }
      bodies.forEach((body) => {
        if (body.velocity.lengthSq() < 1e-8) body.velocity.set(0, 0, 0);
      });
      if (headInstances) {
        bodies.forEach((body, index) => {
          body.group.updateMatrixWorld(true);
          instanceWorldMatrix.multiplyMatrices(body.group.matrixWorld, instanceBaseMatrix);
          headInstances!.setMatrixAt(index, instanceWorldMatrix);
        });
        headInstances.instanceMatrix.needsUpdate = true;
      }
      pointerVelocity.multiplyScalar(.58);
      pointerSpeed *= .58;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      environmentMap?.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="physics-hero" aria-label="Interactive 3D scene with textured head models. Move the pointer across the scene to push them." />;
}
