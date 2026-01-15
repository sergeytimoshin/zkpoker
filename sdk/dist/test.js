// Quick test for ZK Poker SDK
const FIELD_ORDER_EC = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function modEC(a, m = FIELD_ORDER_EC) {
    return ((a % m) + m) % m;
}
function modInverseEC(a, m = FIELD_ORDER_EC) {
    let [old_r, r] = [m, modEC(a, m)];
    let [old_s, s] = [0n, 1n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
    }
    return modEC(old_s, m);
}
function pointAddSimple(p1, p2) {
    if (p1.isInfinite)
        return p2;
    if (p2.isInfinite)
        return p1;
    if (p1.x === p2.x && modEC(p1.y + p2.y) === 0n)
        return { x: 0n, y: 0n, isInfinite: true };
    if (p1.x === p2.x && p1.y === p2.y) {
        const s = modEC(3n * p1.x * p1.x * modInverseEC(2n * p1.y));
        const x = modEC(s * s - 2n * p1.x);
        const y = modEC(s * (p1.x - x) - p1.y);
        return { x, y, isInfinite: false };
    }
    const s = modEC((p2.y - p1.y) * modInverseEC(modEC(p2.x - p1.x)));
    const x = modEC(s * s - p1.x - p2.x);
    const y = modEC(s * (p1.x - x) - p1.y);
    return { x, y, isInfinite: false };
}
function scalarMulSimple(scalar, point) {
    if (point.isInfinite || scalar === 0n)
        return { x: 0n, y: 0n, isInfinite: true };
    let result = { x: 0n, y: 0n, isInfinite: true };
    let current = point;
    let s = modEC(scalar);
    while (s > 0n) {
        if (s & 1n)
            result = pointAddSimple(result, current);
        current = pointAddSimple(current, current);
        s >>= 1n;
    }
    return result;
}
import { createGameState, postBlinds, applyAction, gameStateCommitment, pedersenHash, generateGameActionProverToml, ACTION_CALL, } from './game-state.js';
import { createCard, addPlayerAndMask, partialUnmask, } from './crypto.js';
async function main() {
    console.log('=== ZK Poker SDK Test ===\n');
    // Test 1: Game state operations
    console.log('1. Testing game state operations...');
    const state = createGameState(100, 100, 1);
    console.log(`   Initial state: P1=${state.stackP1}, P2=${state.stackP2}, pot=${state.pot}`);
    const stateWithBlinds = postBlinds(state, 1, 2);
    console.log(`   After blinds:  P1=${stateWithBlinds.stackP1}, P2=${stateWithBlinds.stackP2}, pot=${stateWithBlinds.pot}`);
    const commitment = gameStateCommitment(stateWithBlinds);
    console.log(`   State commitment: 0x${commitment.toString(16).slice(0, 16)}...`);
    // Test 2: Apply action
    console.log('\n2. Testing action application...');
    const callAction = { actionType: ACTION_CALL, amount: 0 };
    const stateAfterCall = applyAction(stateWithBlinds, callAction);
    console.log(`   After call: P1=${stateAfterCall.stackP1}, pot=${stateAfterCall.pot}, street=${stateAfterCall.street}`);
    // Test 3: Generate Prover.toml
    console.log('\n3. Testing Prover.toml generation...');
    // Simulated player public keys
    const player1PubKey = { x: 12345n, y: 67890n };
    const player2PubKey = { x: 11111n, y: 22222n };
    const toml = generateGameActionProverToml({
        stateBefore: stateWithBlinds,
        stateAfter: stateAfterCall,
        player1PubKey,
        player2PubKey,
        actionType: ACTION_CALL,
        actionAmount: 0,
    });
    console.log('   Generated Prover.toml (first 200 chars):');
    console.log('   ' + toml.slice(0, 200).replace(/\n/g, '\n   ') + '...');
    // Test 4: Card operations
    console.log('\n4. Testing card operations...');
    const card = createCard(0); // 2 of Hearts
    console.log(`   Created card 0 (2 of Hearts): msg.x=0x${card.msg.x.toString(16).slice(0, 16)}...`);
    // Test 5: Mask and unmask
    console.log('\n5. Testing mask/unmask...');
    const secret = 12345n;
    const nonce = 67890n;
    // Test scalar multiplication commutativity
    // Both should produce the same result: G * (secret * nonce)
    const GENERATOR = { x: 1n, y: 17631683881184975370165255887551781615748388533673675138860n };
    const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    // Method 1: (G * secret) * nonce - what mask uses
    const GTimesSecret = scalarMulSimple(secret, { x: GENERATOR.x, y: GENERATOR.y, isInfinite: false });
    const sharedSecret = scalarMulSimple(nonce, GTimesSecret);
    // Method 2: (G * nonce) * secret - what unmask uses
    const GTimesNonce = scalarMulSimple(nonce, { x: GENERATOR.x, y: GENERATOR.y, isInfinite: false });
    const decryptionShare = scalarMulSimple(secret, GTimesNonce);
    console.log(`   Verifying EC operations:`);
    console.log(`     G*secret:        (${GTimesSecret.x.toString(16).slice(0, 16)}..., ${GTimesSecret.y.toString(16).slice(0, 16)}...)`);
    console.log(`     G*nonce:         (${GTimesNonce.x.toString(16).slice(0, 16)}..., ${GTimesNonce.y.toString(16).slice(0, 16)}...)`);
    console.log(`     G*secret*nonce:  (${sharedSecret.x.toString(16).slice(0, 16)}..., ${sharedSecret.y.toString(16).slice(0, 16)}...)`);
    console.log(`     G*nonce*secret:  (${decryptionShare.x.toString(16).slice(0, 16)}..., ${decryptionShare.y.toString(16).slice(0, 16)}...)`);
    console.log(`     Match: ${sharedSecret.x === decryptionShare.x && sharedSecret.y === decryptionShare.y ? 'PASS' : 'FAIL'}`);
    // Test card msg: (${testCardPoint.x.toString(16).slice(0,8)}..., ${testCardPoint.y.toString(16).slice(0,8)}...)
    const testCardPoint = { x: card.msg.x, y: card.msg.y, isInfinite: false };
    console.log(`   Test card msg: (${testCardPoint.x.toString(16).slice(0, 8)}..., ${testCardPoint.y.toString(16).slice(0, 8)}...)`);
    const masked = addPlayerAndMask(card, secret, nonce);
    console.log(`   Masked card:`);
    console.log(`     epk: (${masked.epk.x.toString(16).slice(0, 8)}..., ${masked.epk.y.toString(16).slice(0, 8)}...)`);
    console.log(`     msg: (${masked.msg.x.toString(16).slice(0, 8)}..., ${masked.msg.y.toString(16).slice(0, 8)}...)`);
    console.log(`     pk:  (${masked.pk.x.toString(16).slice(0, 8)}..., ${masked.pk.y.toString(16).slice(0, 8)}...)`);
    // Verify pk == G*secret and epk == G*nonce
    const pkMatch = masked.pk.x === GTimesSecret.x && masked.pk.y === GTimesSecret.y;
    const epkMatch = masked.epk.x === GTimesNonce.x && masked.epk.y === GTimesNonce.y;
    console.log(`   pk == G*secret: ${pkMatch ? 'PASS' : 'FAIL'}`);
    console.log(`   epk == G*nonce: ${epkMatch ? 'PASS' : 'FAIL'}`);
    if (!pkMatch) {
        console.log(`     Expected pk: (${GTimesSecret.x}, ${GTimesSecret.y})`);
        console.log(`     Actual pk:   (${masked.pk.x}, ${masked.pk.y})`);
    }
    if (!epkMatch) {
        console.log(`     Expected epk: (${GTimesNonce.x}, ${GTimesNonce.y})`);
        console.log(`     Actual epk:   (${masked.epk.x}, ${masked.epk.y})`);
    }
    const unmasked = partialUnmask(masked, secret);
    console.log(`   Unmasked card:`);
    console.log(`     epk: isInf=${unmasked.epk.isInfinite}, x=${unmasked.epk.x.toString(16).slice(0, 8)}...`);
    console.log(`     msg: (${unmasked.msg.x.toString(16).slice(0, 8)}..., ${unmasked.msg.y.toString(16).slice(0, 8)}...)`);
    console.log(`     pk:  isInf=${unmasked.pk.isInfinite}`);
    // Verify round-trip
    const originalMsgX = card.msg.x;
    const recoveredMsgX = unmasked.msg.x;
    console.log(`   Original msg.x:  0x${originalMsgX.toString(16).slice(0, 20)}...`);
    console.log(`   Recovered msg.x: 0x${recoveredMsgX.toString(16).slice(0, 20)}...`);
    console.log(`   Round-trip check: ${originalMsgX === recoveredMsgX ? 'PASS' : 'FAIL'}`);
    // Test 6: Pedersen hash
    console.log('\n6. Testing Pedersen hash...');
    const hash1 = pedersenHash([1n, 2n, 3n]);
    const hash2 = pedersenHash([1n, 2n, 3n]);
    const hash3 = pedersenHash([1n, 2n, 4n]);
    console.log(`   hash([1,2,3]) = 0x${hash1.toString(16).slice(0, 16)}...`);
    console.log(`   Deterministic: ${hash1 === hash2 ? 'PASS' : 'FAIL'}`);
    console.log(`   Different inputs: ${hash1 !== hash3 ? 'PASS' : 'FAIL'}`);
    console.log('\n=== All tests completed ===');
}
main().catch(console.error);
//# sourceMappingURL=test.js.map