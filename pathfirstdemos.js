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
  // Define width and height of the demo, in tile widths.
  const width = 20;
  const height = 10;
  // Define the location where the character will stand / jump from.
  const startX = 3;
  const startY = height - 2;

  // Create a new demo, and fill its map with a floor along the bottom, and a character sprite at the start position.
  const jumpArc = new Demo('jumpArc', 
    new MapChunk(width, height).fill(Tile.SOLID, 0, height-1, width-1).place(Tile.PLAYER_STAND, startX, startY)
  )

  // Store arrays for each of the possible jump trajectories.
  const standingJump = [];
  const runningJump = [];
  const stallingJump = [];
  const reverseJump = [];

  /**
   * Helper method to simulate a jump trajectory with a given input value, and store the points it crosses.
   * @param {Point[]} path One of the 4 stored trajectory arrays.
   * @param {CharacterState} state Initial state at the start of the jump.
   * @param {InputState} input Current state of the player's simulated controller input.
   */
  function simJumpPath(path, state, input) {
    // Erase the old path, and start at the initial state given.
    path.length = 0;    
    path.push({x:state.x, y:state.y});

    // Keep simulating until we fall below our starting height.
    const startY = state.y;
    while (state.y <= startY) {
      // Use the character controller to step one frame into the future, and record the point in our path.
      state = controller.step(state, input);      
      path.push({x:state.x, y:state.y});
    }  
  }

  /**
   * Whenever the jumpArc demo needs to be regenerated, update the four simulated jump trajectories.
   */
  jumpArc.onRegenerate = function() {
    // Always start where we placed our character sprite.
    const start = new CharacterState(startX, startY);    
    
    // Standing jump: no initial velocity, pressing right.
    const input = {x: 1, jump: true};    
    simJumpPath(standingJump, start, input);

    // Running jump: already moving right as fast as we can.
    start.velX = controller.runSpeed;        
    simJumpPath(runningJump, start, input);

    // Stalling jump: letting go of the stick just as we jump.
    input.x = 0;    
    simJumpPath(stallingJump, start, input); 

    // Turnaround jump: reversing direction just as we jump.
    input.x = -1;    
    simJumpPath(reverseJump, start, input);
  }

  /**
   * Anytime we repaint this demo, before drawing our tile content, draw all our lines.
   * @param {CanvasRenderingContext2D} context 
   * @param {Number} tileSize 
   */
  function preDraw(context, tileSize) { 
  
    // First, draw a white tile grid - horizontal lines, then vertical lines.
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

    // Then draw our four jump tajectories in their respective colours.
    drawPath(context, tileSize, runningJump, 'green');
    drawPath(context, tileSize, standingJump, 'blue');    
    drawPath(context, tileSize, reverseJump, 'red');
    drawPath(context, tileSize, stallingJump, 'orange');
  }
  jumpArc.map.preDraw = preDraw;

  // Store this demo so we can refer to it later.
  demos.jumpArc = jumpArc;
}

// Second demo: visualizing a generated path through the map.
{
  // Set up demo's initial width and height, and apply this to the pathGen demo canvas.
  const width = 50;
  const height = 20;  
  const pathGen = new Demo('pathGen', 
    new MapChunk(width, height)
  )

  // When regenerating this demo, ask the pather for a fresh generated path.
  pathGen.onRegenerate = function() {
    pather.planPath(pathGen.map);
    // The skinned demo will also need an update to take the new path into account.
    demos.ensemble.needsUpdate = true;
  }

  /**
   * Anytime we repaint this demo, before drawing our tile content, draw our path.
   * @param {CanvasRenderingContext2D} context 
   * @param {Number} tileSize 
   */
  function preDraw(context, tileSize) {
    if (pather.successfulPath)
      drawPath(context, tileSize, pather.successfulPath, 'white');
    else if (pather.lastAttempt)
      drawPath(context, tileSize, pather.lastAttempt, 'red');
  }
  pathGen.map.preDraw = preDraw;

  // Wire up the path to be regenerated on demand when clicking the demo canvas,
  // or when pressing the "New Path" button in the last demo.
  function repath() {pathGen.needsUpdate = true; }
  pathGen.canvas.addEventListener('click',repath);
  document.getElementById('repathEnsemble').addEventListener('click', repath);

  // Store this demo so we can refer to it later.
  demos.pathGen = pathGen;
}

// Final demo: skinning the path in level tiles.
{
  // Size this demo to match the generated path demo.
  const {columns, rows} = demos.pathGen.map.getDimensions();  
  const ensemble = new Demo('ensemble', 
    new MapChunk(columns, rows)
  )

  // Allow the reader to turn on/off the drawing of the solution path and reserved tiles.
  // Set the default policy according to the HTML file, and repaint when changed.    
  const pathToggle = document.getElementById('showPath');
  const reservationToggle = document.getElementById('showReservations');
  ensemble.map.printText = reservationToggle.checked;
  function updateToggles() {
    ensemble.map.printText = reservationToggle.checked;
    ensemble.repaint();
  }
  pathToggle.addEventListener('change', updateToggles);
  reservationToggle.addEventListener('change', updateToggles);

  /**
   * Anytime we repaint this demo, draw the solution path if the corresponding toggle says so.
   * @param {CanvasRenderingContext2D} context 
   * @param {Number} tileSize 
   */
   function preDraw(context, tileSize) { if(pathToggle.checked) demos.pathGen.map.preDraw(context, tileSize) }; 
   ensemble.map.preDraw = preDraw;



  // When the demo is regenerated, copy the path annotations into this math, 
  // then run the skinner on those annotations and the corresponding path info.
  ensemble.onRegenerate = function() {
    demos.pathGen.map.stampInto(ensemble.map, 0, 0);
    const path = pather.successfulPath ?? pather.lastAttempt;
    skinner.skinMap(ensemble.map, path, controller);
  }
  

  const autoToggle = document.getElementById('autoRegen');
  let interval = null;
  function toggleAuto() {
    if (autoToggle.checked) {
      interval = setInterval(()=>{demos.pathGen.needsUpdate = true;}, 1000);
      pathGen.needsUpdate = true;
    } else {
      clearInterval(interval);
    }
  }
  autoToggle.addEventListener('change', toggleAuto);

  // Wire up the skinner to re-run when the demo is clicked, and store the demo to refer to later.
  ensemble.canvas.addEventListener('click', () => { ensemble.needsUpdate = true; });  
  demos.ensemble = ensemble;
}

// Wire up all the sliders to modify their corresponding parameters.
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

// Each frame, (once the tiles are loaded), find the first demo that needs an update,
// and update it. This way we never try to do multiple updates in a frame 
// (no matter how noisy the mouse input) so the page does not become unresponsive.
function animate() {
  for (const demo of Object.values(demos)) {
    if (demo.needsUpdate) {
      demo.regenerate();
      break;
    }
  }

  window.requestAnimationFrame(animate);
}

// Repaint all demo canvasses if the window size changes.
function repaintAll() {
  for (const demo of Object.values(demos)) {
    demo.resize();
  }
}
window.addEventListener('resize', repaintAll);
// Set the initial sizes of all demos.
repaintAll();