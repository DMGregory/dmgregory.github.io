// Establish consistent vocabulary for referring to tile types, enum-style.
const Tile = {
    // These are abstract keys that don't correspond to any single tile image.
    NONE: Symbol("none"),
    SOLID: Symbol("solid"),
    // These symbols need to match the ones we look up by name from the SVG
    // elements' id values, so Symbol.for() ensures we get the same symbol.
    GRASS_TOP_BLOCK: Symbol.for("grassTopBlock"),
    DIRT_BLOCK: Symbol.for("dirtBlock"),
    EXCLAMATION_BOX: Symbol.for("exclamationBox"),
    WOOD_BOX: Symbol.for("woodBox"),
    PINK_SLIME: Symbol.for("pinkSlime"),
    START_SIGN: Symbol.for("startSign"),
    GREEN_FLAG: Symbol.for("greenFlag"),    
    COIN: Symbol.for("coin"),
    PLAYER_STAND: Symbol.for("playerStand"),
};
Object.freeze(Tile);

// Gathers up SVG images from the HTML document into images we can
// stamp into our canvas, keyed by members of the Tile enumeration.
class TileLibrary {
    #tileImages = [];
    #remainingToLoad = 0;
    #tileSize = 0;

    // Accepts a function to call when all tiles have finished loading.
    constructor(onLoaded) {
        // Gather all SVG elements in the page, and record them as waiting to load.
        const svgs = document.getElementsByTagName("svg");
        this.#remainingToLoad = svgs.length;

        // Track loading progress, and call the callback once all have loaded.
        // Using arrow function syntax to automatically bind "this" to this context.
        let onTileLoad = () => {
            if (--this.#remainingToLoad == 0) {
                // HACK: Pick one tile arbitrarily to set the size.
                this.#tileSize = this.#tileImages[Tile.DIRT_BLOCK].width;
                if (onLoaded) onLoaded();
            }
        };

        // We'll need to load these SVGs into IMG elements to draw them into our canvas.
        // To do that we'll need to digest their XML contents with this serializer.
        let serializer = new XMLSerializer();
        for (let i = 0; i < svgs.length; i++) {
            // SVG to image stamp borrowed from this StackOverflow answer:
            // https://stackoverflow.com/questions/57502210/how-to-draw-a-svg-on-canvas-using-javascript
            let xml = serializer.serializeToString(svgs[i]);
            let svg64 = btoa(xml);
            let b64Start = "data:image/svg+xml;base64,";
            let image64 = b64Start + svg64;

            // Load the SVG data into a raster image we can easily stamp into our canvas.
            let img = document.createElement("img");
            img.onload = onTileLoad;
            img.src = image64;

            // Associate the tile image with the tile type.
            let key = Symbol.for(svgs[i].id);
            this.#tileImages[key] = img;
        }
    }

    // Looks up a tile image given a symbol from the Tile enumeration.
    getImage(tileSymbol) {
        return this.#tileImages[tileSymbol];
    }

    // Returns the width of a tile in pixels.
    getSize() {
        return this.#tileSize;
    }

    // Returns true if all images have loaded, or false if still loading.
    hasLoaded() {
        return this.#remainingToLoad == 0;
    }
}

// Represents a whole platformer map, or a piece of one,
// as a 2D array of tile symbols.
class MapChunk {
    #columns = [];

    // Accepts the width and height of the map/chunk as integers,
    // and an optional tile symbol to fill it with initially.
    constructor(columnCount, rowCount, fillWith) {
        // Default to fill with the empty tile if no other value is provided.
        if (!fillWith) fillWith = Tile.NONE;

        // Initialize our 2D array of tiles to the desired dimensions,
        // filling with our starting tile as we go.
        for (let x = 0; x < columnCount; x++) {
            let column = [];
            for (let y = 0; y < rowCount; y++) {
                column[y] = fillWith;
            }
            this.#columns[x] = column;
        }
    }

