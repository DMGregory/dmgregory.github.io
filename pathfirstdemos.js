const demo1 = document.getElementById('demo1');
const ctx1 = demo1.getContext('2d');

// Prep our tile library and call the generate and paint methods when ready.
const tiles = new TileLibrary(() => {
    console.log('loaded all tiles');
  });


function sizeToParent(element, aspect) {
    element.width = element.parentElement.clientWidth;
    element.height = aspect * element.parentElement.clientWidth;
}

// Repaint the canvas if the window size changes, filling the width of the page.
function redraw() {
    sizeToParent(demo1, 0.5);
    ctx1.fillStyle = 'black';
    ctx1.fillRect(0, 0, demo1.clientWidth, demo1.clientHeight);
  }
  redraw();
  window.addEventListener('resize', redraw);