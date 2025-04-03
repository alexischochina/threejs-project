<template>
  <div ref="container" class="earth-container">
    <div class="controls">
      <div class="control-group">
        <label for="relief">Relief: {{ Math.round(reliefIntensity * 100) }}%</label>
        <input 
          id="relief" 
          type="range" 
          min="0" 
          max="2" 
          step="0.1" 
          v-model="reliefIntensity"
        />
      </div>
      <div class="control-group">
        <label for="bloom">Bloom: {{ Math.round(bloomIntensity * 100) }}%</label>
        <input 
          id="bloom" 
          type="range" 
          min="0" 
          max="1" 
          step="0.1" 
          v-model="bloomIntensity"
          @input="updateBloomEffect"
        />
      </div>
      <div class="control-group">
        <label for="meteoriteFreq">Fréquence Météorites: {{ Math.round(meteoriteFrequency * 100) }}%</label>
        <input 
          id="meteoriteFreq" 
          type="range" 
          min="0" 
          max="2" 
          step="0.1" 
          v-model="meteoriteFrequency"
        />
      </div>
      <div class="control-group">
        <button @click="togglePause" class="control-button">
          {{ isPaused ? 'Reprendre' : 'Pause' }}
        </button>
        <button @click="createRandomMeteorite" class="control-button">
          Créer Météorite
        </button>
      </div>
      <div class="keyboard-shortcuts">
        <h3>Raccourcis clavier:</h3>
        <ul>
          <li>Espace: Pause/Reprendre</li>
          <li>M: Créer une météorite</li>
          <li>+/-: Intensité Bloom</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';

const container = ref<HTMLElement | null>(null);
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let earth: THREE.Mesh;
let satellite: THREE.Mesh;
let sun: THREE.Mesh;
let controls: OrbitControls;
let animationFrameId: number;
let mainLight: THREE.DirectionalLight;
let satelliteOrbit: THREE.Group;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let composer: EffectComposer;
let sunShaderMaterial: THREE.ShaderMaterial;

const bloomIntensity = ref(0.2);
const meteoriteFrequency = ref(1.0);
const isPaused = ref(false);
const reliefIntensity = ref(0.2);

const sunRotationSpeed = ref(0.0003);
const sunPulseSpeed = ref(0.0005);
const sunPulseIntensity = ref(0.2);
const earthWobbleSpeed = ref(0.0002);
const earthWobbleIntensity = ref(0.05);
const satelliteOrbitSpeed = ref(0.008);
const satelliteRotationSpeed = ref(0.02);

interface MeteoriteData {
  mesh: THREE.Mesh;
  particles: THREE.Points;
  particlesPositions: Float32Array;
  target: THREE.Vector3;
  start: THREE.Vector3;
  startTime: number;
  duration: number;
  impacted: boolean;
  size: number;
}

let meteorites: MeteoriteData[] = [];

function animate() {
  if (!isPaused.value) {
    animationFrameId = requestAnimationFrame(animate);

    const currentTime = Date.now() * 0.001;
    
    if (sun && sun.rotation) {
      sun.rotation.y += sunRotationSpeed.value;
      
      const pulse = Math.sin(currentTime * sunPulseSpeed.value) * sunPulseIntensity.value;
      sun.scale.set(1 + pulse, 1 + pulse, 1 + pulse);
      
      if (sunShaderMaterial && sunShaderMaterial.uniforms) {
        sunShaderMaterial.uniforms.time.value = currentTime;
        sunShaderMaterial.uniforms.pulseIntensity.value = pulse;
      }
    }
    
    if (earth && earth.rotation) {
      earth.rotation.y += 0.0008;
      
      const wobble = Math.sin(currentTime * earthWobbleSpeed.value) * earthWobbleIntensity.value;
      earth.rotation.x = Math.PI * 0.1 + wobble;
    }
    
    if (satelliteOrbit && satelliteOrbit.rotation) {
      satelliteOrbit.rotation.y += satelliteOrbitSpeed.value;
      
      if (satellite) {
        satellite.rotation.x += satelliteRotationSpeed.value;
        satellite.rotation.y += satelliteRotationSpeed.value * 0.5;
      }
    }
    
    updateMeteorites();
    
    if (earth && earth.material) {
      const earthShader = earth.material as THREE.ShaderMaterial;
      if (earthShader.uniforms && mainLight) {
        earthShader.uniforms.lightPosition.value.copy(mainLight.position);
        earthShader.uniforms.lightColor.value.copy(mainLight.color).multiplyScalar(mainLight.intensity);
        earthShader.uniforms.time.value = currentTime;
      }
    }
    
    controls.update();
    composer.render();
  }
}

