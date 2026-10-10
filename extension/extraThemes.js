import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {gtkColors, readFile, writeFile} from './palette.js';

// Only documented color interfaces are used. No platform plugin, Qt style,
// Electron launch arguments, sandbox overrides, or geometry is changed.
// Sources: code.visualstudio.com/api/references/theme-color;
// develop.kde.org/docs/plasma/; github.com/trialuser02/qt6ct;
// docs.gtk.org/gtk4/class.CssProvider.html;
// docs.flatpak.org/en/latest/sandbox-permissions.html.
export function editorColors(c) {
    return {
        'foreground': c.text, 'focusBorder': c.focus,
        'selection.background': c.messageSurface,
        'editor.background': c.codeBackground, 'editor.foreground': c.codeForeground,
        'editorGutter.background': c.codeBackground,
        'editorPane.background': c.codeBackground,
        'editorGroup.emptyBackground': c.codeBackground,
        'editorGroup.border': c.border,
        'editorGroupHeader.noTabsBackground': c.toolbar,
        'editorGroupHeader.tabsBorder': c.border,
        'editorGroupHeader.border': c.border,
        'breadcrumbs.background': c.codeBackground,
        'breadcrumbs.foreground': c.textMuted,
        'breadcrumbs.focusForeground': c.text,
        'breadcrumbs.activeSelectionForeground': c.accent,
        'breadcrumbPicker.background': c.surfaceOverlay,
        'editorCursor.foreground': c.terminalCursor,
        'editor.selectionBackground': c.terminalSelection,
        'editor.lineHighlightBackground': c.surfaceRaised,
        'editorLineNumber.foreground': c.textMuted,
        'editorLineNumber.activeForeground': c.text,
        'editorWidget.background': c.surfaceOverlay,
        'editorWidget.foreground': c.text, 'editorWidget.border': c.border,
        'editorGroupHeader.tabsBackground': c.toolbar,
        'tab.activeBackground': c.codeBackground, 'tab.activeForeground': c.text,
        'tab.inactiveBackground': c.toolbar, 'tab.inactiveForeground': c.textMuted,
        'tab.border': c.border, 'tab.activeBorderTop': c.accent,
        'sideBar.background': c.sidebar, 'sideBar.foreground': c.sidebarForeground,
        'sideBar.border': c.sidebarBorder,
        'sideBarTitle.foreground': c.sidebarForeground,
        'activityBar.background': c.sidebar, 'activityBar.foreground': c.text,
        'activityBar.inactiveForeground': c.textMuted,
        'activityBarBadge.background': c.accent,
        'activityBarBadge.foreground': c.accentForeground,
        'titleBar.activeBackground': c.toolbar,
        'titleBar.activeForeground': c.toolbarForeground,
        'titleBar.inactiveBackground': c.toolbar,
        'titleBar.inactiveForeground': c.textMuted,
        'statusBar.background': c.toolbar, 'statusBar.foreground': c.toolbarForeground,
        'statusBar.noFolderBackground': c.toolbar,
        'statusBar.noFolderForeground': c.toolbarForeground,
        'statusBar.debuggingBackground': c.warningSurface,
        'statusBar.debuggingForeground': c.warningForeground,
        'panel.background': c.canvas, 'panel.border': c.border,
        'panelTitle.activeForeground': c.text, 'panelTitle.inactiveForeground': c.textMuted,
        'button.background': c.accent, 'button.foreground': c.accentForeground,
        'button.secondaryBackground': c.secondary,
        'button.secondaryForeground': c.secondaryForeground,
        'input.background': c.surfaceRaised, 'input.foreground': c.text,
        'input.border': c.border, 'input.placeholderForeground': c.placeholder,
        'dropdown.background': c.surfaceOverlay, 'dropdown.foreground': c.text,
        'dropdown.border': c.border,
        'menu.background': c.surfaceOverlay, 'menu.foreground': c.text,
        'menu.border': c.border, 'menu.selectionBackground': c.secondary,
        'menu.selectionForeground': c.text,
        'toolbar.hoverBackground': c.secondary,
        'activityBarTop.background': c.sidebar,
        'activityBarTop.foreground': c.text,
        'activityBarTop.inactiveForeground': c.textMuted,
        'panelInput.border': c.border,
        'editor.findMatchBackground': c.messageSurface,
        'editorUnicodeHighlight.background': c.warningSurface,
        'editorUnicodeHighlight.border': c.warningForeground,
        'list.activeSelectionBackground': c.sidebarRowSelected,
        'list.activeSelectionForeground': c.sidebarForeground,
        'list.inactiveSelectionBackground': c.sidebarRowActive,
        'list.inactiveSelectionForeground': c.sidebarForeground,
        'list.hoverBackground': c.sidebarRowHover,
        'list.hoverForeground': c.sidebarForeground,
        'quickInput.background': c.surfaceOverlay, 'quickInput.foreground': c.text,
        'notificationCenterHeader.background': c.toolbar,
        'notifications.background': c.surfaceOverlay,
        'notifications.foreground': c.text,
        'terminal.background': c.terminalBackground,
        'terminal.foreground': c.terminalForeground,
        'terminalCursor.foreground': c.terminalCursor,
        'terminal.selectionBackground': c.terminalSelection,
        'scrollbarSlider.background': `${c.terminalScrollbar}80`,
        'scrollbarSlider.hoverBackground': `${c.terminalScrollbarHover}a0`,
        'textLink.foreground': c.accent, 'errorForeground': c.errorForeground,
    };
}

