class Viewer3D {
    constructor() {
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.meshes = [];
        this.palletMeshes = []; // { mesh, item }
        this.containerMesh = null;
        this.selectedGlobalIndex = null;
        this.highlightBox = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.dimensions = null; // {l, w, h}
        this.hasInitializedCamera = false;
        this.lastContainerType = null;

        // 3D Drag and Drop Properties
        this.dragPlane = new THREE.Plane();
        this.planeIntersectPoint = new THREE.Vector3();
        this.dragOffset = new THREE.Vector3();
        this.draggedPallet = null;
        this.isDraggingPallet3D = false;
        this.dragStartMousePos = { x: 0, y: 0 };
        this.dragItemStartCoords = { x: 0, y: 0, z: 0 };
        this.hasMovedIn3D = false;
        this.mode = 'view'; // 'view' (3D 360 회전/줌 관찰) or 'edit' (화물 드래그앤드롭 이동/편집)
        
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
        const initW = this.container.clientWidth || 800;
        const initH = Math.max(340, initW * 0.42);
        this.camera = new THREE.PerspectiveCamera(45, initW / initH, 1, 100000);
        this.camera.position.set(7000, 5000, 7000);
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1200, 0);
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

        // --- 3D Interactive Mouse Drag & Drop & Selection (Click anywhere to select or deselect) ---
        let mouseDownPos = { x: 0, y: 0 };

