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
    /** @type {Object} Map of HTMLImageElements representing each tile. */
    #tileImages = {};
    /** @type {Number} Number of SVG images we have not yet finished loading into usable tiles. */
    #remainingToLoad = -1;
    /** @type {Number} Pixel width of a standard tile. */
    #tileSize = -1;

    /**
     * Create a new TileLibrary by trawling the HTML document for all SVG tags.
     * @param {ActionCallback} onLoaded Function to call when loading completes.
     */
    constructor(onLoaded) {
        // Gather all SVG elements in the page, and record them as waiting to load.
        const svgs = document.getElementsByTagName("svg");
        this.#remainingToLoad = svgs.length;

        // Track loading progress, and call the callback once all have loaded.
        // Using arrow function syntax to automatically bind "this" to this context.
        let onTileLoad = () => {
            // Once we've loaded the last tile, set our tile size and call the
            // onLoaded callback, if we were given one.
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
    /** @type {string[][]|Symbol[][]} Array of arrays of tile symbols in the map.*/
    #columns = [];

    /** @type {boolean} Flag controlling whether string data in tilemap should be drawn.*/
    printText = true;

    /**
     * Build a new map chunk with the given dimensions / initial content.
     * @param {Number} columnCount Width of the map, in tiles.
     * @param {Number} rowCount Height of the map, in tiles.
     * @param {Symbol?} fillWith Optional: fill map with this symbol. Uses Tile.NONE if absent.
     */    
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

    /**
     * Structure representing the width and height of a tile map.
     * @typedef {Object} TileDimensions
     * @property {Number} columns
     * @property {Number} rows
     */

    /** 
     * @returns {TileDimensions} Width and height of this tilemap.
     */
    getDimensions() {
        return { columns: this.#columns.length, rows: this.#columns[0].length };
    }

    /**
     * Place just a single tile, and skip it if it's out of bounds.
     * (This is different from "fill", which clamps the rectangle within bounds)
     * @param {Symbol|string} tile Tile to place
     * @param {*} x Horizontal coordinate (0 is the leftmost column)
     * @param {*} y Vertical coordinate (0 is the top row)
     * @returns {MapChunk} Reference to self, so calls can be chained.
     */
    place(tile, x, y) {
        const { columns, rows } = this.getDimensions();
        if (x >= 0 && x < columns && y >= 0 && y < rows) this.#columns[x][y] = tile;
        return this;
    }

    /**
     * Callback for filling a map chunk with procedurally-selected tiles.
     * @callback TileSelector
     * @param {Number} x Horizontal coordinate of tile to be placed.
     * @param {Number} y Vertical coordinate of tile to be placed.
     * @returns {Symbol|string} Tile to place at this position.
     */

    /**
     * Fills a rectangular region of the map.
     * @param {Symbol|string|TileSelector} tile Tile to fill with, or a callback to select a distinct tile at each x, y.
     * @param {Number} xMin Leftmost column to fill - clamped to zero if less.
     * @param {Number} yMin Topmost row to fill - clamped to zero if less.
     * @param {Number} xMax Rightmost column to fill - clamped within map bounds if outside.
     * @param {Number} yMax Bottommost row to fill - clamped within map bounds if outside.
     * @returns {MapChunk} Reference to self, so calls can be chained.
     */
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
                if (typeof tile === "function")  {
                    this.#columns[x][y] = tile(x, y); 
                } else {
                    this.#columns[x][y] = tile;
                }
            }
        }

        return this;
    }


    /**
     * Returns the tile value at the given x, y coordinates.
     * @param {Number} x Horizontal coordinate of tile (0 = leftmost column).
     * @param {Number} y Vertical coordinate of tile (0 = top row).
     * @returns {Symbol|string} Tile at given coordinates, or Tile.NONE if out of bounds.
     */
    getTileAt(x, y) {
        const { columns, rows } = this.getDimensions();
        if (x < 0 || x >= columns) return Tile.NONE;
        if (y < 0 || y >= rows) return Tile.NONE;
        return this.#columns[x][y];
    }

    /**
     * Data structure for determining a subsection of a canvas to draw into.
     * @typedef Rect
     * @param {Number} x Left edge of rectangle, in pixels.
     * @param {Number} y Top edge of rectangle, in pixels.
     * @param {Number} width Width of rectangle, in pixels.
     * @param {Number} height Height of rectangle, in pixels.
     */
   
    /**
     * Draws the contents of the map chunk into the provided canvas 2D context.
     * @param {CanvasRenderingContext2D} ctx Context to draw into.
     * @param {TileLibrary} tiles Library of tile images to use.
     * @param {Rect?} rect Portion of the canvas to draw into. Defaults to whole canvas if absent.
     */
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

        // Used for debugging path symbols. 
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
                    if (this.printText)
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

    /**
     * Places the selected tile symbol in the specified column,
     * in the first non-solid gap above a solid tile. If there are no solid tiles in the column,
     * it adds one at the bottom. If there is no gap, it adds one at the top.
     * Used the guarantee placing the start / end markers.
     * @param {Symbol|string} tileToPlace What tile symbol to record.
     * @param {Number} x Column to place into (0 = leftmost column).
     * @returns {MapChunk} Reference to self, so calls can be chained.
     */
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

        return this;
    }

    /**
     * Places a start marker in the first column of the map,
     * and an end marker in the last column.
     */
    prepStartEnd() {
        this.placeAtopGround(Tile.START_SIGN, 0);
        this.placeAtopGround(Tile.GREEN_FLAG, this.#columns.length - 1);
    }

    /**
     * Copies the contents of this MapChunk into another one, at a given (x, y) offset.
     * Portions of this MapChunk that overhang the bounds of the destination map are ignored.
     * @param {MapChunk} map Destination map chunk to copy this one into, overwriting what's there.
     * @param {Number} startX Leftmost column to write into.
     * @param {Number} startY Top row to write into.
     */
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

    /**
     * Checks whether the given coordinates contain a solid tile.
     * @param {Number} x Column to check (0 = leftmost column).
     * @param {Number} y Row to check (0 = top row).
     * @returns {boolean} True if there is a solid tile at the given coordinates.
     */
    isSolid(x, y) {
        const tile = this.getTileAt(x, y);
        switch(tile) {
            case Tile.SOLID:
            case Tile.EXCLAMATION_BOX:
                return true;
            default:
                return false;
        }
    }
    
    /**
     * Empties this map, replacing all contents with the "None" tile symbol.
     */
    clear() {
        const { columns, rows } = this.getDimensions();
        this.fill(Tile.NONE, 0, 0, columns, rows);
   }

    /**
     * Get the aspect ratio of this map chunk.
     * @returns {Number} Ratio of height:width of this map.
     */
    aspect() {
        const { columns, rows } = this.getDimensions();
        return rows/columns;
    }
}