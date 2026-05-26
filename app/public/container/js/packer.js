const Packer = (function() {
    
    const CONTAINERS = {
        '20GP': { l: 5898, w: 2352, h: 2393, maxWeight: 28200 },
        '20RF': { l: 5444, w: 2290, h: 2276, maxWeight: 27000 },
        '40GP': { l: 12032, w: 2352, h: 2393, maxWeight: 28800 },
        '40RF': { l: 11583, w: 2290, h: 2254, maxWeight: 29250 },
        '40HC': { l: 12032, w: 2352, h: 2698, maxWeight: 28800 }
    };

    function expandItems(items) {
        const boxes = [];
        items.forEach(item => {
            for (let i = 0; i < item.qty; i++) {
                boxes.push({
                    ...item,
                    originalId: item.id,
                    qty: 1
                });
            }
        });
        return boxes;
    }

    function sortBoxes(boxes) {
        // Sort by area (w * d) descending, then by height descending
        return boxes.sort((a, b) => {
            const areaA = a.w * a.d;
            const areaB = b.w * b.d;
            if (areaB !== areaA) return areaB - areaA;
            return b.h - a.h;
        });
    }

    function sortSpaces(spaces) {
        // Sort spaces: lowest X (deepest, back of container) first, 
        // then lowest Z (bottom to top for vertical stacking), 
        // then lowest Y (side to side)
        return spaces.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x; // 최우선: 컨테이너 가장 안쪽(x=0)부터
            if (a.z !== b.z) return a.z - b.z; // 그 다음: 같은 x위치에서는 바닥(z)부터 천장으로 쌓기
            return a.y - b.y;                  // 마지막: 폭 방향으로 채우기
        });
    }

    function packInternal(containerType, boxes, isTestMode) {
        const container = CONTAINERS[containerType];
        if (!container) throw new Error("Invalid container type");

        let spaces = [
            { x: 0, y: 0, z: 0, l: container.l, w: container.w, h: container.h }
        ];

        const loaded = [];
        const unloaded = [];
        let currentWeight = 0;

        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            
            // 1. Check weight limit
            if (currentWeight + box.weight > container.maxWeight) {
                unloaded.push({ box, reason: '최대 중량 초과' });
                continue;
            }

            // 2. Find a space
            let placed = false;
            sortSpaces(spaces);

            for (let s = 0; s < spaces.length; s++) {
                const space = spaces[s];

                // If space is not on the floor and box is not stackable, skip
                if (space.z > 0 && !box.stackable) continue;

                let fitOriginal = (box.w <= space.l && box.d <= space.w && box.h <= space.h);
                let fitRotated = false;

                if (box.rotation) {
                    fitRotated = (box.d <= space.l && box.w <= space.w && box.h <= space.h);
                }

                if (fitOriginal || fitRotated) {
                    let useRotated = false;
                    
                    if (fitOriginal && fitRotated) {
                        // Maximize the minimum remaining dimension to prevent thin slivers
                        let scoreOrig = Math.min(space.l - box.w, space.w - box.d);
                        let scoreRot = Math.min(space.l - box.d, space.w - box.w);
                        if (scoreRot > scoreOrig) {
                            useRotated = true;
                        }
                    } else if (fitRotated) {
                        useRotated = true;
                    }

                    let usedL = useRotated ? box.d : box.w;
                    let usedW = useRotated ? box.w : box.d;
                    let usedH = box.h;

                    loaded.push({
                        ...box,
                        x: space.x,
                        y: space.y,
                        z: space.z,
                        packedL: usedL,
                        packedW: usedW,
                        packedH: usedH,
                        rotated: useRotated
                    });

                    currentWeight += box.weight;

                    // Remove used space
                    spaces.splice(s, 1);

                    // Space 1: Top (only if box is stackable)
                    if (box.stackable && space.h - usedH > 0) {
                        spaces.push({
                            x: space.x,
                            y: space.y,
                            z: space.z + usedH,
                            l: usedL,
                            w: usedW,
                            h: space.h - usedH
                        });
                    }

                    // Dynamically split remaining space to maximize contiguous area
                    let areaRight1 = (space.l - usedL) * space.w;
                    let areaFront1 = usedL * (space.w - usedW);
                    let maxArea1 = Math.max(areaRight1, areaFront1);

                    let areaRight2 = (space.l - usedL) * usedW;
                    let areaFront2 = space.l * (space.w - usedW);
                    let maxArea2 = Math.max(areaRight2, areaFront2);

                    if (maxArea1 >= maxArea2) {
                        if (space.l - usedL > 0) {
                            spaces.push({
                                x: space.x + usedL,
                                y: space.y,
                                z: space.z,
                                l: space.l - usedL,
                                w: space.w,
                                h: space.h
                            });
                        }
                        if (space.w - usedW > 0) {
                            spaces.push({
                                x: space.x,
                                y: space.y + usedW,
                                z: space.z,
                                l: usedL,
                                w: space.w - usedW,
                                h: space.h
                            });
                        }
                    } else {
                        if (space.l - usedL > 0) {
                            spaces.push({
                                x: space.x + usedL,
                                y: space.y,
                                z: space.z,
                                l: space.l - usedL,
                                w: usedW,
                                h: space.h
                            });
                        }
                        if (space.w - usedW > 0) {
                            spaces.push({
                                x: space.x,
                                y: space.y + usedW,
                                z: space.z,
                                l: space.l,
                                w: space.w - usedW,
                                h: space.h
                            });
                        }
                    }
                    
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                // Determine reason: space or height
                // Simplistic MVP reason:
                let heightIssue = spaces.some(s => box.w <= s.l && box.d <= s.w && box.h > s.h);
                let reason = heightIssue ? '높이 제한 또는 다단 적재 불가' : '공간 부족';
                unloaded.push({ box, reason });
            }
        }

        // Calculate volumes
        const totalContainerVolume = (container.l * container.w * container.h) / 1000000000;
        let loadedVolume = 0;
        loaded.forEach(item => {
            loadedVolume += (item.packedL * item.packedW * item.packedH) / 1000000000;
        });

        const remainingVolume = totalContainerVolume - loadedVolume;
        const utilizationRate = (loadedVolume / totalContainerVolume) * 100;
        const remainingWeight = container.maxWeight - currentWeight;

        // Estimate fragmented vs continuous empty space
        // Since our spaces are non-overlapping, sum of space volumes ≈ remaining volume (excluding some edge losses)
        let fragmentedCount = spaces.length;

        let sortedSpaces = spaces.map(s => ({
            l: s.l, w: s.w, h: s.h,
            x: s.x, y: s.y, z: s.z,
            vol: (s.l * s.w * s.h) / 1000000000
        })).sort((a, b) => b.vol - a.vol);

        let topSpaces = sortedSpaces.slice(0, 2);
        
        let maxContinuousSpace = topSpaces.length > 0 ? topSpaces[0].vol : 0;
        let maxContinuousSpaceDim = topSpaces.length > 0 ? { l: topSpaces[0].l, w: topSpaces[0].w, h: topSpaces[0].h } : { l: 0, w: 0, h: 0 };

        return {
            container: containerType,
            dimensions: container,
            metrics: {
                totalVolume: totalContainerVolume,
                loadedVolume: loadedVolume,
                remainingVolume: remainingVolume,
                utilizationRate: utilizationRate,
                maxWeight: container.maxWeight,
                loadedWeight: currentWeight,
                remainingWeight: remainingWeight,
                fragmentedCount: fragmentedCount,
                maxContinuousVolume: maxContinuousSpace,
                maxContinuousSpaceDim: maxContinuousSpaceDim,
                topSpaces: topSpaces
            },
            loaded,
            unloaded
        };
    }

    function packSpecific(containerTypes, items) {
        let boxes = expandItems(items);
        boxes = sortBoxes(boxes);
        
        // Sort containers from largest to smallest by volume
        let sortedContainerTypes = [...containerTypes].sort((a, b) => {
            const volA = CONTAINERS[a].l * CONTAINERS[a].w * CONTAINERS[a].h;
            const volB = CONTAINERS[b].l * CONTAINERS[b].w * CONTAINERS[b].h;
            return volB - volA;
        });

        const finalResults = [];
        let currentRemaining = boxes;
        
        for (let i = 0; i < sortedContainerTypes.length; i++) {
            if (currentRemaining.length === 0) {
                // We add empty results for unused containers so the UI still shows them
                finalResults.push({
                    container: sortedContainerTypes[i],
                    dimensions: CONTAINERS[sortedContainerTypes[i]],
                    metrics: { utilizationRate: 0, loadedVolume: 0, totalVolume: CONTAINERS[sortedContainerTypes[i]].l * CONTAINERS[sortedContainerTypes[i]].w * CONTAINERS[sortedContainerTypes[i]].h / 1e9, maxWeight: CONTAINERS[sortedContainerTypes[i]].maxWeight, loadedWeight: 0, remainingWeight: CONTAINERS[sortedContainerTypes[i]].maxWeight, fragmentedCount: 0, maxContinuousVolume: 0, remainingVolume: CONTAINERS[sortedContainerTypes[i]].l * CONTAINERS[sortedContainerTypes[i]].w * CONTAINERS[sortedContainerTypes[i]].h / 1e9, topSpaces: [], maxContinuousSpaceDim: {l:0,w:0,h:0} },
                    loaded: [],
                    unloaded: []
                });
                continue;
            }
            
            const type = sortedContainerTypes[i];
            const res = packInternal(type, currentRemaining, true);
            finalResults.push(res);
            currentRemaining = res.unloaded.map(u => u.box);
        }
        
        // If there are still remaining items but we ran out of specified containers
        if (currentRemaining.length > 0) {
            const reasons = currentRemaining.map(box => ({ box, reason: '컨테이너 부족' }));
            if (finalResults.length > 0) {
                finalResults[finalResults.length - 1].unloaded = reasons;
            } else {
                finalResults.push({
                    container: '미배정',
                    metrics: { utilizationRate: 0, loadedVolume: 0, totalVolume: 0, maxWeight: 0, loadedWeight: 0, remainingWeight: 0, fragmentedCount: 0, maxContinuousVolume: 0, remainingVolume: 0, topSpaces: [], maxContinuousSpaceDim: {l:0,w:0,h:0} },
                    loaded: [],
                    unloaded: reasons
                });
            }
        }
        
        // Renumber items globally across all containers
        let gCount = 1;
        let iCounts = {};
        
        finalResults.forEach(res => {
            res.loaded.forEach(item => {
                iCounts[item.name] = (iCounts[item.name] || 0) + 1;
                item.globalIndex = gCount++;
                item.itemIndex = iCounts[item.name];
            });
        });
        
        return finalResults;
    }

    return {
        pack: packSpecific
    };
})();
