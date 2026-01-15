export declare enum HandCategory {
    RoyalFlush = 0,
    StraightFlush = 1,
    FourOfAKind = 2,
    FullHouse = 3,
    Flush = 4,
    Straight = 5,
    ThreeOfAKind = 6,
    TwoPair = 7,
    OnePair = 8,
    HighCard = 9
}
export interface HandRanking {
    primeProduct: bigint;
    rank: number;
    category: HandCategory;
    description: string;
    isFlush: boolean;
}
export declare function generateHandRankings(): {
    basicHands: HandRanking[];
    flushHands: HandRanking[];
};
export declare function buildMerkleTree(hands: HandRanking[]): {
    root: bigint;
    leaves: bigint[];
    tree: bigint[][];
};
export declare function getMerkleProof(tree: bigint[][], index: number): {
    proof: bigint[];
    pathBits: boolean[];
};
export declare function exportLookupTable(hands: HandRanking[]): string;
export declare function generateAllTables(): {
    basicHands: HandRanking[];
    flushHands: HandRanking[];
    basicTree: {
        root: bigint;
        leaves: bigint[];
        tree: bigint[][];
    };
    flushTree: {
        root: bigint;
        leaves: bigint[];
        tree: bigint[][];
    };
    basicLookup: Record<string, number>;
    flushLookup: Record<string, number>;
};
//# sourceMappingURL=hand-rankings.d.ts.map