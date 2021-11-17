// Prep our tile library and call the generate and paint methods when ready.
const tiles = new TileLibrary(() => {
  animate();
});

// Utility function for scaling demo canvasses to match their container.
function sizeToParent(element, aspect) {
  element.width = element.parentElement.clientWidth;
  element.height = Math.floor(aspect * element.parentElement.clientWidth);
}

// Type for demo applets to make it easier to refresh them.
class Demo {
  canvas;
  context;
  map;
  prePaint; postPaint;

  onRegenerate;
  needsUpdate = true;

  constructor(name, map) {
    this.canvas = document.getElementById(name);
    this.context = this.canvas.getContext('2d');
    this.map = map;
  }

  regenerate() {
    if (this.onRegenerate) this.onRegenerate();
    
    this.repaint();
    this.needsUpdate = false;
  }

  resize() {
    sizeToParent(this.canvas, this.map.aspect());
    this.repaint();
  }

  repaint() {
    this.context.fillStyle = "#DAEAFF";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);    

    if (tiles.hasLoaded()) {
      if (this.prePaint) this.prePaint();
      this.map.draw(this.context, tiles);
      if (this.postPaint) this.postPaint();
    }    
  }
}

function makeParameter(objectToModify, parameterName, documentIds, affectedDemos) {
  const inputs = [];

  function reaction(event) {
    const value = event.target.value;
    objectToModify[parameterName] = value;    
    if (objectToModify.update) objectToModify.update();

    for (const input of inputs) {
      input.value = value;
    }

    for (const demo of affectedDemos) {
      demo.needsUpdate = true;
    }
  }  

  const initialValuue = objectToModify[parameterName];

  for (const id of documentIds) {
    const input = document.getElementById(id);
    input.value = initialValuue;
    inputs.push(input);
    input.addEventListener('input', reaction);
  }  
}

function drawPath(ctx, tileSize, path, colour) {  
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.beginPath();
  let point = path[0];
  ctx.moveTo((point[0] + 0.5) * tileSize, (point[1] + 0.5) * tileSize);
  for (let i = 1; i < path.length; i++) {
      point = path[i];
      ctx.lineTo((point[0] + 0.5) * tileSize, (point[1] + 0.5) * tileSize);
  }
  ctx.stroke();
}

const controller = new CharacterController();




// Container for all demo objects.
const demos = {};
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
    path.push([startX, startY]);
    while (state.y <= startY) {
      state = controller.step(state, input);
      path.push([state.x,state.y]);
    }  
  }

  jumpArc.onRegenerate = function() {
    const start = new CharacterState(startX, startY);
    const input = {x: 1, jump: true};

    simPath(standingJump, start, input);

    start.velX = controller.runSpeed;    
    simPath(runningJump, start, input);

    input.x = 0;
    simPath(stallingJump, start, input); 

    input.x = -1;
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
    new MapChunk(width, height).fill(Tile.SOLID, 0, height-1, width-1).place(Tile.PLAYER_STAND, startX, startY)
  )
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
  demos.ensemble = ensemble;
}

{
  const allDemos = [demos.jumpArc, demos.pathGen, demos.ensemble];
  const pathDemos = [demos.pathGen, demos.ensemble]
  const skinDemos = [demos.ensemble];
  makeParameter(controller, 'runSpeed', ['maxSpeed', 'maxSpeed1'], allDemos);
  makeParameter(controller, 'jumpHeight', ['jumpHeight', 'jumpHeight1'], allDemos);
  makeParameter(controller, 'fallingGravityBoost', ['fallingBoost'], allDemos);
  makeParameter(controller, 'maxAcceleration', ['acceleration'], allDemos);
  makeParameter(controller, 'maxDeceleration', ['deceleration'], allDemos);
  makeParameter(controller, 'airControl', ['airControl'], allDemos);
}


function animate() {
  for (const demo of Object.values(demos)) {
    if (demo.needsUpdate) {
      demo.regenerate();
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