    // Quick method to get the width and height of a map chunk.
    getDimensions() {
        return { columns: this.#columns.length, rows: this.#columns[0].length };
    }

    // Place just a single tile, and skip it if it's out of bounds.
    // (This is different from "fill", which clamps the rectangle within bounds)
    // Returns "this" so calls can be chained.
    place(tile, x, y) {
        const { columns, rows } = this.getDimensions();
        if (x >= 0 && x < columns && y >= 0 && y < rows) this.#columns[x][y] = tile;
        return this;
    }

    // Fills a rectangular region of the map from (xMin, yMin) up to (xMax, yMax) (inclusive).
    // Portions of the rectangle hanging outside the map bounds are ignored.
    // Coordinates are 0-based, with 0, 0 being the top-left corner.
    // If the max is omitted, the corresponding min is used instead.
    // The tile argument can be a single tile symbol, or a function accepting an (x, y) coordinate
    // and returning a tile symbol to place at that location.
    // Returns "this" so calls can be chained.
    fill(tile, xMin, yMin, xMax, yMax) {
        const { columns, rows } = this.getDimensions();

        // Remap the min/max on x and y to fit within the map,
        // and fill-in the max with the min if it was omitted.
        xMin = Math.max(0, xMin);
        if (xMin >= columns) return this;
        if (!xMax || xMax < xMin) {
            xMax = xMin;
        } else if (xMax >= columns) {
            xMax = columns - 1;
        }

        yMin = Math.max(0, yMin);
        if (yMin >= rows) return this;
        if (!yMax || yMax < yMin) {
            yMax = yMin;
        } else if (yMax >= rows) {
            yMax = rows - 1;
        }

        // Iterate over the rectangle and set the tile symbol in each location.
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                let tileToPlace = tile;
                if (typeof tile === "function") tileToPlace = tile(x, y);

                this.#columns[x][y] = tileToPlace;
            }
        }

