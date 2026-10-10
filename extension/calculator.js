// Arithmetic only. No eval(), shell commands, or dynamic JavaScript.
export function calculate(input) {
    if (input.length > 160 || !/[+*/^%−×÷-]/u.test(input))
        return null;
    const source = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.');
    const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/^%-]/gi) ?? [];
    if (tokens.join('') !== source.replace(/\s/g, ''))
        return null;
    let position = 0;
    const peek = () => tokens[position];
    function atom() {
        if (peek() === '(') {
            position++;
            const value = sum();
            if (tokens[position++] !== ')') throw new Error('Missing parenthesis');
            return value;
        }
        const token = tokens[position++];
        if (!token || !/^(?:\d|\.)/.test(token)) throw new Error('Missing number');
        return Number(token);
    }
    function power() {
        const value = atom();
        if (peek() !== '^') return value;
        position++;
        return value ** unary();
    }
    function unary() {
        if (peek() === '+' || peek() === '-') {
            const sign = tokens[position++] === '-' ? -1 : 1;
            return sign * unary();
        }
        return power();
    }
    function product() {
        let value = unary();
        while (['*', '/', '%'].includes(peek())) {
            const op = tokens[position++];
            const right = unary();
            value = op === '*' ? value * right : op === '/' ? value / right : value % right;
        }
        return value;
    }
    function sum() {
        let value = product();
        while (['+', '-'].includes(peek())) {
            const op = tokens[position++];
            const right = product();
            value += op === '+' ? right : -right;
        }
        return value;
    }
    try {
        const result = sum();
        if (position !== tokens.length || !Number.isFinite(result)) return null;
        return String(Number(result.toPrecision(12)));
    } catch {
        return null;
    }
}
