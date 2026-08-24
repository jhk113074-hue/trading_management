class Viewer3D {
    constructor() {
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.meshes = [];
        this.palletMeshes = []; // { mesh, item, outlineMesh, labelSprite }
        this.containerMesh = null;
        this.selectedGlobalIndex = null;
        this.highlightBox = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.dimensions = null; // {l, w, h}
        this.lastResult = null;
        this.lastColors = null;
        this.currentStep = 999;

        // 3D Drag and Drop Properties
        this.dragPlane = new THREE.Plane();
        this.planeIntersectPoint = new THREE.Vector3();
        this.dragOffset = new THREE.Vector3();
        this.draggedPallet = null;
        this.isDraggingPallet3D = false;
        this.dragStartMousePos = { x: 0, y: 0 };
        this.dragItemStartCoords = { x: 0, y: 0, z: 0 };
        this.hasMovedIn3D = false;
        this.mode = 'view'; // 'view' | 'edit' | 'fresh'
        
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
        this.scene.background = new THREE.Color('#0f172a'); // Slate 900 dark background

        // Camera
        const initW = this.container.clientWidth || 800;
        const initH = Math.max(380, initW * 0.42);
        this.camera = new THREE.PerspectiveCamera(45, initW / initH, 1, 100000);
        this.camera.position.set(7000, 5000, 7000);
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1200, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight.position.set(5000, 10000, 5000);
        this.scene.add(dirLight);
        
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.45);
        dirLight2.position.set(-5000, 5000, -5000);
        this.scene.add(dirLight2);

        // Grid Helper
        const gridHelper = new THREE.GridHelper(30000, 30, 0x334155, 0x1e293b);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);

        // Animation Loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        // Resize Listener
        window.addEventListener('resize', this.resize.bind(this));

        // --- Mouse Interaction System ---
        let mouseDownPos = { x: 0, y: 0 };
        const tooltip = document.getElementById('tooltip-3d-pallet');
        const tooltipName = document.getElementById('tooltip-3d-name');
        const tooltipSpec = document.getElementById('tooltip-3d-spec');

        const getMouseNDC = (e) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((e.clientY - rect.top) / rect.height) * 2 + 1
            };
        };

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Primary button
            mouseDownPos = { x: e.clientX, y: e.clientY };

            if (this.mode === 'view') {
                this.controls.enabled = true;
                return;
            }

            const ndc = getMouseNDC(e);
            this.mouse.x = ndc.x;
            this.mouse.y = ndc.y;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const clickableMeshes = this.palletMeshes.filter(pm => pm.mesh.visible).map(pm => pm.mesh);
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

            if (this.draggedPallet && (this.mode === 'edit' || this.mode === 'fresh')) {
                const distMoved = Math.hypot(e.clientX - this.dragStartMousePos.x, e.clientY - this.dragStartMousePos.y);
                if (!this.hasMovedIn3D && distMoved < 6) return;
                
                this.isDraggingPallet3D = true;
                this.hasMovedIn3D = true;
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

                    // Magnetic Snapping (100mm tolerance)
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
                                    else if (Math.abs(targetY - other.y) < snapDist) { targetY = other.y; snappedY = true; }
                                }
                            });
                        }
                    }

                    if (!snappedX) targetX = Math.round(targetX / 50) * 50;
                    if (!snappedY) targetY = Math.round(targetY / 50) * 50;

                    const maxX = l + 8000;
                    const finalX = Math.max(0, Math.min(maxX, Math.round(targetX)));
                    const finalY = Math.max(0, Math.min(w * 1.5, Math.round(targetY)));
                    const shiftX = finalX - item.x;
                    const shiftY = finalY - item.y;

                    // Shift stacked 2단 pallet if moving 1단
                    if (item.z === 0 && window.currentResults && window.currentResultIndex !== undefined) {
                        const currentRes = window.currentResults[window.currentResultIndex];
                        if (currentRes && currentRes.loaded) {
                            currentRes.loaded.forEach(other => {
                                if (other.globalIndex !== item.globalIndex && other.z > 0) {
                                    if (Math.abs(other.x - item.x) < 300 && Math.abs(other.y - item.y) < 300) {
                                        other.x = Math.max(0, Math.min(maxX, other.x + shiftX));
                                        other.y = Math.max(0, Math.min(w * 1.5, other.y + shiftY));
                                    }
                                }
                            });
                        }
                    }

                    item.x = finalX;
                    item.y = finalY;

                    const newWorldX = offsetX + item.x + (item.packedL / 2);
                    const newWorldZ = offsetZ + item.y + (item.packedW / 2);
                    this.draggedPallet.mesh.position.x = newWorldX;
                    this.draggedPallet.mesh.position.z = newWorldZ;
                    if (this.highlightBox) {
                        this.highlightBox.position.x = newWorldX;
                        this.highlightBox.position.z = newWorldZ;
                    }

                    if (typeof window.syncPalletPositionFrom3D === 'function') {
                        window.syncPalletPositionFrom3D(item);
                    }
                    this.updateHudInfo(item);
                }
            } else {
                // Tooltip & Hover Detection
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const clickableMeshes = this.palletMeshes.filter(pm => pm.mesh.visible).map(pm => pm.mesh);
                const intersects = this.raycaster.intersectObjects(clickableMeshes);

                if (intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                    if (pm && pm.item) {
                        this.renderer.domElement.style.cursor = this.mode === 'view' ? 'pointer' : 'grab';
                        if (tooltip && tooltipName && tooltipSpec) {
                            const item = pm.item;
                            tooltip.style.display = 'block';
                            tooltipName.innerHTML = `[#${item.globalIndex}] ${item.name}`;
                            const tierStr = item.x >= (this.dimensions?.l || 99999) ? '📦 대기장소 (밖)' : (item.z > 0 ? '2단 적재 (상단)' : '1단 적재 (바닥)');
                            tooltipSpec.textContent = `크기: ${item.packedL}×${item.packedW}×${item.packedH} mm | ${tierStr}`;
                        }
                    }
                } else {
                    this.renderer.domElement.style.cursor = 'default';
                    if (tooltip) tooltip.style.display = 'none';
                }
            }
        });

        const handleMouseUp = (e) => {
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

            // Click handling (if clicked without dragging)
            if (distMoved < 6) {
                const ndc = getMouseNDC(e);
                this.mouse.x = ndc.x;
                this.mouse.y = ndc.y;
                this.raycaster.setFromCamera(this.mouse, this.camera);

                const clickableMeshes = this.palletMeshes.filter(pm => pm.mesh.visible).map(pm => pm.mesh);
                const intersects = this.raycaster.intersectObjects(clickableMeshes);

                if (intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                    if (pm && pm.item) {
                        this.selectPallet(pm.item.globalIndex);
                        if (typeof window.onPalletSelected === 'function') {
                            window.onPalletSelected(pm.item);
                        }
                    }
                } else {
                    // Clicked background: Deselect
                    this.selectPallet(null);
                    if (typeof window.onPalletDeselected === 'function') {
                        window.onPalletDeselected();
                    }
                }
            }
        };

        this.renderer.domElement.addEventListener('mouseup', handleMouseUp);
        this.renderer.domElement.addEventListener('mouseleave', () => {
            if (this.draggedPallet) {
                this.draggedPallet = null;
                this.isDraggingPallet3D = false;
                this.hasMovedIn3D = false;
                this.controls.enabled = true;
            }
            if (tooltip) tooltip.style.display = 'none';
        });

        // Double click to rotate 90°
        this.renderer.domElement.addEventListener('dblclick', (e) => {
            if (this.mode === 'view') return;
            const ndc = getMouseNDC(e);
            this.mouse.x = ndc.x;
            this.mouse.y = ndc.y;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const clickableMeshes = this.palletMeshes.filter(pm => pm.mesh.visible).map(pm => pm.mesh);
            const intersects = this.raycaster.intersectObjects(clickableMeshes);

            if (intersects.length > 0) {
                const hitMesh = intersects[0].object;
                const pm = this.palletMeshes.find(p => p.mesh === hitMesh);
                if (pm && pm.item && window.rotatePallet90) {
                    window.rotatePallet90(pm.item);
                }
            }
        });
    }

    setMode(mode) {
        this.mode = mode;
        this.updateModeUI();
    }

    updateModeUI() {
        const btnView = document.getElementById('btn-mode-3d-view');
        const btnEdit = document.getElementById('btn-mode-3d-edit');
        const btnFresh = document.getElementById('btn-mode-3d-fresh');
        const banner = document.getElementById('mode-3d-banner');
        const playerBar = document.getElementById('player-3d-sequence-bar');
        const hud = document.getElementById('hud-3d-pallet-ctrl');

        const resetBtn = (btn) => {
            if (!btn) return;
            btn.classList.remove('active');
            btn.style.background = '#f1f5f9';
            btn.style.color = '#475569';
            btn.style.border = '1px solid #cbd5e1';
            btn.style.boxShadow = 'none';
        };

        const setActive = (btn, bg, border, shadow) => {
            if (!btn) return;
            btn.classList.add('active');
            btn.style.background = bg;
            btn.style.color = '#ffffff';
            btn.style.border = border;
            btn.style.boxShadow = shadow;
        };

        resetBtn(btnView);
        resetBtn(btnEdit);
        resetBtn(btnFresh);

        if (this.mode === 'fresh') {
            setActive(btnFresh, '#4f46e5', '1px solid #4338ca', '0 2px 6px rgba(79,70,229,0.35)');
            if (playerBar) playerBar.style.display = 'none';
        } else if (this.mode === 'edit') {
            setActive(btnEdit, '#3b82f6', '1px solid #2563eb', '0 2px 6px rgba(37,99,235,0.35)');
            if (playerBar) playerBar.style.display = 'none';
        } else {
            setActive(btnView, '#0284c7', '1px solid #0284c7', '0 2px 6px rgba(2,132,199,0.35)');
            if (playerBar) playerBar.style.display = 'block';
            if (hud) hud.style.display = 'none';
        }

        if (banner) {
            if (this.mode === 'fresh') {
                banner.style.background = '#eef2ff';
                banner.style.border = '1.5px solid #a5b4fc';
                banner.style.color = '#3730a3';
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="background: #4f46e5; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 11.5px;">📦 수동 적재 (대기실)</span>
                        <span>화물들이 컨테이너 밖 대기장소에 있습니다. <b>[1개씩 적재]</b> 버튼을 누르거나 직접 원하는 위치에 넣으세요.</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <button type="button" id="btn-banner-load-next" style="background: #4f46e5; color: #ffffff; border: 1px solid #4338ca; font-weight: 750; font-size: 12px; padding: 4px 12px; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 5px rgba(79,70,229,0.3);">
                            📥 다음 화물 1개 적재
                        </button>
                        <button type="button" id="btn-banner-move-all-out" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-weight: 750; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                            📤 전체 밖으로 꺼내기
                        </button>
                        <button type="button" id="btn-banner-reset-auto" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-weight: 750; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                            ↩️ 최적배치 원상복귀
                        </button>
                    </div>
                `;
                const btnLoadNext = document.getElementById('btn-banner-load-next');
                const btnMoveAllOut = document.getElementById('btn-banner-move-all-out');
                const btnResetAuto = document.getElementById('btn-banner-reset-auto');
                if (btnLoadNext && window.loadNextPalletIntoContainer) btnLoadNext.onclick = () => window.loadNextPalletIntoContainer();
                if (btnMoveAllOut && window.moveAllPalletsOutside) btnMoveAllOut.onclick = window.moveAllPalletsOutside;
                if (btnResetAuto && window.resetToAutoPacking) btnResetAuto.onclick = window.resetToAutoPacking;
            } else if (this.mode === 'edit') {
                banner.style.background = '#fef2f2';
                banner.style.border = '1.5px solid #f87171';
                banner.style.color = '#991b1b';
                banner.innerHTML = `
                    <span style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 11.5px;">✏️ 3D 직접 수정</span>
                        <span>화물을 <b>클릭하여 선택 후 스마트 정렬 버튼(앞/뒤/좌/우 밀착)이나 키보드 방향키</b>로 이동하세요.</span>
                    </span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" id="btn-banner-switch-fresh" style="background: #4f46e5; color: #ffffff; border: 1px solid #4338ca; font-weight: 750; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                            📦 수동 적재 모드로 전환
                        </button>
                        <button type="button" id="btn-banner-switch-view" style="background: #ffffff; color: #0284c7; border: 1px solid #bae6fd; font-weight: 750; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                            👁️ 시퀀스 보기로 전환
                        </button>
                    </div>
                `;
                const btnSwitchFresh = document.getElementById('btn-banner-switch-fresh');
                const btnSwitchView = document.getElementById('btn-banner-switch-view');
                if (btnSwitchFresh) btnSwitchFresh.onclick = () => {
                    this.setMode('fresh');
                    if (window.moveAllPalletsOutside) window.moveAllPalletsOutside();
                };
                if (btnSwitchView) btnSwitchView.onclick = () => this.setMode('view');
            } else {
                banner.style.background = '#f0f9ff';
                banner.style.border = '1.5px solid #7dd3fc';
                banner.style.color = '#0369a1';
                banner.innerHTML = `
                    <span style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #0284c7; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 11.5px;">👁️ 시퀀스 보기</span>
                        <span>마우스 드래그로 <b>360° 회전 및 휠 줌</b>하여 점검하거나, 하단 플레이어로 <b>적재 순서를 재생</b>하세요.</span>
                    </span>
                    <button type="button" id="btn-banner-switch-edit" style="background: #3b82f6; color: #ffffff; border: 1px solid #2563eb; font-weight: 750; font-size: 12px; padding: 4px 12px; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 5px rgba(37,99,235,0.3);">
                        ✏️ 화물 직접 수정하기
                    </button>
                `;
                const btnSwitch = document.getElementById('btn-banner-switch-edit');
                if (btnSwitch) {
                    btnSwitch.onclick = () => this.setMode('edit');
                }
            }
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
        if (globalIndex === null || globalIndex === undefined) {
            if (hud) hud.style.display = 'none';
            return;
        }
        
        const pm = this.palletMeshes.find(p => p.item && p.item.globalIndex === globalIndex);
        if (pm && pm.mesh) {
            const item = pm.item;
            const hlGeo = new THREE.BoxGeometry(item.packedL + 25, item.packedH + 25, item.packedW + 25);
            const hlEdges = new THREE.EdgesGeometry(hlGeo);
            const hlMat = new THREE.LineBasicMaterial({ color: 0xffe600, linewidth: 4 });
            this.highlightBox = new THREE.LineSegments(hlEdges, hlMat);
            this.highlightBox.position.copy(pm.mesh.position);
            this.scene.add(this.highlightBox);

            if (this.mode !== 'view' && hud) {
                hud.style.display = 'block';
                this.updateHudInfo(item);
            }
        } else {
            if (hud) hud.style.display = 'none';
        }
    }

    updateHudInfo(item) {
        const hudTitle = document.getElementById('hud-title');
        const hudCoords = document.getElementById('hud-coords');
        const hudTierBtn = document.getElementById('hud-btn-tier');
        const hudInOutBtn = document.getElementById('hud-btn-inout');

        if (hudTitle) hudTitle.innerHTML = `[#${item.globalIndex}] ${item.name} <small style="color:#94a3b8; font-weight:normal;">(${item.packedL}×${item.packedW}×${item.packedH}mm)</small>`;
        const isOutside = this.dimensions && item.x >= this.dimensions.l;
        const locText = isOutside ? '📦 컨테이너 밖 (대기장소)' : (item.z > 0 ? '2단 적재 (상단)' : '1단 적재 (바닥)');
        if (hudCoords) hudCoords.textContent = `위치: X=${item.x}mm, Y=${item.y}mm, Z=${item.z}mm | ${locText}`;
        if (hudTierBtn) hudTierBtn.innerHTML = item.z > 0 ? '🔽 1단(바닥) 내리기' : '🔼 2단(상단) 올리기';
        if (hudInOutBtn) {
            hudInOutBtn.innerHTML = isOutside ? '📥 컨테이너 안으로 넣기' : '📤 밖으로 꺼내기';
            hudInOutBtn.style.background = isOutside ? '#059669' : '#d97706';
        }
    }

    setLoadingStep(step) {
        this.currentStep = step;
        if (!this.lastResult || !this.lastResult.loaded) return;

        const total = this.lastResult.loaded.length;
        const safeStep = Math.max(0, Math.min(total, step));

        this.palletMeshes.forEach((pm, idx) => {
            const isVisible = idx < safeStep;
            pm.mesh.visible = isVisible;
            if (pm.labelSprite) pm.labelSprite.visible = isVisible;
        });

        if (this.highlightBox) {
            const pm = this.palletMeshes.find(p => p.item && p.item.globalIndex === this.selectedGlobalIndex);
            if (pm) this.highlightBox.visible = pm.mesh.visible;
        }

        const slider = document.getElementById('seq-slider');
        const counter = document.getElementById('seq-counter');
        if (slider) slider.value = safeStep;
        if (counter) counter.textContent = `${safeStep} / ${total} 적재됨`;
    }

    update(result, colors) {
        if (!this.scene) return;
        this.clearScene();
        this.lastResult = result;
        this.lastColors = colors;
        this.dimensions = result.dimensions;

        const { l, w, h } = this.dimensions;
        const offsetX = -l / 2;
        const offsetZ = -w / 2;
        const offsetY = 0;

        // Container Outline
        const boxGeo = new THREE.BoxGeometry(l, h, w);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.65 });
        this.containerMesh = new THREE.LineSegments(edges, lineMat);
        this.containerMesh.position.set(0, h/2, 0);
        this.scene.add(this.containerMesh);

        // Container Floor
        const floorGeo = new THREE.PlaneGeometry(l, w);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, 0, 0);
        this.scene.add(floorMesh);
        this.meshes.push(floorMesh);

        // Container Floor Grid Lines
        const floorGrid = new THREE.GridHelper(Math.max(l, w), Math.round(l / 1000), 0x0284c7, 0x334155);
        floorGrid.position.set(0, 0, 0);
        this.scene.add(floorGrid);
        this.meshes.push(floorGrid);

        // FRONT WALL (x = -l/2)
        const frontWallGeo = new THREE.PlaneGeometry(w, h);
        const frontWallMat = new THREE.MeshBasicMaterial({ color: 0x064e3b, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
        const frontWallMesh = new THREE.Mesh(frontWallGeo, frontWallMat);
        frontWallMesh.rotation.y = Math.PI / 2;
        frontWallMesh.position.set(-l / 2, h / 2, 0);
        this.scene.add(frontWallMesh);
        this.meshes.push(frontWallMesh);
        frontWallMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(frontWallGeo), new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 })));

        // Front Wall 3D Badge
        const frontBadge = this.createHeaderBadgeSprite('🚪 안쪽 끝 (FRONT WALL)', '#064e3b', '#34d399');
        frontBadge.position.set(-l / 2, h + 340, 0);
        frontBadge.scale.set(1300, 320, 1);
        this.scene.add(frontBadge);
        this.meshes.push(frontBadge);

        // DOOR END (x = +l/2)
        const doorW = w / 2;
        const doorGeo = new THREE.PlaneGeometry(doorW, h);
        const doorMat = new THREE.MeshBasicMaterial({ color: 0x0c4a6e, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });

        const leftDoor = new THREE.Mesh(doorGeo, doorMat);
        leftDoor.position.set(l / 2 + (doorW / 2) * Math.cos(Math.PI / 4.5), h / 2, -w / 2 - (doorW / 2) * Math.sin(Math.PI / 4.5));
        leftDoor.rotation.y = Math.PI / 4.5;
        this.scene.add(leftDoor);
        this.meshes.push(leftDoor);
        leftDoor.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })));

        const rightDoor = new THREE.Mesh(doorGeo, doorMat);
        rightDoor.position.set(l / 2 + (doorW / 2) * Math.cos(Math.PI / 4.5), h / 2, w / 2 + (doorW / 2) * Math.sin(Math.PI / 4.5));
        rightDoor.rotation.y = -Math.PI / 4.5;
        this.scene.add(rightDoor);
        this.meshes.push(rightDoor);
        rightDoor.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })));

        // Door Yellow Hazard Strip
        const rampGeo = new THREE.PlaneGeometry(450, w);
        const rampMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const rampMesh = new THREE.Mesh(rampGeo, rampMat);
        rampMesh.rotation.x = -Math.PI / 2;
        rampMesh.position.set(l / 2 + 225, 0, 0);
        this.scene.add(rampMesh);
        this.meshes.push(rampMesh);

        // Door 3D Badge
        const doorBadge = this.createHeaderBadgeSprite('🚛 컨테이너 문 (DOOR / 입구)', '#0c4a6e', '#38bdf8');
        doorBadge.position.set(l / 2, h + 340, 0);
        doorBadge.scale.set(1500, 360, 1);
        this.scene.add(doorBadge);
        this.meshes.push(doorBadge);

        // STAGING YARD
        const yardLength = 9000;
        const yardGeo = new THREE.PlaneGeometry(yardLength, w * 1.5);
        const yardMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
        const yardMesh = new THREE.Mesh(yardGeo, yardMat);
        yardMesh.rotation.x = -Math.PI / 2;
        yardMesh.position.set(l / 2 + yardLength / 2, -1, 0);
        this.scene.add(yardMesh);
        this.meshes.push(yardMesh);

        const yardEdgeGeo = new THREE.EdgesGeometry(yardGeo);
        const yardEdgeMesh = new THREE.LineSegments(yardEdgeGeo, new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.6 }));
        yardEdgeMesh.rotation.x = -Math.PI / 2;
        yardEdgeMesh.position.set(l / 2 + yardLength / 2, 0, 0);
        this.scene.add(yardEdgeMesh);
        this.meshes.push(yardEdgeMesh);

        const yardBadge = this.createHeaderBadgeSprite('📦 화물 대기 장소 (STAGING YARD / 밖)', '#1e1b4b', '#a5b4fc');
        yardBadge.position.set(l / 2 + 2800, h + 340, 0);
        yardBadge.scale.set(1900, 380, 1);
        this.scene.add(yardBadge);
        this.meshes.push(yardBadge);

        // Draw Pallets
        result.loaded.forEach((item, idx) => {
            const itemColor = colors[item.name] || '#3b82f6';
            const geom = new THREE.BoxGeometry(item.packedL, item.packedH, item.packedW);
            
            const mat = new THREE.MeshPhongMaterial({ 
                color: itemColor,
                transparent: true,
                opacity: 0.8,
                shininess: 35
            });
            
            const mesh = new THREE.Mesh(geom, mat);
            const edgeMesh = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
            mesh.add(edgeMesh);

            const posX = offsetX + item.x + (item.packedL / 2);
            const posY = offsetY + item.z + (item.packedH / 2);
            const posZ = offsetZ + item.y + (item.packedW / 2);
            mesh.position.set(posX, posY, posZ);
            
            this.scene.add(mesh);
            this.meshes.push(mesh);

            // Floating Label Sprite
            const labelSprite = this.createHeaderBadgeSprite(`[#${item.globalIndex}] ${item.name}`, '#0f172a', '#ffffff');
            labelSprite.position.set(posX, posY + item.packedH / 2 + 120, posZ);
            labelSprite.scale.set(Math.min(item.packedL, 1000), 200, 1);
            this.scene.add(labelSprite);
            this.meshes.push(labelSprite);

            this.palletMeshes.push({ mesh, item, labelSprite });
        });

        // Initialize Sequence Slider
        const slider = document.getElementById('seq-slider');
        const counter = document.getElementById('seq-counter');
        if (slider && counter) {
            slider.max = result.loaded.length;
            slider.value = result.loaded.length;
            counter.textContent = `${result.loaded.length} / ${result.loaded.length} 적재됨`;
        }

        if (this.selectedGlobalIndex) {
            this.selectPallet(this.selectedGlobalIndex);
        }
        this.updateModeUI();
    }

    createHeaderBadgeSprite(text, bgColor = '#0f172a', textColor = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(4, 4, 504, 92, 14);
        } else {
            ctx.rect(4, 4, 504, 92);
        }
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 34px sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 50);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        return new THREE.Sprite(spriteMat);
    }

    clearScene() {
        this.palletMeshes = [];
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
                else mesh.material.dispose();
            }
        });
        this.meshes = [];

        if (this.containerMesh) {
            this.scene.remove(this.containerMesh);
            if (this.containerMesh.geometry) this.containerMesh.geometry.dispose();
            if (this.containerMesh.material) this.containerMesh.material.dispose();
            this.containerMesh = null;
        }

        if (this.highlightBox) {
            this.scene.remove(this.highlightBox);
            if (this.highlightBox.geometry) this.highlightBox.geometry.dispose();
            if (this.highlightBox.material) this.highlightBox.material.dispose();
            this.highlightBox = null;
        }
    }

    resize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || (this.container.parentElement ? this.container.parentElement.clientWidth : 800);
        if (width <= 0) return;
        const height = Math.max(380, width * 0.42); 
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

    setCamera(preset) {
        if (!this.camera || !this.controls || !this.dimensions) return;
        const { l, w, h } = this.dimensions;
        const maxDim = Math.max(l, w, h);
        const dist = maxDim * 1.5;

        this.controls.target.set(0, h/2, 0);

        switch(preset) {
            case 'iso':
            case 'reset':
                this.camera.position.set(dist * 0.85, dist * 0.65, dist * 0.85);
                break;
            case 'iso_wide':
                this.camera.position.set(dist * 1.3, dist * 0.9, dist * 1.3);
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

const viewer = new Viewer3D();
document.addEventListener('DOMContentLoaded', () => {
    viewer.init('container-3d');
});
