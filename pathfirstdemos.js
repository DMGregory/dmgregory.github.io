// Prep our tile library and start the animation loop once all graphics are loaded.
// See tilemap.js for this type.
const tiles = new TileLibrary(() => {
  animate();
});

//#region Demo types and helper methods.

/**
 * Utility function for scaling demo canvasses to match their container width.
 * @param {HTMLElement} element DOM element to be resized.
 * @param {Number} aspect Height:Width ratio to maintain when sizing.
 */
function sizeToParent(element, aspect) {
  element.width = element.parentElement.clientWidth;
  element.height = Math.floor(aspect * element.parentElement.clientWidth);
}


/**
 * Definition for a method signature that takes no parameters and returns nothing.
 * @callback ActionCallback
 */

// Type for demo applets to make it easier to refresh them.
class Demo {

  /** @type {HTMLCanvasElement} */
  canvas;

  /** @type {CanvasRenderingContext2D} */
  context;

  /** @type {MapChunk} */
  map;

  /** @type {ActionCallback} */
  prePaint; 

  /** @type {ActionCallback} */
  postPaint;

  /** @type {ActionCallback} */
  onRegenerate;

  /** @type {boolean} */
  needsUpdate = true;

  /** @type {string} */
  backgroundColour = "#D0E0FF";

  /**
   * Constructs a new demo, fetching the Canvas & its 2D context from the HTML document.
   * @param {string} id ID of Canvas Element to use for this demo.
   * @param {MapChunk} map MapChunk to contain content to draw.
   */
  constructor(id, map) {
    this.canvas = document.getElementById(id);
    this.context = this.canvas.getContext('2d');
    this.map = map;
  }

  /**
   * Rebuilds the demo's content, based on the latest data changes.
   */
  regenerate() {
    // Call any custom generation work that needs to happen.
    if (this.onRegenerate) this.onRegenerate();
    
    // Paint the canvas contents to reflect the newly generated map.
    this.repaint();

    // Mark this demo up to date, so it's not refreshed redundantly.
    this.needsUpdate = false;
  }

  /**
   * Resize this demo to match the container size,
   * then repaint its visible content without generating from scratch.
   */
  resize() {
    sizeToParent(this.canvas, this.map.aspect());
    this.repaint();
  }

  /**
   * Paint the contents of the map, and any supporting content.
   */
  repaint() {
    // Paint the sky to a consistent blue.
    this.context.fillStyle = this.backgroundColour;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);    

    // If we have our tiles, paint this demo's map contents.
    if (tiles.hasLoaded()) {
      // Allow customizing demos with steps to draw between the sky background and the foreground.
      if (this.prePaint) this.prePaint();

      // Draw the map, using our standard tileset.
      this.map.draw(this.context, tiles);

      // Allow customizing demos with steps to draw at the end, on top of the mep content.
      if (this.postPaint) this.postPaint();
    }    
  }
}

/**
 * Helper function for setting up parameter sliders that modify demos.
 * @param {Object} objectToModify Object containing the variable we want to change.
 * @param {string} parameterName Name of the variable to change.
 * @param {string[]} documentIds Array of IDs for HTML slider elements that should be linked to this parameter.
 * @param {Demo[]} affectedDemos Array of Demo objects that need to be updated when this parameter changes.
 */
function makeParameter(objectToModify, parameterName, documentIds, affectedDemos) {
  /** @type {HTMLInputElement[]} Array of sliders that control this parameter. */
  const inputs = [];

  /**
   * Define a callback to modify the source data object when the slider is changed.
   * @param {InputEvent} event 
   */
  function reaction(event) {
    // Read number from the changed slider, and apply it to the variable we want to control.
    const value = parseFloat(event.target.value);
    objectToModify[parameterName] = value;    

    // If that object has an "update" function, invoke it to hande the new value.
    if (objectToModify.update) objectToModify.update();

    // Update all other sliders that control this parameter, so they all agree with the latest input.
    for (const input of inputs) {
      input.value = value;
    }

    // Mark all affected demos as needing an update.
    for (const demo of affectedDemos) {
      demo.needsUpdate = true;
    }
  }  

  // Get the initial value of this parameter from the data object,
  // so we can apply it to all the sliders (and I don't have to edit the HTML manually).
  const initialValuue = objectToModify[parameterName];

  // Gather up all the matching sliders in the HTML document,
  // set up their initial values, and connect them to the reaction function.
  for (const id of documentIds) {
    const input = document.getElementById(id);
    input.value = initialValuue;
    inputs.push(input);
    input.addEventListener('input', reaction);
  }  
}

