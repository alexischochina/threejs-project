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
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';

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

// Supprimer les variables de vitesse
const bloomIntensity = ref(0.2);
const meteoriteFrequency = ref(1.0);
const isPaused = ref(false);
const reliefIntensity = ref(0.2);

// Ajouter des variables pour les animations
const sunRotationSpeed = ref(0.0003);
const sunPulseSpeed = ref(0.0005);
const sunPulseIntensity = ref(0.2);
const earthWobbleSpeed = ref(0.0002);
const earthWobbleIntensity = ref(0.05);
const satelliteOrbitSpeed = ref(0.008);
const satelliteRotationSpeed = ref(0.02);

// Interface pour les données de météorites
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

// Déplacer la fonction animate au niveau global
function animate() {
  if (!isPaused.value) {
    animationFrameId = requestAnimationFrame(animate);

    const currentTime = Date.now() * 0.001;
    
    // Animation du soleil
    if (sun && sun.rotation) {
      // Rotation de base
      sun.rotation.y += sunRotationSpeed.value;
      
      // Effet de pulsation
      const pulse = Math.sin(currentTime * sunPulseSpeed.value) * sunPulseIntensity.value;
      sun.scale.set(1 + pulse, 1 + pulse, 1 + pulse);
      
      // Mise à jour du shader
      if (sunShaderMaterial && sunShaderMaterial.uniforms) {
        sunShaderMaterial.uniforms.time.value = currentTime;
        sunShaderMaterial.uniforms.pulseIntensity.value = pulse;
      }
    }
    
    // Animation de la Terre
    if (earth && earth.rotation) {
      // Rotation de base
      earth.rotation.y += 0.0008;
      
      // Effet de wobble (oscillation)
      const wobble = Math.sin(currentTime * earthWobbleSpeed.value) * earthWobbleIntensity.value;
      earth.rotation.x = Math.PI * 0.1 + wobble;
    }
    
    // Animation du satellite
    if (satelliteOrbit && satelliteOrbit.rotation) {
      // Rotation de l'orbite
      satelliteOrbit.rotation.y += satelliteOrbitSpeed.value;
      
      // Rotation du satellite sur lui-même
      if (satellite) {
        satellite.rotation.x += satelliteRotationSpeed.value;
        satellite.rotation.y += satelliteRotationSpeed.value * 0.5;
      }
    }
    
    // Mise à jour des météorites
    updateMeteorites();
    
    // Mise à jour du shader de la Terre
    if (earth && earth.material) {
      const earthShader = earth.material as THREE.ShaderMaterial;
      if (earthShader.uniforms && mainLight) {
        earthShader.uniforms.lightPosition.value.copy(mainLight.position);
        earthShader.uniforms.lightColor.value.copy(mainLight.color).multiplyScalar(mainLight.intensity);
        earthShader.uniforms.time.value = currentTime; // Ajouter le temps pour les animations
      }
    }
    
    controls.update();
    composer.render();
  }
}