const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(',');
export function kdeColors(c) {
    const entries = [];
    for (const [set, background, foreground] of [
        ['Window', c.canvas, c.text], ['View', c.surface, c.text],
        ['Button', c.toolbarControl, c.toolbarControlForeground],
        ['Selection', c.accent, c.accentForeground],
        ['Tooltip', c.surfaceOverlay, c.text], ['Header', c.toolbar, c.toolbarForeground],
    ]) {
        const selected = set === 'Selection';
        for (const [key, value] of Object.entries({
            BackgroundNormal: background, BackgroundAlternate: selected ? c.accent : c.surfaceRaised,
            BackgroundActive: c.accentSurface, BackgroundLink: c.accentSurface,
            BackgroundVisited: c.muted, BackgroundNegative: c.errorSurface,
            BackgroundNeutral: c.warningSurface, BackgroundPositive: c.messageSurface,
            ForegroundNormal: foreground, ForegroundInactive: selected ? foreground : c.textMuted,
            ForegroundActive: selected ? foreground : c.accent, ForegroundLink: selected ? foreground : c.accent,
            ForegroundVisited: selected ? foreground : c.messageAction,
            ForegroundNegative: selected ? foreground : c.errorForeground,
            ForegroundNeutral: selected ? foreground : c.warningForeground,
            ForegroundPositive: selected ? foreground : c.messageAction,
            DecorationFocus: c.focus, DecorationHover: c.accent,
        })) entries.push({keys: [`Colors:${set}`, key], value: rgb(value)});
    }
    return entries;
}

export function qtctColors(c, major) {
    // QPalette::ColorRole order is part of Qt's serialization contract.
    const active = [c.text, c.toolbarControl, c.surfaceRaised, c.surfaceRaised,
        c.border, c.border, c.text, c.text, c.toolbarControlForeground,
        c.surface, c.canvas, '#000000', c.accent, c.accentForeground,
        c.accent, c.messageAction, c.surfaceRaised, c.canvas,
        c.surfaceOverlay, c.text, c.placeholder];
    if (major === 6) active.push(c.accent); // Qt 6.6+ Accent
    const disabled = active.map((color, index) =>
        [0, 6, 8, 13, 19, 20].includes(index) ? c.textMuted : color);
    disabled[12] = c.surfaceRaised;
    const line = colors => colors.map(color => `#ff${color.slice(1)}`).join(', ');
    return `[ColorScheme]\nactive_colors=${line(active)}\n` +
        `inactive_colors=${line(active)}\ndisabled_colors=${line(disabled)}\n`;
}

export function kdeScheme(colors, name = 'LightOS GNOME') {
    let scheme = `[General]\nName=${name}\n`;
    for (const {keys, value} of kdeColors(colors))
        scheme = editINI(scheme, keys, {present: true, value});
    return scheme;
}

