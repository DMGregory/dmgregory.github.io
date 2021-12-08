// Vocabulary used for book-keeping reservations in the map.
const SOLID_RESERVATION = '▀';
const PLAYER_RESERVATION = '×';

/**
 * @callback DiscreteProbabilityDistribution
 * @param {Number} value Input value in the domain of the distribution.
 * @returns {Number} Probability that an event that has not happened before "value" attempts will occur on the next attempt.
 */

/**
 * Helper function for making a probability distribution that will have a success somewhere between
 * the given min and max, with the most likely outcome occurring halfway in between.
 * @param {Number} min Fewest number of attempts / shortest distance before a "success" event occurs.
 * @param {Number} max Greatest number of attempts / longest distance before a "success" event occurs.
 * @returns {DiscreteProbabilityDistribution} Function to get the probability of success on the nth attempt.
 */
function discreteTriangleDistribution(min, max) {    
    // Compute the width and radius of the domain/support for this function.
    const span = max - min + 1;
    const halfSpan = span/2;    

    // Compute the total probability weight we want to assign over all possible inputs.
    const halfRoundUp = Math.ceil(halfSpan);
    const totalWeight = halfRoundUp*halfRoundUp;

    // Prepare a lookup table of probability values for inputs between min and max.
    const lookupTable = [];
    
    // Compute how much probability weight still resides at values "ahead" of the current number.
    function futureWeightAt(fromMin) {
        if (fromMin < halfSpan) {
            return totalWeight - fromMin * (fromMin + 1) / 2;
        } else {
            fromEnd = span - fromMin;
            return fromEnd*(fromEnd+1)/2;
        }
    }
    
    // Compute the probability that we should succeed at "this" input,
    // given that we did not have a success at previous inputs.
    function getProbability(fromMin) {
        const here = futureWeightAt(fromMin);
        const before = futureWeightAt(fromMin-1);

        return 1 - here/before;
    }

    // Use our helper functions to populate the probability table.
    for (let i = min; i <= max; i++) {
        lookupTable.push(getProbability(i - min+1))
    }

    // Return a function that samples the probability table for the given number of attempts.
    function sample(value) {
        
        if (value < min) return 0;
        if (value >= max) return 1;

        return lookupTable[value - min];
    }
    return sample;
}

// Class responsible for Markov chain generation of a player path from the given controller.
class Pather {
    /** @type {CharacterController} Character physics to use.*/
    controller;

    /**
     * @type {Number} Tuning parameter controlling how much time the analog stick should be pressed in some direction.
     * 1 = Speedrunner, always going max speed. 0 = AFK, player never moves. 0.8 means we're usually moving, just not always full tilt.
    */
    moveProbability = 0.8;

    /** @type {Number} Tuning parameters controlling how long we wait between jumps/falls.*/
    minSecondsOnPlatform = 1;
    /** @type {Number} Tuning parameters controlling how long we wait between jumps/falls.*/
    maxSecondsOnPlatform = 2;

    /** @type {DiscreteProbabilityDistribution} Probability distribution for what grounded frame counts should trigger a jump.*/
    jumpDistribution;
    /** @type {DiscreteProbabilityDistribution} Probability distribution for what airborne frame counts should trigger a landing.*/
    landDistribution;

    /** @type {Number} Tuning parameter controlling how frequently character should change direction when jumping/landing.*/
    backtrackProbability = 0.45;

    /** @type {Number} Tuning parameter controlling how far landings should deviate from the launch height.*/
    heightVariance = 1.0;

    /** @type {CharacterState[]} Complete history of the last path that made it from start to end.*/
    successfulPath = null;

    /** @type {CharacterState[]} Complete history of the last path we tried, even if it failed to reach the end.*/
    lastAttempt = null;

    /**
     * Construct a new path generator based on the given character physics.
     * @param {CharacterController} controller Character physics to use for this path planner.
     */
    constructor(controller) {
        this.controller = controller;
    }