/**
 * Type definition for a structure representing a 2D point.
 * @typedef {Object} Point
 * @property {Number} x
 * @property {Number} y
 */

/**
 * Utility method for drawing paths into a TileMap.
 * @param {CanvasRenderingContext2D} ctx Context to draw into.
 * @param {Number} tileSize Scaling factor - how many pixels wide is one tile?
 * @param {Point[]} path Array of points making up the path.
 * @param {string} colour Colour to draw the path in.
 */
function drawPath(ctx, tileSize, path, colour) {  
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.beginPath();
  let point = path[0];

  // Draw path through the middle of the tiles (hence the +0.5s)
  // (By default, my points refer to the top-left corner of a tile)
  ctx.moveTo((point.x + 0.5) * tileSize, (point.y + 0.5) * tileSize);
  for (let i = 1; i < path.length; i++) {
      point = path[i];
      ctx.lineTo((point.x + 0.5) * tileSize, (point.y + 0.5) * tileSize);
  }
  ctx.stroke();
}

//#endregion


// Data objects representing the generator's configuration.

// Character control mode.
const controller = new CharacterController();

// Path generator.
const pather = new Pather(controller);

// Tile placement logic.
const skinner = new MapSkinner();

// Whenever the controller changes, the path generator also needs to change
// (Taking into account different jump height, traversal timings)
controller.postUpdate = pather.update.bind(pather);

// Initialize the controller (and consequently pather) with their default values.
controller.update();


// Container for all demo objects.
const demos = {};

// First demo: visualizing character controller's jump arcs.
{
  const width = 20;
  const height = 10;
  const startX = 3;
  const startY = height - 2;
  const jumpArc = new Demo('jumpArc', 
    new MapChunk(width, height).fill(Tile.SOLID, 0, height-1, width-1).place(Tile.PLAYER_STAND, startX, startY)
  )

  const standingJump = [];
  const runningJump = [];
  const stallingJump = [];
  const reverseJump = [];

  function simPath(path, state, input) {
    path.length = 0;    
    path.push({x:startX, y:startY});
    while (state.y <= startY) {
      state = controller.step(state, input);      
      path.push({x:state.x, y:state.y});
    }  
  }

  jumpArc.onRegenerate = function() {
    const start = new CharacterState(startX, startY);
    start.velY = controller.jumpVelocity;
    const input = {x: 1, jump: true};

    //console.log('standing', start, standingJump);
    simPath(standingJump, start, input);

    start.velX = controller.runSpeed;    
    //console.log('running', start, runningJump);
    simPath(runningJump, start, input);

    input.x = 0;
    //console.log('stalling', start, stallingJump);
    simPath(stallingJump, start, input); 

    input.x = -1;
    //console.log('reverse', start, reverseJump);
    simPath(reverseJump, start, input);
  }

  jumpArc.map.preDraw = function(context, tileSize) {
    context.beginPath();
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    for (let y = 1; y < height; y++) {
      context.moveTo(0, y * tileSize);
      context.lineTo(width * tileSize, y * tileSize);
    }
    for (let x = 1; x < width; x++) {
      context.moveTo(x * tileSize, 0);
      context.lineTo(x* tileSize, height * tileSize);
    }
    context.stroke();
    drawPath(context, tileSize, runningJump, 'green');
    drawPath(context, tileSize, standingJump, 'blue');
    
    drawPath(context, tileSize, reverseJump, 'red');
    drawPath(context, tileSize, stallingJump, 'orange');
  }

  demos.jumpArc = jumpArc;
}

