const SOLID_RESERVATION = 'X';
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

    minSecondsOnPlatform= 1;
    maxSecondsOnPlatform = 3;

    jumpDistribution;
    landDistribution;

    jumpProbablity = 0.5;

    backtrackProbability = 0.1;

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


        min = Math.round((this.controller.timeToPeak)/dt);
        max = Math.round((this.controller.timeToPeak + 2 * this.controller.timeToFall)/dt);

        if (max < min) {max = min}
        this.landDistribution = discreteTriangleDistribution(min, max);
    }

    selectInputForState(state, jumpLimit) {
        const input = {x:0, jump:false};

        if (Math.random() < 10.8) {            
            if (state.facing == 0) {
                input.x = (Math.random() < this.backtrackProbability) ? -1 : 1;
            }
        }

        if (state.y >= jumpLimit) {
        
            if (controller.coyoteFrames > 0 && state.framesSinceGround == 1 && state.velY > 0) {
                // If I've walked off a ledge, jump with some probability.
                input.jump = Math.random() < this.jumpProbablity;
            } else if (state.isOnGround(controller.coyoteFrames)) {
                // Otherwise, if I'm still mid-platform, check if it's time to jump.
                const pJump = this.jumpDistribution(state.framesOnGround);            
                input.jump = Math.random() < pJump;
            }
        }

        return input;
    }

    planPath(map) {
        let path;
        for (let attempts = 0; (!path) && (attempts < 30); attempts++) {
            map.clear();
            path = this.attemptPath(map);
            if (path) break;
        }

        if (path) {
            this.successfulPath = path;
            console.log("found successful path!");
        } else {
            this.successfulPath = this.lastAttempt;
            console.log("failed to find path. ", this.lastAttempt);
        }
    }

    attemptPath(map) {

        const { columns, rows } = map.getDimensions();

        const fallLimit = rows - 2;
        const jumpLimit = controller.jumpHeight;

        let state = new CharacterState(
            0, 
            jumpLimit + Math.floor(Math.random() * (fallLimit - jumpLimit))
        );
        state.framesOnGround = 1;
        state.facing = 1;

        const secondsBudget = 100;
        const ticksBudget = secondsBudget/dt;

        const path = [state];

        const mapShim = {
            isSolid(x, y) {
                if (x < 0 || x >= columns) return true;
                if (y < 0) return true;
                const tile = map.getTileAt(x, y);
                return tile === SOLID_RESERVATION;
            }
        }

        map.place(SOLID_RESERVATION, 0, state.bottomTile + 1);
        let wasOnGround = true;

        for (let i = 0; i < ticksBudget; i++) {

            const input = this.selectInputForState(state, jumpLimit);

            const newState = this.controller.step(state, input);

            let {collided, left, right, top, bottom} = this.controller.handleCollision(newState, mapShim);


            let needsFloor = false;
            if (!newState.isOnGround() && newState.velY > 0) {
                if (wasOnGround) {
                    let endPlatform = this.jumpDistribution(state.framesOnGround);
                    needsFloor = Math.random() >= endPlatform;
                } else {
                    needsFloor = bottom > this.fallLimit
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
                        // Re-run our collision check to snap the player above the newly placed floor.
                        ({collided, left, right, top, bottom} = this.controller.handleCollision(newState, mapShim));                            
                    }
                    wasOnGround = floorPlaced;
                }
            } else {
                wasOnGround = true;
            }

            map.fill(PLAYER_RESERVATION, left, top, right, bottom);
            
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