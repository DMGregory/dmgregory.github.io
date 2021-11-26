const SOLID_RESERVATION = '#';
const PLAYER_RESERVATION = '.';

function discreteTriangleDistribution(min, max) {
    

    const span = max - min + 1;
    const halfSpan = span/2;    

    const halfRoundUp = Math.ceil(halfSpan);

    const totalWeight = halfRoundUp*halfRoundUp;

    const lookupTable = [];
    
    function futureWeightAt(fromMin) {
        if (fromMin < halfSpan) {
            return totalWeight - fromMin * (fromMin + 1) / 2;
        } else {
            fromEnd = span - fromMin;
            return fromEnd*(fromEnd+1)/2;
        }
    }
    
    function getProbability(fromMin) {
        const here = futureWeightAt(fromMin);
        const before = futureWeightAt(fromMin-1);

        return 1 - here/before;
    }

    for (let i = min; i <= max; i++) {
        lookupTable.push(getProbability(i - min+1))
    }

    function sample(value) {
        
        if (value < min) return 0;
        if (value >= max) return 1;

        return lookupTable[value - min];
    }

    return sample;
}


class Pather {
    controller;
    fallLimit;
    jumpLimit;

    minSecondsOnPlatform= .5;
    maxSecondsOnPlatform = 2;

    jumpDistribution;
    landDistribution;

    backtrackProbability = 0.35;

    heightVariance = 1.0;

    successfulPath = null;

    constructor(controller) {
        this.controller = controller;
    }

    update() {
        let  min = Math.round(this.minSecondsOnPlatform/dt);
        let max = Math.round(this.maxSecondsOnPlatform/dt);

        if (max < min) {max = min}

        this.jumpDistribution = discreteTriangleDistribution(min, max);

        // Height variance is very non-linear - most of the differences occur very close to zero.
        // Squaring the parameter gives a more interesting range of variation for a human using the slider.
        const hv = this.heightVariance * this.heightVariance;

        min = Math.round((this.controller.timeToPeak + (1.0 - hv) * this.controller.timeToFall)/dt);
        max = Math.round((this.controller.timeToPeak + (1.0 + 0.25 * hv) * this.controller.timeToFall)/dt);

        if (max < min) {max = min}
        this.landDistribution = discreteTriangleDistribution(min, max);
    }

    selectInputForState(state, jumpLimit) {
        const input = {x:0, jump:false};

        if (Math.random() < 0.8) {            
            if (state.facing == 0) {
                state.facing = (Math.random() < this.backtrackProbability) ? -1 : 1;
            }
            input.x = state.facing;
        }

        if (state.y >= jumpLimit) {        
            if (state.isOnGround(controller.coyoteFrames)) {
                // Otherwise, if I'm still mid-platform, check if it's time to jump.
                const pJump = this.jumpDistribution(state.framesOnGround);            
                input.jump = Math.random() < pJump;
            }
        }

        return input;
    }

    planPath(map) {
        let path;
        for (let attempts = 0; (!path) && (attempts < 50); attempts++) {
            map.clear();
            path = this.attemptPath(map);
            if (path) { 
                console.log(`found successful path in ${attempts+1} attempt${attempts > 0 ? 's' : ''}.`);
                this.successfulPath = path;
                break;
            }
        }

        if (!path) {
            this.successfulPath = null;
            console.log("failed to find path. ", this.lastAttempt);
        }
    }

    attemptPath(map) {
        const { columns, rows } = map.getDimensions();

        const fallLimit = rows - 2;
        const jumpLimit = controller.jumpHeight;

        let state = new CharacterState(
            0, 
            jumpLimit + Math.floor(Math.random() * (fallLimit - jumpLimit)) + 1 - this.controller.height
        );
        state.framesOnGround = 1;
        state.facing = 1;

        const secondsBudget = 100;
        const ticksBudget = secondsBudget/dt;

        const path = [state];

        const mapShim = {
            isSolid: function(x, y) {
                if (x < 0 || x >= columns) return true;
                if (y < 0) return true;
                const tile = map.getTileAt(x, y);
                return tile === SOLID_RESERVATION;
            },
            getTileAt: map.getTileAt.bind(map)
        }

        {
            const bottom = state.bottomTile(this.controller.height);
            map.place(SOLID_RESERVATION, 0, bottom + 1);
            map.place(PLAYER_RESERVATION, 0, bottom);
        }        
        

        let wasOnGround = true;

        for (let i = 0; i < ticksBudget; i++) {

            const nearStart = state.x < 2 && path.length < 3/dt;

            const input = this.selectInputForState(state, jumpLimit);
            input.jump &= !nearStart;

            const newState = this.controller.step(state, input);

            let {collided, left, right, top, bottom} = this.controller.handleCollision(newState, mapShim);


            let needsFloor = false;
            if (newState.velY > 0) {
                if (wasOnGround) {
                    let endPlatform = this.jumpDistribution(state.framesOnGround);
                    needsFloor = nearStart || Math.random() >= endPlatform;
                } else {
                    needsFloor = bottom > fallLimit
                              || Math.random() < this.landDistribution(newState.framesSinceGround);
                }         

                if (needsFloor) {
                    let floorPlaced = false;
                    for(let x = left; x <= right; x++) {
                        if (bottom > fallLimit || map.getTileAt(x, bottom) !== PLAYER_RESERVATION) {
                            map.place(SOLID_RESERVATION, x, bottom);
                            floorPlaced = true;
                        }
                    }

                    if (floorPlaced) {
                        //floorsBuilt++;
                        // Re-run our collision check to snap the player above the newly placed floor.
                        ({collided, left, right, top, bottom} = this.controller.handleCollision(newState, mapShim));                            
                    }
                    wasOnGround = floorPlaced;
                } else {
                    wasOnGround = false;
                }
            } else {
                wasOnGround = newState.isOnGround();
            }

            map.fill(PLAYER_RESERVATION, left, top, right, newState.velY > 0 ? top : bottom);
            
            state = newState;
            path.push(state);

            if (state.x >= columns - 1  && state.isOnGround()) {                
                return path;
            }
        }

        this.lastAttempt = path;
        // Pathing time-out / fail. :(
        return null;
    }
}