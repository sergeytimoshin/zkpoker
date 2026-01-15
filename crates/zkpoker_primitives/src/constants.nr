// Card encoding constants
// 52 cards mapped to first 52 prime numbers for unique identification

// Standard deck size (no jokers for Texas Hold'em)
pub global DECK_SIZE: u32 = 52;

// Maximum number of players supported
pub global MAX_PLAYERS: u32 = 10;

// Prime-based card encoding
// Cards are ordered by suit (Hearts, Diamonds, Clubs, Spades) then rank (2-A)
// Index 0-12: Hearts 2-A, Index 13-25: Diamonds 2-A, etc.
pub global CARD_PRIMES: [Field; 52] = [
    // Hearts (2h-Ah): indices 0-12
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41,
    // Diamonds (2d-Ad): indices 13-25
    43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101,
    // Clubs (2c-Ac): indices 26-38
    103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
    // Spades (2s-As): indices 39-51
    173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239
];

// Rank primes (suit-independent) for hand evaluation
// All cards of the same rank share this prime
pub global RANK_PRIMES: [Field; 13] = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41
];

// Get the card prime for a given card index
pub fn get_card_prime(card_index: u32) -> Field {
    assert(card_index < DECK_SIZE, "Card index out of range");
    CARD_PRIMES[card_index]
}

// Get the rank prime (suit-independent) for a card index
pub fn get_rank_prime(card_index: u32) -> Field {
    assert(card_index < DECK_SIZE, "Card index out of range");
    let rank = card_index % 13;
    RANK_PRIMES[rank]
}

// Get the suit of a card (0=Hearts, 1=Diamonds, 2=Clubs, 3=Spades)
pub fn get_suit(card_index: u32) -> u32 {
    assert(card_index < DECK_SIZE, "Card index out of range");
    card_index / 13
}

// Get the rank of a card (0=2, 1=3, ..., 12=A)
pub fn get_rank(card_index: u32) -> u8 {
    assert(card_index < DECK_SIZE, "Card index out of range");
    (card_index % 13) as u8
}
