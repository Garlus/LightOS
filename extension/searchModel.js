// GNOME-native implementation of the interaction concepts documented by Oma Cast.
// No upstream QML, JavaScript or Rust is bundled. See docs/oma-cast.md.
export function normalize(text) {
    return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/ß/g, 'ss').replace(/ø/g, 'o').trim();
}

function nearWord(a, b) {
    if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
    if (a.length === b.length)
        return a.slice(i + 1) === b.slice(i + 1) ||
            (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchScore(query, item) {
    const q = normalize(query).slice(0, 160);
    if (!q) return 0;
    const name = normalize(item.name);
    const words = normalize(`${item.name ?? ''} ${item.keywords ?? ''} ${item.description ?? ''}`)
        .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (name === q) return 180;
    if (name.startsWith(q)) return 140;
    if (q === name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(word => word[0]).join('')) return 100;
    let score = 0;
    for (const term of q.split(/\s+/)) {
        if (words.some(word => word.startsWith(term))) score += 85;
        else if (words.some(word => word.includes(term))) score += 60;
        else if (words.some(word => nearWord(term, word))) score += 35;
        else {
            let index = 0;
            for (const char of name) if (char === term[index]) index++;
            if (term.length < 2 || index !== term.length) return null;
            score += 20;
        }
    }
    return score / q.split(/\s+/).length;
}

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const validId = id => /^(app|command):[^\s]{1,220}$/.test(id);
const cleanTerms = (terms, limit) => Array.isArray(terms) ? [...new Set(terms
    .filter(t => typeof t === 'string' && t.length <= 80).map(normalize).filter(Boolean))].slice(0, limit) : [];
export function cleanState(raw = {}) {
    const state = {version: 1, items: {}, history: []};
    if (!raw || typeof raw !== 'object') return state;
    for (const [id, value] of Object.entries(raw.items ?? {}).slice(0, 512)) {
        if (!validId(id) || !value || typeof value !== 'object') continue;
        state.items[id] = {
            favorite: value.favorite === true, hidden: value.hidden === true,
            alias: typeof value.alias === 'string' ? normalize(value.alias).slice(0, 40) : '',
            count: Math.max(0, Math.min(10000, Number(value.count) || 0)),
            last: Math.max(0, Math.min(Date.now(), Number(value.last) || 0)),
            terms: cleanTerms(value.terms, 16),
        };
    }
    state.history = cleanTerms(raw.history, 30);
    return state;
}

export function itemState(state, id) {
    if (!own(state.items, id)) {
        // Keep the on-disk and in-memory state bounded even after many app installs.
        if (Object.keys(state.items).length >= 512) {
            const oldest = Object.keys(state.items).sort((a, b) => {
                const left = state.items[a], right = state.items[b];
                const protectedItem = saved => Boolean(saved.favorite || saved.alias || saved.hidden);
                return Number(protectedItem(left)) - Number(protectedItem(right)) || left.last - right.last;
            })[0];
            delete state.items[oldest];
        }
        state.items[id] = {favorite: false, hidden: false, alias: '', count: 0, last: 0, terms: []};
    }
    return state.items[id];
}

export function recordUse(state, id, query, now = Date.now()) {
    if (!validId(id)) return;
    const saved = itemState(state, id);
    saved.count = Math.min(10000, saved.count + 1);
    saved.last = now;
    const term = normalize(query).slice(0, 80);
    if (!term) return;
    saved.terms = [term, ...saved.terms.filter(t => t !== term)].slice(0, 16);
    state.history = [term, ...state.history.filter(t => t !== term)].slice(0, 30);
}

export function rankResults(items, query, state, now = Date.now()) {
    const q = normalize(query);
    const seen = new Set();
    return items.flatMap((item, order) => {
        if (seen.has(item.id)) return [];
        seen.add(item.id);
        const stored = state?.items ?? {};
        const saved = own(stored, item.id) ? stored[item.id] : {};
        if (saved.hidden) return [];
        let score = matchScore(q, item);
        if (q && saved.alias === q) score = 400;
        else if (q && saved.terms?.includes(q)) score = Math.max(score ?? 0, 200);
        if (score === null) return [];
        const ageDays = Math.max(0, (now - (saved.last ?? 0)) / 86400000);
        score += (saved.favorite ? 25 : 0) + Math.min(20, Math.log2(1 + (saved.count ?? 0)) * 4) /
            (1 + ageDays / 14) + (item.priority ?? 0);
        return [{...item, favorite: saved.favorite, alias: saved.alias, score, order}];
    }).sort((a, b) => b.score - a.score || a.order - b.order);
}
