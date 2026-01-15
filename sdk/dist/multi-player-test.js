/**
 * Multi-player Test (3+ players)
 *
 * Tests the full mask/unmask cycle with 3 players:
 * 1. Create unmasked card
 * 2. Each player adds their mask
 * 3. Each player unmasks in sequence
 * 4. Verify original card is recovered
 */
import { addPlayerAndMask, partialUnmask, secretToPublicKey, randomScalar, } from './elgamal.js';
import { createCard, cardCommitment, cardIndexToPoint, } from './card.js';
import { scalarToBigint } from './grumpkin.js';
import { toHex } from './game-state.js';
import * as fs from 'fs';
import * as path from 'path';
function printDivider(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60));
}
async function runMultiPlayerTest(numPlayers, outputDir) {
    console.log(`\n${'╔' + '═'.repeat(58) + '╗'}`);
    console.log(`║${' '.repeat(12)}MULTI-PLAYER TEST (${numPlayers} players)${' '.repeat(16)}║`);
    console.log(`${'╚' + '═'.repeat(58) + '╝'}`);
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    // Create players
    printDivider('SETUP: Creating Players');
    const players = [];
    for (let i = 1; i <= numPlayers; i++) {
        const secret = randomScalar();
        const publicKey = secretToPublicKey(secret);
        players.push({
            id: i,
            secret,
            publicKey: { x: publicKey.x, y: publicKey.y },
        });
        const secretBigint = scalarToBigint(secret);
        console.log(`  Player ${i}:`);
        console.log(`    Secret: 0x${secretBigint.toString(16).slice(0, 16)}...`);
        console.log(`    Public: (0x${publicKey.x.toString(16).slice(0, 12)}..., 0x${publicKey.y.toString(16).slice(0, 12)}...)`);
    }
    // Test card: Ace of Spades (index 51)
    const testCardIndex = 51;
    console.log(`\n  Test card: index=${testCardIndex} (Ace of Spades)`);
    // Create unmasked card
    printDivider('CREATE: Unmasked Card');
    let card = createCard(testCardIndex);
    console.log(`  Initial card (unmasked):`);
    console.log(`    epk: (${card.epk.x.toString(16).slice(0, 12)}..., isInf=${card.epk.isInfinity})`);
    console.log(`    msg: (${card.msg.x.toString(16).slice(0, 12)}...)`);
    console.log(`    pk:  (isInf=${card.pk.isInfinity})`);
    console.log(`    commitment: 0x${cardCommitment(card).toString(16).slice(0, 16)}...`);
    // Each player adds their mask
    printDivider('MASK PHASE: Each Player Adds Mask');
    const maskHistory = [];
    for (const player of players) {
        const inputCard = card;
        const nonce = randomScalar();
        const outputCard = addPlayerAndMask(inputCard, player.secret, nonce);
        maskHistory.push({ player, inputCard, outputCard, nonce });
        console.log(`\n  Player ${player.id} adding mask:`);
        console.log(`    Input commitment:  0x${cardCommitment(inputCard).toString(16).slice(0, 16)}...`);
        console.log(`    Output commitment: 0x${cardCommitment(outputCard).toString(16).slice(0, 16)}...`);
        console.log(`    Output pk.isInf:   ${outputCard.pk.isInfinity}`);
        // Generate mask Prover.toml
        const inputCommitment = cardCommitment(inputCard);
        const outputCommitment = cardCommitment(outputCard);
        const toml = `# circuit_mask Prover.toml - Player ${player.id} (${numPlayers}-player test)

input_card_commitment = ${toHex(inputCommitment)}
output_card_commitment = ${toHex(outputCommitment)}
player_pub_x = ${toHex(player.publicKey.x)}
player_pub_y = ${toHex(player.publicKey.y)}

input_epk_x = ${toHex(inputCard.epk.x)}
input_epk_y = ${toHex(inputCard.epk.y)}
input_epk_is_inf = ${inputCard.epk.isInfinity}
input_msg_x = ${toHex(inputCard.msg.x)}
input_msg_y = ${toHex(inputCard.msg.y)}
input_pk_x = ${toHex(inputCard.pk.x)}
input_pk_y = ${toHex(inputCard.pk.y)}
input_pk_is_inf = ${inputCard.pk.isInfinity}

player_secret_lo = ${toHex(player.secret.lo)}
player_secret_hi = ${toHex(player.secret.hi)}

nonce_lo = ${toHex(nonce.lo)}
nonce_hi = ${toHex(nonce.hi)}
`;
        const filename = `mask_${numPlayers}p_player${player.id}.toml`;
        fs.writeFileSync(path.join(outputDir, filename), toml);
        console.log(`    Generated ${filename}`);
        card = outputCard;
    }
    // Verify fully masked card
    printDivider('VERIFY: Fully Masked Card');
    console.log(`  After ${numPlayers} players masked:`);
    console.log(`    epk.isInf: ${card.epk.isInfinity}`);
    console.log(`    pk.isInf:  ${card.pk.isInfinity}`);
    console.log(`    commitment: 0x${cardCommitment(card).toString(16).slice(0, 16)}...`);
    // Each player unmasks (in reverse order to match typical protocol)
    printDivider('UNMASK PHASE: Each Player Removes Mask');
    const unmaskHistory = [];
    // Unmask in order (could be any order, but we do 1, 2, 3...)
    for (const player of players) {
        const inputCard = card;
        const outputCard = partialUnmask(inputCard, player.secret);
        unmaskHistory.push({ player, inputCard, outputCard });
        console.log(`\n  Player ${player.id} unmasking:`);
        console.log(`    Input commitment:  0x${cardCommitment(inputCard).toString(16).slice(0, 16)}...`);
        console.log(`    Output commitment: 0x${cardCommitment(outputCard).toString(16).slice(0, 16)}...`);
        console.log(`    Output pk.isInf:   ${outputCard.pk.isInfinity}`);
        // Generate unmask Prover.toml
        const inputCommitment = cardCommitment(inputCard);
        const outputCommitment = cardCommitment(outputCard);
        const toml = `# circuit_unmask Prover.toml - Player ${player.id} (${numPlayers}-player test)

input_card_commitment = ${toHex(inputCommitment)}
output_card_commitment = ${toHex(outputCommitment)}
player_pub_x = ${toHex(player.publicKey.x)}
player_pub_y = ${toHex(player.publicKey.y)}

input_epk_x = ${toHex(inputCard.epk.x)}
input_epk_y = ${toHex(inputCard.epk.y)}
input_msg_x = ${toHex(inputCard.msg.x)}
input_msg_y = ${toHex(inputCard.msg.y)}
input_pk_x = ${toHex(inputCard.pk.x)}
input_pk_y = ${toHex(inputCard.pk.y)}

player_secret_lo = ${toHex(player.secret.lo)}
player_secret_hi = ${toHex(player.secret.hi)}
`;
        const filename = `unmask_${numPlayers}p_player${player.id}.toml`;
        fs.writeFileSync(path.join(outputDir, filename), toml);
        console.log(`    Generated ${filename}`);
        card = outputCard;
    }
    // Verify final unmasked card
    printDivider('VERIFY: Final Unmasked Card');
    console.log(`  Final card state:`);
    console.log(`    epk.isInf: ${card.epk.isInfinity}`);
    console.log(`    pk.isInf:  ${card.pk.isInfinity} (should be true)`);
    // The unmasked card should have pk = infinity
    if (!card.pk.isInfinity) {
        console.error(`  ERROR: pk is not infinity after all players unmasked!`);
        return false;
    }
    // Verify msg matches original card point
    const expectedPoint = cardIndexToPoint(testCardIndex);
    console.log(`\n  Expected msg (original card):`);
    console.log(`    x: 0x${expectedPoint.x.toString(16).slice(0, 16)}...`);
    console.log(`    y: 0x${expectedPoint.y.toString(16).slice(0, 16)}...`);
    console.log(`\n  Actual msg (after unmask):`);
    console.log(`    x: 0x${card.msg.x.toString(16).slice(0, 16)}...`);
    console.log(`    y: 0x${card.msg.y.toString(16).slice(0, 16)}...`);
    const msgMatches = card.msg.x === expectedPoint.x && card.msg.y === expectedPoint.y;
    console.log(`\n  Card recovered correctly: ${msgMatches ? '✅ YES' : '❌ NO'}`);
    // Summary
    printDivider('TEST COMPLETE');
    console.log(`\n  Generated files in: ${outputDir}`);
    const files = fs.readdirSync(outputDir).filter(f => f.includes(`${numPlayers}p`));
    console.log(`  Files for ${numPlayers}-player test: ${files.length}`);
    files.forEach(f => console.log(`    - ${f}`));
    return msgMatches;
}
async function main() {
    const outputDir = process.argv[2] || './e2e-output';
    // Test with 3, 4, and 5 players
    const results = [];
    for (const numPlayers of [3, 4, 5]) {
        const success = await runMultiPlayerTest(numPlayers, outputDir);
        results.push({ players: numPlayers, success });
    }
    // Final summary
    console.log('\n' + '╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(18) + 'FINAL SUMMARY' + ' '.repeat(27) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');
    for (const r of results) {
        console.log(`  ${r.players} players: ${r.success ? '✅ PASS' : '❌ FAIL'}`);
    }
    const allPassed = results.every(r => r.success);
    console.log(`\n  Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    process.exit(allPassed ? 0 : 1);
}
main().catch(console.error);
//# sourceMappingURL=multi-player-test.js.map