        return this;
    }

    // Returns the tile value at the given x, y coordinates.
    // Accesses outside the map bounds return NONE.
    getTileAt(x, y) {
        const { columns, rows } = this.getDimensions();
        if (x < 0 || x >= columns) return Tile.NONE;
        if (y < 0 || y >= rows) return Tile.NONE;
        return this.#columns[x][y];
    }

    // Draws the contents of the map chunk into the provided canvas 2D context ctx
    // using the images in the TileLibrary tiles. Drawing can be limited to a rectangle
    // rect (x, y, width, height), or to the whole canvas area if rect is omitted.
    // The map is automatically scaled uniformly to fit the available drawing area.
    draw(ctx, tiles, rect) {
        // Default to the whole canvas if a rect was not provided.
        if (!rect)
            rect = { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };

        // Save the context's current transform so we can restore it later.
        ctx.save();

        ctx.resetTransform();

        const { columns, rows } = this.getDimensions();
        // HACK: Drawing full size leaves faint gaps between tiles.
        // Reducing the effective size by a fudge factor hides this artifact.
        const tileSize = tiles.getSize() * 0.98;
        const scale = Math.min(
            rect.width / (columns * tileSize),
            rect.height / (rows * tileSize)
        );

        // Shift the canvas rendering transform to match our drawing rectangle.
        ctx.translate(rect.x, rect.y);
        ctx.scale(scale, scale);

        // Used for debugging path symbols. Uncomment the fillText call below to enable this.
        ctx.font = "64px sans-serif";
        ctx.fillStyle = "#8CF";

        // Draw the path through the level, if provided by the generator.
        if (this.preDraw) {
            this.preDraw(ctx, tileSize);
        }

        // Iterate over our columns left to right.
        for (let x = 0; x < columns; x++) {
            // Keep track of the last tile drawn above ("None" to start with)
            // so we know when to draw solid tiles as grass-topped or not.
            let lastTile = Tile.NONE;
            // Iterate over the tiles in the column top to bottom.
            for (let y = 0; y < rows; y++) {
                let tile = this.#columns[x][y];

                // Used for debugging path generation. Displays path symbols instead of tiles.
                if (typeof tile === "string") {
                    ctx.fillText(tile, (x+0.25) * tileSize, (y+0.8) * tileSize);
                    tile = Tile.NONE;
                }

                // Vary the version of solid tiles being drawn.
                // Solid tiles under other solid tiles should use the full dirt version.
                // The top solid tile in a run should have grass on top.
                if (tile === Tile.SOLID) {
                    tile =
                        lastTile === Tile.SOLID ? Tile.DIRT_BLOCK : Tile.GRASS_TOP_BLOCK;
                    lastTile = Tile.SOLID;
                } else {
                    lastTile = tile;
                }

                // Skip invalid/empty tiles.
                if (!tile || tile === Tile.NONE) continue;

                // Look up the image for this tile from the TileLibrary
                // and stamp it at the corresponding place in our tile grid.
                ctx.drawImage(tiles.getImage(tile), x * tileSize, y * tileSize);
            }
        }

        // Put the context's transform back the way we found it.
        ctx.restore();
    }

    // Places the selected tile symbol in the column indexed by x (leftmost column is 0)
    // in the first non-solid gap above a solid tile. If there are no solid tiles in the column,
    // it adds one at the bottom. If there is no gap, it adds one at the top.
    // Used the guarantee placing the start / end markers.
    placeAtopGround(tileToPlace, x) {
        // Clamp the index into the range of valid columns.
        x = Math.max(0, Math.min(x, this.#columns.length - 1));
        let column = this.#columns[x];

        // Scan up the column from the bottom to the top.
        let hasFoundGround = false;
        for (let y = column.length - 1; y >= 0; y--) {
            let tile = column[y];
            switch (tile) {
                // Tiles we can stand on: mark that we've found ground.
                case Tile.SOLID:
                case Tile.EXCLAMATION_BOX:
                case Tile.WOOD_BOX:
                    hasFoundGround = true;
                    break;

                // Tiles we can occupy: if above ground, this is the spot!
                // Place the tile (replacing anything in this spot) and exit.
                default:
                    if (hasFoundGround) {
                        column[y] = tileToPlace;
                        return;
                    }
                    break;
            }
        }

        // If we failed to place a put the tile, engage fallback bahaviour.
        if (hasFoundGround) {
            // We found ground but no empty space above? Carve a spot at the top.
            column[0] = tileToPlace;
        } else {
            // No solid ground at all? Place a solid tile at the bottom, and place above that.
            column[column.length - 1] = Tile.SOLID;
            column[column.length - 2] = tileToPlace;
        }
    }

    // Places a start marker in the first column of the map,
    // and an end marker in the last column.
    prepStartEnd() {
        this.placeAtopGround(Tile.START_SIGN, 0);
        this.placeAtopGround(Tile.GREEN_FLAG, this.#columns.length - 1);
    }

    // Copies the contents of this MapChunk into another one (map), at a given (x, y) offset.
    // Portions of this MapChunk that overhang the bounds of the destination map are ignored.
    stampInto(map, startX, startY) {
        const { columns, rows } = map.getDimensions();

        for (let x = 0; x < this.#columns.length; x++) {
            let destX = startX + x;
            if (destX < 0 || destX >= columns) continue;

            let source = this.#columns[x];
            let dest = map.#columns[destX];
            for (let y = 0; y < source.length; y++) {
                let destY = startY + y;
                if (destY < 0 || destY >= dest.length) continue;

                dest[destY] = source[y];
            }
        }
    }

    // Empties this map, replacing all contents with the "None" tile symbol.
    clear() {
        const { columns, rows } = this.getDimensions();
        this.fill(Tile.NONE, 0, 0, columns, rows);

        // "path" field is glued on by the Path-Based generator. Clear it too.
        this.path = undefined;
    }

    aspect() {
        const { columns, rows } = this.getDimensions();
        return rows/columns;
    }
}