    /**
     * Call this when any tuning parameters change, to update dependent parameters.
     */
    update() {
        // Compute the fewest and most frames we should spend on a platform,
        // and set up a probability distribution we can use to decide when to jump.
        let min = Math.round(this.minSecondsOnPlatform/dt);
        let max = Math.round(this.maxSecondsOnPlatform/dt);
        if (max < min) {max = min}
        this.jumpDistribution = discreteTriangleDistribution(min, max);

        // Height variance is very non-linear - most of the differences occur very close to zero.
        // Squaring the parameter gives a more interesting range of variation for a human using the slider.
        const hv = this.heightVariance * this.heightVariance;

        // Compute the fewest and most frames we should spend in the air,
        // and set up a probability distribution we can use to decide when to land.
        min = Math.round((this.controller.timeToPeak + (1.0 - hv) * this.controller.timeToFall)/dt);
        max = Math.round((this.controller.timeToPeak + (1.0 + 0.25 * hv) * this.controller.timeToFall)/dt);
        if (max < min) {max = min}
        this.landDistribution = discreteTriangleDistribution(min, max);
    }

    /**
     * Markov chain: generate a new simulated player input based on the current state of the character.
     * @param {CharacterState} state Most recent character physics state.
     * @param {Number} jumpLimit Ceiling row above which we mustn't jump, to avoid exiting out the top of the map.
     * @returns {InputState} Simulated gamepad input for our virtual player.
     */
    selectInputForState(state, jumpLimit) {
        /** @type {InputState} */
        const input = {x:0, jump:false};

        // If our virtual player is pressing the stick at all...
        if (Math.random() < this.moveProbability) {            
            // If we weren't heading in a particular direction (just landed/jumped),
            // pick a direction to go according to our backtrack chance.
            if (state.facing == 0) {
                state.facing = (Math.random() < this.backtrackProbability) ? -1 : 1;
            }
            // Keep moving in the direction we're facing.
            input.x = state.facing;
        }

        // If we're below the jump ceiling (row numbers increase toward the bottom of the map), then we can jump.
        if (state.y >= jumpLimit) {        
            if (state.isOnGround(controller.coyoteFrames)) {
                // If we're still mid-platform, check if it's time to jump.
                const pJump = this.jumpDistribution(state.framesOnGround);            
                input.jump = Math.random() < pJump;
            }
        }

        return input;
    }

    /**
     * Repeatedly attempts to plan a path, annotating the given map with the tile reservation bookmarking along the way.
     * @param {MapChunk} map Map to use for dimensions and bookkeeping information. Will be cleared as part of the process.
     * @param {Number} [attemptLimit=50] Maximum number of attempts before giving up.
     * @returns {boolean} True if successful, false if no path was found in the maximum attempt limit.
     */
    planPath(map, attemptLimit = 50) {

        // Iterate up to our attempt limit.
        for (let attempts = 0; attempts < attemptLimit; attempts++) {
            // Reset map and try a fresh attempt.
            map.clear();
            const path = this.attemptPath(map);            

            if (path) { 
                // If the attempt was successful, log our success, record the path, and return.
                console.log(`found successful path in ${attempts+1} attempt${attempts > 0 ? 's' : ''}.`);
                this.successfulPath = path;
                return true;
            }
        }

        // Report failure if we did not find a path in all our attempts.        
        this.successfulPath = null;
        console.log("failed to find path.");
        return false;
    }

