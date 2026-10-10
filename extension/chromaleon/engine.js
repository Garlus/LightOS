// SPDX-License-Identifier: GPL-3.0-or-later
// LightOS adapter for ChromaLeon b2c5cd2: upstream templates and tint-strength formula.
import {readFile, readPalette} from '../palette.js';
export {calculatePaletteColors} from './vendor/colorUtils.js';
export const ACCENTS = {blue:'#3584e4', teal:'#2190a4', green:'#3a944a', yellow:'#c88800',
    orange:'#ed5b00', red:'#e62d42', pink:'#d56199', purple:'#9141ac', slate:'#6f8396'};
export const validColor = value => /^#[a-f0-9]{6}$/i.test(value);
export function strength(level, base, decimal = false) {
    return base + [decimal ? -.05 : -5, 0, decimal ? .05 : 5, decimal ? .1 : 10][Math.max(0, Math.min(3, level))];
}
export function mix(base, accent, amount) {
    const channels = value => value.slice(1).match(/../g).map(c => parseInt(c, 16));
    return '#' + channels(base).map((c, i) => Math.round(c * (1-amount) + channels(accent)[i] * amount)
        .toString(16).padStart(2, '0')).join('');
}
export function nearestAccent(hex) {
    const channels = c => c.slice(1).match(/../g).map(v => parseInt(v,16));
    const target = channels(hex);
    return Object.entries(ACCENTS).sort((a,b) => {
        const distance = c => channels(c).reduce((sum,v,i) => sum+(v-target[i])**2,0);
        return distance(a[1])-distance(b[1]);
    })[0][0];
}
// A strict property allowlist keeps the native GNOME theme in charge of geometry.
export function colorOnly(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body]) => {
        if (selector.trim().startsWith('@')) return '';
        const declarations = body.split(';').map(d => d.trim()).filter(d =>
            /^(?:color|background-color|border(?:-top|-bottom|-left|-right)?-color|outline-color|-barlevel-(?:active-background|background|overdrive)-color)\s*:/i.test(d));
        return declarations.length ? `${selector.trim()} { ${declarations.join('; ')}; }` : '';
    }).filter(Boolean).join('\n');
}
export function renderTemplate(dir, name, accent, level) {
    const text = readFile(dir.get_child(`chromaleon/vendor/templates/${name}.template.css`).get_path());
    if (text === null) throw new Error(`ChromaLeon template missing: ${name}`);
    return text.replace(/@@ACCENT@@|-st-accent-color/g, accent)
        .replace(/@@PANEL@@/g, '')
        .replace(/@@TINT_STRENGTH_CARD@@/g, strength(level,.06,true))
        .replace(/@@TINT_STRENGTH_DARK@@/g, strength(level,.1,true))
        .replace(/@@TINT_STRENGTH@@/g, name.startsWith('gtk') ? strength(level,.12,true) :
            `${strength(level,name.includes('light') ? 12 : 10)}%`);
}
export function shellCss(dir, options, mode) {
    const light = options.preferLight && mode === 'light';
    const name = options.tintShell ? (light ? (options.fullLight ? 'tinted_light_full' : 'tinted_light') :
        (options.darker ? 'tinted_darker' : 'tinted_dark')) :
        (light ? (options.fullLight ? 'light_full' : 'shell_accent_light') : 'shell_accent_dark');
    let css = colorOnly(renderTemplate(dir,name,options.accent,options.level));
    // Panel coloring is an independent setting. Avoid selectors containing #panel when off.
    css = css.replace(/([^{}]+)\{([^{}]*)\}/g, (block,sel) => sel.includes('#panel') ? '' : block);
    const lightPanel = light && options.fullLight;
    if ((options.tintShell && options.tintPanel) || lightPanel) {
        const base = lightPanel ? '#fafafb' : options.darker ? '#0f0f10' : '#1b1b1d';
        const background = options.tintShell && options.tintPanel ? mix(base, options.accent, strength(options.level,.1,true)) : base;
        css += `\n#panel { background-color: ${background}; }`;
    }
    // GNOME 50's panel stays dark in light mode unless explicitly made fully light.
    const foreground = lightPanel ? '#222226' : '#fafafb';
    css += `\n#panel, #panel .panel-button, #panel .clock-display, #panel .clock-display .clock { color: ${foreground}; }`;
    return css;
}
export function appCss(dir, options, mode) {
    const accent = `@define-color accent_bg_color ${options.accent};\n@define-color accent_color ${options.accent};\n`;
    const result = {'4.0': accent + `:root { --accent-bg-color: ${options.accent}; --accent-color: ${options.accent}; }\n`};
    if (options.tintApps) {
        const template = renderTemplate(dir,
            options.darker ? 'gtk4_darker_tinted' : 'gtk4_tinted',options.accent,options.level);
        // libadwaita 1.8+ uses CSS variables; retain upstream values in that interface too.
        result['4.0'] += template.replace(/(@media\s*[^{}]+)\{([^{}]*)\}/g, (_match,media,body) => {
            const vars=[...body.matchAll(/@define-color\s+(\w+)\s+([^;]+);/g)].map(([,key,value]) =>
                `--${key.replace(/_/g,'-')}: ${value.replace(/@(\w+)/g,(_m,k)=>`var(--${k.replace(/_/g,'-')})`)};`);
            return `${media} { ${body}\n:root { ${vars.join('\n')} } }`;
        });
    }
    if (options.tintGtk3) {
        const template = options.tintApps ? renderTemplate(dir,
        mode === 'light' ? 'gtk3_light_tinted' : options.darker ? 'gtk3_darker_tinted' : 'gtk3_dark_tinted',
        options.accent,options.level) : '';
        const definitions = (template.match(/@define-color[^;]+;/g) ?? []).join('\n');
        result['3.0'] = accent + definitions + '\n' + colorOnly(template.replace(/@define-color[^;]+;/g,''));
    }
    return result;
}
export function optionsFor(settings, iface) {
    return {accent: settings.get_boolean('chroma-gnome-colors') ? ACCENTS[iface.get_string('accent-color')] ?? ACCENTS.blue :
        (validColor(settings.get_string('chroma-accent')) ? settings.get_string('chroma-accent') : ACCENTS.blue),
        level:settings.get_int('chroma-strength'), tintShell:settings.get_boolean('chroma-tint-shell'),
        tintPanel:settings.get_boolean('chroma-tint-panel'), tintApps:settings.get_boolean('chroma-tint-apps'),
        tintGtk3:settings.get_boolean('chroma-tint-gtk3'), darker:settings.get_boolean('chroma-darker'),
        preferLight:settings.get_boolean('chroma-prefer-light'), fullLight:settings.get_boolean('chroma-full-light')};
}
// Adapt upstream mixed surface colors to LightOS' additional terminal, syntax and app adapters.
export function dynamicPalette(dir, options) {
    const palette = readPalette(dir,'ocean');
    palette.id = 'chromaleon'; palette.label = 'ChromaLeon'; palette.gnomeAccent = nearestAccent(options.accent);
    for (const mode of ['light','dark']) {
        const c = palette.variants[mode]; const dark = mode === 'dark';
        const amount = options.tintApps ? strength(options.level,dark ? .1 : .12,true) : 0;
        const base = dark ? (options.darker ? '#141416' : '#222226') : '#fafafb';
        const canvas = mix(base,options.accent,amount);
        const surface = mix(dark ? '#1d1d20' : '#ffffff',options.accent,amount);
        const raised = mix(dark ? '#2e2e32' : '#ffffff',options.accent,amount);
        const text = dark ? '#fafafb' : '#222226';
        for (const key of Object.keys(c)) {
            if (/Foreground$/.test(key) || key === 'text') c[key] = text;
            else if (/Background$/.test(key) || ['canvas','chrome','toolbar','codeBackground'].includes(key)) c[key]=canvas;
            else if (/Surface|Control|sidebar|secondary|muted/.test(key) && !/Foreground|Border/.test(key)) c[key]=raised;
        }
        Object.assign(c,{surface,surfaceRaised:raised,surfaceOverlay:raised,accent:options.accent,
            accentForeground:'#ffffff', focus:options.accent, terminalCursor:options.accent,
            messageAction:options.accent,messageActionForeground:'#ffffff',text,codeForeground:text});
    }
    return palette;
}
export function chooseColor(settings, uri, color) {
    if (!validColor(color)) return;
    settings.set_string('chroma-accent',color);
    if (settings.get_boolean('chroma-persistent')) {
        let choices; try {choices = JSON.parse(settings.get_string('chroma-choices'));} catch {choices = {};}
        choices[uri] = color;
        settings.set_string('chroma-choices',JSON.stringify(choices));
    }
    settings.set_string('color-engine','chromaleon');
}
