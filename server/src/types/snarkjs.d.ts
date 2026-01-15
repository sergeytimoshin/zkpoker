declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: object; publicSignals: string[] }>;

    verify(
      verificationKey: object,
      publicSignals: string[],
      proof: object
    ): Promise<boolean>;

    exportSolidityCallData(
      proof: object,
      publicSignals: string[]
    ): Promise<string>;
  };

  export const zKey: {
    exportVerificationKey(zkeyPath: string): Promise<object>;
  };
}
