// Pure model tests: no Shell, GSettings or profile access. Run with
// `gjs -m tests/test_search_model.js` from the repository root.
import {normalize, matchScore, cleanState, itemState, recordUse, rankResults}
    from '../extension/searchModel.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}
const json = value => JSON.stringify(value);
const ids = results => results.map(result => result.id);
const entry = (id, name, extra = {}) => ({id, name, ...extra});
const stateWith = items => cleanState({items});
const DAY = 86400000;
const NOW = 1700000000000;

// ---------------------------------------------------------------- normalization
assert(normalize('  Ärger  ') === 'arger', 'Diacritics are folded and surrounding space trimmed');
assert(normalize('ÜBER') === 'uber', 'Uppercase umlauts fold to plain lowercase');
assert(normalize('İstanbul') === 'istanbul', 'NFKD removes the Turkish dotted capital I mark');
assert(normalize('Café au lait') === 'cafe au lait', 'Inner spacing survives, accents do not');
assert(normalize('a\tb\nc') === 'a\tb\nc', 'Only leading and trailing whitespace is removed');
assert(normalize('uber') === normalize(normalize('Über')), 'Normalization is idempotent for folded text');
assert(normalize('Straße Søren') === 'strasse soren', 'German sharp s and Scandinavian o are folded');
assert(normalize(null) === '' && normalize(undefined) === '', 'Missing text stays empty');

// ------------------------------------------------------------------- matchScore
assert(matchScore('Firefox', {name: 'Firefox'}) === 180, 'Exact normalized name scores 180');
assert(matchScore('  FIREFOX ', {name: 'firefox'}) === 180, 'Exact match ignores case and padding');
assert(matchScore('ärger', {name: 'Arger'}) === 180, 'Umlaut query matches ASCII name exactly');
assert(matchScore('arger', {name: 'Ärger'}) === 180, 'ASCII query matches umlaut name exactly');
assert(matchScore('fire', {name: 'Firefox'}) === 140, 'Name prefix scores 140');
assert(matchScore('browser', {name: 'Firefox', keywords: 'browser web'}) === 85, 'Keyword prefix scores 85');
assert(matchScore('editor', {name: 'Code', description: 'A text editor'}) === 85,
    'Description prefix scores 85');
assert(matchScore('visual code', {name: 'Visual Studio Code'}) === 85,
    'Multi-word query averages its per-term scores');
assert(matchScore('vsc', {name: 'Visual Studio Code'}) === 100, 'Initials of a multi-word name score 100');
assert(matchScore('ffx', {name: 'Firefox'}) === 20, 'Subsequence inside the name scores 20');
assert(matchScore('friefox', {name: 'Firefox'}) === 35, 'Transposed letters are a near-word match');
assert(matchScore('frefox', {name: 'Firefox'}) === 35, 'One deleted letter is a near-word match');
assert(matchScore('furefox', {name: 'Firefox'}) === 35, 'One substituted letter is a near-word match');
assert(matchScore('undefined', {}) === null, 'Missing names do not become searchable placeholder text');
assert(matchScore('', {name: 'Firefox'}) === 0, 'Empty query scores zero');
assert(matchScore('zzzz', {name: 'Firefox'}) === null, 'Unrelated multi-letter query is rejected');
assert(matchScore('z', {name: 'Firefox'}) === null, 'Unrelated single letter cannot match by subsequence');
assert(matchScore('fire zzz', {name: 'Firefox'}) === null, 'Every query term must match something');
assert(matchScore('X'.repeat(400), {name: 'X'.repeat(400)}) === 140,
    'Query is truncated before scoring but still matches as prefix');
assert(matchScore('firefox', {name: 'Firefox'}) > matchScore('fire', {name: 'Firefox'}) &&
    matchScore('fire', {name: 'Firefox'}) > matchScore('ffx', {name: 'Firefox'}),
    'Exact beats prefix beats subsequence');
assert(matchScore('vsc', {name: 'Visual Studio Code', keywords: 'editor', description: 'Development'}) === 100,
    'Metadata must not change the title acronym');

// ------------------------------------------------------------------- cleanState
for (const raw of [null, undefined, 0, 'garbage', [], {items: null}, {items: 'garbage'},
    {items: []}, {history: 'x'}, {version: 99}]) {
    let cleaned;
    try {
        cleaned = cleanState(raw);
    } catch (error) {
        assert(false, `cleanState threw for ${json(raw)}: ${error.message}`);
    }
    assert(cleaned.version === 1 && json(cleaned.items) === '{}' && json(cleaned.history) === '[]',
        `Malformed state ${json(raw)} collapses to empty version 1`);
}
const invalidIds = ['app:', 'command:', 'app:has space', 'web:https://example.com',
    'file:/tmp/report.pdf', 'window:0x1', 'APP:firefox', 'command:two words',
    `app:${'x'.repeat(221)}`];
