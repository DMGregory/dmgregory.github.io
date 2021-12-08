/** Duration of one frame, in seconds. */
const dt = 1/30;

/**
 * Input object used for tracking what buttons the "player" is pressing.
 * @typedef {Object} InputState
 * @property {Number} x Horizontal analog stick input, from -1 (left) to +1 (right)
 * @property {boolean} jump Is the jump button pressed?
 */

// Class representing one snapshot of the character's physical state in the game, and its inertial physics behaviour.
class CharacterState {
    /** @type {Number} Horizontal position of the character's top-left corner, in tile units.*/
    x = 0;
    /** @type {Number} Vertical position of the character's top-left corner, in tile units.*/
    y = 0;

    /** @type {Number} Horizontal velocity of the character, in tiles/second rightward.*/
    velX = 0;
    /** @type {Number} Vertical velocity of the character, in tiles/second downward.*/
    velY = 0;

    /** @type {Number} Number of frames that have passed since the character last touched ground.*/
    framesSinceGround = 1;
    /** @type {Number} Number of consecutive frames the character has been on the ground.*/
    framesOnGround = 0; 

    /** @type {Number} Which way the character is pointed (-1 = left, 0 no direction, 1 = right).*/
    facing = 1;

    /**
     * Creates a new character state, stationary, at the given coordinates.
     * @param {Number} x 
     * @param {Number} y 
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Copy this character state.
     * @returns {CharacterState} A shallow copy of this state object, suitable for mutating.
     */
    clone() {
        let copy = new CharacterState(this.x, this.y);
        copy = Object.assign(copy, this); 
        copy.collision = undefined;       
        return copy;
    }

    /**
     * Should this state count as "Standing on the ground"?
     * @param {Number} [coyoteFrames=0] How many frames' leeway do we give for a recently-falling character? Defaults to zero.
     * @returns {boolean} True if on ground (or within coyote time window), false if rising, or falling longer than the threshold.
     */
    isOnGround(coyoteFrames = 0) {
        return (this.velY >= 0) && (this.framesSinceGround <= coyoteFrames);
    }

    /**
     * Accelerate this state toward a target horizontal velocity, respecting acceleration limits.
     * @param {Number} targetVelocity Velocity to try to reach, in tiles per second rightward.
     * @param {Number} maxAcceleration Maximum acceleration when starting motion / speeding up, in tiles per second squared.
     * @param {Number} maxDeceleration Maximum deceleration when slowing down / reversing, in tiles per second squared.
     */
    accelerateToward(targetVelocity, maxAcceleration, maxDeceleration) {
        // Compute difference between desired velocity and actual.
        const deltaV = targetVelocity - this.velX;
        
        // Select an appropriate limiting velocity change based on whether we're speeding up or slowing down.
        const stopping = (targetVelocity === 0) || (this.velX * deltaV < 0);
        const limit = (stopping ? maxDeceleration : maxAcceleration) * dt;
        
        // Enforce the limit, and apply the resulting change to our velocity.
        const clamped = Math.min(Math.max(deltaV, -limit), limit);
        this.velX += clamped;
    }

    /**
     * Advance this physics state one time step, using the provided gravity strength.
     * @param {Number} gravity Vertical acceleration, in tiles per second squared downward.
     */
    step(gravity) {
        // Apply downward acceleration due to gravity.
        this.velY += gravity * dt;

        // Euler integration - advance our position along our velocity vector by one time step.
        this.x += this.velX * dt;
        this.y += this.velY * dt;

        // Advance our off-ground timer, and reset our ground timer if appropriate.
        if (this.framesSinceGround > 0) {
            this.framesOnGround = 0;
        }
        this.framesSinceGround++;
    }

    /**
     * Make this state jump off the ground.
     * @param {Number} jumpVelocity Vertical velocity, in tiles per second downward. (So, use a negative value to jump up)
     */
    jump(jumpVelocity) {
        this.velY = jumpVelocity;
        // Reset facing direction due to changing movement state, clear frames on ground now that we're aiborne.
        this.facing = 0;
        this.framesOnGround = 0;
    }

    /**
     * Process coming into contact with the ground.
     */
    land() {
        // If we've just landed from a fall, reset our facing direction
        // so we can potentially reverse direction again.
        if (this.framesOnGround === 0)
            this.facing = 0;

        // Clear any accumulated vertical velocity.
        this.velY = 0;

        // Clear off-ground timer, increment ground timer.
        this.framesSinceGround = 0;
        this.framesOnGround++;        
    }