// KSyntaxHighlighting themes have no inheritance interface. Start with the
// native theme document so every bold/italic/underline/custom-style field is
// retained, then change only its color values and identifying metadata.
export function kdeEditorTheme(base, c, name = 'LightOS GNOME') {
    const theme = JSON.parse(JSON.stringify(base));
    theme.metadata = {...theme.metadata, name, revision: 1};
    const syntaxColor = style => {
        if (/Comment|Documentation|Annotation/.test(style)) return c.textMuted;
        if (/String|Char|Import|Preprocessor|Others/.test(style)) return c.messageAction;
        if (/DecVal|BaseN|Float|Constant|Information/.test(style)) return c.warningForeground;
        if (/Warning|Alert|Error/.test(style)) return c.errorForeground;
        if (/Keyword|Function|Variable|ControlFlow|Operator|BuiltIn|Extension|Attribute|DataType|RegionMarker/.test(style)) return c.accent;
        return c.codeForeground;
    };
    const colorStyle = (style, definition) => {
        for (const key of Object.keys(definition)) {
            if (key === 'text-color') definition[key] = syntaxColor(style);
            else if (key === 'selected-text-color') definition[key] = c.accentForeground;
            else if (key === 'background-color') definition[key] = c.surfaceRaised;
            else if (key === 'selected-background-color') definition[key] = c.accent;
        }
    };
    for (const [style, definition] of Object.entries(theme['text-styles'] ?? {})) colorStyle(style, definition);
    for (const definitions of Object.values(theme['custom-styles'] ?? {}))
        for (const [style, definition] of Object.entries(definitions)) colorStyle(style, definition);
    theme['editor-colors'] = {...theme['editor-colors'],
        BackgroundColor: c.codeBackground, CurrentLine: c.surfaceRaised,
        IconBorder: c.sidebar, IndentationLine: c.border,
        LineNumbers: c.textMuted, CurrentLineNumber: c.text,
        TextSelection: c.accent, Separator: c.border, CodeFolding: c.messageSurface,
        BracketMatching: c.messageSurface, SearchHighlight: c.messageSurface,
        ReplaceHighlight: c.messageSurface, SpellChecking: c.errorForeground,
        TabMarker: c.textMuted, WordWrapMarker: c.border,
        MarkBookmark: c.accent, MarkBreakpointActive: c.errorForeground,
        MarkBreakpointReached: c.warningForeground, MarkBreakpointDisabled: c.textMuted,
        MarkExecution: c.messageAction, MarkWarning: c.warningForeground,
        MarkError: c.errorForeground, ModifiedLines: c.warningForeground,
        SavedLines: c.messageAction, TemplateBackground: c.surfaceRaised,
        TemplatePlaceholder: c.messageSurface, TemplateFocusedPlaceholder: c.accentSurface,
        TemplateReadOnlyPlaceholder: c.muted,
    };
    return JSON.stringify(theme, null, 2) + '\n';
}

// A small JSONC syntax tree, retaining original text spans. This deliberately
// rejects duplicate keys and malformed input instead of rewriting user files.
export function parseJSONC(text) {
    let pos = 0;
    function space() {
        while (pos < text.length) {
            if (/\s/.test(text[pos])) { pos++; continue; }
            if (text.slice(pos, pos + 2) === '//') {
                const end = text.indexOf('\n', pos); pos = end < 0 ? text.length : end + 1; continue;
            }
            if (text.slice(pos, pos + 2) === '/*') {
                const end = text.indexOf('*/', pos + 2);
                if (end < 0) throw new Error('Unclosed JSONC comment');
                pos = end + 2; continue;
            }
            break;
        }
    }
    function parse(depth = 0) {
        if (depth > 100) throw new Error('JSONC nesting too deep');
        space(); const start = pos;
        if (text[pos] === '{' || text[pos] === '[') {
            const object = text[pos++] === '{';
            const close = object ? '}' : ']';
            const properties = []; const value = object ? Object.create(null) : [];
            space();
            while (text[pos] !== close) {
                let name = null; const keyStart = pos;
                if (object) {
                    const key = parse(depth + 1);
                    if (typeof key.value !== 'string') throw new Error('JSONC key must be a string');
                    name = key.value;
                    if (Object.hasOwn(value, name)) throw new Error('Duplicate JSONC key');
                    space(); if (text[pos++] !== ':') throw new Error('JSONC colon missing');
                }
                const child = parse(depth + 1);
                if (object) value[name] = child.value;
                else value.push(child.value);
                const prop = {name, keyStart, child, comma: null}; properties.push(prop);
                space();
                if (text[pos] === ',') { prop.comma = pos++; space(); }
                else if (text[pos] !== close) throw new Error('JSONC comma missing');
                if (pos >= text.length) throw new Error('Unclosed JSONC container');
            }
            pos++;
            return {start, end: pos, value, properties, object};
        }
        if (text[pos] === '"') {
            pos++;
            while (pos < text.length) {
                if (text[pos] === '\\') { pos += 2; continue; }
                if (text[pos++] === '"') return {start, end: pos, value: JSON.parse(text.slice(start, pos))};
            }
            throw new Error('Unclosed JSONC string');
        }
        const token = text.slice(pos).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
        if (!token) throw new Error('Invalid JSONC value');
        pos += token[0].length;
        return {start, end: pos, value: JSON.parse(token[0])};
    }
    const root = parse(); space();
    if (pos !== text.length || !root.object) throw new Error('JSONC object expected');
    return root;
}

