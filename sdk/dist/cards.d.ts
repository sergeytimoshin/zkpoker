export declare const CARD_PRIMES: bigint[];
export declare const RANK_PRIMES: bigint[];
export declare class CardEncoding {
    static indexToString(index: number): string;
    static stringToIndex(card: string): number;
    static getPrime(index: number): bigint;
    static getRankPrime(index: number): bigint;
    static getSuit(index: number): number;
    static getRank(index: number): number;
    static allCards(): number[];
    static shuffle<T>(array: T[]): T[];
}
//# sourceMappingURL=cards.d.ts.map