    /** 
     * @returns {Number} The topmost row of the tile map occupied by the character sprite.
     */
    topTile() { return Math.floor(this.y)}

    /** 
     * @param {Number} height The vertical height of the character sprite, in tile units.
     * @returns {Number} The bottom row of the tile map occupied by the character sprite.
     */
    bottomTile(height) { return Math.ceil(this.y + height - 1)}

    /** 
     * @returns {Number} The leftmost column of the tile map occupied by the character sprite.
     */
    leftTile() { return Math.floor(this.x)}

    /** 
     * @param {Number} width The horizontal width of the character sprite, in tile units.
     * @returns {Number} The rightmost column of the tile map occupied by the character sprite.
     */
    rightTile(width) { return Math.ceil(this.x + width - 1)}

    /** 
     * @returns {boolean} Should this state be considered as a "falling" state?
     */
    isFalling() {return this.velY > 0;}
}

// Class representing the gameplay parameters of the player character,
// including the policy for mapping player inputs into character physics state changes.
class CharacterController {
    // Using values slightly less than 1 here, just so the character can fit soundly in a single tile without
    // risk of unintuitive rounting problems at the edges (I *think* my math above fixes that, but why risk it?)

    /** @type {Number} Width of the character's collision box, in tile units. */
    width = 0.99;
    /** @type {Number} Height of the character's collision box, in tile units. */
    height = 0.99;

    /** @type {Number} Vertical acceleration of the character when airborne, in tiles per second squared, downward.*/
    gravity = 5;

    /** @type {Number} Multiplier to apply to gravity when falling, for that snappy Mario-style drop at the end of a jump.*/
    fallingGravityBoost = 1.7;

    /** 
     * @type {Number} Launch velocity when jumping, in tiles per second.
     * This is not set directly, but calculated based on jumpHeight.
    */
    jumpVelocity = 9;

    /** @type {Number} Maximum horizontal speed, in tiles per second.*/
    runSpeed = 4;

    /** @type {Number} Maximum horizontal acceleration when starting/increasing speed, in tiles per second squared.*/
    maxAcceleration = 50;
    /** 
     * @type {Number} Maximum horizontal acceleration when stopping/reversing, in tiles per second squared.
     * This usually feels best if it's substantially higher than maxAcceleration, to get controllable stops and smooth starts.
    */
    maxDeceleration = 100;

    /** @type {Number} Multiplier to apply to acceleration parameters when airborne.*/
    airControl = 0.03;    

    /**
     * @type {Number} Number of frames after running off a ledge that the character still "counts" as being on the ground.
     * This makes jumping a little more forgiving, and results in less cursing and yelling of "I PRESSED JUMP!!" when falling into a pit.
    */
    coyoteFrames = 2;

    /** 
     * @type {Number} Vertical height from launch point to apex of jump, in tile units.
     * This is used to set the jumpVelocity, since it's generally more intuitive as a parameter for designers to edit.
    */
    jumpHeight = 4;


    // These parameters are calculated based on jumpHeight and the gravity parameters, to help with timing metrics.
    /** @type {Number} Seconds from the start of a jump to the apex of the jump.*/
    timeToPeak;
    /** @type {Number} Seconds from the apex of a jump until landing back at the level you launched from.*/
    timeToFall;

    /** @type {ActionCallback} Function to call when the controller parameters have been changed.*/
    postUpdate;

    constructor() {
    }

    /**
     * Call this when changing any input parameters to ensure output parameters are all correctly configured to match,
     * and to propagate updates to any dependent demos. (ie. Update path generation when control physics changes)
     */
    update() {
        // Update jump velocity and timing metrics based on the latest jumpHeight and gravity settings.
        // You can get these formulae by solving the equation of motion, y(t) = y(0) + v(0) * t + a * t * t / 2.
        this.jumpVelocity = -Math.sqrt(2 * this.jumpHeight * this.gravity);        
        this.timeToPeak = -this.jumpVelocity/this.gravity;        
        this.timeToFall = Math.sqrt(2 * this.jumpHeight / (this.gravity * this.fallingGravityBoost));

        // Propagate changes to any downstream demos.
        if (this.postUpdate)
            this.postUpdate();
    }