function jsonNode(text, keys) {
    let node = parseJSONC(text);
    for (const key of keys) {
        if (!node.object) return null;
        node = node.properties.find(prop => prop.name === key)?.child;
        if (!node) return null;
    }
    return node;
}

export function jsonValue(text, keys) {
    const node = jsonNode(text, keys);
    return node ? {present: true, value: node.value} : {present: false};
}

export function editJSONC(text, keys, desired) {
    const root = parseJSONC(text);
    let parent = root;
    for (let index = 0; index < keys.length - 1; index++) {
        const child = parent.properties.find(prop => prop.name === keys[index])?.child;
        if (!child) {
            if (!desired.present) return text;
            let nested = desired.value;
            for (let cursor = keys.length - 1; cursor > index; cursor--) nested = {[keys[cursor]]: nested};
            return editJSONC(text, keys.slice(0, index + 1), {present: true, value: nested});
        }
        if (!child.object) throw new Error('Existing JSONC setting is not an object');
        parent = child;
    }
    const name = keys.at(-1);
    const index = parent.properties.findIndex(prop => prop.name === name);
    const prop = parent.properties[index];
    if (prop && desired.present)
        return text.slice(0, prop.child.start) + JSON.stringify(desired.value) + text.slice(prop.child.end);
    if (prop) {
        // Remove exactly one setting and one comma; retain neighboring comments.
        let result = text.slice(0, prop.keyStart) + text.slice(prop.child.end);
        if (prop.comma !== null) {
            const comma = prop.comma - (prop.child.end - prop.keyStart);
            result = result.slice(0, comma) + result.slice(comma + 1);
        } else if (index > 0) {
            const comma = parent.properties[index - 1].comma;
            result = result.slice(0, comma) + result.slice(comma + 1);
        }
        return result;
    }
    if (!desired.present) return text;
    const previous = parent.properties.at(-1);
    const comma = previous && previous.comma === null ? ',' : '';
    const insertion = `${comma}\n  ${JSON.stringify(name)}: ${JSON.stringify(desired.value)}\n`;
    return text.slice(0, parent.end - 1) + insertion + text.slice(parent.end - 1);
}