    /**
     * Attempts, just once, to plan a path from the left side of the map to the right.
     * @param {MapChunk} map Map to use for dimensions and bookkeeping information. Can contain pre-placed content.
     * @returns {CharacterState[]|null} Complete frame-by-frame history of the successful path through the level.
     */
    attemptPath(map) {
        const { columns, rows } = map.getDimensions();

        // Determine how how far we can fall before we MUST find ground, and how high we can climb and still jump higher.
        const fallLimit = rows - 2;
        const jumpLimit = controller.jumpHeight;

        // Choose a random starting point for our character, on the left side of the map.
        let state = new CharacterState(
            0, 
            jumpLimit + Math.floor(Math.random() * (fallLimit - jumpLimit)) + 1 - this.controller.height
        );
        // ...standing on the ground, facing right.
        state.framesOnGround = 1;
        state.facing = 1;

        // Limit the maximum play duration spent in the level, and convert it into a maximum frame count to simulate.
        const secondsBudget = 100;
        const ticksBudget = secondsBudget/dt;

        // Initialize our path to contain just the starting state.
        const path = [state];

        // Create a floor below our starting state, and reserve our starting tile as occupied by the path.
        {
            const bottom = state.bottomTile(this.controller.height);
            map.place(SOLID_RESERVATION, 0, bottom + 1);
            map.place(PLAYER_RESERVATION, 0, bottom);
        }        
        
        // Remember whether we were on the ground in the previous frame - which we are in the initial state.
        let wasOnGround = true;

        // Advance frame-by-frame, up to our maximum frame count.
        for (let i = 0; i < ticksBudget; i++) {
            // Use our Markov chain logic to determine our pseudo-random input given the most recent character state.
            const input = this.selectInputForState(state, jumpLimit);

            // Don't allow jumping in the first 3 columns for the first few seconds,
            // just so our starting platform tends to be longer than one tile.
            const nearStart = state.x < 2 && path.length < 3/dt;           
            input.jump &= !nearStart;

            // Use the character control logic to advance the character state one frame.
            const newState = this.controller.step(state, input);

            // Handle collisions with any existing solid tile reservations.
            let {collided, left, right, top, bottom} = this.controller.handleCollision(newState, map);

            // Check whether we're falling and need to land on something.            
            if (newState.isFalling()) {
                let needsFloor = false;

                if (wasOnGround) {
                    // If we've just dropped off an edge, we should keep walking straight unless it's time to jump.
                    let endPlatform = this.jumpDistribution(state.framesOnGround);
                    needsFloor = nearStart || Math.random() >= endPlatform;
                } else {
                    // Or if we're in an extended fall, we should land if we're nearing the bottom of the screen,
                    // or if our landing distribution says so.
                    needsFloor = bottom > fallLimit
                              || Math.random() < this.landDistribution(newState.framesSinceGround);
                }         

                // If we've concluded that we need a floor, try to build one.
                // (We may fail if this space is already reserved, but we'll override that to avoid falling down a pit)
                if (needsFloor) {
                    let floorPlaced = false;
                    for(let x = left; x <= right; x++) {
                        if (bottom > fallLimit || map.getTileAt(x, bottom) !== PLAYER_RESERVATION) {
                            map.place(SOLID_RESERVATION, x, bottom);
                            floorPlaced = true;
                        }
                    }

                    if (floorPlaced) {                        
                        // Re-run our collision check to snap the player above the newly placed floor,
                        // and update our bounds.
                        ({collided, left, right, top, bottom} = this.controller.handleCollision(newState, map));                            
                    }

                    // Update grounded state based on which branch we took.
                    wasOnGround = floorPlaced; // We're on ground now if we placed a floor.
                } else {
                    wasOnGround = false;       // We're still falling since we didn't place a floor.
                }
            } else {
                wasOnGround = newState.isOnGround(); // The physics state knows whether we're standing or mid-jump.
            }

            // Mark the tiles our character sprite needs to occupy this frame as reserved.
            map.fill(PLAYER_RESERVATION, left, top, right, newState.velY > 0 ? top : bottom);
            
            // Record our path history and advance to the next frame's state before we loop.
            state = newState;
            path.push(state);

            // If we landed and we're in the rightmost column, we have arrived at a valid end goal!
            // Return the successful path.
            if (state.x >= columns - 1  && state.isOnGround()) {                
                return path;
            }
        }       
        
        // Pathing time-out / fail. :(
        this.lastAttempt = path;
        return null;
    }
}