    /**
     * Use the character controller produce a new character state based on the given player input.
     * @param {CharacterState} oldState Previous physics state of the character.
     * @param {InputState} input Current left/right/jump input from the player's keyboard/gamepad.
     * @returns {CharacterState} A modified character state one time step in the future.
     */
    step(oldState, input) {
        // Clone the old state so we can change it while still preserving the old.
        const newState = oldState.clone();

        // If we're pressing in any direction, face that direction.
        if (input.x != 0) {
            newState.facing = Math.sign(input.x);
        }

        // Compute desired horizontal speed.
        const targetVelocity = input.x * this.runSpeed;        

        // Adjust our control strength based on whether we are on the ground.
        const traction =  newState.isOnGround() ? 1 : this.airControl;
        // Accelerate in the input direction left/right (or decelerate to a stop if input.x is zero).
        newState.accelerateToward(targetVelocity, this.maxAcceleration * traction, this.maxDeceleration * traction);

        // If the player tries to jump, confirm if we're allowed before doing so.
        if (input.jump && newState.isOnGround(this.coyoteFrames)) {
            newState.jump(this.jumpVelocity);
        }        

        // Fall with the appropriate gravity.
        let gravity = this.gravity;
        if (newState.isFalling()) gravity *= this.fallingGravityBoost;
        newState.step(gravity)

        return newState;
    }

    /**
     * @typedef {Object} CollisionReport 
     * @property {boolean} collided True if a collision occurred, false otherwise.
     * @property {Number} left      The leftmost column of the tilemap overlapped by the resolved character sprite.
     * @property {Number} right     The rightmost column of the tilemap overlapped by the resolved character sprite.
     * @property {Number} top       The top row of the tilemap overlapped by the resolved character sprite.
     * @property {Number} bottom    The bottom row of the tilemap overlapped by the resolved character sprite.
     */
    

    /**
     * Checks for collisions between a character and the map, and resolves collisions that occur by modifying the character state.
     * @param {CharacterState} newState A character physics state to move to a non-intersecting position.
     * @param {MapChunk} map A MapChunk to use for collision checks (calls map.isSolid(x, y))
     * @returns {CollisionReport} A data structure including the character's resulting tile bounds and whether a collision occurred.
     */
    handleCollision(newState, map) {
        // Initialize collision flag and character bounds in the tile map.
        let collided = false;

        let left = newState.leftTile();
        let right = newState.rightTile(this.width);

        let top = newState.topTile();
        let bottom = newState.bottomTile(this.height);
        
        if (newState.velY > 0) {
            // Falling down - land if we touch a solid tile below.
            for (let x = left; x <= right; x++) {
                if(map.isSolid(x, bottom) && !map.isSolid(x, bottom - 1)) {                    
                    newState.y = bottom - this.height;
                    newState.land();

                    top = newState.topTile();
                    bottom--;

                    collided = true;
                    newState.collision = {x:0, y:1};
                    break;
                }
            }
        } else if (newState.velY < 0) {
            // Rising up - kill our vertical velocity if we hit our head.
            for (let x = left; x <= right; x++) {
                if(map.isSolid(x, top) && !map.isSolid(x, top + 1)) {
                    newState.y = top+1;
                    newState.velY = 0;

                    top++;
                    bottom = newState.bottomTile(this.height);

                    collided = true;
                    newState.collision = {x:0, y:-1};
                    break;
                }
            }
        }

        if (newState.velX > 0) {
            // Moving right - backtrack left if we hit a wall.
            for (let y = top; y <= bottom; y++) {
                if(map.isSolid(right, y)) {
                    newState.x = right - this.width;
                    newState.velX = 0;
                    newState.facing *= -1;

                    left = newState.leftTile();
                    right--;

                    collided = true;
                    newState.collision = {x:1, y:0};
                    break;
                }
            }
        } else if (newState.velX < 0) {
            // Moving left - backtrack right if we hit a wall.
            for (let y = top; y <= bottom; y++) {
                if(map.isSolid(left, y)) {
                    newState.x = left+1;
                    newState.velX = 0;
                    newState.facing *= -1;

                    left++;
                    right = newState.rightTile(this.width);

                    collided = true;
                    newState.collision = {x:-1, y:0};
                    break;
                }
            }
        }

        // Report back the resulting bounds and whether or not we had to resolve a collision.
        return {collided, left, right, top, bottom}
    }
}