function init() {
  if (!container.value) return;

  // Créer la scène
  scene = new THREE.Scene();
  
  // Initialiser le raycaster et le vecteur de la souris pour la détection des clics
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Ajouter un fond d'étoiles amélioré
  const textureLoader = new THREE.TextureLoader();
  
  // Charger les textures de galaxie et de nébuleuse
  const nebulaTexture = textureLoader.load('/textures/space/nebula.jpg');
  const galaxyTexture = textureLoader.load('/textures/space/galaxy.jpg');
  
  // Premier skybox (nébuleuse en arrière-plan)
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
  
  // Deuxième skybox (galaxie plus proche, semi-transparent)
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

  // Ajouter un effet de particules d'étoiles pour renforcer l'immersion
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.7,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  // Créer 3000 étoiles aléatoires autour de la scène avec des couleurs variées
  const starsVertices = [];
  const starsColors = [];
  
  // Couleurs d'étoiles possibles
  const starColors = [
    new THREE.Color(0xffffff), // blanc
    new THREE.Color(0xffffdd), // blanc chaud
    new THREE.Color(0xddddff), // blanc bleuté
    new THREE.Color(0xffdddd), // blanc rougeâtre
    new THREE.Color(0x9bb0ff), // bleu ciel
    new THREE.Color(0xaabfff), // bleu clair
    new THREE.Color(0xffcc6f), // jaune
  ];
  
  for (let i = 0; i < 3000; i++) {
    // Position aléatoire dans un espace sphérique
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const radius = 150 + Math.random() * 150; // Entre 150 et 300 unités
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    starsVertices.push(x, y, z);
    
    // Couleur aléatoire parmi les options
    const color = starColors[Math.floor(Math.random() * starColors.length)];
    starsColors.push(color.r, color.g, color.b);
  }

  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
  starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));
  
  // Utiliser les couleurs personnalisées
  starsMaterial.vertexColors = true;
  
  const starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);
  
  // Créer un second champ d'étoiles plus lointain avec des étoiles plus petites
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
    // Position aléatoire dans un espace sphérique plus grand
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const radius = 300 + Math.random() * 50; // Entre 300 et 350 unités
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    farStarsVertices.push(x, y, z);
    
    // Couleur aléatoire parmi les options, légèrement atténuée
    const color = starColors[Math.floor(Math.random() * starColors.length)];
    farStarsColors.push(color.r * 0.8, color.g * 0.8, color.b * 0.8); // Plus atténué
  }
  
  farStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(farStarsVertices, 3));
  farStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(farStarsColors, 3));
  
  const farStarField = new THREE.Points(farStarsGeometry, farStarsMaterial);
  scene.add(farStarField);

  // Créer la caméra
  camera = new THREE.PerspectiveCamera(
    75,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 7;
  camera.position.y = 2;

  // Créer le renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  // Configurer le post-processing
  composer = new EffectComposer(renderer);

  // Ajouter le RenderPass de base
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Ajouter l'effet de bloom pour les lumières
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.value.clientWidth, container.value.clientHeight),
    0.05,  // strength (réduit de 0.1 à 0.05)
    0.02,  // radius (réduit de 0.04 à 0.02)
    0.98   // threshold (augmenté de 0.95 à 0.98 pour ne pas affecter les zones moins lumineuses)
  );
  composer.addPass(bloomPass);

  // Ajouter l'OutputPass pour le rendu final
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Ajouter les contrôles pour pouvoir naviguer avec la souris
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 3;
  controls.maxDistance = 15;
  controls.update();

  // Charger les textures de la Terre
  const earthTexture = textureLoader.load('/textures/earth.jpg');
  const earthNormalMap = textureLoader.load('/textures/earth_normal.jpg');
  const earthBumpMap = textureLoader.load('/textures/earth_bump.jpg');
  
  // Traitement de la texture de relief pour accentuer les montagnes
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  
  // Charger l'image de bump map pour la traiter
  const bumpImage = new Image();
  bumpImage.src = '/textures/earth_bump.jpg';
  bumpImage.onload = () => {
    // Vérifier que le contexte existe
    if (!context) {
      console.error("Impossible d'obtenir le contexte 2D du canvas");
      return;
    }
    
    // Dessiner l'image sur le canvas
    context.drawImage(bumpImage, 0, 0, canvas.width, canvas.height);
    
    try {
      // Récupérer les données de l'image
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Augmenter drastiquement le contraste pour accentuer les montagnes
      for (let i = 0; i < data.length; i += 4) {
        // Calculer la luminosité (moyenne simple des composantes RGB)
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        // Appliquer une courbe de contraste encore plus extrême pour les montagnes
        if (avg > 127) {
          // Valeurs beaucoup plus élevées pour les points lumineux (montagnes)
          const factor = Math.pow((avg - 127) / 128, 2.0) * 3.0; // Exponentielle plus forte
          data[i] = Math.min(255, 127 + factor * 128);     // R
          data[i + 1] = Math.min(255, 127 + factor * 128); // G
          data[i + 2] = Math.min(255, 127 + factor * 128); // B
        } else {
          // Valeurs encore plus basses pour les zones sombres (vallées et océans)
          const factor = Math.pow(avg / 127, 3.0) * 0.5; // Accentuer encore plus les creux
          data[i] = Math.max(0, factor * 127);     // R
          data[i + 1] = Math.max(0, factor * 127); // G
          data[i + 2] = Math.max(0, factor * 127); // B
        }
      }
      
      // Appliquer les modifications
      context.putImageData(imageData, 0, 0);
      
      // Créer une texture à partir du canvas amélioré
      const enhancedBumpMap = new THREE.CanvasTexture(canvas);
      
      // Créer la Terre
      const earthGeometry = new THREE.SphereGeometry(2, 192, 192);
      
      // Création d'un shader personnalisé pour la Terre
      const earthShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: earthTexture },
          normalMap: { value: earthNormalMap },
          bumpMap: { value: earthBumpMap },
          normalScale: { value: new THREE.Vector2(2.0, 2.0) }, // Réduit de 20.0 à 2.0 (20%)
          bumpScale: { value: 0.6 }, // Réduit de 3.0 à 0.6 (20%)
          displacementMap: { value: earthBumpMap },
          displacementScale: { value: 0.04 }, // Réduit de 0.2 à 0.04 (20%)
          lightPosition: { value: new THREE.Vector3(30, 0, 0) },
          lightColor: { value: new THREE.Color(0xffffff) },
          ambientColor: { value: new THREE.Color(0x404050) },
          reliefIntensity: { value: 0.2 }, // Modifié de 1.0 à 0.2 (20%)
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
            
            // Déplacement de géométrie pour le relief avec animation
            vec4 displacementColor = texture2D(displacementMap, uv);
            float displacement = displacementColor.r * displacementScale;
            
            // Ajouter une légère pulsation
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
          
          // Fonction pour lire la normal map et obtenir une direction perturbée
          vec3 perturbNormal2Arb(vec3 eye_pos, vec3 surf_norm, vec2 uv) {
            // Lire la normal map
            vec3 normalColor = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
            normalColor.xy *= normalScale * reliefIntensity;
            
            // Construire la TBN matrix
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
          
          // Anti-aliasing pour éviter les stries
          vec4 smoothTexture(sampler2D tex, vec2 uv) {
            vec2 texSize = vec2(1024.0, 512.0); // Taille approximative de la texture
            vec2 texelSize = 1.0 / texSize;
            
            // Échantillonnage avec filtrage bilinéaire amélioré
            vec4 tl = texture2D(tex, uv);
            vec4 tr = texture2D(tex, uv + vec2(texelSize.x, 0.0));
            vec4 bl = texture2D(tex, uv + vec2(0.0, texelSize.y));
            vec4 br = texture2D(tex, uv + vec2(texelSize.x, texelSize.y));
            
            vec2 f = fract(uv * texSize);
            vec4 tA = mix(tl, tr, f.x);
            vec4 tB = mix(bl, br, f.x);
            return mix(tA, tB, f.y);
          }
          
          // Fonction pour calculer l'occlusion ambiante basée sur la bump map
          float calculateAO(vec2 uv, vec3 normal) {
            // Comparer la hauteur du pixel central avec les pixels environnants
            vec2 texSize = vec2(1024.0, 512.0);
            vec2 texelSize = 1.0 / texSize;
            
            // Échantillonner la bump map pour les hauteurs
            float centerHeight = texture2D(bumpMap, uv).r;
            
            // Échantillonner les hauteurs voisines
            float sum = 0.0;
            for(int i = -2; i <= 2; i++) {
              for(int j = -2; j <= 2; j++) {
                if(i == 0 && j == 0) continue; // Sauter le pixel central
                
                vec2 offset = vec2(float(i), float(j)) * texelSize * 2.0;
                float neighborHeight = texture2D(bumpMap, uv + offset).r;
                
                // Plus le voisin est élevé par rapport au pixel central, plus l'occlusion est forte
                float heightDiff = max(0.0, neighborHeight - centerHeight);
                float influence = 1.0 / (1.0 + float(i*i + j*j)); // Influence diminue avec la distance
                sum += heightDiff * influence;
              }
            }
            
            // Normaliser l'occlusion
            float occlusion = 1.0 - sum * 2.0;
            return clamp(occlusion, 0.3, 1.0);
          }
          
          void main() {
            // Échantillonner la texture de couleur avec anti-aliasing
            vec4 diffuseColor = smoothTexture(map, vUv);
            
            // Calculer la normale perturbée pour un relief plus détaillé
            vec3 normal = perturbNormal2Arb(vViewPosition, vNormal, vUv);
            
            // Direction de la lumière
            vec3 lightDir = normalize(lightPosition - vWorldPosition);
            
            // Modèle d'éclairage de base (Lambertien)
            float diffuse = max(dot(normal, lightDir), 0.0);
            
            // Ajout d'une légère composante spéculaire très douce pour les glaciers
            vec3 viewDir = normalize(vViewPosition);
            vec3 halfDir = normalize(lightDir + viewDir);
            float specular = pow(max(dot(normal, halfDir), 0.0), 32.0) * 0.2 * (1.0 - diffuseColor.b);
            
            // Calcul de l'occlusion ambiante
            float ao = calculateAO(vUv, normal);
            
            // Éclairage final avec occlusion ambiante
            vec3 litColor = ambientColor * diffuseColor.rgb * ao + 
                            lightColor * diffuseColor.rgb * diffuse +
                            lightColor * specular;
            
            // Réduire l'intensité de l'effet de limbe
            float rimFactor = 1.0 - max(0.0, dot(normal, viewDir));
            rimFactor = pow(rimFactor, 3.0) * 0.15; // Réduit de 0.3 à 0.15
            vec3 rimColor = vec3(0.1, 0.15, 0.4); // Réduit l'intensité des couleurs
            
            // Couleur finale avec atmosphère
            vec3 finalColor = litColor + rimColor * rimFactor;
            
            // Gamma correction pour un rendu plus naturel
            finalColor = pow(finalColor, vec3(1.0/2.2));
            
            // Réduire l'effet de scintillement
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
      
      // Inclinaison comme l'axe terrestre
      earth.rotation.x = Math.PI * 0.1;
      
      // Créer le soleil en premier pour pouvoir utiliser sa position dans les shaders
      const sunGeometry = new THREE.SphereGeometry(7, 64, 64);
      const sunTexture = textureLoader.load('/textures/space/sun.jpg');
      
      // Matériau pour le soleil avec émission de lumière - utiliser MeshStandardMaterial avec emissive
      const sunMaterial = new THREE.MeshStandardMaterial({
        map: sunTexture,
        color: 0xffee88, // Couleur plus vive
        emissive: 0xffee88, 
        emissiveIntensity: 3.0, // Augmentation de l'intensité lumineuse
        roughness: 0.1,
        metalness: 0.0
      });
      
      sun = new THREE.Mesh(sunGeometry, sunMaterial);
      // Positionner le soleil plus près pour un meilleur éclairage
      sun.position.set(7, 4, 8); // Plus proche
      scene.add(sun);
      
      // Créer un shader personnalisé pour le soleil avec des effets plus intenses
      sunShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0.0 },
          baseColor: { value: new THREE.Color(0xffee88) }, // Jaune plus clair
          coronaColor: { value: new THREE.Color(0xff7700) }, // Orange plus vif
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
            
            // Ajouter une déformation basée sur la pulsation
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
          
          // Fonction de bruit 3D améliorée pour perturber la surface
          float noise(vec3 p) {
            float t = time * 0.2;
            return 0.5 + 
              0.5 * sin(p.x * 10.0 + t) * 
              sin(p.y * 8.0 + t * 0.7) * 
              sin(p.z * 12.0 + t * 1.3);
          }
          
          // Turbulence - superposition de bruit à différentes échelles
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
          
          // Génération de plasma solaire plus complexe
          float plasma(vec3 p) {
            float t = time * 0.8;
            
            // Superposer des ondes avec turbulence
            float turb = turbulence(p * 1.5 + vec3(t * 0.3), 3);
            
            float plasma = 
                sin((p.x * 10.0 + turb) + t) +
                sin((p.y * 12.0 + turb) + t * 1.2) +
                sin((p.z * 8.0 + turb) + t * 0.8) +
                sin(sqrt(p.x * p.x + p.y * p.y + p.z * p.z) * 10.0 + t);
                
            return plasma * 0.25;
          }
          
          void main() {
            // Coordonnées UV déformées pour un aspect plus organique et dynamique
            vec2 distortedUV = vUv;
            float noiseValue = noise(vPosition * 0.5 + time * 0.1);
            
            // Ajouter une déformation progressive plus intense aux UVs
            distortedUV.x += sin(distortedUV.y * 10.0 + time * 0.7) * 0.04 * noiseValue;
            distortedUV.y += cos(distortedUV.x * 12.0 + time * 0.9) * 0.04 * noiseValue;
            
            // Échantillonner la texture de base et la rendre plus vive
            vec4 texColor = texture2D(sunTexture, distortedUV);
            
            // Générer des éruptions solaires et des taches plus visibles
            float flare = 
                sin(vUv.y * 25.0 + time * 3.0) * 
                sin(vUv.x * 25.0 + time * 2.5) * 
                0.4 * noise(vPosition + time * 0.3);
            
            // Générer des taches solaires
            float spots = pow(turbulence(vPosition * 4.0 + time * 0.4, 3), 5.0);
            spots = 1.0 - spots * 0.6; // Rendre les taches plus prononcées
            
            // Plasma pour l'aspect de la surface en fusion - plus intense
            float plasmaEffect = plasma(vPosition);
            plasmaEffect = pow(plasmaEffect, 1.5) * 2.0; // Renforcer l'effet
            
            // Régler l'intensité des différents effets
            float flareIntensity = max(0.0, flare) * 1.5;
            
            // Couleur de base du soleil avec texture et taches
            vec3 sunColor = texColor.rgb * baseColor * spots * 1.5; // Plus brillant
            
            // Ajouter les éruptions avec une couleur plus chaude et intense
            vec3 flareColor = mix(baseColor, coronaColor * 1.5, flareIntensity);
            
            // Ajouter l'effet de plasma renforcé
            vec3 plasmaColor = mix(sunColor, coronaColor * 1.8, pow(plasmaEffect, 1.5));
            
            // Couleur finale avec tous les effets combinés
            vec3 finalColor = mix(plasmaColor, flareColor, flareIntensity);
            
            // Simulation d'une couronne solaire au bord plus prononcée
            float edge = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.5);
            finalColor = mix(finalColor, coronaColor * 1.5, edge * 1.2);
            
            // Ajouter un effet de pulsation à la couleur
            float colorPulse = sin(time * 3.0) * 0.1;
            finalColor *= (1.0 + colorPulse);
            
            // Ajouter un effet de scintillement global
            float scintillation = 0.9 + 0.1 * sin(time * 5.0 + vWorldPosition.x + vWorldPosition.y);
            finalColor *= scintillation;
            
            // Écrêtage pour éviter les valeurs trop élevées
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
      
      // Remplacer le matériau du soleil par le shader
      sun.material = sunShaderMaterial;

      // Créer le satellite
      const satelliteGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.1);
      const satelliteMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x555555,
      });
      satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
      
      // Maintenant que le satellite est créé, on peut définir sa propriété castShadow
      satellite.castShadow = true;
      
      // Ajouter des panneaux solaires au satellite
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
      
      // Placer le satellite dans un groupe pour faciliter l'orbite
      satelliteOrbit = new THREE.Group();
      satelliteOrbit.add(satellite);
      satellite.position.set(4, 0, 0); // Position initiale du satellite
      
      // Incliner légèrement l'orbite
      satelliteOrbit.rotation.x = Math.PI * 0.1;
      scene.add(satelliteOrbit);

      // Réduire l'intensité de la lumière ambiante pour avoir plus de contraste
      const ambientLight = new THREE.AmbientLight(0x404050, 0.3);
      scene.add(ambientLight);

      // Réduire l'intensité de la lumière hémisphérique
      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x303050, 0.7);
      scene.add(hemiLight);

      // Créer une lumière directionnelle principale pour le soleil
      mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
      mainLight.position.set(30, 0, 0); // Uniquement sur l'axe X pour simplifier
      mainLight.castShadow = true;
      
      // Configurer les ombres avec précision
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
      
      // Diriger explicitement la lumière vers l'origine (Terre)
      mainLight.target.position.set(0, 0, 0);
      scene.add(mainLight.target);
      mainLight.target.updateMatrixWorld();
      
      // Réduire l'intensité pour éviter les reflets
      mainLight.intensity = 1.5;
      
      scene.add(mainLight);

      // Ajouter un léger effet de scintillement aux étoiles
      const tweenSkybox = () => {
        const time = Date.now() * 0.0003;
        
        // Faire scintiller les étoiles
        starField.rotation.y += 0.0001;
        farStarField.rotation.y += 0.00005;
        
        // Animer légèrement l'opacité des étoiles pour un effet de scintillement
        starsMaterial.opacity = 0.6 + Math.sin(time) * 0.2;
        farStarsMaterial.opacity = 0.4 + Math.cos(time) * 0.15;
        
        // Une légère rotation du skybox pour donner un sentiment de mouvement
        skybox.rotation.y += 0.00005;
        innerSkybox.rotation.y -= 0.00007; // Rotation en sens inverse pour créer un effet parallaxe
        
        // Animer le soleil et sa lueur
        sun.rotation.y += 0.0003;
        
        // Mettre à jour le vecteur de vue pour l'effet de halo
        if (sunShaderMaterial && sunShaderMaterial.uniforms && sunShaderMaterial.uniforms.viewVector) {
          const camVec = new THREE.Vector3();
          camVec.subVectors(camera.position, sun.position).normalize();
          sunShaderMaterial.uniforms.viewVector.value = camVec;
        }
        
        setTimeout(tweenSkybox, 100);
      };
      tweenSkybox();

      // Démarrer l'animation
      animate();

      // Gérer le redimensionnement de la fenêtre
      window.addEventListener('resize', onWindowResize);
      
      // Ajouter un écouteur d'événement pour détecter les clics sur la Terre
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
  
  // Libérer la mémoire
  if (scene) {
    scene.clear();
  }
}

