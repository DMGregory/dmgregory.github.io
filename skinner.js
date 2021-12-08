class MapSkinner {

    platformExtendProbability = 1;

    powerUpProbability = 0.2;
    coinProbability = 0.2;

    enemyProbability = 0.3;

    skinMap(map, path, controller) {
        const {columns, rows} = map.getDimensions();

        const columnsSinceEnemy = [];
        for(let i = 0; i < rows; i++) {
            columnsSinceEnemy[i] = 0;
        }

        let solids = [];
        let clearBelow = [];

        const powerupHeight = Math.round(controller.jumpHeight + controller.height);

        for(let x = 0; x < columns; x++) {

            let foundContent = false;
            let tilesFromFloor = Number.POSITIVE_INFINITY;

            for (let y = rows - 1; y >= 0; y--) {
                tilesFromFloor++;
                columnsSinceEnemy[y]++;
                const tile = map.getTileAt(x, y);

                if (tile === SOLID_RESERVATION) {
                    let bottom = foundContent ? y : rows-1;
                    map.fill(Tile.SOLID, x, y, x, bottom);
                    tilesFromFloor = 0;
                    solids.push({x, y});
                } else {
                    if (x > 2 && x < columns-2) {            

                        if(tilesFromFloor === powerupHeight && tile !== PLAYER_RESERVATION
                            && Math.random() < this.powerUpProbability) {                            
                                map.place(Tile.EXCLAMATION_BOX, x, y);
                        } else if (tilesFromFloor === 1) {

                            if (map.getTileAt(x, y-1) === PLAYER_RESERVATION
                                && columnsSinceEnemy[y] > 2
                                && Math.random() < this.enemyProbability) {
                                    map.place(Tile.PINK_SLIME, x, y);
                                    columnsSinceEnemy[y] = 0;
                            } else if (y < rows-1 
                                && Math.random() < this.coinProbability) {
                                map.place(Tile.COIN, x, y);
                            }
                        }
                    }
                }

                if (!foundContent) {
                    clearBelow[x] = y;
                    foundContent = tile !== Tile.NONE;
                }                
            }        
        }


        let edge = 0;
        for (const solid of solids) {
            
            if (solid.x > 0 && map.getTileAt(solid.x-1, solid.y) == Tile.NONE && !map.isSolid(solid.x-2, solid.y)
            && Math.random() < this.platformExtendProbability) {
                const bottom = clearBelow[solid.x - 1] <= solid.y ? rows - 1 : solid.y;                    
                map.fill(Tile.SOLID, solid.x-1, solid.y, solid.x-1, bottom);                    
            }

            
            if (solid.x < columns-1 && map.getTileAt(solid.x+1, solid.y) === Tile.NONE && !map.isSolid(solid.x+2, solid.y)
            && Math.random() < this.platformExtendProbability) {
                const bottom = clearBelow[solid.x + 1] <= solid.y ? rows - 1 : solid.y;                    
                map.fill(Tile.SOLID, solid.x+1, solid.y, solid.x+1, bottom);
                //console.log(edge, solid, clearBelow[solid.x+1]);
               //edge++;
            }
            
        }   

        let jumpStart = -1;
            for (let i = 0; i < path.length; i++) {
                const state = path[i];

                if (state.framesSinceGround === 1) {
                    jumpStart = i;
                } else if (jumpStart >= 0 && state.framesSinceGround === 0) {
                    const start = path[jumpStart];
                    
                    const distance = Math.abs(state.x-start.x)+Math.abs(state.y-start.y);
                    if (distance > 3) {
                        for (let j = jumpStart; j < i; j++) {
                            const here = path[j];
                            const x = Math.round(here.x);
                            const y = Math.round(here.y);

                            if (map.getTileAt(x, y) != PLAYER_RESERVATION) 
                                continue;

                            const deviation = (here.x-x)*(here.x-x) + (here.y-y)*(here.y-y);
                            if (deviation < 0.1
                                && Math.random() < this.coinProbability)
                                map.place(Tile.COIN, x, y);
                        }
                    }
                    jumpStart = -1;
                }                
            }

    }
}