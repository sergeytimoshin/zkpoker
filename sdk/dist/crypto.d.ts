/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the following imports instead:
 * - For ElGamal operations: import from './elgamal.js'
 * - For card operations: import from './card.js'
 * - For EC operations: import from './grumpkin.js'
 *
 * The elgamal.ts implementation has proper P-P=O handling and uses
 * the verified grumpkin.ts EC operations.
 */
import type { MaskedCard, PlayerKeys } from './types.js';
export declare function generatePlayerKeys(): PlayerKeys;
export declare function createCard(cardIndex: number): MaskedCard;
export declare function addPlayerToCardMask(card: MaskedCard, playerSecret: bigint): MaskedCard;
export declare function mask(card: MaskedCard, nonce: bigint): MaskedCard;
export declare function partialUnmask(card: MaskedCard, playerSecret: bigint): MaskedCard;
export declare function addPlayerAndMask(card: MaskedCard, playerSecret: bigint, nonce: bigint): MaskedCard;
//# sourceMappingURL=crypto.d.ts.map