function iniLines(text) { return text.match(/[^\n]*\n|[^\n]+$/g) ?? []; }
function iniLocation(text, section, key) {
    const lines = iniLines(text); let current = ''; const matches = []; const sections = [];
    for (let index = 0; index < lines.length; index++) {
        const header = lines[index].trim().match(/^\[([^\]]+)\]$/);
        if (header) { current = header[1]; if (current === section) sections.push(index); continue; }
        if (current !== section) continue;
        const entry = lines[index].match(/^\s*([^#;=\s][^=]*?)\s*=(.*?)(?:\r?\n)?$/);
        if (entry && entry[1].trim() === key) matches.push({index, value: entry[2].trim()});
    }
    if (matches.length > 1 || sections.length > 1) throw new Error('Ambiguous INI setting');
    return {lines, match: matches[0] ?? null, section: sections[0] ?? null};
}
export function iniValue(text, keys) {
    const match = iniLocation(text, ...keys).match;
    return match ? {present: true, value: match.value} : {present: false};
}
export function editINI(text, keys, desired) {
    const [section, key] = keys; const found = iniLocation(text, section, key);
    if (found.match) {
        if (!desired.present) found.lines.splice(found.match.index, 1);
        else found.lines[found.match.index] = `${key}=${desired.value}\n`;
        return found.lines.join('');
    }
    if (!desired.present) return text;
    if (found.section !== null) {
        // Insert immediately after its header. Ensure a missing final newline
        // cannot glue the generated key to the section name.
        if (!found.lines[found.section].endsWith('\n')) found.lines[found.section] += '\n';
        found.lines.splice(found.section + 1, 0, `${key}=${desired.value}\n`);
        return found.lines.join('');
    }
    return text + (text && !text.endsWith('\n') ? '\n' : '') + `[${section}]\n${key}=${desired.value}\n`;
}

const BEGIN = '/* BEGIN LightOS private app colors */';
const END = '/* END LightOS private app colors */';
function removeCSS(text) {
    const start = text.indexOf(BEGIN); const end = text.indexOf(END, start);
    if (start < 0 || end < 0) return text;
    return text.slice(0, start) + text.slice(end + END.length).replace(/^\n/, '');
}
function cssBlock(text) {
    const start = text.indexOf(BEGIN); const end = text.indexOf(END, start);
    return start < 0 || end < 0 ? null : text.slice(start, end + END.length);
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Module import is side-effect-free. Optional directories make isolated tests
// possible; the extension uses the ordinary XDG locations when instantiated.
export class ExtraThemes {
    constructor(options = {}) {
        this._config = options.configDir ?? GLib.get_user_config_dir();
        this._data = options.dataDir ?? GLib.get_user_data_dir();
        this._home = options.homeDir ?? GLib.get_home_dir();
        this._privateRoot = options.privateRoot ?? GLib.build_filenamev([this._home, '.var', 'app']);
        this._state = options.stateDir ?? GLib.get_user_state_dir();
        this._assets = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('native');
        this._path = GLib.build_filenamev([this._state, 'lightos-gnome', 'extra-backup.json']);
        this._journal = JSON.parse(readFile(this._path) ?? '{"files":{}}');
        this.coverage = [];
    }
    _save() { writeFile(this._path, JSON.stringify(this._journal)); }
    _safe(path) {
        // In particular, do not follow private-app symlinks outside its sandbox
        // config directory. Never follow a settings file replaced by a symlink.
        const roots = [this._config, this._data, this._privateRoot];
        const root = roots.find(candidate => path.startsWith(candidate + '/'));
        if (!root) return false;
        let current = root;
        for (const part of path.slice(root.length + 1).split('/')) {
            if (!part || part === '.' || part === '..') return false;
            current += '/' + part;
            const file = Gio.File.new_for_path(current);
            try {
                const info = file.query_info('standard::is-symlink', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
                if (info.get_is_symlink()) return false;
            } catch (error) {
                if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) throw error;
            }
        }
        return true;
    }
    _directory(path) {
        return Gio.File.new_for_path(path).query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY;
    }
    _directories(path) {
        if (!this._directory(path)) return [];
        const enumerator = Gio.File.new_for_path(path).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const result = [];
        try {
            let info;
            while ((info = enumerator.next_file(null))) {
                if (info.get_file_type() === Gio.FileType.DIRECTORY)
                    result.push(info.get_name());
            }
        } finally { enumerator.close(null); }
        return result;
    }
    _files(path, suffix) {
        if (!this._directory(path)) return [];
        const enumerator = Gio.File.new_for_path(path).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const result = [];
        try {
            let info;
            while ((info = enumerator.next_file(null)))
                if (info.get_file_type() === Gio.FileType.REGULAR && info.get_name().endsWith(suffix))
                    result.push(`${path}/${info.get_name()}`);
        } finally { enumerator.close(null); }
        return result;
    }
    _patch(path, kind, entries) {
        if (!this._safe(path)) return;
        const original = readFile(path);
        let text = original ?? (kind === 'json' ? '{}\n' : '');
        const getter = kind === 'json' ? jsonValue : iniValue;
        const editor = kind === 'json' ? editJSONC : editINI;
        const file = this._journal.files[path] ??= {kind, original, entries: {}, last: original};
        if (original !== file.last) file.preserveEdits = true;
        // Preflight the complete edit before journaling/writing anything.
        const updated = [];
        for (const {keys, value} of entries) {
            const id = JSON.stringify(keys); const current = getter(text, keys);
            const managed = file.entries[id];
            if (managed?.abandoned) continue;
            if (managed && !equal(current, managed.last)) { managed.abandoned = true; continue; }
            const desired = {present: true, value};
            text = editor(text, keys, desired);
            updated.push({id, keys, original: current, last: desired});
        }
        for (const entry of updated) {
            file.entries[entry.id] ??= {keys: entry.keys, original: entry.original};
            file.entries[entry.id].last = entry.last;
        }
        file.last = text; this._save();
        if (text !== original) writeFile(path, text);
    }
    _whole(path, contents) {
        if (!this._safe(path)) return;
        const original = readFile(path);
        const file = this._journal.files[path] ??= {kind: 'whole', original, last: original};
        if (file.abandoned || original !== file.last) { file.abandoned = true; this._save(); return; }
        file.last = contents; this._save();
        if (contents !== original) writeFile(path, contents);
    }
    _css(path, colors, modern) {
        if (!this._safe(path)) return;
        const original = readFile(path);
        const file = this._journal.files[path] ??= {kind: 'css', original, last: original};
        if (file.abandoned) return;
        // Keep user-modified managed colors as well as unrelated custom rules.
        if (original !== file.last && cssBlock(original ?? '') !== cssBlock(file.last ?? '')) {
            file.abandoned = true; this._save(); return;
        }
        if (original !== file.last) file.preserveEdits = true;
        const clean = removeCSS(original ?? '');
        const text = clean + (clean && !clean.endsWith('\n') ? '\n' : '') + BEGIN + '\n' +
            gtkColors(colors, modern) + END + '\n';
        file.last = text; this._save();
        if (text !== original) writeFile(path, text);
    }
    _attempt(label, operation) {
        try { operation(); this.coverage.push(label); }
        catch (error) { console.warn(`LightOS app colors: ${label}: ${error.message}`); }
    }
    _code(config, label, colors) {
        for (const product of ['Code', 'Code - Insiders', 'VSCodium', 'VSCodium - Insiders', 'Code - OSS']) {
            const user = GLib.build_filenamev([config, product, 'User']);
            if (!this._directory(user)) continue;
            const profiles = [user, ...this._directories(user + '/profiles')
                .filter(id => /^[a-zA-Z0-9_-]+$/.test(id)).map(id => `${user}/profiles/${id}`)];
            for (const profile of profiles) this._attempt(`${label}${product}`, () => {
                this._patch(profile + '/settings.json', 'json', [
                    ...Object.entries(editorColors(colors)).map(([key, value]) =>
                        ({keys: ['workbench.colorCustomizations', key], value})),
                ]);
            });
        }
    }
    _originalINI(path, keys) {
        const entry = this._journal.files[path]?.entries?.[JSON.stringify(keys)];
        return entry?.original ?? iniValue(readFile(path) ?? '', keys);
    }
    _baseKdeTheme(config, data, app, mode) {
        const chosen = this._originalINI(`${config}/${app}rc`, ['KTextEditor Renderer', 'Color Theme']);
        if (chosen.present && !chosen.value.startsWith('LightOS GNOME')) {
            for (const root of [data, ...GLib.get_system_data_dirs()]) {
                for (const path of this._files(`${root}/org.kde.syntax-highlighting/themes`, '.theme')) {
                    try {
                        const theme = JSON.parse(readFile(path));
                        if (theme.metadata?.name === chosen.value) return theme;
                    } catch { /* An unrelated broken user theme is never changed. */ }
                }
            }
        }
        const nativeMode = chosen.value === 'Breeze Light' ? 'light' :
            chosen.value === 'Breeze Dark' ? 'dark' : mode;
        return JSON.parse(readFile(this._assets.get_child(`breeze-${nativeMode}.theme`).get_path()));
    }
    _qt(config, data, colors, label, mode) {
        const schemeId = 'LightOSGNOME';
        this._attempt(`${label}KDE colors`, () => {
            this._whole(`${data}/color-schemes/${schemeId}.colors`, kdeScheme(colors));
            this._patch(config + '/kdeglobals', 'ini', [...kdeColors(colors),
                {keys: ['General', 'ColorScheme'], value: schemeId}]);
        });
        // On non-KDE desktops KColorSchemeManager's automatic choice is Breeze,
        // not kdeglobals. Its documented per-app color selector applies the
        // palette directly without changing the native Qt widget style.
        for (const app of ['kwrite', 'kate', 'dolphin', 'okular', 'gwenview', 'konsole', 'ark', 'kcalc', 'kdenlive', 'filelight']) {
            const path = `${config}/${app}rc`;
            if (readFile(path) === null) continue;
            this._attempt(`${label}${app} colors`, () => {
                const entries = [{keys: ['UiSettings', 'ColorScheme'], value: schemeId}];
                if (app === 'kwrite' || app === 'kate') {
                    const name = `LightOS GNOME ${app}`;
                    const base = this._baseKdeTheme(config, data, app, mode);
                    this._whole(`${data}/org.kde.syntax-highlighting/themes/lightos-gnome-${app}.theme`,
                        kdeEditorTheme(base, colors, name));
                    entries.push({keys: ['KTextEditor Renderer', 'Color Theme'], value: name},
                        {keys: ['KTextEditor Renderer', 'Auto Color Theme Selection'], value: 'false'});
                }
                this._patch(path, 'ini', entries);
            });
        }
        for (const major of [5, 6]) {
            const name = `qt${major}ct`; const path = `${config}/${name}/${name}.conf`;
            if (readFile(path) === null) continue;
            this._attempt(`${label}${name}`, () => {
                const scheme = `${config}/${name}/colors/lightos-gnome.conf`;
                this._whole(scheme, qtctColors(colors, major));
                this._patch(path, 'ini', [
                    {keys: ['Appearance', 'custom_palette'], value: 'true'},
                    {keys: ['Appearance', 'color_scheme_path'], value: config === this._config ? scheme :
                        `/var/config/${name}/colors/lightos-gnome.conf`},
                ]);
            });
        }
    }
    apply(palette, mode, options = {}) {
        const colors = palette.variants[mode];
        this.coverage = [];
        this._qt(this._config, this._data, colors, '', mode);
        this._code(this._config, '', colors);
        const privateRoot = this._privateRoot;
        for (const id of options.flatpak === false ? [] : this._directories(privateRoot)) {
            if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}$/.test(id)) continue;
            const config = `${privateRoot}/${id}/config`;
            if (!this._directory(config)) continue;
            // GTK honors $XDG_CONFIG_HOME in each Flatpak's private config.
            // No host directory grants or global Flatpak overrides are needed.
            for (const version of options.gtk3 === false ? ['4.0'] : ['3.0', '4.0']) this._attempt(`${id}: GTK ${version}`, () =>
                this._css(`${config}/gtk-${version}/gtk.css`, colors, version === '4.0'));
            if (readFile(`${config}/kdeglobals`) !== null ||
                ['org.kde.', 'org.videolan.', 'org.qbittorrent.'].some(prefix => id.startsWith(prefix)))
                this._qt(config, `${privateRoot}/${id}/data`, colors, `${id}: `, mode);
            this._code(config, `${id}: `, colors);
        }
    }
    restore() {
        const pending = {};
        for (const [path, file] of Object.entries(this._journal.files)) {
            try {
                if (file.abandoned) continue;
                if (!this._safe(path)) { pending[path] = file; continue; }
                const current = readFile(path);
                if (current === null) continue;
                if (current === file.last && !file.preserveEdits) {
                    if (file.original === null) Gio.File.new_for_path(path).delete(null);
                    else writeFile(path, file.original);
                    continue;
                }
                if (file.kind === 'css') {
                    if (cssBlock(current) !== cssBlock(file.last ?? '')) continue;
                    const text = removeCSS(current);
                    if (text !== current) writeFile(path, text);
                } else if (file.kind !== 'whole') {
                    const getter = file.kind === 'json' ? jsonValue : iniValue;
                    const editor = file.kind === 'json' ? editJSONC : editINI;
                    let text = current;
                    // Reverse insertion order restores nested leaves first.
                    for (const entry of Object.values(file.entries).reverse()) {
                        if (!entry.abandoned && equal(getter(text, entry.keys), entry.last))
                            text = editor(text, entry.keys, entry.original);
                    }
                    if (file.kind === 'json' &&
                        !jsonValue(file.original ?? '{}', ['workbench.colorCustomizations']).present) {
                        const custom = jsonValue(text, ['workbench.colorCustomizations']);
                        if (custom.present && custom.value && typeof custom.value === 'object' &&
                            Object.keys(custom.value).length === 0)
                            text = editJSONC(text, ['workbench.colorCustomizations'], {present: false});
                    }
                    if (text !== current) writeFile(path, text);
                }
            } catch (error) {
                // Keep the backup if a temporarily malformed/locked file cannot
                // be restored. Never erase recovery data merely to finish disable.
                pending[path] = file;
                console.warn(`LightOS restore: ${path}: ${error.message}`);
            }
        }
        this._journal = {files: pending};
        if (Object.keys(pending).length) this._save();
        else if (Gio.File.new_for_path(this._path).query_exists(null)) Gio.File.new_for_path(this._path).delete(null);
    }
}