function init() {
  if (!container.value) return;

  scene = new THREE.Scene();
  
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  const textureLoader = new THREE.TextureLoader();
  
  const nebulaTexture = textureLoader.load('/textures/space/nebula.jpg');
  const galaxyTexture = textureLoader.load('/textures/space/galaxy.jpg');
  
  const skyboxGeometry = new THREE.SphereGeometry(400, 64, 64);
  skyboxGeometry.scale(-1, 1, 1);
  
  const skyboxMaterial = new THREE.MeshBasicMaterial({
    map: nebulaTexture,
    side: THREE.BackSide,
    fog: false,
  });
  
  const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
  skybox.rotation.x = Math.PI * 0.1;
  skybox.rotation.y = Math.PI * 0.25;
  scene.add(skybox);
  
  const innerSkyboxGeometry = new THREE.SphereGeometry(250, 64, 64);
  innerSkyboxGeometry.scale(-1, 1, 1);
  
  const innerSkyboxMaterial = new THREE.MeshBasicMaterial({
    map: galaxyTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.5,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  
  const innerSkybox = new THREE.Mesh(innerSkyboxGeometry, innerSkyboxMaterial);
  innerSkybox.rotation.x = Math.PI * -0.2;
  innerSkybox.rotation.z = Math.PI * 0.15;
  scene.add(innerSkybox);

  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.7,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  const starsVertices = [];
  const starsColors = [];
  
  const starColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xffffdd),
    new THREE.Color(0xddddff),
    new THREE.Color(0xffdddd),
    new THREE.Color(0x9bb0ff),
    new THREE.Color(0xaabfff),
    new THREE.Color(0xffcc6f),
  ];
  
  for (let i = 0; i < 3000; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const radius = 150 + Math.random() * 150
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    starsVertices.push(x, y, z);
    
    const color = starColors[Math.floor(Math.random() * starColors.length)];
    starsColors.push(color.r, color.g, color.b);
  }

  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
  starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));
  
  starsMaterial.vertexColors = true;
  
  const starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);
  
  const farStarsGeometry = new THREE.BufferGeometry();
  const farStarsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    vertexColors: true
  });
  
  const farStarsVertices = [];
  const farStarsColors = [];
  
  for (let i = 0; i < 5000; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const radius = 300 + Math.random() * 50;
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    farStarsVertices.push(x, y, z);
    
    const color = starColors[Math.floor(Math.random() * starColors.length)];
    farStarsColors.push(color.r * 0.8, color.g * 0.8, color.b * 0.8);
  }
  
  farStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(farStarsVertices, 3));
  farStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(farStarsColors, 3));
  
  const farStarField = new THREE.Points(farStarsGeometry, farStarsMaterial);
  scene.add(farStarField);

  camera = new THREE.PerspectiveCamera(
    75,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 7;
  camera.position.y = 2;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.value.clientWidth, container.value.clientHeight),
    0.05,
    0.02,
    0.98
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 3;
  controls.maxDistance = 15;
  controls.update();

  const earthTexture = textureLoader.load('/textures/earth.jpg');
  const earthNormalMap = textureLoader.load('/textures/earth_normal.jpg');
  const earthBumpMap = textureLoader.load('/textures/earth_bump.jpg');
  
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  
  const bumpImage = new Image();
  bumpImage.src = '/textures/earth_bump.jpg';
  bumpImage.onload = () => {
    if (!context) {
      console.error("Impossible d'obtenir le contexte 2D du canvas");
      return;
    }
    
    context.drawImage(bumpImage, 0, 0, canvas.width, canvas.height);
    
    try {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        if (avg > 127) {
          const factor = Math.pow((avg - 127) / 128, 2.0) * 3.0;
          data[i] = Math.min(255, 127 + factor * 128);
          data[i + 1] = Math.min(255, 127 + factor * 128);
          data[i + 2] = Math.min(255, 127 + factor * 128);
        } else {
          const factor = Math.pow(avg / 127, 3.0) * 0.5;
          data[i] = Math.max(0, factor * 127);
          data[i + 1] = Math.max(0, factor * 127);
          data[i + 2] = Math.max(0, factor * 127);
        }
      }
      
      context.putImageData(imageData, 0, 0);
      
      const enhancedBumpMap = new THREE.CanvasTexture(canvas);
      
      const earthGeometry = new THREE.SphereGeometry(2, 192, 192);
      
      const earthShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: earthTexture },
          normalMap: { value: earthNormalMap },
          bumpMap: { value: earthBumpMap },
          normalScale: { value: new THREE.Vector2(2.0, 2.0) },
          bumpScale: { value: 0.6 },
          displacementMap: { value: earthBumpMap },
          displacementScale: { value: 0.04 },
          lightPosition: { value: new THREE.Vector3(30, 0, 0) },
          lightColor: { value: new THREE.Color(0xffffff) },
          ambientColor: { value: new THREE.Color(0x404050) },
          reliefIntensity: { value: 0.2 },
          time: { value: 0.0 },
          pulseIntensity: { value: 0.0 }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying vec3 vWorldPosition;
          
          uniform sampler2D displacementMap;
          uniform float displacementScale;
          uniform float time;
          uniform float pulseIntensity;
          
          void main() {
            vUv = uv;
            
            vec4 displacementColor = texture2D(displacementMap, uv);
            float displacement = displacementColor.r * displacementScale;
            
            float pulse = sin(time * 2.0) * pulseIntensity;
            displacement *= (1.0 + pulse);
            
            vec3 newPosition = position + normal * displacement;
            
            vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
            vWorldPosition = worldPosition.xyz;
            
            vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
            vViewPosition = -mvPosition.xyz;
            
            vNormal = normalize(normalMatrix * normal);
            
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform sampler2D normalMap;
          uniform sampler2D bumpMap;
          uniform vec2 normalScale;
          uniform float bumpScale;
          uniform vec3 lightPosition;
          uniform vec3 lightColor;
          uniform vec3 ambientColor;
          uniform float reliefIntensity;
          uniform float time;
          uniform float pulseIntensity;
          
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying vec3 vWorldPosition;
          
          vec3 perturbNormal2Arb(vec3 eye_pos, vec3 surf_norm, vec2 uv) {
            vec3 normalColor = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
            normalColor.xy *= normalScale * reliefIntensity;
            
            vec3 q0 = dFdx(eye_pos);
            vec3 q1 = dFdy(eye_pos);
            vec2 st0 = dFdx(uv);
            vec2 st1 = dFdy(uv);
            
            vec3 N = surf_norm;
            vec3 T = normalize(q0 * st1.t - q1 * st0.t);
            vec3 B = -normalize(cross(N, T));
            mat3 TBN = mat3(T, B, N);
            
            return normalize(TBN * normalColor);
          }
          
          vec4 smoothTexture(sampler2D tex, vec2 uv) {
            vec2 texSize = vec2(1024.0, 512.0);
            vec2 texelSize = 1.0 / texSize;
            
            vec4 tl = texture2D(tex, uv);
            vec4 tr = texture2D(tex, uv + vec2(texelSize.x, 0.0));
            vec4 bl = texture2D(tex, uv + vec2(0.0, texelSize.y));
            vec4 br = texture2D(tex, uv + vec2(texelSize.x, texelSize.y));
            
            vec2 f = fract(uv * texSize);
            vec4 tA = mix(tl, tr, f.x);
            vec4 tB = mix(bl, br, f.x);
            return mix(tA, tB, f.y);
          }
          
          float calculateAO(vec2 uv, vec3 normal) {
            vec2 texSize = vec2(1024.0, 512.0);
            vec2 texelSize = 1.0 / texSize;
            
            float centerHeight = texture2D(bumpMap, uv).r;
            
            float sum = 0.0;
            for(int i = -2; i <= 2; i++) {
              for(int j = -2; j <= 2; j++) {
                if(i == 0 && j == 0) continue;
                
                vec2 offset = vec2(float(i), float(j)) * texelSize * 2.0;
                float neighborHeight = texture2D(bumpMap, uv + offset).r;
                
                float heightDiff = max(0.0, neighborHeight - centerHeight);
                float influence = 1.0 / (1.0 + float(i*i + j*j));
                sum += heightDiff * influence;
              }
            }
            
            float occlusion = 1.0 - sum * 2.0;
            return clamp(occlusion, 0.3, 1.0);
          }
          
          void main() {
            vec4 diffuseColor = smoothTexture(map, vUv);
            
            vec3 normal = perturbNormal2Arb(vViewPosition, vNormal, vUv);
            
            vec3 lightDir = normalize(lightPosition - vWorldPosition);
            
            float diffuse = max(dot(normal, lightDir), 0.0);
            
            vec3 viewDir = normalize(vViewPosition);
            vec3 halfDir = normalize(lightDir + viewDir);
            float specular = pow(max(dot(normal, halfDir), 0.0), 32.0) * 0.2 * (1.0 - diffuseColor.b);
            
            float ao = calculateAO(vUv, normal);
            
            vec3 litColor = ambientColor * diffuseColor.rgb * ao +
                            lightColor * diffuseColor.rgb * diffuse +
                            lightColor * specular;
            
            float rimFactor = 1.0 - max(0.0, dot(normal, viewDir));
            rimFactor = pow(rimFactor, 3.0) * 0.15;
            vec3 rimColor = vec3(0.1, 0.15, 0.4);
            
            vec3 finalColor = litColor + rimColor * rimFactor;
            
            finalColor = pow(finalColor, vec3(1.0/2.2));
            
            float scintillation = 0.98 + 0.02 * sin(time * 3.0 + vWorldPosition.x + vWorldPosition.y);
            finalColor *= scintillation;
            
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `,
      });
      
      earth = new THREE.Mesh(earthGeometry, earthShaderMaterial);
      earth.castShadow = false;
      earth.receiveShadow = true;
      earth.position.set(0, 0, 0);
      scene.add(earth);
      
      earth.rotation.x = Math.PI * 0.1;
      
      const sunGeometry = new THREE.SphereGeometry(7, 64, 64);
      const sunTexture = textureLoader.load('/textures/space/sun.jpg');
      
      const sunMaterial = new THREE.MeshStandardMaterial({
        map: sunTexture,
        color: 0xffee88,
        emissive: 0xffee88, 
        emissiveIntensity: 3.0,
        roughness: 0.1,
        metalness: 0.0
      });
      
      sun = new THREE.Mesh(sunGeometry, sunMaterial);
      sun.position.set(7, 4, 8);
      scene.add(sun);
      
      sunShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0.0 },
          baseColor: { value: new THREE.Color(0xffee88) },
          coronaColor: { value: new THREE.Color(0xff7700) },
          sunTexture: { value: sunTexture },
          viewVector: { value: new THREE.Vector3() },
          pulseIntensity: { value: 0.0 }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vWorldPosition;
          
          uniform float time;
          uniform float pulseIntensity;
          
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            
            vec3 newPosition = position;
            float pulse = sin(time * 2.0) * pulseIntensity;
            newPosition *= (1.0 + pulse);
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 baseColor;
          uniform vec3 coronaColor;
          uniform sampler2D sunTexture;
          
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vWorldPosition;
          
          float noise(vec3 p) {
            float t = time * 0.2;
            return 0.5 + 
              0.5 * sin(p.x * 10.0 + t) * 
              sin(p.y * 8.0 + t * 0.7) * 
              sin(p.z * 12.0 + t * 1.3);
          }
          
          float turbulence(vec3 p, int octaves) {
            float sum = 0.0;
            float scale = 1.0;
            float weight = 1.0;
            
            for(int i = 0; i < 4; i++) {
              if (i >= octaves) break;
              sum += weight * noise(p * scale);
              weight *= 0.5;
              scale *= 2.0;
            }
            
            return sum;
          }
          
          float plasma(vec3 p) {
            float t = time * 0.8;
            
            float turb = turbulence(p * 1.5 + vec3(t * 0.3), 3);
            
            float plasma = 
                sin((p.x * 10.0 + turb) + t) +
                sin((p.y * 12.0 + turb) + t * 1.2) +
                sin((p.z * 8.0 + turb) + t * 0.8) +
                sin(sqrt(p.x * p.x + p.y * p.y + p.z * p.z) * 10.0 + t);
                
            return plasma * 0.25;
          }
          
          void main() {
            vec2 distortedUV = vUv;
            float noiseValue = noise(vPosition * 0.5 + time * 0.1);
            
            distortedUV.x += sin(distortedUV.y * 10.0 + time * 0.7) * 0.04 * noiseValue;
            distortedUV.y += cos(distortedUV.x * 12.0 + time * 0.9) * 0.04 * noiseValue;
            
            vec4 texColor = texture2D(sunTexture, distortedUV);
            
            float flare =
                sin(vUv.y * 25.0 + time * 3.0) * 
                sin(vUv.x * 25.0 + time * 2.5) * 
                0.4 * noise(vPosition + time * 0.3);
            
            float spots = pow(turbulence(vPosition * 4.0 + time * 0.4, 3), 5.0);
            spots = 1.0 - spots * 0.6;
            
            float plasmaEffect = plasma(vPosition);
            plasmaEffect = pow(plasmaEffect, 1.5) * 2.0;
            
            float flareIntensity = max(0.0, flare) * 1.5;
            
            vec3 sunColor = texColor.rgb * baseColor * spots * 1.5;
            
            vec3 flareColor = mix(baseColor, coronaColor * 1.5, flareIntensity);
            
            vec3 plasmaColor = mix(sunColor, coronaColor * 1.8, pow(plasmaEffect, 1.5));
            
            vec3 finalColor = mix(plasmaColor, flareColor, flareIntensity);
            
            float edge = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.5);
            finalColor = mix(finalColor, coronaColor * 1.5, edge * 1.2);
            
            float colorPulse = sin(time * 3.0) * 0.1;
            finalColor *= (1.0 + colorPulse);
            
            float scintillation = 0.9 + 0.1 * sin(time * 5.0 + vWorldPosition.x + vWorldPosition.y);
            finalColor *= scintillation;
            
            finalColor = min(finalColor, vec3(2.0));
            
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        wireframe: false,
        fog: false,
        lights: false,
        depthWrite: false,
        transparent: true
      });
      
      sun.material = sunShaderMaterial;

      const satelliteGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.1);
      const satelliteMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x555555,
      });
      satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
      
      satellite.castShadow = true;
      
      const panelGeometry = new THREE.BoxGeometry(0.6, 0.01, 0.2);
      const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x2222ff,
        metalness: 0.8,
        roughness: 0.2,
      });
      
      const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
      leftPanel.position.set(0, 0, 0.2);
      satellite.add(leftPanel);
      
      const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
      rightPanel.position.set(0, 0, -0.2);
      satellite.add(rightPanel);
      
      satelliteOrbit = new THREE.Group();
      satelliteOrbit.add(satellite);
      satellite.position.set(4, 0, 0);
      
      satelliteOrbit.rotation.x = Math.PI * 0.1;
      scene.add(satelliteOrbit);

      const ambientLight = new THREE.AmbientLight(0x404050, 0.3);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x303050, 0.7);
      scene.add(hemiLight);

      mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
      mainLight.position.set(30, 0, 0);
      mainLight.castShadow = true;
      
      mainLight.shadow.mapSize.width = 4096;
      mainLight.shadow.mapSize.height = 4096;
      mainLight.shadow.camera.near = 0.5;
      mainLight.shadow.camera.far = 50;
      mainLight.shadow.camera.left = -10;
      mainLight.shadow.camera.right = 10;
      mainLight.shadow.camera.top = 10;
      mainLight.shadow.camera.bottom = -10;
      mainLight.shadow.bias = -0.0001;
      mainLight.shadow.radius = 1.5;
      mainLight.shadow.blurSamples = 16;
      
      mainLight.target.position.set(0, 0, 0);
      scene.add(mainLight.target);
      mainLight.target.updateMatrixWorld();
      
      mainLight.intensity = 1.5;
      
      scene.add(mainLight);

      const tweenSkybox = () => {
        const time = Date.now() * 0.0003;
        
        starField.rotation.y += 0.0001;
        farStarField.rotation.y += 0.00005;
        
        starsMaterial.opacity = 0.6 + Math.sin(time) * 0.2;
        farStarsMaterial.opacity = 0.4 + Math.cos(time) * 0.15;
        
        skybox.rotation.y += 0.00005;
        innerSkybox.rotation.y -= 0.00007;
        
        sun.rotation.y += 0.0003;
        
        if (sunShaderMaterial && sunShaderMaterial.uniforms && sunShaderMaterial.uniforms.viewVector) {
          const camVec = new THREE.Vector3();
          camVec.subVectors(camera.position, sun.position).normalize();
          sunShaderMaterial.uniforms.viewVector.value = camVec;
        }
        
        setTimeout(tweenSkybox, 100);
      };
      tweenSkybox();

      animate();

      window.addEventListener('resize', onWindowResize);
      
      container.value.addEventListener('click', onDocumentMouseDown);
    } catch (error) {
      console.error("Erreur lors du traitement de l'image:", error);
    }
  };
}

function onWindowResize() {
  if (!container.value) return;
  
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  composer.setSize(container.value.clientWidth, container.value.clientHeight);
}

function cleanup() {
  window.removeEventListener('resize', onWindowResize);
  cancelAnimationFrame(animationFrameId);
  
  if (container.value && renderer) {
    container.value.removeChild(renderer.domElement);
  }
  
  if (scene) {
    scene.clear();
  }
}

function updateReliefIntensity() {
  if (earth && earth.material) {
    const normalValue = Number(reliefIntensity.value) * 2.0;
    const bumpValue = Number(reliefIntensity.value) * 0.6;
    const displacementValue = Number(reliefIntensity.value) * 0.04;
    
    const material = earth.material as THREE.ShaderMaterial;
    material.uniforms.normalScale.value = new THREE.Vector2(normalValue, normalValue);
    material.uniforms.bumpScale.value = bumpValue;
    material.uniforms.displacementScale.value = displacementValue;
    material.uniforms.reliefIntensity.value = reliefIntensity.value;
    material.needsUpdate = true;
  }
}

watch(reliefIntensity, () => {
  updateReliefIntensity();
});

function onDocumentMouseDown(event: MouseEvent) {
  if (!container.value) return;
  
  const rect = container.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObject(earth);
  
  if (intersects.length > 0) {
    const intersectionPoint = intersects[0].point;
    
    createMeteorite(intersectionPoint);
  }
}

function createMeteorite(targetPoint: THREE.Vector3) {
  const startDirection = targetPoint.clone().normalize();
  const startDistance = 30 + Math.random() * 10;
  const startPoint = startDirection.multiplyScalar(startDistance);
  
  const deviation = 5 + Math.random() * 5;
  startPoint.x += (Math.random() - 0.5) * deviation;
  startPoint.y += (Math.random() - 0.5) * deviation;
  startPoint.z += (Math.random() - 0.5) * deviation;
  
  const meteoriteSize = 0.3 + Math.random() * 0.4;
  
  const meteoriteGeometry = new THREE.IcosahedronGeometry(meteoriteSize, 1);
  
  const positionAttribute = meteoriteGeometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  
  for (let i = 0; i < positionAttribute.count; i++) {
    vertex.fromBufferAttribute(positionAttribute, i);
    
    vertex.x += (Math.random() - 0.5) * 0.2;
    vertex.y += (Math.random() - 0.5) * 0.2;
    vertex.z += (Math.random() - 0.5) * 0.2;
    
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  
  meteoriteGeometry.computeVertexNormals();
  
  const meteoriteMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.8,
    metalness: 0.2,
    emissive: 0xff4400,
    emissiveIntensity: 0.5 
  });
  
  const meteorite = new THREE.Mesh(meteoriteGeometry, meteoriteMaterial);
  meteorite.position.copy(startPoint);
  meteorite.castShadow = true;
  
  meteorite.lookAt(targetPoint);
  meteorite.rotateOnAxis(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
  
  scene.add(meteorite);
  
  const particlesGeometry = new THREE.BufferGeometry();
  const particleCount = 60;
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const colors = new Float32Array(particleCount * 3);
  
  const particleColors = [
    new THREE.Color(0xffcc00),
    new THREE.Color(0xff9900),
    new THREE.Color(0xff3300),
    new THREE.Color(0x330000),
  ];
  
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = meteorite.position.x;
    positions[i * 3 + 1] = meteorite.position.y;
    positions[i * 3 + 2] = meteorite.position.z;
    
    const sizeFactor = 1 - (i / particleCount);
    sizes[i] = (Math.random() * 0.1 + 0.05) * sizeFactor * meteoriteSize;
    
    const colorIndex = Math.min(
      Math.floor(i / particleCount * particleColors.length), 
      particleColors.length - 1
    );
    const color = particleColors[colorIndex];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const particlesMaterial = new THREE.PointsMaterial({
    size: 0.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });
  
  const particles = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particles);
  
  const meteoriteData: MeteoriteData = {
    mesh: meteorite,
    particles: particles,
    particlesPositions: positions,
    target: targetPoint.clone(),
    start: startPoint.clone(),
    startTime: Date.now(),
    duration: 1500 + Math.random() * 1000,
    impacted: false,
    size: meteoriteSize
  };
  
  meteorites.push(meteoriteData);
}

function updateMeteorites() {
  const now = Date.now();
  const meteoritesToRemove: number[] = [];
  
  meteorites.forEach((meteorite, index) => {
    const elapsed = now - meteorite.startTime;
    let progress = Math.min(1.0, elapsed / meteorite.duration);
    
    if (progress < 1.0) {
      const newPosition = new THREE.Vector3().lerpVectors(
        meteorite.start,
        meteorite.target,
        progress
      );
      
      const upOffset = new THREE.Vector3(0, 1, 0);
      upOffset.multiplyScalar(-Math.sin(progress * Math.PI) * 2);
      newPosition.add(upOffset);
      
      meteorite.mesh.position.copy(newPosition);
      
      const rotationSpeed = 0.02 + progress * 0.04;
      meteorite.mesh.rotation.x += rotationSpeed;
      meteorite.mesh.rotation.y += rotationSpeed * 1.5;
      meteorite.mesh.rotation.z += rotationSpeed * 0.5;
      
      const scale = meteorite.size + progress * 0.5;
      meteorite.mesh.scale.set(scale, scale, scale);
      
      const positions = meteorite.particlesPositions;
      const particleGeometry = meteorite.particles.geometry;
      
      for (let i = (positions.length / 3) - 1; i > 0; i--) {
        positions[i * 3] = positions[(i - 1) * 3];
        positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
        positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
      }
      
      positions[0] = newPosition.x;
      positions[1] = newPosition.y;
      positions[2] = newPosition.z;
      
      particleGeometry.attributes.position.needsUpdate = true;
      
      const speedFactor = 1.0 + (progress * 0.5);
      (meteorite.particles.material as THREE.PointsMaterial).opacity = 0.6 + speedFactor * 0.4;
      
      const emissiveIntensity = 0.5 + progress * 1.5;
      (meteorite.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
    } 
    else if (!meteorite.impacted) {
      meteorite.impacted = true;
      
      createImpactEffect(meteorite.target);
      
      meteoritesToRemove.push(index);
    }
  });
  
  meteoritesToRemove.sort((a, b) => b - a);
  for (const index of meteoritesToRemove) {
    const meteorite = meteorites[index];
    
    scene.remove(meteorite.mesh);
    scene.remove(meteorite.particles);
    
    meteorites.splice(index, 1);
  }
}

function createImpactEffect(position: THREE.Vector3) {
  const flashGeometry = new THREE.SphereGeometry(0.5, 32, 32);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending
  });
  
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  flash.position.copy(position);
  scene.add(flash);
  
  const explosionGeometry = new THREE.BufferGeometry();
  const particleCount = 100;
  const explosionPositions = new Float32Array(particleCount * 3);
  const explosionSizes = new Float32Array(particleCount);
  const explosionColors = new Float32Array(particleCount * 3);
  
  const colors = [
    new THREE.Color(0xff0000),
    new THREE.Color(0xff5500),
    new THREE.Color(0xff9900),
    new THREE.Color(0xffcc00),
  ];
  
  for (let i = 0; i < particleCount; i++) {
    explosionPositions[i * 3] = position.x;
    explosionPositions[i * 3 + 1] = position.y;
    explosionPositions[i * 3 + 2] = position.z;
    
    explosionSizes[i] = Math.random() * 0.2 + 0.05;
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    explosionColors[i * 3] = color.r;
    explosionColors[i * 3 + 1] = color.g;
    explosionColors[i * 3 + 2] = color.b;
  }
  
  explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
  explosionGeometry.setAttribute('size', new THREE.BufferAttribute(explosionSizes, 1));
  explosionGeometry.setAttribute('color', new THREE.BufferAttribute(explosionColors, 3));
  
  const explosionMaterial = new THREE.PointsMaterial({
    size: 0.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });
  
  const explosion = new THREE.Points(explosionGeometry, explosionMaterial);
  scene.add(explosion);
  
  const targetDirection = position.clone().normalize();
  const earthRadius = 2;
  const craterPosition = targetDirection.multiplyScalar(earthRadius);
  
  const startTime = Date.now();
  const explosionDuration = 1500;
  
  function animateExplosion() {
    const now = Date.now();
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / explosionDuration);
    
    if (progress < 0.2) {
      const scale = progress * 5;
      flash.scale.set(scale, scale, scale);
    } else {
      flash.material.opacity = 1.0 - (progress - 0.2) / 0.8;
      
      if (progress >= 0.99) {
        scene.remove(flash);
      }
    }
    
    if (progress < 0.99) {
      const positions = explosion.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < particleCount; i++) {
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI * 2;
        
        const speed = 0.05 * (1.0 - progress);
        
        positions[i * 3] += Math.sin(angle1) * Math.cos(angle2) * speed;
        positions[i * 3 + 1] += Math.sin(angle1) * Math.sin(angle2) * speed;
        positions[i * 3 + 2] += Math.cos(angle1) * speed;
      }
      
      explosion.geometry.attributes.position.needsUpdate = true;
      
      explosion.material.opacity = 1.0 - progress;
      
      requestAnimationFrame(animateExplosion);
    } else {
      scene.remove(explosion);
    }
  }
  
  animateExplosion();
}

function updateBloomEffect() {
  if (composer) {
    const bloomPass = composer.passes.find(pass => pass instanceof UnrealBloomPass) as UnrealBloomPass;
    if (bloomPass) {
      bloomPass.strength = bloomIntensity.value;
    }
  }
}

function togglePause() {
  isPaused.value = !isPaused.value;
  if (!isPaused.value) {
    animate();
  }
}

function createRandomMeteorite() {
  if (isPaused.value) return;
  
  const phi = Math.random() * Math.PI * 2;
  const theta = Math.random() * Math.PI;
  const radius = 2;
  
  const targetPoint = new THREE.Vector3(
    radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.sin(theta) * Math.sin(phi),
    radius * Math.cos(theta)
  );
  
  createMeteorite(targetPoint);
}

function handleKeyPress(event: KeyboardEvent) {
  switch(event.key) {
    case ' ':
      togglePause();
      break;
    case 'm':
      createRandomMeteorite();
      break;
    case '+':
      bloomIntensity.value = Math.min(1.0, bloomIntensity.value + 0.1);
      updateBloomEffect();
      break;
    case '-':
      bloomIntensity.value = Math.max(0.0, bloomIntensity.value - 0.1);
      updateBloomEffect();
      break;
  }
}

onMounted(() => {
  init();
  window.addEventListener('keydown', handleKeyPress);
  
  setInterval(() => {
    if (!isPaused.value && Math.random() < meteoriteFrequency.value) {
      createRandomMeteorite();
    }
  }, 2000);
});

onBeforeUnmount(() => {
  cleanup();
  window.removeEventListener('keydown', handleKeyPress);
});
</script>

<style scoped>
.earth-container {
  width: 100%;
  height: 100vh;
  display: block;
}

.controls {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 15px;
  border-radius: 8px;
  color: white;
  min-width: 250px;
}

.control-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-size: 0.9em;
}

input[type="range"] {
  width: 100%;
  margin: 5px 0;
}

.control-button {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  margin: 5px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.control-button:hover {
  background-color: #45a049;
}

.keyboard-shortcuts {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.keyboard-shortcuts h3 {
  margin: 0 0 10px 0;
  font-size: 1em;
}

.keyboard-shortcuts ul {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.8em;
}

.keyboard-shortcuts li {
  margin: 3px 0;
  color: #ccc;
}
</style> 