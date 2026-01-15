// Game State Management for ZK Poker
// Handles game state, player actions, and state transitions

use std::hash::pedersen_hash;

// ==================== Constants ====================

// Action types
pub global ACTION_NULL: u8 = 0;       // No action (start of street)
pub global ACTION_BET: u8 = 1;        // First bet on a street
pub global ACTION_CALL: u8 = 2;       // Match the current bet
pub global ACTION_FOLD: u8 = 3;       // Surrender the hand
pub global ACTION_RAISE: u8 = 4;      // Increase the bet
pub global ACTION_CHECK: u8 = 5;      // Pass without betting
pub global ACTION_ALL_IN: u8 = 6;     // Bet all remaining chips

// Street (betting round)
pub global STREET_PREFLOP: u8 = 0;
pub global STREET_FLOP: u8 = 1;
pub global STREET_TURN: u8 = 2;
pub global STREET_RIVER: u8 = 3;
pub global STREET_SHOWDOWN: u8 = 4;

// Game status
pub global STATUS_WAITING: u8 = 0;    // Waiting for players
pub global STATUS_ACTIVE: u8 = 1;     // Game in progress
pub global STATUS_FINISHED: u8 = 2;   // Game complete

// Betting limits
pub global MIN_BET: u32 = 1;          // Minimum bet size (big blind)
pub global MIN_RAISE_MULTIPLIER: u32 = 2;  // Min raise = 2x last bet

// ==================== Game State Struct ====================

// Packed game state for efficient storage and verification
pub struct GameState {
    // Player stacks (chips)
    pub stack_p1: u32,
    pub stack_p2: u32,

    // Current pot
    pub pot: u32,

    // Current street (0-4)
    pub street: u8,

    // Whose turn (1 or 2)
    pub current_player: u8,

    // Last action taken
    pub last_action: u8,

    // Size of last bet/raise
    pub last_bet_size: u32,

    // Amount each player has put in this street
    pub street_bet_p1: u32,
    pub street_bet_p2: u32,

    // Game status
    pub status: u8,

    // Dealer position (1 or 2) - affects blind posting
    pub dealer: u8,
}

impl GameState {
    // Create initial game state
    pub fn new(stack_p1: u32, stack_p2: u32, dealer: u8) -> Self {
        GameState {
            stack_p1,
            stack_p2,
            pot: 0,
            street: STREET_PREFLOP,
            current_player: if dealer == 1 { 2 } else { 1 }, // Non-dealer acts first preflop
            last_action: ACTION_NULL,
            last_bet_size: 0,
            street_bet_p1: 0,
            street_bet_p2: 0,
            status: STATUS_ACTIVE,
            dealer,
        }
    }

    // Post blinds (call at game start)
    pub fn post_blinds(self, small_blind: u32, big_blind: u32) -> Self {
        let (sb_player, _bb_player) = if self.dealer == 1 { (1, 2) } else { (2, 1) };

        let (new_stack_p1, new_stack_p2, new_street_bet_p1, new_street_bet_p2) =
            if sb_player == 1 {
                (self.stack_p1 - small_blind, self.stack_p2 - big_blind, small_blind, big_blind)
            } else {
                (self.stack_p1 - big_blind, self.stack_p2 - small_blind, big_blind, small_blind)
            };

        GameState {
            stack_p1: new_stack_p1,
            stack_p2: new_stack_p2,
            pot: small_blind + big_blind,
            street: STREET_PREFLOP,
            current_player: sb_player, // Small blind acts first
            last_action: ACTION_BET,   // Big blind counts as a bet
            last_bet_size: big_blind,
            street_bet_p1: new_street_bet_p1,
            street_bet_p2: new_street_bet_p2,
            status: STATUS_ACTIVE,
            dealer: self.dealer,
        }
    }

    // Compute hash commitment of game state
    pub fn commitment(self) -> Field {
        pedersen_hash([
            self.stack_p1 as Field,
            self.stack_p2 as Field,
            self.pot as Field,
            self.street as Field,
            self.current_player as Field,
            self.last_action as Field,
            self.last_bet_size as Field,
            self.street_bet_p1 as Field,
            self.street_bet_p2 as Field,
            self.status as Field,
            self.dealer as Field
        ])
    }

    // Get the current player's stack
    pub fn current_stack(self) -> u32 {
        if self.current_player == 1 { self.stack_p1 } else { self.stack_p2 }
    }