const rejected = cleanState({items: Object.fromEntries(invalidIds.map(id => [id, {count: 1}]))});
assert(json(rejected.items) === '{}', 'Invalid, foreign and oversized ids are dropped');
const longest = cleanState({items: {[`app:${'x'.repeat(220)}`]: {count: 1}}});
assert(Object.keys(longest.items).length === 1, 'A 220-character id payload is still accepted');
const bounded = cleanState({items: {
    'app:counts': {count: -5, last: -1},
    'app:huge': {count: 1e9, last: Date.now() + 10 * DAY},
    'app:types': {count: '12abc', favorite: 'yes', hidden: 1, alias: '  ÄRGER  ', terms: 'nope'},
}});
assert(bounded.items['app:counts'].count === 0 && bounded.items['app:counts'].last === 0,
    'Negative counters and timestamps clamp to zero');
assert(bounded.items['app:huge'].count === 10000, 'Counter is capped at 10000');
assert(bounded.items['app:huge'].last <= Date.now(), 'Future timestamps clamp to now');
assert(bounded.items['app:types'].count === 0 && bounded.items['app:types'].favorite === false &&
    bounded.items['app:types'].hidden === false, 'Non-numeric and non-boolean fields fall back');
assert(bounded.items['app:types'].alias === 'arger' && bounded.items['app:types'].terms.length === 0,
    'Alias is normalized and non-array terms are discarded');
const aliasBounded = cleanState({items: {[`app:${'a'.repeat(200)}`]: {alias: 'Ä'.repeat(50)}}});
assert(aliasBounded.items[`app:${'a'.repeat(200)}`].alias.length === 40 &&
    aliasBounded.items[`app:${'a'.repeat(200)}`].alias === 'a'.repeat(40), 'Alias is capped at 40 characters');
const termState = cleanState({items: {'app:terms': {
    terms: ['ÜBER', 'a'.repeat(80), 'b'.repeat(81), 42, null, ...Array.from({length: 20}, (_, i) => `filler${i}`)],
}}});
assert(termState.items['app:terms'].terms[0] === 'uber' && termState.items['app:terms'].terms.length === 16,
    'Terms are normalized and capped at 16');
assert(!termState.items['app:terms'].terms.some(term => typeof term !== 'string' || term.length > 80),
    'Terms reject non-strings and entries longer than 80 characters');
const historyState = cleanState({history: ['ok', 'a'.repeat(80), 'b'.repeat(81), 42, null,
    ...Array.from({length: 40}, (_, i) => `filler${i}`)]});
assert(historyState.history.length === 30 && historyState.history[0] === 'ok' &&
    historyState.history[1] === 'a'.repeat(80), 'History keeps strings up to 80 characters and caps at 30');
const manyItems = Object.fromEntries(Array.from({length: 600}, (_, index) => [`app:a${index}`, {}]));
const capped = cleanState({items: manyItems});
assert(Object.keys(capped.items).length === 512 && 'app:a0' in capped.items &&
    !('app:a512' in capped.items), 'Item map is capped at 512 entries in insertion order');
const rawInput = {items: {'app:x': {alias: 'ÄRGER', count: 3}}, history: ['q']};
const rawSnapshot = json(rawInput);
cleanState(rawInput);
assert(json(rawInput) === rawSnapshot, 'cleanState does not mutate its input');
assert(json(cleanState(cleanState(rawInput))) === json(cleanState(rawInput)),
    'cleanState is idempotent for cleaned output');
assert(Object.keys(cleanState(rawInput).items['app:x']).sort().join() ===
    'alias,count,favorite,hidden,last,terms', 'Cleaned entries expose only the known fields');

// --------------------------------------------------------------------- itemState
const lazy = cleanState();
const created = itemState(lazy, 'app:firefox');
assert(created.favorite === false && created.hidden === false && created.alias === '' &&
    created.count === 0 && created.last === 0 && json(created.terms) === '[]',
    'itemState creates a neutral entry on demand');
created.favorite = true;
assert(itemState(lazy, 'app:firefox').favorite === true, 'itemState returns the live stored entry');
const full = cleanState();
for (let index = 0; index < 512; index++) itemState(full, `app:item${index}`);
itemState(full, 'app:item0');
assert(Object.keys(full.items).length === 512, 'Touching an existing id does not grow a full map');
itemState(full, 'app:overflow');
assert(Object.keys(full.items).length === 512 && !('app:item0' in full.items) &&
    'app:item1' in full.items && 'app:overflow' in full.items,
    'A full map evicts the oldest inserted id and keeps the new one');

