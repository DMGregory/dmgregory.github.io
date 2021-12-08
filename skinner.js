// Class for converting path annotations into tile geometry.
class MapSkinner {

    /** @type {Number} Chance to extent a platform left or right to make it wider.*/
    platformExtendProbability = 1;

    /** @type {Number} Chance to place a ! Box wherever it has the right clearance.*/
    powerUpProbability = 0.2;

    /** @type {Number} Chance to place a coin along the ground or on a "long enough" jump arc.*/
    coinProbability = 0.2;

    /** @type {Number} Chance to place an enemy wherever it can stand and be stomped.*/
    enemyProbability = 0.3;

    /**
     * Populates a map with tiles, given a path annotaton and character info.
     * @param {MapChunk} map Map annotated with path reservations.
     * @param {CharacterState[]} path History of character movement (used to place coins on jump arcs).
     * @param {CharacterController} controller Character parameters (used for jump height / height clearance).
     */
    skinMap(map, path, controller) {
        const {columns, rows} = map.getDimensions();

        /** @type {Number[]} How far to the left was the last enemy we placed in this row?*/ 
        const columnsSinceEnemy = [];
        for(let i = 0; i < rows; i++) {
            columnsSinceEnemy[i] = 0;
        }

        /** @type {Point[]} Locations of solid reservations - used for platform extension later.*/
        let solids = [];

        /** @type {Number[]} Row index of the bottom row with no bookkeeping annotations below it, in this column.*/
        let clearBelow = [];

        // How high should ! Boxes be placed above the ground, so we can still jump to hit them?
        const powerupHeight = Math.round(controller.jumpHeight + controller.height);

        // Iterate over the map left to right...
        for(let x = 0; x < columns; x++) {

            // Track whether we've found some book-keeping annotation, 
            // and how far we are above the nearest floor.
            let foundContent = false;
            let tilesFromFloor = Number.NEGATIVE_INFINITY;

            /// ...then iterate each column bottom to top.
            for (let y = rows - 1; y >= 0; y--) {
                // Increment our counters, and read the tile at the current coordinates.
                tilesFromFloor++;
                columnsSinceEnemy[y]++;
                const tile = map.getTileAt(x, y);
                
                if (tile === SOLID_RESERVATION) {
                    // If the tile is solid, build a platform. 
                    // If this is the first thing we found in the column, it can be a plateau reaching to the bottom of the map.
                    let bottom = foundContent ? y : rows-1;
                    map.fill(Tile.SOLID, x, y, x, bottom);
                    // Record the presence of this floor.
                    tilesFromFloor = 0;
                    solids.push({x, y});
                } else {
                    // If this is not solid, then maybe we'll put something here.
                    // We'll skip tiles with no floor under them, or that are very close to the start/end of the map.
                    if (tilesFromFloor > -1 && x > 2 && x < columns-2) { 
                        // Tiles I don't need to jump through, and that are at the right height,
                        // are eligible to become ! Boxes.
                        if(tilesFromFloor === powerupHeight && tile !== PLAYER_RESERVATION
                            && Math.random() < this.powerUpProbability) {                            
                                map.place(Tile.EXCLAMATION_BOX, x, y);

                        // Tiles immediately above a floor can be coins or enemies.
                        } else if (tilesFromFloor === 1) {                            

                            // Place enemies only in places known to have reachable space above them (to stomp them)
                            // and never too close together at the same elevation.
                            if (map.getTileAt(x, y-1) === PLAYER_RESERVATION
                                && columnsSinceEnemy[y] > 2
                                && Math.random() < this.enemyProbability) {
                                    map.place(Tile.PINK_SLIME, x, y);
                                    columnsSinceEnemy[y] = 0;

                            // Or, if we didn't place an enemy, try to place a coin.
                            } else if (Math.random() < this.coinProbability) {
                                map.place(Tile.COIN, x, y);
                            }
                        }
                    }
                }

                // If we hadn't found any bookkeeping annotations before this cell,
                // update that based on our latest findings.
                if (!foundContent) {
                    clearBelow[x] = y;
                    foundContent = tile !== Tile.NONE;
                }                
            }        
        }


        // Iterate over our solid platforms and consider extending them left/right.
        for (const solid of solids) {
            
            // First, try extending them to the left, if we can do so without impinging on a player reservation or closing a gap.
            if (solid.x > 0 && map.getTileAt(solid.x-1, solid.y) == Tile.NONE && !map.isSolid(solid.x-2, solid.y)
            && Math.random() < this.platformExtendProbability) {
                const bottom = clearBelow[solid.x - 1] <= solid.y ? rows - 1 : solid.y;                    
                map.fill(Tile.SOLID, solid.x-1, solid.y, solid.x-1, bottom);                    
            }

            // Then, try extending them to the right, if we can do so without impinging on a player reservation or closing a gap.
            if (solid.x < columns-1 && map.getTileAt(solid.x+1, solid.y) === Tile.NONE && !map.isSolid(solid.x+2, solid.y)
            && Math.random() < this.platformExtendProbability) {
                const bottom = clearBelow[solid.x + 1] <= solid.y ? rows - 1 : solid.y;                    
                map.fill(Tile.SOLID, solid.x+1, solid.y, solid.x+1, bottom);               
            }
            
        }   

        // Next, iterate over the full path, looking for long jumps to decorate with coins.
        // (jumps where we land close to our starting point are skipped -  they're usually just path gen artifacts)

        /** @type {Number} Index of the entry in the path where we started our current jump, or -1 if we're not airborne. */
        let jumpStart = -1;
        for (let i = 0; i < path.length; i++) {
            const state = path[i];

            if (state.framesSinceGround === 1) {
                // If this is the start of a jump, record the index where we started.
                jumpStart = i;
            } else if (jumpStart >= 0 && state.framesSinceGround === 0) {
                // Otherwise, if we've just landed from a jump, check how far we are from our launch point.
                const start = path[jumpStart];
                
                // Only decorate this jump if we travelled at least 3 tiles horizontally or landed at a different elevation.
                const distance = Math.abs(state.x-start.x);
                if (distance > 3 || Math.abs(start.y - state.y) > 0.5) {
                    // Iterate over the points in this jump and decorate them with coins.
                    for (let j = jumpStart; j < i; j++) {
                        const here = path[j];
                        const x = Math.round(here.x);
                        const y = Math.round(here.y);

                        // Only decorate places where the coin sits very close to the jump line.
                        // (Otherwise we get ugly stairstep patterns)
                        const deviation = (here.x-x)*(here.x-x) + (here.y-y)*(here.y-y);
                        if (deviation < 0.1
                            && Math.random() < this.coinProbability)
                            map.place(Tile.COIN, x, y);
                    }
                }
                // We're no longer tracking a single jump, clear that index.
                jumpStart = -1;
            }                
        }
    }
}