// Fonction pour mettre à jour l'intensité du relief en temps réel
function updateReliefIntensity() {
  if (earth && earth.material) {
    // Convertir la valeur en nombre avec amplification pour plus d'effet
    const normalValue = Number(reliefIntensity.value) * 2.0; // Base de 2.0 au lieu de 10.0
    const bumpValue = Number(reliefIntensity.value) * 0.6;   // Base de 0.6 au lieu de 3.0
    const displacementValue = Number(reliefIntensity.value) * 0.04; // Base de 0.04 au lieu de 0.2
    
    const material = earth.material as THREE.ShaderMaterial;
    material.uniforms.normalScale.value = new THREE.Vector2(normalValue, normalValue);
    material.uniforms.bumpScale.value = bumpValue;
    material.uniforms.displacementScale.value = displacementValue;
    material.uniforms.reliefIntensity.value = reliefIntensity.value;
    material.needsUpdate = true;
    
    console.log(`Relief mis à jour: normal=${normalValue}, bump=${bumpValue}, displacement=${displacementValue}`);
  }
}

// Observation des changements sur reliefIntensity
watch(reliefIntensity, () => {
  updateReliefIntensity();
});

// Fonction pour gérer les clics sur la scène
function onDocumentMouseDown(event: MouseEvent) {
  if (!container.value) return;
  
  // Calculer la position de la souris en coordonnées normalisées (-1 à +1)
  const rect = container.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Mettre à jour le raycaster avec la position de la souris
  raycaster.setFromCamera(mouse, camera);
  
  // Calculer les objets qui sont intersectés
  const intersects = raycaster.intersectObject(earth);
  
  // Si la Terre est cliquée
  if (intersects.length > 0) {
    // Point d'impact sur la Terre
    const intersectionPoint = intersects[0].point;
    
    // Créer et lancer une météorite vers ce point
    createMeteorite(intersectionPoint);
  }
}