// --------------------------------------------------------------------- recordUse
const privacy = cleanState();
const privacySnapshot = json(privacy);
for (const id of ['web:https://example.com', 'file:/tmp/report.pdf', 'window:0x1',
    'app', '', 'https://example.com', 'command', 'app:', 'app:has space', `app:${'x'.repeat(221)}`])
    recordUse(privacy, id, 'secret query', NOW);
assert(json(privacy) === privacySnapshot,
    'recordUse ignores web, file, window and non-prefixed ids without touching state');
const used = cleanState();
recordUse(used, 'app:firefox', '  Über  ', NOW);
assert(used.items['app:firefox'].count === 1 && used.items['app:firefox'].last === NOW &&
    json(used.items['app:firefox'].terms) === '["uber"]' && json(used.history) === '["uber"]',
    'recordUse increments the counter, stamps the time and stores the normalized term');
recordUse(used, 'app:firefox', 'Über', NOW + 1);
assert(used.items['app:firefox'].count === 2 && json(used.items['app:firefox'].terms) === '["uber"]' &&
    json(used.history) === '["uber"]', 'Repeated use does not duplicate learned terms or history');
recordUse(used, 'app:firefox', 'zweite', NOW + 2);
assert(json(used.items['app:firefox'].terms) === '["zweite","uber"]' &&
    json(used.history) === '["zweite","uber"]', 'Newer terms move to the front');
recordUse(used, 'app:firefox', '   ', NOW + 3);
assert(used.items['app:firefox'].count === 4 && json(used.history) === '["zweite","uber"]',
    'Empty queries still count but store no term');
const truncated = cleanState();
recordUse(truncated, 'app:long', 'Ü'.repeat(100), NOW);
assert(truncated.items['app:long'].terms[0].length === 80 && truncated.history[0].length === 80,
    'Stored queries are truncated to 80 characters');
const busy = cleanState();
for (let index = 0; index < 40; index++) recordUse(busy, 'app:busy', `q${index}`, NOW);
assert(busy.items['app:busy'].terms.length === 16 && busy.history.length === 30,
    'Learned terms and history stay bounded at 16 and 30 entries');
for (let index = 0; index < 10005; index++) recordUse(busy, 'app:busy', '', NOW);
assert(busy.items['app:busy'].count === 10000, 'Usage counter saturates at 10000');
const isolated = cleanState();
recordUse(isolated, 'app:a', 'q', NOW);
assert(!('app:b' in isolated.items) && json(isolated.history) === '["q"]',
    'recordUse creates only the used id but shares the global history');
const roundTrip = JSON.parse(json(isolated));
assert(json(cleanState(roundTrip)) === json(isolated),
    'State written by recordUse survives a JSON persistence round trip');
// ------------------------------------------------------------------ rankResults
const aliasState = stateWith({
    'app:alias': {alias: 'Ärger'},
    'app:favorite': {favorite: true, count: 500, last: NOW},
});
const aliasRanked = rankResults([entry('app:favorite', 'Ärger'), entry('app:alias', 'Zzz')],
    'ärger', aliasState, NOW);
assert(ids(aliasRanked)[0] === 'app:alias' && aliasRanked[0].score === 400,
    'An exact normalized alias outscores a favorite exact name');
assert(aliasRanked[1].score === 225, 'Favorite plus maximum frecency adds 45 points to an exact match');
assert(aliasRanked[0].alias === 'arger' && aliasRanked[0].favorite === false,
    'Ranked results expose the persisted alias and favorite flag');

const learnedState = stateWith({'app:learned': {terms: ['terminal']}});
const learnedRanked = rankResults([entry('app:exact', 'Terminal'), entry('app:learned', 'Zzz')],
    'terminal', learnedState, NOW);
assert(ids(learnedRanked)[0] === 'app:learned' && learnedRanked[0].score === 200,
    'A learned term outranks a plain exact name with 200 points');
const learnedMixed = rankResults([entry('app:exact', 'Terminal'), entry('app:learned', 'Zzz')],
    'terminal', stateWith({'app:learned': {terms: ['terminal']}}), NOW);
assert(json(ids(learnedMixed)) === '["app:learned","app:exact"]' && learnedMixed[1].score === 180,
    'A learned term reorders but does not suppress other relevant results');