        const getMouseNDC = (e) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((e.clientY - rect.top) / rect.height) * 2 + 1
            };
        };

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Primary mouse button only

            mouseDownPos = { x: e.clientX, y: e.clientY };
            const ndc = getMouseNDC(e);
            this.mouse.x = ndc.x;
            this.mouse.y = ndc.y;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const clickableMeshes = this.palletMeshes.map(pm => pm.mesh);
            const intersects = this.raycaster.intersectObjects(clickableMeshes);

            if (intersects.length > 0) {
                const hitMesh = intersects[0].object;
                const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                if (pm && pm.item) {
                    this.draggedPallet = pm;
                    this.isDraggingPallet3D = false;
                    this.hasMovedIn3D = false;
                    this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                    this.dragItemStartCoords = { x: pm.item.x, y: pm.item.y, z: pm.item.z };

                    // Set horizontal dragging plane at pallet's current Y height
                    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), pm.mesh.position);
                    this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersectPoint);
                    this.dragOffset.copy(this.planeIntersectPoint).sub(pm.mesh.position);
                }
            }
        });

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            const ndc = getMouseNDC(e);
            this.mouse.x = ndc.x;
            this.mouse.y = ndc.y;

            if (this.draggedPallet) {
                const distMoved = Math.hypot(e.clientX - this.dragStartMousePos.x, e.clientY - this.dragStartMousePos.y);
                if (!this.hasMovedIn3D && distMoved < 6) return;
                
                this.isDraggingPallet3D = true;
                this.hasMovedIn3D = true;

                // Disable OrbitControls while dragging a pallet
                this.controls.enabled = false;
                this.renderer.domElement.style.cursor = 'grabbing';

                this.raycaster.setFromCamera(this.mouse, this.camera);
                if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersectPoint)) {
                    const targetWorldPos = this.planeIntersectPoint.clone().sub(this.dragOffset);
                    const item = this.draggedPallet.item;
                    if (!this.dimensions) return;
                    const { l, w, h } = this.dimensions;
                    const offsetX = -l / 2;
                    const offsetZ = -w / 2;

                    let targetX = targetWorldPos.x - offsetX - (item.packedL / 2);
                    let targetY = targetWorldPos.z - offsetZ - (item.packedW / 2);

                    // Magnetic snapping (100mm tolerance)
                    const snapDist = 100;
                    let snappedX = false;
                    let snappedY = false;

                    if (Math.abs(targetX) < snapDist) { targetX = 0; snappedX = true; }
                    else if (Math.abs(targetX + item.packedL - l) < snapDist) { targetX = l - item.packedL; snappedX = true; }

                    if (Math.abs(targetY) < snapDist) { targetY = 0; snappedY = true; }
                    else if (Math.abs(targetY + item.packedW - w) < snapDist) { targetY = w - item.packedW; snappedY = true; }
                    else if (Math.abs(targetY - (w - item.packedW) / 2) < snapDist) { targetY = Math.round((w - item.packedW) / 2); snappedY = true; }

                    // Snap to other pallets
                    if (window.currentResults && window.currentResultIndex !== undefined) {
                        const currentRes = window.currentResults[window.currentResultIndex];
                        if (currentRes && currentRes.loaded) {
                            currentRes.loaded.forEach(other => {
                                if (other.globalIndex === item.globalIndex) return;
                                if (!snappedX) {
                                    if (Math.abs(targetX - (other.x + other.packedL)) < snapDist) { targetX = other.x + other.packedL; snappedX = true; }
                                    else if (Math.abs(targetX + item.packedL - other.x) < snapDist) { targetX = other.x - item.packedL; snappedX = true; }
                                    else if (Math.abs(targetX - other.x) < snapDist) { targetX = other.x; snappedX = true; }
                                }
                                if (!snappedY) {
                                    if (Math.abs(targetY - (other.y + other.packedW)) < snapDist) { targetY = other.y + other.packedW; snappedY = true; }
                                    else if (Math.abs(targetY + item.packedW - other.y) < snapDist) { targetY = other.y - item.packedW; snappedY = true; }
                                    else if (Math.abs(targetY - other.y) < snapDist) { targetY = other.y - item.packedW; snappedY = true; }
                                }
                            });
                        }
                    }

                    if (!snappedX) targetX = Math.round(targetX / 50) * 50;
                    if (!snappedY) targetY = Math.round(targetY / 50) * 50;

                    const finalX = Math.max(0, Math.min(l - item.packedL, Math.round(targetX)));
                    const finalY = Math.max(0, Math.min(w - item.packedW, Math.round(targetY)));
                    const shiftX = finalX - item.x;
                    const shiftY = finalY - item.y;

                    // If moving 1단 pallet, also shift stacked 2단 pallet sitting on top
                    if (item.z === 0 && window.currentResults && window.currentResultIndex !== undefined) {
                        const currentRes = window.currentResults[window.currentResultIndex];
                        if (currentRes && currentRes.loaded) {
                            currentRes.loaded.forEach(other => {
                                if (other.globalIndex !== item.globalIndex && other.z > 0) {
                                    if (Math.abs(other.x - item.x) < 300 && Math.abs(other.y - item.y) < 300) {
                                        other.x = Math.max(0, Math.min(l - other.packedL, other.x + shiftX));
                                        other.y = Math.max(0, Math.min(w - other.packedW, other.y + shiftY));
                                    }
                                }
                            });
                        }
                    }

                    item.x = finalX;
                    item.y = finalY;

                    // Live sync 3D mesh position & highlight box
                    const newWorldX = offsetX + item.x + (item.packedL / 2);
                    const newWorldZ = offsetZ + item.y + (item.packedW / 2);
                    this.draggedPallet.mesh.position.x = newWorldX;
                    this.draggedPallet.mesh.position.z = newWorldZ;
                    if (this.highlightBox) {
                        this.highlightBox.position.x = newWorldX;
                        this.highlightBox.position.z = newWorldZ;
                    }

                    // Live sync with bottom panel & 2D canvas & HUD
                    if (typeof window.syncPalletPositionFrom3D === 'function') {
                        window.syncPalletPositionFrom3D(item);
                    }
                    const hudCoords = document.getElementById('hud-coords');
                    if (hudCoords) {
                        const tierText = item.z > 0 ? '2단 적재 (상단)' : '1단 적재 (바닥)';
                        hudCoords.textContent = `위치: X=${item.x}mm, Y=${item.y}mm, Z=${item.z}mm | ${tierText}`;
                    }
                }
            } else {
                // Hover detection
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const clickableMeshes = this.palletMeshes.map(pm => pm.mesh);
                const intersects = this.raycaster.intersectObjects(clickableMeshes);
                if (intersects.length > 0) {
                    this.renderer.domElement.style.cursor = 'pointer';
                } else {
                    this.renderer.domElement.style.cursor = 'default';
                }
            }
        });

        const handle3DDragEnd = (e) => {
            const distMoved = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);

            if (this.draggedPallet) {
                if (this.isDraggingPallet3D && this.hasMovedIn3D) {
                    if (typeof window.applyPalletPositionChange === 'function') {
                        window.applyPalletPositionChange(this.draggedPallet.item);
                    }
                }
                this.draggedPallet = null;
                this.isDraggingPallet3D = false;
                this.hasMovedIn3D = false;
                this.controls.enabled = true;
                this.renderer.domElement.style.cursor = 'default';
            }

            // Click handling (if mouse was clicked, not dragged)
            if (distMoved < 6) {
                const ndc = getMouseNDC(e);
                this.mouse.x = ndc.x;
                this.mouse.y = ndc.y;
                this.raycaster.setFromCamera(this.mouse, this.camera);

                const clickableMeshes = this.palletMeshes.map(pm => pm.mesh);
                const intersects = this.raycaster.intersectObjects(clickableMeshes);

                if (intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                    if (pm && pm.item) {
                        // Clicked on a pallet: Select it immediately!
                        this.selectPallet(pm.item.globalIndex);
                        if (typeof window.onPalletSelected === 'function') {
                            window.onPalletSelected(pm.item);
                        }
                    }
                } else {
                    // Clicked on empty space/background: Deselect!
                    this.selectPallet(null);
                    if (typeof window.onPalletDeselected === 'function') {
                        window.onPalletDeselected();
                    }
                }
            }
        };

        this.renderer.domElement.addEventListener('mouseup', handle3DDragEnd);
        this.renderer.domElement.addEventListener('mouseleave', () => {
            if (this.draggedPallet) {
                this.draggedPallet = null;
                this.isDraggingPallet3D = false;
                this.hasMovedIn3D = false;
                this.controls.enabled = true;
            }
        });

        // Double Click to Rotate in 3D
        this.renderer.domElement.addEventListener('dblclick', (e) => {
            const ndc = getMouseNDC(e);
            this.mouse.x = ndc.x;
            this.mouse.y = ndc.y;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const clickableMeshes = this.palletMeshes.map(pm => pm.mesh);
            const intersects = this.raycaster.intersectObjects(clickableMeshes);

            if (intersects.length > 0) {
                const hitMesh = intersects[0].object;
                const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                if (pm && pm.item) {
                    const item = pm.item;
                    const temp = item.packedL;
                    item.packedL = item.packedW;
                    item.packedW = temp;
                    item.rotated = !item.rotated;

                    if (this.dimensions) {
                        if (item.x + item.packedL > this.dimensions.l) item.x = Math.max(0, this.dimensions.l - item.packedL);
                        if (item.y + item.packedW > this.dimensions.w) item.y = Math.max(0, this.dimensions.w - item.packedW);
                    }

                    if (typeof window.applyPalletPositionChange === 'function') {
                        window.applyPalletPositionChange(item);
                    }
                    this.selectPallet(item.globalIndex);
                }
            }
        });
    }

    resize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || (this.container.parentElement ? this.container.parentElement.clientWidth : 800);
        if (width <= 0) return;
        const height = Math.max(340, width * 0.42); 
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

    createHeaderBadgeSprite(text, bgColor, textColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Rounded badge background
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(10, 10, 492, 108, 20);
        } else {
            ctx.rect(10, 10, 492, 108);
        }
        ctx.fill();

        // Border
        ctx.lineWidth = 6;
        ctx.strokeStyle = textColor;
        ctx.stroke();

        // Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = textColor;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(text, 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.renderOrder = 1000;
        return sprite;
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
        this.palletMeshes = [];

        if (this.highlightBox) {
            this.scene.remove(this.highlightBox);
            if (this.highlightBox.geometry) this.highlightBox.geometry.dispose();
            if (this.highlightBox.material) this.highlightBox.material.dispose();
            this.highlightBox = null;
        }

        if (this.containerMesh) {
            this.scene.remove(this.containerMesh);
            this.containerMesh.geometry.dispose();
            this.containerMesh.material.dispose();
            this.containerMesh = null;
        }
    }

    selectPallet(globalIndex) {
        this.selectedGlobalIndex = globalIndex;
        
        if (this.highlightBox) {
            this.scene.remove(this.highlightBox);
            if (this.highlightBox.geometry) this.highlightBox.geometry.dispose();
            if (this.highlightBox.material) this.highlightBox.material.dispose();
            this.highlightBox = null;
        }
        
        const hud = document.getElementById('hud-3d-pallet-ctrl');
        const hudTitle = document.getElementById('hud-title');
        const hudCoords = document.getElementById('hud-coords');
        const hudTierBtn = document.getElementById('hud-btn-tier');

        if (globalIndex === null || globalIndex === undefined) {
            if (hud) hud.style.display = 'none';
            return;
        }
        
        const pm = this.palletMeshes.find(p => p.item && p.item.globalIndex === globalIndex);
        if (pm && pm.mesh) {
            const item = pm.item;
            const hlGeo = new THREE.BoxGeometry(item.packedL + 25, item.packedH + 25, item.packedW + 25);
            const hlEdges = new THREE.EdgesGeometry(hlGeo);
            const hlMat = new THREE.LineBasicMaterial({ color: 0xffe600, linewidth: 4 }); // Bright Yellow highlight
            this.highlightBox = new THREE.LineSegments(hlEdges, hlMat);
            this.highlightBox.position.copy(pm.mesh.position);
            this.scene.add(this.highlightBox);

            // Update HUD overlay
            if (hud) {
                hud.style.display = 'block';
                if (hudTitle) hudTitle.innerHTML = `[#${item.globalIndex}] ${item.name} <small style="color:#94a3b8; font-weight:normal;">(${item.packedL}×${item.packedW}×${item.packedH}mm)</small>`;
                const tierText = item.z > 0 ? '2단 적재 (상단)' : '1단 적재 (바닥)';
                if (hudCoords) hudCoords.textContent = `위치: X=${item.x}mm, Y=${item.y}mm, Z=${item.z}mm | ${tierText}`;
                if (hudTierBtn) hudTierBtn.innerHTML = item.z > 0 ? '🔽 1단(바닥) 내리기' : '🔼 2단(상단) 올리기';
            }
        } else {
            if (hud) hud.style.display = 'none';
        }
    }

    update(result, colors) {
        if (!this.scene) return;
        this.clearScene();
        this.dimensions = result.dimensions;

        const { l, w, h } = this.dimensions;
        
        const offsetX = -l / 2;
        const offsetZ = -w / 2;
        const offsetY = 0;

        // Draw Container (Wireframe / Edges)
        const boxGeo = new THREE.BoxGeometry(l, h, w);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.6 });
        this.containerMesh = new THREE.LineSegments(edges, lineMat);
        this.containerMesh.position.set(0, h/2, 0);
        this.scene.add(this.containerMesh);

        // --- Container Floor Grid & Background Plane ---
        const floorGeo = new THREE.PlaneGeometry(l, w);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, 0, 0);
        this.scene.add(floorMesh);
        this.meshes.push(floorMesh);

        // --- FRONT END (안쪽 벽면 / 깊숙한 안쪽, x = -l/2) ---
        const frontWallGeo = new THREE.PlaneGeometry(w, h);
        const frontWallMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
        const frontWallMesh = new THREE.Mesh(frontWallGeo, frontWallMat);
        frontWallMesh.rotation.y = Math.PI / 2;
        frontWallMesh.position.set(-l / 2, h / 2, 0);
        this.scene.add(frontWallMesh);
        this.meshes.push(frontWallMesh);

        // Front Wall Wireframe Frame (Emerald Green Accent)
        const frontWallFrameMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 3 });
        const frontWallFrame = new THREE.LineSegments(new THREE.EdgesGeometry(frontWallGeo), frontWallFrameMat);
        frontWallMesh.add(frontWallFrame);

        // Floating 3D Badge: FRONT (안쪽 벽면)
        const frontBadge = this.createHeaderBadgeSprite('🚪 안쪽 끝 (FRONT WALL)', '#064e3b', '#34d399');
        frontBadge.position.set(-l / 2, h + 340, 0);
        frontBadge.scale.set(1300, 320, 1);
        this.scene.add(frontBadge);
        this.meshes.push(frontBadge);

        // --- BACK END (컨테이너 문 / 상차 출입구, x = +l/2) ---
        const doorW = w / 2;
        const doorGeo = new THREE.PlaneGeometry(doorW, h);
        const doorMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });

        // Left Door (swung open 40 degrees outward)
        const leftDoor = new THREE.Mesh(doorGeo, doorMat);
        leftDoor.position.set(l / 2 + (doorW / 2) * Math.cos(Math.PI / 4.5), h / 2, -w / 2 - (doorW / 2) * Math.sin(Math.PI / 4.5));
        leftDoor.rotation.y = Math.PI / 4.5;
        this.scene.add(leftDoor);
        this.meshes.push(leftDoor);
        const leftDoorEdges = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
        leftDoor.add(leftDoorEdges);

        // Right Door (swung open 40 degrees outward)
        const rightDoor = new THREE.Mesh(doorGeo, doorMat);
        rightDoor.position.set(l / 2 + (doorW / 2) * Math.cos(Math.PI / 4.5), h / 2, w / 2 + (doorW / 2) * Math.sin(Math.PI / 4.5));
        rightDoor.rotation.y = -Math.PI / 4.5;
        this.scene.add(rightDoor);
        this.meshes.push(rightDoor);
        const rightDoorEdges = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
        rightDoor.add(rightDoorEdges);

        // Door Floor Entrance Strip (Yellow Hazard)
        const rampGeo = new THREE.PlaneGeometry(450, w);
        const rampMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const rampMesh = new THREE.Mesh(rampGeo, rampMat);
        rampMesh.rotation.x = -Math.PI / 2;
        rampMesh.position.set(l / 2 + 225, 0, 0);
        this.scene.add(rampMesh);
        this.meshes.push(rampMesh);

        // Floating 3D Badge: BACK (출입문 / DOOR)
        const doorBadge = this.createHeaderBadgeSprite('🚛 컨테이너 문 (DOOR / 입구)', '#0c4a6e', '#38bdf8');
        doorBadge.position.set(l / 2, h + 340, 0);
        doorBadge.scale.set(1500, 360, 1);
        this.scene.add(doorBadge);
        this.meshes.push(doorBadge);

        const textureCache = {};

        // Draw Pallets
        result.loaded.forEach(item => {
            const itemColor = colors[item.name] || '#3b82f6';
            const labelText = `[${item.globalIndex}] ${item.name}`;
            
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
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
            const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
            mesh.add(edgeMesh);

            // Position (center of the box)
            const posX = offsetX + item.x + (item.packedL / 2);
            const posY = offsetY + item.z + (item.packedH / 2);
            const posZ = offsetZ + item.y + (item.packedW / 2);
            
            mesh.position.set(posX, posY, posZ);
            
            this.scene.add(mesh);
            this.meshes.push(mesh);
            this.palletMeshes.push({ mesh, item });

            // Add Text Sprite
            let tex = textureCache[labelText];
            if (!tex) {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 44px sans-serif';
                
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,1)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                ctx.fillText(labelText, 256, 64);
                ctx.fillText(labelText, 256, 64);
                
                tex = new THREE.CanvasTexture(canvas);
                textureCache[labelText] = tex;
            }

            const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.renderOrder = 999;
            
            const maxDim = Math.max(item.packedL, item.packedW, item.packedH);
            const spriteW = Math.min(maxDim * 0.9, 800); 
            const spriteH = spriteW / 4;
            
            sprite.scale.set(spriteW, spriteH, 1);
            sprite.position.set(posX, posY + 10, posZ);
            
            this.scene.add(sprite);
            this.meshes.push(sprite);
        });

        if (this.selectedGlobalIndex !== null) {
            this.selectPallet(this.selectedGlobalIndex);
        }

        // Auto-fit and focus camera on first load or when switching container
        if (!this.hasInitializedCamera || this.lastContainerType !== result.container) {
            this.lastContainerType = result.container;
            this.hasInitializedCamera = true;
            this.resize();
            this.setCamera('iso');
        }
    }

    setCamera(preset) {
        if (!this.dimensions || !this.camera || !this.controls) return;
        const { l, w, h } = this.dimensions;
        
        const maxDim = Math.max(l, w, h);
        const dist = maxDim * 1.35;

        this.controls.target.set(0, h/2, 0);

        switch(preset) {
            case 'iso':
            case 'reset':
                this.camera.position.set(dist * 0.85, dist * 0.65, dist * 0.85);
                break;
            case 'top':
                this.camera.position.set(0, dist * 1.35, 0);
                break;
            case 'side':
                this.camera.position.set(0, h/2, dist * 1.15);
                break;
            case 'front':
                this.camera.position.set(dist * 1.15, h/2, 0);
                break;
        }
        
        this.camera.lookAt(0, h/2, 0);
        this.controls.update();
    }
}

// Auto-initialize when module loads
const viewer = new Viewer3D();
document.addEventListener('DOMContentLoaded', () => {
    viewer.init('container-3d');
});
