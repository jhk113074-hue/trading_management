

class Viewer3D {
    constructor() {
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.meshes = [];
        this.containerMesh = null;
        
        this.dimensions = null; // {l, w, h}
        
        // Expose to window for app.js
        window.Viewer3D = this;
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.resize();
        this.container.appendChild(this.renderer.domElement);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#111111'); // Dark background

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 1, 100000);
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5000, 10000, 5000);
        this.scene.add(dirLight);
        
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight2.position.set(-5000, 5000, -5000);
        this.scene.add(dirLight2);

        // Grid Helper
        const gridHelper = new THREE.GridHelper(20000, 20, 0x444444, 0x222222);
        gridHelper.position.y = -1; // slightly below floor
        this.scene.add(gridHelper);

        // Animation Loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        // Resize Listener
        window.addEventListener('resize', this.resize.bind(this));
    }

    resize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        // Keep a 4:3 or 16:9 aspect ratio if height isn't constrained, or just match container
        // Since container height is 0 initially, let's force a height based on width
        const height = width * 0.42; 
        this.container.style.height = height + 'px';
        
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    animate() {
        requestAnimationFrame(this.animate);
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    clearScene() {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });
        this.meshes = [];

        if (this.containerMesh) {
            this.scene.remove(this.containerMesh);
            this.containerMesh.geometry.dispose();
            this.containerMesh.material.dispose();
            this.containerMesh = null;
        }
    }

    update(result, colors) {
        if (!this.scene) return;
        this.clearScene();
        this.dimensions = result.dimensions;

        const { l, w, h } = this.dimensions;
        
        // We will center the container at (0, h/2, 0)
        // ThreeJS Coordinate System: Y is up.
        // Packer data: x (along L), y (along W), z (along H).
        // Let's map: 
        // Packer X -> Three X
        // Packer Y -> Three Z
        // Packer Z -> Three Y
        const offsetX = -l / 2;
        const offsetZ = -w / 2;
        const offsetY = 0;

        // Draw Container (Wireframe / Edges)
        const boxGeo = new THREE.BoxGeometry(l, h, w);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x88aa88, transparent: true, opacity: 0.5 });
        this.containerMesh = new THREE.LineSegments(edges, lineMat);
        this.containerMesh.position.set(0, h/2, 0);
        this.scene.add(this.containerMesh);

        const textureCache = {};

        // Draw Pallets
        result.loaded.forEach(item => {
            const itemColor = colors[item.name] || '#3b82f6';
            const labelText = `[${item.globalIndex}] ${item.name}-${item.itemIndex}`;
            
            // Box size: length -> x, height -> y, width -> z
            const geom = new THREE.BoxGeometry(item.packedL, item.packedH, item.packedW);
            
            const mat = new THREE.MeshPhongMaterial({ 
                color: itemColor,
                transparent: true,
                opacity: 0.75,
                shininess: 30
            });
            
            const mesh = new THREE.Mesh(geom, mat);

            // Edges for better visibility
            const edgeGeo = new THREE.EdgesGeometry(geom);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
            const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
            mesh.add(edgeMesh);

            // Position (center of the box)
            const posX = offsetX + item.x + (item.packedL / 2);
            const posY = offsetY + item.z + (item.packedH / 2);
            const posZ = offsetZ + item.y + (item.packedW / 2);
            
            mesh.position.set(posX, posY, posZ);
            
            this.scene.add(mesh);
            this.meshes.push(mesh);

            // Add Text Sprite
            let tex = textureCache[labelText];
            if (!tex) {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 50px sans-serif';
                
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,1)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                ctx.fillText(labelText, 256, 64);
                ctx.fillText(labelText, 256, 64); // draw twice for stronger shadow
                
                tex = new THREE.CanvasTexture(canvas);
                textureCache[labelText] = tex;
            }

            const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.renderOrder = 999;
            
            // Scale sprite to fit inside box
            const maxDim = Math.max(item.packedL, item.packedW, item.packedH);
            const spriteW = Math.min(maxDim * 0.9, 800); 
            const spriteH = spriteW / 4;
            
            sprite.scale.set(spriteW, spriteH, 1);
            // Position slightly above center to avoid Z-fighting
            sprite.position.set(posX, posY + 10, posZ);
            
            this.scene.add(sprite);
            this.meshes.push(sprite);
        });

        this.setCamera('iso');
    }

    setCamera(preset) {
        if (!this.dimensions || !this.camera || !this.controls) return;
        const { l, w, h } = this.dimensions;
        
        // Calculate a reasonable distance based on container size
        const maxDim = Math.max(l, w, h);
        const dist = maxDim * 1.5;

        // Target is center of container
        this.controls.target.set(0, h/2, 0);

        switch(preset) {
            case 'iso':
            case 'reset':
                this.camera.position.set(dist * 0.8, dist * 0.8, dist * 0.8);
                break;
            case 'top':
                this.camera.position.set(0, dist, 0);
                break;
            case 'side':
                this.camera.position.set(0, h/2, dist);
                break;
            case 'front':
                this.camera.position.set(dist, h/2, 0);
                break;
        }
        
        this.controls.update();
    }
}

// Auto-initialize when module loads
const viewer = new Viewer3D();
document.addEventListener('DOMContentLoaded', () => {
    // We defer the actual DOM attachment until the 3D wrapper is visible 
    // or just attach it to the hidden container. It will resize when shown.
    viewer.init('container-3d');
});
