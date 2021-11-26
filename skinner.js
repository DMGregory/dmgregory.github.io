class MapSkinner {
    platformExtendProbability = 0.5;

    powerUpProbability = 0.5;
    coinProbability = 0.1;

    skinMap(map, path, controller) {
        const {columns, rows} = map.getDimensions();

        let previousClearBelow = 0;
        const powerupHeight = Math.round(controller.jumpHeight);

        for(let x = 0; x < columns; x++) {

            let foundContent = false;
            let clearBelow = rows;
            let tilesFromFloor = Number.POSITIVE_INFINITY;

            for (let y = rows - 1; y >= 0; y--) {
                tilesFromFloor++;
                const tile = map.getTileAt(x, y);

                if (tile === SOLID_RESERVATION) {
                    let bottom = foundContent ? y : rows-1;
                    map.fill(Tile.SOLID, x, y, x, bottom);
                    tilesFromFloor = 0;

                    /*
                    if (map.getTileAt(x-1, y) === Tile.NONE && !map.isSolid(x-2, y) && Math.random() < this.platformExtendProbability) {
                        if (previousClearBelow >= y) bottom = y;
                        map.fill(Tile.SOLID, x, y, x, bottom);
                    }
                } else if (tile !== PLAYER_RESERVATION && 
                    map.getTileAt(x-1, y) === Tile.SOLID && map.getTileAt(x+1, y) !== SOLID_RESERVATION && Math.random() < this.platformExtendProbability) {

                        let bottom = foundContent ? y : rows-1;
                        map.fill(Tile.SOLID, x, y, x, bottom);                 
                    */
                } else {
                    if (x > 1 && x < columns-1
                        && tilesFromFloor === powerupHeight && tile !== PLAYER_RESERVATION
                        && Math.random() < this.powerUpProbability) {
                            map.place(Tile.EXCLAMATION_BOX, x, y);
                    }
                }

                if (!foundContent) {
                    clearBelow = y;
                    if (tile !== Tile.NONE) 
                        foundContent = true;
                }
                
            }

            previousClearBelow = clearBelow;
        }

    }
}