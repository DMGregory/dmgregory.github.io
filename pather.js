const SOLID_RESERVATION = 'X';
const PLAYER_RESERVATION = '.';

class Pather {
    controller;
    fallLimit;
    jumpLimit;

    constructor(controller) {
        this.controller = controller;
    }

    selectInputForState(state) {
        const input = {x:0, jump:false};
        
        return input;
    }

    planPath(map, controller) {

        const { columns, rows } = map.getDimensions();

        this.fallLimit = rows - 3;
        this.jumpLimit = controller.jumpHeight;

        let state = new CharacterState(
            0, 
            this.jumpLimit + Math.floor(Math.random() * (this.fallLimit - this.jumpLimit))
        );
        state.framesOnGround = 1;
        state.facing = 1;

        const secondsBudget = 60;
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

        for (let i = 0; i < ticksBudget; i++) {

            const input = this.selectInputForState(state);

            const newState = controller.step(state, input);

            let {collided, left, right, top, bottom} = handleCollision(newState, mapShim);


            path.push(state);

            if (state.x >= columns - 1  && state.isOnGround()) {
                return path;
            }
        }

        // Pathing time-out / fail. :(
        return null;
    }
}