const decayState = stateWith({
    'app:old': {count: 64, last: NOW - 28 * DAY},
    'app:mid': {count: 64, last: NOW - 14 * DAY},
    'app:fresh': {count: 64, last: NOW},
});
const decayed = rankResults([entry('app:old', 'Browser'), entry('app:mid', 'Browser'),
    entry('app:fresh', 'Browser')], 'browser', decayState, NOW);
assert(json(ids(decayed)) === '["app:fresh","app:mid","app:old"]',
    'Equal usage counts decay with the age of the last use');
assert(decayed[0].score === 200 && decayed[1].score === 190 &&
    Math.abs(decayed[2].score - (180 + 20 / 3)) < 1e-9, 'Frecency bonus halves after two weeks');

const hiddenState = stateWith({'app:hidden': {hidden: true, favorite: true, alias: 'browser',
    count: 10000, last: NOW}});
assert(rankResults([entry('app:hidden', 'Browser'), entry('app:shown', 'Browser')],
    'browser', hiddenState, NOW).every(result => result.id !== 'app:hidden'),
    'Hidden items stay excluded even with alias, favorite and high frecency');

const duplicate = rankResults([entry('app:x', 'Xterm', {priority: 10}),
    entry('app:x', 'Xterm'), entry('app:y', 'Xterm')], 'xterm', cleanState(), NOW);
assert(ids(duplicate).length === 2 && ids(duplicate)[0] === 'app:x' && duplicate[0].order === 0 &&
    duplicate[0].score === 190, 'Duplicate ids keep the first occurrence and its order and priority');

const stable = rankResults([entry('app:c', 'C'), entry('app:a', 'A'), entry('app:b', 'B')],
    '', cleanState(), NOW);
assert(json(ids(stable)) === '["app:c","app:a","app:b"]',
    'Equal scores without a query keep the incoming order');
const tie = rankResults([entry('app:first', 'Alpha'), entry('app:second', 'Alpha', {priority: 5})],
    'alpha', cleanState(), NOW);
assert(json(ids(tie)) === '["app:second","app:first"]', 'Provider priority breaks a score tie');

const irrelevant = rankResults([entry('app:popular', 'Zzz', {priority: 20})], 'browser',
    stateWith({'app:popular': {favorite: true, count: 10000, last: NOW}}), NOW);
assert(irrelevant.length === 0, 'Frecency cannot resurrect an item with no query relevance');

const mutationState = stateWith({'app:x': {favorite: true, count: 2, last: NOW, terms: ['xterm']}});
const mutationItems = [entry('app:x', 'Xterm'), entry('app:y', 'Yterm')];
const stateSnapshot = json(mutationState);
const itemsSnapshot = json(mutationItems);
const ordered = rankResults(mutationItems, 'xterm', mutationState, NOW);
assert(json(mutationState) === stateSnapshot, 'rankResults does not mutate the persisted state');
assert(json(mutationItems) === itemsSnapshot, 'rankResults does not mutate the provider items');
assert(ordered[0] !== mutationItems[0] && ordered[0].name === 'Xterm',
    'Ranked results are decorated copies, not the provider objects');
const unknown = cleanState();
rankResults([entry('app:unknown', 'Unknown')], 'unknown', unknown, NOW);
assert(json(unknown.items) === '{}', 'Ranking unknown ids does not grow the state map');
assert(ordered[1].favorite === undefined && ordered[1].alias === undefined,
    'Results without persisted state carry no invented personalization');

const sanitizedTerms = cleanState({items: {'app:x': {terms: ['', '  ', 'Über', 'uber']}},
    history: ['', 'Über', 'uber']});
assert(json(sanitizedTerms.items['app:x'].terms) === '["uber"]' &&
    json(sanitizedTerms.history) === '["uber"]', 'Reload removes empty and duplicate normalized terms');
const protectedState = cleanState();
itemState(protectedState, 'app:favorite').favorite = true;
for (let i = 0; i < 512; i++) itemState(protectedState, `app:other${i}`);
assert(protectedState.items['app:favorite'].favorite === true && !protectedState.items['app:other0'],
    'Capacity eviction retains explicit personalization before unused entries');
assert(rankResults([entry('app:x', 'Xterm')], 'xterm', {}).length === 1,
    'Missing persisted item map is treated as empty');
const inherited = {items: Object.create({'app:x': {hidden: true}})};
assert(rankResults([entry('app:x', 'Xterm')], 'xterm', inherited).length === 1,
    'Inherited state properties cannot hide a result');

print(`${checks} search model checks passed (normalization, matching, ranking, state bounds, recording)`);