// Fonction pour créer et animer une météorite
function createMeteorite(targetPoint: THREE.Vector3) {
  // Créer une position de départ dans la même direction que la cible, mais plus loin
  const startDirection = targetPoint.clone().normalize();
  const startDistance = 30 + Math.random() * 10; // Distance variable
  const startPoint = startDirection.multiplyScalar(startDistance); // Même direction que la cible
  
  // Ajout d'un peu d'aléatoire à la position de départ
  const deviation = 5 + Math.random() * 5; // Déviation variable
  startPoint.x += (Math.random() - 0.5) * deviation;
  startPoint.y += (Math.random() - 0.5) * deviation;
  startPoint.z += (Math.random() - 0.5) * deviation;
  
  // Taille variable de la météorite
  const meteoriteSize = 0.3 + Math.random() * 0.4;
  
  // Créer la géométrie de la météorite avec une forme irrégulière
  const meteoriteGeometry = new THREE.IcosahedronGeometry(meteoriteSize, 1);
  
  // Déformer légèrement la géométrie pour un aspect plus irrégulier
  const positionAttribute = meteoriteGeometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  
  for (let i = 0; i < positionAttribute.count; i++) {
    vertex.fromBufferAttribute(positionAttribute, i);
    
    // Ajouter une déformation aléatoire
    vertex.x += (Math.random() - 0.5) * 0.2;
    vertex.y += (Math.random() - 0.5) * 0.2;
    vertex.z += (Math.random() - 0.5) * 0.2;
    
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  
  // Mettre à jour les normales après déformation
  meteoriteGeometry.computeVertexNormals();
  
  // Création du matériau de la météorite
  const meteoriteMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.8,
    metalness: 0.2,
    emissive: 0xff4400,
    emissiveIntensity: 0.5 // Rougeoiement dû à la chaleur
  });
  
  // Créer le mesh de la météorite
  const meteorite = new THREE.Mesh(meteoriteGeometry, meteoriteMaterial);
  meteorite.position.copy(startPoint);
  meteorite.castShadow = true;
  
  // Orienter la météorite vers sa trajectoire
  meteorite.lookAt(targetPoint);
  // Ajouter une rotation aléatoire sur l'axe de la direction
  meteorite.rotateOnAxis(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
  
  scene.add(meteorite);
  
  // Ajouter une traînée de particules
  const particlesGeometry = new THREE.BufferGeometry();
  const particleCount = 60; // Plus de particules pour une traînée plus longue
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const colors = new Float32Array(particleCount * 3);
  
  // Couleurs pour la traînée - du jaune au rouge puis au noir
  const particleColors = [
    new THREE.Color(0xffcc00), // jaune 
    new THREE.Color(0xff9900), // orange
    new THREE.Color(0xff3300), // rouge
    new THREE.Color(0x330000), // rouge foncé
  ];
  
  for (let i = 0; i < particleCount; i++) {
    // Les particules suivent la météorite avec un léger décalage aléatoire
    positions[i * 3] = meteorite.position.x;
    positions[i * 3 + 1] = meteorite.position.y;
    positions[i * 3 + 2] = meteorite.position.z;
    
    // Tailles variées pour les particules, plus petites en fin de traînée
    const sizeFactor = 1 - (i / particleCount);
    sizes[i] = (Math.random() * 0.1 + 0.05) * sizeFactor * meteoriteSize;
    
    // Couleur dégradée le long de la traînée
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
  
  // Matériau de particules avec un aspect de flamme
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
  
  // Stocker la météorite et ses données dans le tableau
  const meteoriteData: MeteoriteData = {
    mesh: meteorite,
    particles: particles,
    particlesPositions: positions,
    target: targetPoint.clone(),
    start: startPoint.clone(),
    startTime: Date.now(),
    duration: 1500 + Math.random() * 1000, // Durée variable entre 1.5 et 2.5 secondes
    impacted: false,
    size: meteoriteSize
  };
  
  // Ajouter à la liste des météorites actives
  meteorites.push(meteoriteData);
}

// Fonction pour mettre à jour l'animation des météorites
function updateMeteorites() {
  const now = Date.now();
  const meteoritesToRemove: number[] = [];
  
  // Parcourir toutes les météorites actives
  meteorites.forEach((meteorite, index) => {
    // Calculer la progression de l'animation (0 à 1)
    const elapsed = now - meteorite.startTime;
    let progress = Math.min(1.0, elapsed / meteorite.duration);
    
    // Si la météorite n'a pas encore atteint sa cible
    if (progress < 1.0) {
      // Calculer la nouvelle position en interpolant entre le départ et la cible
      const newPosition = new THREE.Vector3().lerpVectors(
        meteorite.start,
        meteorite.target,
        progress
      );
      
      // Ajouter une légère trajectoire courbe plongeante
      const upOffset = new THREE.Vector3(0, 1, 0);
      // Soustraire l'offset pour créer une trajectoire plongeante
      upOffset.multiplyScalar(-Math.sin(progress * Math.PI) * 2);
      newPosition.add(upOffset);
      
      // Mettre à jour la position
      meteorite.mesh.position.copy(newPosition);
      
      // Faire tourner la météorite
      const rotationSpeed = 0.02 + progress * 0.04; // Accélération de la rotation à l'approche
      meteorite.mesh.rotation.x += rotationSpeed;
      meteorite.mesh.rotation.y += rotationSpeed * 1.5;
      meteorite.mesh.rotation.z += rotationSpeed * 0.5;
      
      // Mettre à jour la taille (grossit un peu en s'approchant)
      const scale = meteorite.size + progress * 0.5;
      meteorite.mesh.scale.set(scale, scale, scale);
      
      // Mettre à jour les particules (traînée)
      const positions = meteorite.particlesPositions;
      const particleGeometry = meteorite.particles.geometry;
      
      // Décaler toutes les particules
      for (let i = (positions.length / 3) - 1; i > 0; i--) {
        positions[i * 3] = positions[(i - 1) * 3];
        positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
        positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
      }
      
      // Ajouter la position actuelle au début
      positions[0] = newPosition.x;
      positions[1] = newPosition.y;
      positions[2] = newPosition.z;
      
      // Mettre à jour la géométrie des particules
      particleGeometry.attributes.position.needsUpdate = true;
      
      // Ajuster l'opacité des particules en fonction de la vitesse
      const speedFactor = 1.0 + (progress * 0.5);
      (meteorite.particles.material as THREE.PointsMaterial).opacity = 0.6 + speedFactor * 0.4;
      
      // Augmenter la luminosité à l'approche de l'impact
      const emissiveIntensity = 0.5 + progress * 1.5;
      (meteorite.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
    } 
    // Si la météorite a atteint sa cible
    else if (!meteorite.impacted) {
      // Marquer comme impactée
      meteorite.impacted = true;
      
      // Créer un effet d'explosion à l'impact
      createImpactEffect(meteorite.target);
      
      // Prévoir de supprimer la météorite après l'impact
      meteoritesToRemove.push(index);
    }
  });
  
  // Supprimer les météorites qui ont déjà frappé (en ordre décroissant pour éviter les problèmes d'index)
  meteoritesToRemove.sort((a, b) => b - a);
  for (const index of meteoritesToRemove) {
    const meteorite = meteorites[index];
    
    // Retirer les objets de la scène
    scene.remove(meteorite.mesh);
    scene.remove(meteorite.particles);
    
    // Supprimer du tableau
    meteorites.splice(index, 1);
  }
}

// Fonction pour créer un effet d'impact
function createImpactEffect(position: THREE.Vector3) {
  // 1. Créer un flash lumineux
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
  
  // 2. Créer des particules d'explosion
  const explosionGeometry = new THREE.BufferGeometry();
  const particleCount = 100;
  const explosionPositions = new Float32Array(particleCount * 3);
  const explosionSizes = new Float32Array(particleCount);
  const explosionColors = new Float32Array(particleCount * 3);
  
  // Couleurs pour les particules d'explosion
  const colors = [
    new THREE.Color(0xff0000), // Rouge
    new THREE.Color(0xff5500), // Orange
    new THREE.Color(0xff9900), // Jaune orangé
    new THREE.Color(0xffcc00), // Jaune
  ];
  
  // Initialiser les particules
  for (let i = 0; i < particleCount; i++) {
    // Position initiale = position d'impact
    explosionPositions[i * 3] = position.x;
    explosionPositions[i * 3 + 1] = position.y;
    explosionPositions[i * 3 + 2] = position.z;
    
    // Tailles variées
    explosionSizes[i] = Math.random() * 0.2 + 0.05;
    
    // Couleur aléatoire parmi les options
    const color = colors[Math.floor(Math.random() * colors.length)];
    explosionColors[i * 3] = color.r;
    explosionColors[i * 3 + 1] = color.g;
    explosionColors[i * 3 + 2] = color.b;
  }
  
  explosionGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3));
  explosionGeometry.setAttribute('size', new THREE.BufferAttribute(explosionSizes, 1));
  explosionGeometry.setAttribute('color', new THREE.BufferAttribute(explosionColors, 3));
  
  // Matériau pour les particules d'explosion
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
  
  // 3. Créer un cratère sur la surface de la Terre (déformation)
  const targetDirection = position.clone().normalize();
  const earthRadius = 2; // Le rayon de la Terre
  const craterPosition = targetDirection.multiplyScalar(earthRadius);
  
  // Animation pour l'explosion
  const startTime = Date.now();
  const explosionDuration = 1500; // Durée de l'effet en ms
  
  function animateExplosion() {
    const now = Date.now();
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / explosionDuration);
    
    // Animer le flash (grandit puis disparaît)
    if (progress < 0.2) {
      // Expansion rapide
      const scale = progress * 5;
      flash.scale.set(scale, scale, scale);
    } else {
      // Disparition progressive
      flash.material.opacity = 1.0 - (progress - 0.2) / 0.8;
      
      if (progress >= 0.99) {
        scene.remove(flash);
      }
    }
    
    // Animer les particules d'explosion
    if (progress < 0.99) {
      const positions = explosion.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < particleCount; i++) {
        // Direction aléatoire pour chaque particule
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI * 2;
        
        const speed = 0.05 * (1.0 - progress); // Ralentissement progressif
        
        // Déplacer les particules vers l'extérieur
        positions[i * 3] += Math.sin(angle1) * Math.cos(angle2) * speed;
        positions[i * 3 + 1] += Math.sin(angle1) * Math.sin(angle2) * speed;
        positions[i * 3 + 2] += Math.cos(angle1) * speed;
      }
      
      explosion.geometry.attributes.position.needsUpdate = true;
      
      // Réduire l'opacité
      explosion.material.opacity = 1.0 - progress;
      
      requestAnimationFrame(animateExplosion);
    } else {
      scene.remove(explosion);
    }
  }
  
  animateExplosion();
}

// Fonction pour mettre à jour les paramètres du bloom
function updateBloomEffect() {
  if (composer) {
    const bloomPass = composer.passes.find(pass => pass instanceof UnrealBloomPass) as UnrealBloomPass;
    if (bloomPass) {
      bloomPass.strength = bloomIntensity.value;
    }
  }
}

// Fonction pour gérer la pause/reprise
function togglePause() {
  isPaused.value = !isPaused.value;
  if (!isPaused.value) {
    animate();
  }
}

// Fonction pour créer une météorite aléatoire
function createRandomMeteorite() {
  if (isPaused.value) return;
  
  // Position aléatoire sur la sphère de la Terre
  const phi = Math.random() * Math.PI * 2;
  const theta = Math.random() * Math.PI;
  const radius = 2; // Rayon de la Terre
  
  const targetPoint = new THREE.Vector3(
    radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.sin(theta) * Math.sin(phi),
    radius * Math.cos(theta)
  );
  
  createMeteorite(targetPoint);
}

// Fonction pour gérer les touches du clavier
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
  
  // Démarrer la création automatique de météorites
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