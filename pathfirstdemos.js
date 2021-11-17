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
    this.context.fillStyle = "#E4F7FF";
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
  const reverseJump = [];

  jumpArc.onRegenerate = function() {
    const start = new CharacterState(startX, startY);
    const input = {x: 1, jump: true};

    standingJump.length = 0;
    standingJump.push([startX, startY]);
    let state = start;
    while (state.y <= startY) {
      state = controller.step(state, input);
      standingJump.push([state.x,state.y]);
    }

    runningJump.length = 0;
    runningJump.push([startX, startY]);
    state = start;
    state.velX = controller.runSpeed;    
    while (state.y <= startY) {
      state = controller.step(state, input);
      runningJump.push([state.x,state.y]);
    }    

    reverseJump.length = 0;
    reverseJump.push([startX, startY]);
    state = start;
    input.x = -1;
    while (state.y <= startY) {
      state = controller.step(state, input);
      reverseJump.push([state.x,state.y]);
    }  
  }

  jumpArc.map.preDraw = function(context, tileSize) {
    drawPath(context, tileSize, runningJump, '#BEB');
    drawPath(context, tileSize, standingJump, '#CCF');
    drawPath(context, tileSize, reverseJump, '#FCC');
  }

  demos.jumpArc = jumpArc;
}

makeParameter(controller, 'runSpeed', ['maxSpeed'], [demos.jumpArc]);
makeParameter(controller, 'jumpHeight', ['jumpHeight'], [demos.jumpArc]);
makeParameter(controller, 'fallingGravityBoost', ['fallingBoost'], [demos.jumpArc]);
makeParameter(controller, 'maxAcceleration', ['acceleration'], [demos.jumpArc]);
makeParameter(controller, 'maxDeceleration', ['deceleration'], [demos.jumpArc]);
makeParameter(controller, 'airControl', ['airControl'], [demos.jumpArc]);

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