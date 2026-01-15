declare const CIRCUIT_NAMES: readonly ["mask", "unmask", "shuffle", "game_action"];
type CircuitName = typeof CIRCUIT_NAMES[number];
export interface SunspotPaths {
    sunspotBin: string;
    targetDir: string;
}
export declare class ZKPokerProver {
    private paths;
    constructor(paths: SunspotPaths);
    private circuitPath;
    private runSunspot;
    compile(name: CircuitName): Promise<void>;
    setup(name: CircuitName): Promise<void>;
    prove(name: CircuitName): Promise<void>;
    verify(name: CircuitName): Promise<boolean>;
    proveAndVerify(name: CircuitName): Promise<boolean>;
}
export declare function toField(value: bigint): string;
export declare function splitScalar(scalar: bigint): {
    lo: string;
    hi: string;
};
export declare function randomScalar(): bigint;
export {};
//# sourceMappingURL=prover.d.ts.map