    // Get opponent's current street bet
    pub fn opponent_street_bet(self) -> u32 {
        if self.current_player == 1 { self.street_bet_p2 } else { self.street_bet_p1 }
    }

    // Get current player's street bet
    pub fn current_street_bet(self) -> u32 {
        if self.current_player == 1 { self.street_bet_p1 } else { self.street_bet_p2 }
    }

    // Amount needed to call
    pub fn amount_to_call(self) -> u32 {
        let opponent_bet = self.opponent_street_bet();
        let my_bet = self.current_street_bet();
        if opponent_bet > my_bet { opponent_bet - my_bet } else { 0 }
    }
}

// ==================== Action Struct ====================

pub struct Action {
    pub action_type: u8,
    pub amount: u32,
}

impl Action {
    pub fn fold() -> Self {
        Action { action_type: ACTION_FOLD, amount: 0 }
    }

    pub fn check() -> Self {
        Action { action_type: ACTION_CHECK, amount: 0 }
    }

    pub fn call() -> Self {
        Action { action_type: ACTION_CALL, amount: 0 }  // Amount computed from state
    }

    pub fn bet(amount: u32) -> Self {
        Action { action_type: ACTION_BET, amount }
    }

    pub fn raise_to(amount: u32) -> Self {
        Action { action_type: ACTION_RAISE, amount }
    }

    pub fn all_in() -> Self {
        Action { action_type: ACTION_ALL_IN, amount: 0 }  // Amount is entire stack
    }
}

// ==================== Action Validation ====================

// Check if an action is valid given the current game state
pub fn is_valid_action(state: GameState, action: Action) -> bool {
    // Game must be active
    let game_active = state.status == STATUS_ACTIVE;

    let amount_to_call = state.amount_to_call();
    let current_stack = state.current_stack();

    // Validate based on action type
    let action_valid = if action.action_type == ACTION_FOLD {
        // Can always fold (though it's stupid if you can check)
        true
    } else if action.action_type == ACTION_CHECK {
        // Can only check if nothing to call
        amount_to_call == 0
    } else if action.action_type == ACTION_CALL {
        // Can only call if there's something to call
        // Must have enough chips (or go all-in)
        (amount_to_call > 0) & (current_stack >= amount_to_call)
    } else if action.action_type == ACTION_BET {
        // Can only bet if no one has bet yet (last_action is NULL or CHECK)
        // Bet must be at least min bet
        let can_bet = (state.last_action == ACTION_NULL) | (state.last_action == ACTION_CHECK);
        let valid_amount = (action.amount >= MIN_BET) & (action.amount <= current_stack);
        can_bet & valid_amount
    } else if action.action_type == ACTION_RAISE {
        // Can only raise if there's a bet to raise
        // Raise must be at least 2x the last bet
        let is_bet = state.last_action == ACTION_BET;
        let is_raise = state.last_action == ACTION_RAISE;
        let is_allin = state.last_action == ACTION_ALL_IN;
        let can_raise = is_bet | is_raise | is_allin;
        let min_raise = state.last_bet_size * MIN_RAISE_MULTIPLIER;
        let valid_amount = (action.amount >= min_raise) & (action.amount <= current_stack);
        can_raise & valid_amount
    } else if action.action_type == ACTION_ALL_IN {
        // Can always go all-in if you have chips
        current_stack > 0
    } else {
        false
    };

    game_active & action_valid
}

// ==================== State Transition ====================

