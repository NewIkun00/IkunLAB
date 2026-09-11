'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type LiquidParams = {
  fillA: string; fillB: string; edgeR: string; edgeG: string; edgeB: string;
  fillOpacity: number; edgeOpacity: number; dispersion: number; blur: number;
  refractionStrength: number; refractionOpacity: number; backgroundFilmOpacity: number;
  distortionMultiplier: number; smearLength: number; colorStrength: number; shadeStrength: number; noiseJitter: number;
  pearl: number; edgeMix: number; densityThreshold: number; speedThreshold: number;
  velocityDissipation: number; densityDissipation: number; edgeDissipation: number;
  pushStrength: number; inertia: number; vorticity: number; vorticityScale: number;
  minRadius: number; maxRadius: number; radiusSensitivity: number;
};

const DEFAULT_PARAMS: LiquidParams = {
  fillA: '#287fff', fillB: '#ff3892', edgeR: '#ff315f', edgeG: '#66ffe3', edgeB: '#385cff',
  fillOpacity: 0, edgeOpacity: 0.8, dispersion: 0.86, blur: 1.2,
  refractionStrength: 1.575, refractionOpacity: 1, backgroundFilmOpacity: 0.85,
  distortionMultiplier: 4.2, smearLength: 1.8, colorStrength: 8, shadeStrength: 1.1, noiseJitter: 1,
  pearl: 0, edgeMix: 0, densityThreshold: 0, speedThreshold: 0,
  velocityDissipation: 0.72, densityDissipation: 0.895, edgeDissipation: 0.865,
  pushStrength: 18, inertia: 0.8, vorticity: 1.6, vorticityScale: 0.02,
  minRadius: 16, maxRadius: 155, radiusSensitivity: 76,
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const paintShader = `
  precision highp float;
  uniform sampler2D uPrevious;
  uniform vec2 uTexel;
  uniform vec4 uFrom;
  uniform vec4 uTo;
  uniform vec2 uVelocity;
  uniform float uPush;
  uniform float uVorticity;
  uniform float uVorticityScale;
  uniform vec3 uDissipation;
  varying vec2 vUv;

  vec2 segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
  }

  vec3 noiseDerivatives(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    vec2 ga = hash22(i);
    vec2 gb = hash22(i + vec2(1.0, 0.0));
    vec2 gc = hash22(i + vec2(0.0, 1.0));
    vec2 gd = hash22(i + vec2(1.0, 1.0));
    float va = dot(ga, f);
    float vb = dot(gb, f - vec2(1.0, 0.0));
    float vc = dot(gc, f - vec2(0.0, 1.0));
    float vd = dot(gd, f - vec2(1.0, 1.0));
    float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
    vec2 derivative = ga + u.x * (gb - ga) + u.y * (gc - ga)
      + u.x * u.y * (ga - gb - gc + gd)
      + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);
    return vec3(value, derivative);
  }

  void main() {
    vec2 hit = segmentDistance(gl_FragCoord.xy, uFrom.xy, uTo.xy);
    vec2 radiusWeight = mix(uFrom.zw, uTo.zw, hit.y);
    float brush = 1.0 - smoothstep(radiusWeight.x * 0.2, radiusWeight.x, hit.x);

    vec4 low = (
      texture2D(uPrevious, vUv) * 4.0
      + texture2D(uPrevious, vUv + vec2(uTexel.x * 4.0, 0.0))
      + texture2D(uPrevious, vUv - vec2(uTexel.x * 4.0, 0.0))
      + texture2D(uPrevious, vUv + vec2(0.0, uTexel.y * 4.0))
      + texture2D(uPrevious, vUv - vec2(0.0, uTexel.y * 4.0))
    ) / 8.0;
    vec2 inverseVelocity = (0.5 - low.xy) * uPush;
    vec3 broadNoise = noiseDerivatives(gl_FragCoord.xy * uVorticityScale * (1.0 - low.xy));
    vec2 curl = noiseDerivatives(
      gl_FragCoord.xy * uVorticityScale * (2.0 - low.xy * (0.5 + broadNoise.x) + broadNoise.yz * 0.1)
    ).yz;
    inverseVelocity += curl * (low.z + low.w) * uVorticity;
    vec4 data = texture2D(uPrevious, vUv + inverseVelocity * uTexel);
    data.xy -= 0.5;

    vec4 delta = (uDissipation.xxyz - 1.0) * data;
    delta += vec4(uVelocity * brush, radiusWeight.yy * brush);
    data += delta;
    // Lightly diffuse only the density channels so the pointer velocity stays
    // responsive while the visible film remains one broad, coherent surface.
    data.zw = mix(data.zw, low.zw, 0.06);
    // Collapse the low-density tail quickly so the sampled scene snaps back
    // cleanly instead of leaving a faint blurred or displaced afterimage.
    data.zw *= smoothstep(vec2(0.006), vec2(0.035), data.zw);
    data.xy += 0.5;
    gl_FragColor = clamp(data, 0.0, 1.0);
  }
`;

const glassShader = `
  precision highp float;
  uniform sampler2D uPaint;
  uniform sampler2D uHero;
  uniform sampler2D uBackdrop;
  uniform float uHeroReady;
  uniform vec4 uHeroRect;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uFillA;
  uniform vec3 uFillB;
  uniform vec3 uEdgeR;
  uniform vec3 uEdgeG;
  uniform vec3 uEdgeB;
  uniform float uFillOpacity;
  uniform float uEdgeOpacity;
  uniform float uDispersion;
  uniform float uPearl;
  uniform float uEdgeMix;
  uniform float uDensityThreshold;
  uniform float uSpeedThreshold;
  uniform float uRefractionStrength;
  uniform float uRefractionOpacity;
  uniform float uBackgroundFilmOpacity;
  uniform float uDistortionMultiplier;
  uniform float uSmearLength;
  uniform float uColorStrength;
  uniform float uShadeStrength;
  uniform float uNoiseJitter;
  uniform float uBlur;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float smoothNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), f.x),
      f.y
    );
  }

  // Smooth the simulation's height before deriving a surface normal. Sampling
  // over several simulation pixels avoids a hard, stair-stepped outline.
  float filmHeight(vec2 uv) {
    vec2 d = vec2(6.0) / uResolution;
    vec4 h = texture2D(uPaint, uv) * 4.0;
    h += texture2D(uPaint, uv + vec2(d.x, 0.0));
    h += texture2D(uPaint, uv - vec2(d.x, 0.0));
    h += texture2D(uPaint, uv + vec2(0.0, d.y));
    h += texture2D(uPaint, uv - vec2(0.0, d.y));
    h += texture2D(uPaint, uv + d) * 0.5;
    h += texture2D(uPaint, uv - d) * 0.5;
    h += texture2D(uPaint, uv + vec2(d.x, -d.y)) * 0.5;
    h += texture2D(uPaint, uv + vec2(-d.x, d.y)) * 0.5;
    return (h.z + h.w) / 20.0;
  }

  float roundedHeroMask(vec2 uv) {
    vec2 sizePx = uHeroRect.zw * uResolution;
    vec2 p = (uv - 0.5) * sizePx;
    float radius = min(15.0, min(sizePx.x, sizePx.y) * 0.5);
    vec2 q = abs(p) - sizePx * 0.5 + radius;
    float distanceToEdge = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
    float inBounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    return inBounds * (1.0 - smoothstep(-1.5, 1.5, distanceToEdge));
  }

  vec3 sampleLowerLayer(vec2 screenUv) {
    vec2 safeScreenUv = clamp(screenUv, 0.001, 0.999);
    vec3 backdrop = texture2D(uBackdrop, safeScreenUv).rgb;
    vec2 heroUv = (safeScreenUv - uHeroRect.xy) / max(uHeroRect.zw, vec2(0.001));
    float heroMask = roundedHeroMask(heroUv) * uHeroReady;
    vec3 hero = texture2D(uHero, clamp(heroUv, 0.001, 0.999)).rgb;
    return mix(backdrop, hero, heroMask);
  }

  void main() {
    vec4 paint = texture2D(uPaint, vUv);
    float weight = (paint.z + paint.w) * 0.5;
    vec2 velocity = (0.5 - paint.xy - 0.001) * 2.0 * weight;
    float speed = max(abs(velocity.x), abs(velocity.y));
    float densityEnvelope = smoothstep(uDensityThreshold, uDensityThreshold + 0.12, weight);
    float motionEnvelope = smoothstep(uSpeedThreshold, uSpeedThreshold + 0.025, speed);
    float activity = densityEnvelope * motionEnvelope;
    // Thin-film reflections depend on surface slope, not pointer velocity.
    // Flat interiors have no coating; only bends and folds catch colored light.
    vec2 normalStep = vec2(10.0) / uResolution;
    float height = filmHeight(vUv);
    vec2 slope = vec2(
      filmHeight(vUv + vec2(normalStep.x, 0.0)) - filmHeight(vUv - vec2(normalStep.x, 0.0)),
      filmHeight(vUv + vec2(0.0, normalStep.y)) - filmHeight(vUv - vec2(0.0, normalStep.y))
    );
    float bend = smoothstep(0.015, 0.20, length(slope));
    // The thinning tail erodes at different rates across broad, stable noise
    // islands. This only affects the fade-out edge, keeping a fresh stroke
    // smooth while preventing the whole outline from disappearing uniformly.
    float dissolveA = smoothNoise(vUv * uResolution * 0.010
      + vec2(uTime * 0.018, -uTime * 0.012));
    float dissolveB = smoothNoise(vUv * uResolution * 0.023
      + vec2(-uTime * 0.011, uTime * 0.016));
    float dissolveNoise = mix(dissolveA, dissolveB, 0.34);
    float dissolveFloor = mix(0.016, 0.047, dissolveNoise);
    float filmPresence = smoothstep(dissolveFloor, 0.13, height);
    vec3 normal = normalize(vec3(-slope * 4.0, 1.0));
    // Two broad moving fields continuously rotate the spectral phase. The
    // edge therefore changes hue order along its length instead of repeating
    // the same yellow-green-blue-purple stack around every stroke.
    float colorFlowA = smoothNoise(vUv * uResolution * 0.006
      + vec2(uTime * 0.052, -uTime * 0.034));
    float colorFlowB = smoothNoise(vUv * uResolution * 0.017
      + vec2(-uTime * 0.029, uTime * 0.043));
    float spectralFlow = (colorFlowA - 0.5) * 6.28318
      + (colorFlowB - 0.5) * 3.2 + uTime * 0.20;
    float phase = height * 10.0 + dot(normal.xy, vec2(2.4, -1.8))
      + spectralFlow;
    vec3 spectrum = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.094, 4.189));
    vec3 filmTint = mix(vec3(1.0), spectrum, 0.66);
    float glint = pow(max(dot(normal, normalize(vec3(-0.55, 0.65, 0.65))), 0.0), 18.0);
    float filmReflection = bend * filmPresence * uBackgroundFilmOpacity * 0.8;

    // A single continuous refracted position, rather than spaced copies along
    // the entire stroke. Both sides of the hero sample the same lower layer.
    // Directional displacement follows live motion only. As the pointer slows,
    // it settles before the film opacity fades, so no displaced ghost remains.
    vec2 tracePx = velocity * uRefractionStrength * uDistortionMultiplier
      * uSmearLength * 6.0 * activity;
    tracePx *= 78.0 / max(78.0, length(tracePx));
    vec2 lensPx = normal.xy * (12.0 + height * 18.0);
    // Keep directional smearing at the boundary, but settle it rapidly inside
    // the hero. This preserves the cross-surface paint gesture without making
    // the refracted 3D scene appear horizontally misregistered.
    vec2 baseHeroUv = (vUv - uHeroRect.xy) / max(uHeroRect.zw, vec2(0.001));
    vec2 heroSizePx = uHeroRect.zw * uResolution;
    float heroEdgeDistancePx = min(
      min(baseHeroUv.x, 1.0 - baseHeroUv.x) * heroSizePx.x,
      min(baseHeroUv.y, 1.0 - baseHeroUv.y) * heroSizePx.y
    );
    float baseHeroMask = roundedHeroMask(baseHeroUv) * uHeroReady;
    float heroInterior = baseHeroMask * smoothstep(8.0, 46.0, heroEdgeDistancePx);
    float directionalSmear = mix(0.55, 0.08, heroInterior);
    vec2 refractedUv = vUv + (tracePx * directionalSmear + lensPx)
      * filmPresence / uResolution;
    // Low-frequency variation makes the thin-film band widen organically
    // without turning its outline into high-frequency noise.
    float edgeNoise = smoothNoise(vUv * uResolution * 0.012
      + vec2(uTime * 0.045, -uTime * 0.025));
    float fadingEdge = 1.0 - smoothstep(0.055, 0.18, height);
    float edgeVariation = mix(0.90, 1.28, edgeNoise)
      * mix(1.0, mix(0.76, 1.46, dissolveNoise), fadingEdge);
    vec2 chromaticOffset = normal.xy * bend * (1.8 + uDispersion * 6.5)
      * edgeVariation / uResolution;
    float channelPhase = spectralFlow + edgeNoise * 3.14159;
    vec2 redOffset = chromaticOffset * (0.45 + 0.85 * sin(channelPhase));
    vec2 greenOffset = chromaticOffset * (0.45 + 0.85 * sin(channelPhase + 2.094));
    vec2 blueOffset = chromaticOffset * (0.45 + 0.85 * sin(channelPhase + 4.189));
    float blurRadius = (1.6 + uBlur * 3.6 + bend) * filmPresence;
    // While the pointer is moving, samples may cross the boundary to create
    // the requested two-way paint exchange. Once motion settles, the edge
    // blends back to the original hero instead of stretching one clamped pixel
    // column into a visibly duplicated dark layer.
    float boundaryExchange = smoothstep(0.10, 0.48, activity);
    float stationaryHeroEdge = baseHeroMask * (1.0 - boundaryExchange)
      * (1.0 - smoothstep(2.0, 34.0, heroEdgeDistancePx));
    vec3 smeared = vec3(0.0);
    float totalWeight = 0.0;
    // Closely spaced disk samples soften the warped image without creating
    // a row of recognizable silhouettes. The pattern is stable across frames.
    for (int i = 0; i < 16; i++) {
      float t = (float(i) + 0.5) / 16.0;
      float angleSample = float(i) * 2.39996323;
      vec2 disk = vec2(cos(angleSample), sin(angleSample)) * sqrt(t);
      float sampleWeight = exp(-2.0 * t);
      vec2 sampleUv = refractedUv + disk * blurRadius / uResolution;
      vec3 dispersed = vec3(
        sampleLowerLayer(sampleUv + redOffset).r,
        sampleLowerLayer(sampleUv + greenOffset).g,
        sampleLowerLayer(sampleUv + blueOffset).b
      );
      smeared += dispersed * sampleWeight;
      totalWeight += sampleWeight;
    }
    smeared /= totalWeight;
    smeared = mix(smeared, sampleLowerLayer(vUv), stationaryHeroEdge);

    float angle = atan(velocity.y, velocity.x) / 6.28318 + 0.5;
    vec3 optionalFilm = mix(uFillA, uFillB, angle);
    optionalFilm = mix(optionalFilm, vec3(1.0), uPearl);
    vec3 original = sampleLowerLayer(vUv);
    vec3 refracted = smeared;
    // Tint follows the sampled scene's luminance. A dark surface cannot
    // acquire a white coating; bright content carried across the boundary can.
    float surfaceLuma = dot(refracted, vec3(0.2126, 0.7152, 0.0722));
    float lightSurface = smoothstep(0.35, 0.85, surfaceLuma);
    float tintLuma = dot(filmTint, vec3(0.2126, 0.7152, 0.0722));
    vec3 sceneTint = filmTint * surfaceLuma / max(tintLuma, 0.001);
    vec3 reflectionTint = mix(sceneTint, filmTint, lightSurface);
    refracted = mix(refracted, reflectionTint, filmReflection * 0.44);
    refracted = mix(refracted, vec3(1.0),
      filmReflection * (0.025 + glint * 0.10) * lightSurface);
    vec3 color = mix(original, refracted, uRefractionOpacity);
    color = mix(color, optionalFilm, uFillOpacity);
    float effectAlpha = clamp(filmPresence
      * max(uRefractionOpacity, uFillOpacity), 0.0, 1.0);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), effectAlpha);
    #include <colorspace_fragment>
  }
`;

const excluded = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('.project-card, .project-detail');

export function RippleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // CSS width excludes a classic scrollbar; innerWidth does not. All
    // screen-space data must use the actual displayed overlay rectangle.
    let viewport = canvas.getBoundingClientRect();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.Camera();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const paintScene = new THREE.Scene();
    const outputScene = new THREE.Scene();
    const backdropCanvas = document.createElement('canvas');
    const backdropContext = backdropCanvas.getContext('2d');
    const backdropTexture = new THREE.CanvasTexture(backdropCanvas);
    backdropTexture.colorSpace = THREE.SRGBColorSpace;
    backdropTexture.minFilter = THREE.LinearFilter;
    backdropTexture.magFilter = THREE.LinearFilter;
    backdropTexture.generateMipmaps = false;

    const refreshBackdrop = () => {
      if (!backdropContext) return;
      backdropCanvas.width = 2;
      backdropCanvas.height = Math.max(1, Math.ceil(viewport.height));
      backdropContext.fillStyle = getComputedStyle(document.body).backgroundColor;
      backdropContext.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);
      document.querySelectorAll<HTMLElement>('section, footer').forEach((element) => {
        const color = getComputedStyle(element).backgroundColor;
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return;
        const rect = element.getBoundingClientRect();
        const top = Math.max(0, Math.floor(rect.top - viewport.top));
        const bottom = Math.min(viewport.height, Math.ceil(rect.bottom - viewport.top));
        if (bottom <= top) return;
        backdropContext.fillStyle = color;
        backdropContext.fillRect(0, top, backdropCanvas.width, bottom - top);
      });
      backdropTexture.needsUpdate = true;
    };

    const paintMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: paintShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrevious: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uFrom: { value: new THREE.Vector4(-1000, -1000, 0, 0) },
        uTo: { value: new THREE.Vector4(-1000, -1000, 0, 0) },
        uVelocity: { value: new THREE.Vector2() },
        uPush: { value: DEFAULT_PARAMS.pushStrength },
        uVorticity: { value: DEFAULT_PARAMS.vorticity },
        uVorticityScale: { value: DEFAULT_PARAMS.vorticityScale },
        uDissipation: { value: new THREE.Vector3(0.975, 0.95, 0.8) },
      },
    });
    paintScene.add(new THREE.Mesh(geometry, paintMaterial));

    const glassMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: glassShader,
      transparent: true,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPaint: { value: null },
        uHero: { value: null },
        uBackdrop: { value: backdropTexture },
        uHeroReady: { value: 0 },
        uHeroRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFillA: { value: new THREE.Color(DEFAULT_PARAMS.fillA) },
        uFillB: { value: new THREE.Color(DEFAULT_PARAMS.fillB) },
        uEdgeR: { value: new THREE.Color(DEFAULT_PARAMS.edgeR) },
        uEdgeG: { value: new THREE.Color(DEFAULT_PARAMS.edgeG) },
        uEdgeB: { value: new THREE.Color(DEFAULT_PARAMS.edgeB) },
        uFillOpacity: { value: DEFAULT_PARAMS.fillOpacity },
        uEdgeOpacity: { value: DEFAULT_PARAMS.edgeOpacity },
        uDispersion: { value: DEFAULT_PARAMS.dispersion },
        uPearl: { value: DEFAULT_PARAMS.pearl },
        uEdgeMix: { value: DEFAULT_PARAMS.edgeMix },
        uDensityThreshold: { value: DEFAULT_PARAMS.densityThreshold },
        uSpeedThreshold: { value: DEFAULT_PARAMS.speedThreshold },
        uRefractionStrength: { value: DEFAULT_PARAMS.refractionStrength },
        uRefractionOpacity: { value: DEFAULT_PARAMS.refractionOpacity },
        uBackgroundFilmOpacity: { value: DEFAULT_PARAMS.backgroundFilmOpacity },
        uDistortionMultiplier: { value: DEFAULT_PARAMS.distortionMultiplier },
        uSmearLength: { value: DEFAULT_PARAMS.smearLength },
        uColorStrength: { value: DEFAULT_PARAMS.colorStrength },
        uShadeStrength: { value: DEFAULT_PARAMS.shadeStrength },
        uNoiseJitter: { value: DEFAULT_PARAMS.noiseJitter },
        uBlur: { value: DEFAULT_PARAMS.blur },
      },
    });
    outputScene.add(new THREE.Mesh(geometry, glassMaterial));

    let targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
    let heroTexture: THREE.CanvasTexture | null = null;
    const pointer = new THREE.Vector2(-1000, -1000);
    const previousPointer = new THREE.Vector2(-1000, -1000);
    const smoothedVelocity = new THREE.Vector2();
    let pointerMoved = false;
    let hasPointer = false;
    let frame = 0;
    let lastTime = performance.now();

    const clearTargets = () => {
      if (!targets) return;
      const oldColor = renderer.getClearColor(new THREE.Color());
      const oldAlpha = renderer.getClearAlpha();
      renderer.setClearColor(new THREE.Color(0.5, 0.5, 0), 0);
      for (const target of targets) {
        renderer.setRenderTarget(target);
        renderer.clear();
      }
      renderer.setRenderTarget(null);
      renderer.setClearColor(oldColor, oldAlpha);
    };

    const resize = () => {
      viewport = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(devicePixelRatio, 1.25);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(viewport.width, viewport.height, false);

      const width = Math.max(1, Math.ceil(viewport.width * 0.25));
      const height = Math.max(1, Math.ceil(viewport.height * 0.25));
      targets?.forEach((target) => target.dispose());
      const options: THREE.RenderTargetOptions = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
      };
      targets = [
        new THREE.WebGLRenderTarget(width, height, options),
        new THREE.WebGLRenderTarget(width, height, options),
      ];
      paintMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
      glassMaterial.uniforms.uResolution.value.set(viewport.width, viewport.height);
      refreshBackdrop();
      clearTargets();
      hasPointer = false;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || excluded(event.target)) {
        hasPointer = false;
        return;
      }
      pointer.set(
        (event.clientX - viewport.left) / viewport.width * targets[0].width,
        (viewport.bottom - event.clientY) / viewport.height * targets[0].height,
      );
      if (!hasPointer) {
        previousPointer.copy(pointer);
        const to = paintMaterial.uniforms.uTo.value as THREE.Vector4;
        to.set(pointer.x, pointer.y, 0, 0);
        hasPointer = true;
      }
      pointerMoved = true;
    };

    const reset = () => {
      hasPointer = false;
      pointerMoved = false;
      smoothedVelocity.set(0, 0);
      refreshBackdrop();
      clearTargets();
    };

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const delta = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const settings = DEFAULT_PARAMS;

      paintMaterial.uniforms.uPush.value = settings.pushStrength;
      paintMaterial.uniforms.uVorticity.value = settings.vorticity;
      paintMaterial.uniforms.uVorticityScale.value = settings.vorticityScale;
      paintMaterial.uniforms.uDissipation.value.set(
        settings.velocityDissipation,
        settings.densityDissipation,
        settings.edgeDissipation,
      );
      glassMaterial.uniforms.uFillA.value.set(settings.fillA);
      glassMaterial.uniforms.uFillB.value.set(settings.fillB);
      glassMaterial.uniforms.uEdgeR.value.set(settings.edgeR);
      glassMaterial.uniforms.uEdgeG.value.set(settings.edgeG);
      glassMaterial.uniforms.uEdgeB.value.set(settings.edgeB);
      glassMaterial.uniforms.uFillOpacity.value = settings.fillOpacity;
      glassMaterial.uniforms.uEdgeOpacity.value = settings.edgeOpacity;
      glassMaterial.uniforms.uDispersion.value = settings.dispersion;
      glassMaterial.uniforms.uPearl.value = settings.pearl;
      glassMaterial.uniforms.uEdgeMix.value = settings.edgeMix;
      glassMaterial.uniforms.uDensityThreshold.value = settings.densityThreshold;
      glassMaterial.uniforms.uSpeedThreshold.value = settings.speedThreshold;
      glassMaterial.uniforms.uRefractionStrength.value = settings.refractionStrength;
      glassMaterial.uniforms.uRefractionOpacity.value = settings.refractionOpacity;
      glassMaterial.uniforms.uBackgroundFilmOpacity.value = settings.backgroundFilmOpacity;
      glassMaterial.uniforms.uDistortionMultiplier.value = settings.distortionMultiplier;
      glassMaterial.uniforms.uSmearLength.value = settings.smearLength;
      glassMaterial.uniforms.uColorStrength.value = settings.colorStrength;
      glassMaterial.uniforms.uShadeStrength.value = settings.shadeStrength;
      glassMaterial.uniforms.uNoiseJitter.value = settings.noiseJitter;
      glassMaterial.uniforms.uBlur.value = settings.blur;

      if (!heroTexture) {
        const source = document.querySelector<HTMLCanvasElement>('.physics-hero canvas');
        if (source) {
          heroTexture = new THREE.CanvasTexture(source);
          heroTexture.colorSpace = THREE.SRGBColorSpace;
          heroTexture.minFilter = THREE.LinearFilter;
          heroTexture.magFilter = THREE.LinearFilter;
          heroTexture.generateMipmaps = false;
          glassMaterial.uniforms.uHero.value = heroTexture;
        }
      }
      if (heroTexture) {
        const source = heroTexture.image as HTMLCanvasElement;
        const rect = source.getBoundingClientRect();
        const visible = rect.bottom > viewport.top && rect.top < viewport.bottom && rect.width > 0 && rect.height > 0;
        glassMaterial.uniforms.uHeroReady.value = visible ? 1 : 0;
        glassMaterial.uniforms.uHeroRect.value.set(
          (rect.left - viewport.left) / viewport.width,
          (viewport.bottom - rect.bottom) / viewport.height,
          rect.width / viewport.width,
          rect.height / viewport.height,
        );
        heroTexture.needsUpdate = visible;
      }

      const distance = pointer.distanceTo(previousPointer) / 0.25;
      const radiusRange = Math.max(0, settings.maxRadius - settings.minRadius);
      const speedRadius = Math.pow(Math.min(1, distance / settings.radiusSensitivity), 0.7);
      const radius = pointerMoved
        ? (settings.minRadius + speedRadius * radiusRange) * 0.25
        : 0;

      const from = paintMaterial.uniforms.uFrom.value as THREE.Vector4;
      const to = paintMaterial.uniforms.uTo.value as THREE.Vector4;
      if (!hasPointer) {
        // Never connect the last valid point to an off-canvas sentinel.
        // That segment was the diagonal streak seen when entering media.
        from.set(-1000, -1000, 0, 0);
        to.copy(from);
        smoothedVelocity.multiplyScalar(settings.inertia * 0.8);
      } else {
        from.copy(to);
        to.set(pointer.x, pointer.y, radius, 1);
      }

      const velocity = new THREE.Vector2(to.x - from.x, to.y - from.y).multiplyScalar(delta * 0.8);
      smoothedVelocity.multiplyScalar(settings.inertia).add(velocity);
      (paintMaterial.uniforms.uVelocity.value as THREE.Vector2).copy(smoothedVelocity);
      paintMaterial.uniforms.uPrevious.value = targets[0].texture;

      renderer.setRenderTarget(targets[1]);
      renderer.render(paintScene, camera);
      const swap = targets[0];
      targets[0] = targets[1];
      targets[1] = swap;

      glassMaterial.uniforms.uPaint.value = targets[0].texture;
      glassMaterial.uniforms.uTime.value = now * 0.001;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(outputScene, camera);

      previousPointer.copy(pointer);
      pointerMoved = false;
    };

    resize();
    // Scrollbar appearance can change the canvas width without a window resize.
    const viewportObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width !== viewport.width || rect.height !== viewport.height) resize();
    });
    viewportObserver.observe(canvas);
    frame = requestAnimationFrame(render);
    addEventListener('resize', resize);
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('scroll', reset, { passive: true });
    addEventListener('blur', reset);

    return () => {
      cancelAnimationFrame(frame);
      viewportObserver.disconnect();
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      removeEventListener('scroll', reset);
      removeEventListener('blur', reset);
      targets?.forEach((target) => target.dispose());
      geometry.dispose();
      paintMaterial.dispose();
      glassMaterial.dispose();
      heroTexture?.dispose();
      backdropTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas
    ref={canvasRef}
    className="ripple-field screen-paint"
    aria-hidden="true"
  />;
}
