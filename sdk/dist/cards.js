// Card encoding utilities for ZK Poker
// Matches the Noir circuit encoding
// Card primes: first 52 primes mapped to cards
// Ordered by suit (Hearts, Diamonds, Clubs, Spades) then rank (2-A)
export const CARD_PRIMES = [
    // Hearts (2h-Ah): indices 0-12
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
    // Diamonds (2d-Ad): indices 13-25
    43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n,
    // Clubs (2c-Ac): indices 26-38
    103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n,
    // Spades (2s-As): indices 39-51
    173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n
];
// Rank primes (suit-independent) for hand evaluation
export const RANK_PRIMES = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n
];
// Rank names
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
// Suit names
const SUITS = ['h', 'd', 'c', 's']; // Hearts, Diamonds, Clubs, Spades
// Card encoding utilities
export class CardEncoding {
    // Convert card index (0-51) to string representation
    static indexToString(index) {
        if (index < 0 || index >= 52) {
            throw new Error(`Invalid card index: ${index}`);
        }
        const rank = index % 13;
        const suit = Math.floor(index / 13);
        return RANKS[rank] + SUITS[suit];
    }
    // Convert string representation to card index
    static stringToIndex(card) {
        if (card.length !== 2) {
            throw new Error(`Invalid card string: ${card}`);
        }
        const rankChar = card[0].toUpperCase();
        const suitChar = card[1].toLowerCase();
        const rank = RANKS.indexOf(rankChar === '10' ? 'T' : rankChar);
        const suit = SUITS.indexOf(suitChar);
        if (rank === -1 || suit === -1) {
            throw new Error(`Invalid card string: ${card}`);
        }
        return suit * 13 + rank;
    }
    // Get the prime for a card index
    static getPrime(index) {
        if (index < 0 || index >= 52) {
            throw new Error(`Invalid card index: ${index}`);
        }
        return CARD_PRIMES[index];
    }
    // Get the rank prime (suit-independent) for a card index
    static getRankPrime(index) {
        if (index < 0 || index >= 52) {
            throw new Error(`Invalid card index: ${index}`);
        }
        return RANK_PRIMES[index % 13];
    }
    // Get the suit of a card (0=Hearts, 1=Diamonds, 2=Clubs, 3=Spades)
    static getSuit(index) {
        if (index < 0 || index >= 52) {
            throw new Error(`Invalid card index: ${index}`);
        }
        return Math.floor(index / 13);
    }
    // Get the rank of a card (0=2, 1=3, ..., 12=A)
    static getRank(index) {
        if (index < 0 || index >= 52) {
            throw new Error(`Invalid card index: ${index}`);
        }
        return index % 13;
    }
    // Generate all 52 card indices
    static allCards() {
        return Array.from({ length: 52 }, (_, i) => i);
    }
    // Shuffle an array using Fisher-Yates
    static shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
//# sourceMappingURL=cards.js.map