{
  const width = 50;
  const height = 20;
  const startX = 3;
  const startY = height - 2;
  const pathGen = new Demo('pathGen', 
    new MapChunk(width, height)
  )

  pathGen.onRegenerate = function() {
    pather.planPath(pathGen.map);
    demos.ensemble.needsUpdate = true;
  }

  pathGen.map.preDraw = function(context, tileSize) {

    if (pather.successfulPath)
      drawPath(context, tileSize, pather.successfulPath, 'white');
    else if (pather.lastAttempt)
      drawPath(context, tileSize, pather.lastAttempt, 'red');
  }

  function repath() {pathGen.needsUpdate = true; }
  pathGen.canvas.addEventListener('click',repath);
  document.getElementById('repathEnsemble').addEventListener('click', repath);

  demos.pathGen = pathGen;
}

{
  const width = 50;
  const height = 20;
  const startX = 3;
  const startY = height - 2;
  const ensemble = new Demo('ensemble', 
    new MapChunk(width, height).fill(Tile.SOLID, 0, height-1, width-1).place(Tile.PLAYER_STAND, startX, startY)
  )


  const pathToggle = document.getElementById('showPath');
  const reservationToggle = document.getElementById('showReservations');
  ensemble.map.printText = reservationToggle.checked;
  function updateToggles() {
    ensemble.map.printText = reservationToggle.checked;
    ensemble.repaint();
  }
  pathToggle.addEventListener('change', updateToggles);
  reservationToggle.addEventListener('change', updateToggles);

  ensemble.onRegenerate = function() {
    demos.pathGen.map.stampInto(ensemble.map, 0, 0);
    const path = pather.successfulPath ?? pather.lastAttempt;
    skinner.skinMap(ensemble.map, path, controller);
  }

  ensemble.map.preDraw = function(context, tileSize) { if(pathToggle.checked) demos.pathGen.map.preDraw(context, tileSize) };  
  
  ensemble.canvas.addEventListener('click', () => { ensemble.needsUpdate = true; });

  

  
  demos.ensemble = ensemble;
}

{
  const allDemos = [demos.jumpArc, demos.pathGen];
  const pathDemos = [demos.pathGen]
  const skinDemos = [demos.ensemble];
  makeParameter(controller, 'runSpeed', ['maxSpeed', 'maxSpeed1'], allDemos);
  makeParameter(controller, 'jumpHeight', ['jumpHeight', 'jumpHeight1'], allDemos);
  makeParameter(controller, 'fallingGravityBoost', ['fallingBoost'], allDemos);
  makeParameter(controller, 'maxAcceleration', ['acceleration'], allDemos);
  makeParameter(controller, 'maxDeceleration', ['deceleration'], allDemos);
  makeParameter(controller, 'airControl', ['airControl'], allDemos);
  makeParameter(pather, 'minSecondsOnPlatform', ['minJumpTime'], pathDemos);
  makeParameter(pather, 'maxSecondsOnPlatform', ['maxJumpTime'], pathDemos);
  makeParameter(pather, 'backtrackProbability', ['backtrackProbability'], pathDemos);
  makeParameter(pather, 'heightVariance', ['heightVariance'], pathDemos);
  makeParameter(skinner, 'platformExtendProbability', ['extendProbability'], skinDemos);
  makeParameter(skinner, 'coinProbability', ['coinProbability'], skinDemos);
  makeParameter(skinner, 'powerUpProbability', ['powerUpProbability'], skinDemos);
  makeParameter(skinner, 'enemyProbability', ['enemyProbability'], skinDemos);
}


function animate() {
  for (const demo of Object.values(demos)) {
    if (demo.needsUpdate) {
      demo.regenerate();
      break;
    }
  }

  window.requestAnimationFrame(animate);
}


// Repaint all demo canvasses if the window size changes,
// or after the tileset finishes loading.
function repaintAll() {
  for (const demo of Object.values(demos)) {
    demo.resize();
  }
}
window.addEventListener('resize', repaintAll);
repaintAll();