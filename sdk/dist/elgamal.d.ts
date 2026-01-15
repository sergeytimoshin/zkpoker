/**
 * ElGamal encryption operations for mental poker
 *
 * Implements the mask/unmask protocol for commutative encryption.
 * This allows multiple players to mask a card, and any order of
 * unmasking reveals the original card.
 */
import { Point, Scalar } from "./grumpkin.js";
import { Card } from "./card.js";
/**
 * Compute public key from secret: G * secret
 */
export declare function secretToPublicKey(secret: Scalar): Point;
/**
 * Add a player to the card's masking group
 *
 * This must be called before masking can occur.
 * Mathematical operation:
 *   pk_new = pk + G * player_secret
 *   msg_new = msg + epk * player_secret (if epk exists)
 *
 * @param card The card to add the player to
 * @param playerSecret The player's private key (scalar)
 * @returns A new Card with the player added to the masking group
 */
export declare function addPlayerToCardMask(card: Card, playerSecret: Scalar): Card;
/**
 * Mask a card with a random nonce (ElGamal encryption step)
 *
 * Mathematical operation:
 *   epk_new = epk + G * nonce (or G * nonce if epk is identity)
 *   msg_new = msg + pk * nonce
 *
 * Requirements: Card must have at least one player in pk
 *
 * @param card The card to mask
 * @param nonce Random scalar for encryption
 * @returns A new masked Card
 */
export declare function mask(card: Card, nonce: Scalar): Card;
/**
 * Partially unmask a card (one player reveals their share)
 *
 * Mathematical operation:
 *   msg_new = msg - epk * player_secret
 *   pk_new = pk - G * player_secret
 *
 * When all players have unmasked, pk becomes the point at infinity
 * and msg contains the original card point.
 *
 * @param card The card to unmask
 * @param playerSecret The player's private key (scalar)
 * @returns A new Card with one layer of masking removed
 */
export declare function partialUnmask(card: Card, playerSecret: Scalar): Card;
/**
 * Combined operation: add player and mask in one step
 * This is the typical flow during the shuffle phase
 */
export declare function addPlayerAndMask(card: Card, playerSecret: Scalar, nonce: Scalar): Card;
/**
 * Generate random scalar for use as nonce or secret
 */
export declare function randomScalar(): Scalar;
//# sourceMappingURL=elgamal.d.ts.map