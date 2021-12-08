const dt = 1/30;

class CharacterState {
    x = 0;
    y = 0;

    velX = 0;
    velY = 0;

    framesSinceGround = 1;
    framesOnGround = 0; 

    facing = 1;

    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    clone() {
        let copy = new CharacterState(this.x, this.y);
        copy = Object.assign(copy, this); 
        copy.collision = undefined;       
        return copy;
    }

    isOnGround(coyoteFrames = 0) {
        return (this.velY >= 0) && (this.framesSinceGround <= coyoteFrames);
    }

    accelerateToward(targetVelocity, maxAcceleration, maxDeceleration) {
        const deltaV = targetVelocity - this.velX;
        
        const stopping = (targetVelocity === 0) || (this.velX * deltaV < 0);
        const limit = (stopping ? maxDeceleration : maxAcceleration) * dt;
        
        const clamped = Math.min(Math.max(deltaV, -limit), limit);

        const pre = this.velX;        

        this.velX += clamped;
    }

    step(gravity) {
        this.velY += gravity * dt;

        this.x += this.velX * dt;
        this.y += this.velY * dt;

        if (this.framesSinceGround > 0) {
            this.framesOnGround = 0;
        }

        this.framesSinceGround++;
    }

    jump(jumpVelocity) {
        this.velY = jumpVelocity;        
        this.facing = 0;
        this.framesOnGround = 0;
    }

    land() {        
        this.framesSinceGround = 0;
        this.framesOnGround++;
        this.velY = 0;
        this.facing = 0;
    }

    topTile() { return Math.floor(this.y)}
    bottomTile(height) { return Math.ceil(this.y + height - 1)}

    leftTile() { return Math.floor(this.x)}
    rightTile(width) { return Math.ceil(this.x + width - 1)}

    isFalling() {return this.velY > 0;}
}

class CharacterController {
    width = 0.99;
    height = 0.99;

    gravity = 5;
    fallingGravityBoost = 1.7;
    jumpVelocity = 9;

    runSpeed = 4;

    maxAcceleration = 10;
    maxDeceleration = 150;

    airControl = 0.03;    

    coyoteFrames = 2;

    jumpHeight = 4;

    timeToPeak;
    timeToFall;

    postUpdate;

    constructor() {
    }

    update() {
        this.jumpVelocity = -Math.sqrt(2 * this.jumpHeight * this.gravity);        
        this.timeToPeak = -this.jumpVelocity/this.gravity;        
        this.timeToFall = Math.sqrt(2 * this.jumpHeight / (this.gravity * this.fallingGravityBoost));

        if (this.postUpdate)
            this.postUpdate();
    }

    step(oldState, input) {        
        
        
        const newState = oldState.clone();

        if (typeof(newState.velX) !== 'number')
            console.log('mismatch: ', newState, oldState);

        if (input.x != 0) {
            newState.facing = Math.sign(input.x);
        }

        const targetVelocity = input.x * this.runSpeed;        

        const isOnGround = newState.isOnGround(this.coyoteFrames);
        const traction = isOnGround ? 1 : this.airControl;
        newState.accelerateToward(targetVelocity, this.maxAcceleration * traction, this.maxDeceleration * traction);


        if (isOnGround && input.jump) {
            newState.jump(this.jumpVelocity);
        }

        let gravity = this.gravity;
        if (newState.velY > 0) gravity *= this.fallingGravityBoost;
        newState.step(gravity)

        return newState;
    }

    handleCollision(newState, map) {

        let collided = false;

        let left = newState.leftTile();
        let right = newState.rightTile(this.width);

        let top = newState.topTile();
        let bottom = newState.bottomTile(this.height);

        if (newState.velY > 0) {
            // Falling down - land if we touch a solid tile below.
            for (let x = left; x <= right; x++) {
                if(map.isSolid(x, bottom) && !map.isSolid(x, bottom - 1)) {
                    //console.log(x, bottom, map.getTileAt(x, bottom).toString());
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


        return {collided, left, right, top, bottom}
    }
}