// Apply an action to the game state and return the new state
pub fn apply_action(state: GameState, action: Action) -> GameState {
    // Compute actual bet amount (additional chips to add)
    let current_stack = state.current_stack();
    let amount_to_call = state.amount_to_call();
    let my_street_bet = state.current_street_bet();

    // For RAISE, action.amount is the "raise to" total, so we need to compute additional chips
    let chips_to_add = if action.action_type == ACTION_FOLD {
        0
    } else if action.action_type == ACTION_CHECK {
        0
    } else if action.action_type == ACTION_CALL {
        if amount_to_call > current_stack { current_stack } else { amount_to_call }
    } else if action.action_type == ACTION_BET {
        action.amount
    } else if action.action_type == ACTION_RAISE {
        // Raise TO amount minus what we've already bet on this street
        action.amount - my_street_bet
    } else if action.action_type == ACTION_ALL_IN {
        current_stack
    } else {
        0
    };

    // Update stacks
    let (new_stack_p1, new_stack_p2) = if state.current_player == 1 {
        (state.stack_p1 - chips_to_add, state.stack_p2)
    } else {
        (state.stack_p1, state.stack_p2 - chips_to_add)
    };

    // Update street bets
    let (new_street_bet_p1, new_street_bet_p2) = if state.current_player == 1 {
        (state.street_bet_p1 + chips_to_add, state.street_bet_p2)
    } else {
        (state.street_bet_p1, state.street_bet_p2 + chips_to_add)
    };

    // Update pot
    let new_pot = state.pot + chips_to_add;

    // Determine new status
    let new_status = if action.action_type == ACTION_FOLD {
        STATUS_FINISHED
    } else {
        state.status
    };

    // Determine if street is complete (both players have acted and bets are equal)
    let bets_equal = new_street_bet_p1 == new_street_bet_p2;
    let both_acted = state.last_action != ACTION_NULL;
    let is_call = action.action_type == ACTION_CALL;
    let is_check = action.action_type == ACTION_CHECK;
    let street_complete = bets_equal & both_acted & (is_call | is_check);

    // Advance street if complete
    let (new_street, new_last_action, new_last_bet, new_street_p1, new_street_p2, new_current) =
        if street_complete & (state.street < STREET_SHOWDOWN) {
            // Move to next street
            (
                state.street + 1,
                ACTION_NULL,
                0,
                0,  // Reset street bets
                0,
                if state.dealer == 1 { 2 } else { 1 }  // Non-dealer acts first post-flop
            )
        } else {
            // Stay on current street, switch player
            let is_bet = action.action_type == ACTION_BET;
            let is_raise = action.action_type == ACTION_RAISE;
            // For BET/RAISE, last_bet_size is the total bet amount to match
            // For BET: it's chips_to_add (no prior bet)
            // For RAISE: it's action.amount (the "raise to" total)
            let new_bet_size = if is_raise { action.amount }
                              else if is_bet { chips_to_add }
                              else { state.last_bet_size };
            (
                state.street,
                action.action_type,
                new_bet_size,
                new_street_bet_p1,
                new_street_bet_p2,
                if state.current_player == 1 { 2 } else { 1 }
            )
        };

    GameState {
        stack_p1: new_stack_p1,
        stack_p2: new_stack_p2,
        pot: new_pot,
        street: new_street,
        current_player: new_current,
        last_action: new_last_action,
        last_bet_size: new_last_bet,
        street_bet_p1: new_street_p1,
        street_bet_p2: new_street_p2,
        status: new_status,
        dealer: state.dealer,
    }
}

// ==================== Tests ====================

#[test]
fn test_initial_state() {
    let state = GameState::new(100, 100, 1);
    assert(state.stack_p1 == 100);
    assert(state.stack_p2 == 100);
    assert(state.pot == 0);
    assert(state.status == STATUS_ACTIVE);
}

#[test]
fn test_post_blinds() {
    let state = GameState::new(100, 100, 1);
    let state_with_blinds = state.post_blinds(1, 2);

    // Dealer (P1) posts small blind, P2 posts big blind
    assert(state_with_blinds.stack_p1 == 99);  // 100 - 1 (small blind)
    assert(state_with_blinds.stack_p2 == 98);  // 100 - 2 (big blind)
    assert(state_with_blinds.pot == 3);
}

#[test]
fn test_fold_action() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);
    let action = Action::fold();

    assert(is_valid_action(state, action));

    let new_state = apply_action(state, action);
    assert(new_state.status == STATUS_FINISHED);
}

#[test]
fn test_call_action() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);
    let action = Action::call();

    assert(is_valid_action(state, action));

    let new_state = apply_action(state, action);
    // Small blind calls the big blind
    assert(new_state.stack_p1 == 98);  // Called 1 more
    assert(new_state.pot == 4);
}

#[test]
fn test_raise_action() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);
    let action = Action::raise_to(6);  // Raise to 6 (min raise is 2x2=4)

    assert(is_valid_action(state, action));

    let new_state = apply_action(state, action);
    assert(new_state.stack_p1 == 94);  // 100 - 1 (sb) - 5 (raise)
    assert(new_state.pot == 8);  // 1 + 2 + 5
    assert(new_state.last_bet_size == 6);
}
