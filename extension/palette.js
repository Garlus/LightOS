import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const PALETTES = ['ocean', 'grove', 'ember', 'iris', 't3-chat', 't3-code'];
export const LABELS = ['Ocean · Blau / Türkis', 'Grove · Grün', 'Ember · Orange',
    'Iris · Violett', 'T3 Chat · Rosa', 'T3 Code · Neutral / Blau'];

export function readPalette(dir, id) {
    const safeId = PALETTES.includes(id) ? id : 'ocean';
    const [, contents] = dir.get_child(`palettes/${safeId}.json`).load_contents(null);
    return JSON.parse(new TextDecoder().decode(contents));
}

// These are color tokens only: no selectors changing Adwaita geometry.
export function gtkColors(c, modern = true) {
    const colors = {
        accent_color: c.accent, accent_bg_color: c.accent, accent_fg_color: c.accentForeground,
        window_bg_color: c.canvas, window_fg_color: c.text,
        view_bg_color: c.surface, view_fg_color: c.text,
        headerbar_bg_color: c.toolbar, headerbar_fg_color: c.toolbarForeground,
        headerbar_backdrop_color: c.toolbar, headerbar_border_color: c.toolbarBorder,
        sidebar_bg_color: c.sidebar,
        sidebar_fg_color: c.sidebarForeground, sidebar_backdrop_color: c.sidebar,
        sidebar_border_color: c.sidebarBorder, secondary_sidebar_bg_color: c.surfaceRaised,
        secondary_sidebar_fg_color: c.text, secondary_sidebar_backdrop_color: c.surfaceRaised,
        card_bg_color: c.surfaceRaised, card_fg_color: c.text,
        dialog_bg_color: c.surfaceOverlay, dialog_fg_color: c.text,
        popover_bg_color: c.surfaceOverlay, popover_fg_color: c.text,
        destructive_color: c.errorForeground, destructive_bg_color: c.error,
        destructive_fg_color: c.accentForeground,
        warning_color: c.warningForeground, warning_bg_color: c.warning,
        warning_fg_color: c.text, success_color: c.messageAction,
        success_bg_color: c.messageAction, success_fg_color: c.messageActionForeground,
        theme_bg_color: c.canvas, theme_fg_color: c.text,
        theme_base_color: c.surface, theme_text_color: c.text,
        theme_selected_bg_color: c.accent, theme_selected_fg_color: c.accentForeground,
        insensitive_bg_color: c.surfaceRaised, insensitive_fg_color: c.textMuted,
        insensitive_base_color: c.surfaceRaised, borders: c.border,
        unfocused_theme_bg_color: c.canvas, unfocused_theme_fg_color: c.text,
        unfocused_theme_base_color: c.surface, unfocused_theme_text_color: c.text,
        unfocused_theme_selected_bg_color: c.accent,
        unfocused_theme_selected_fg_color: c.accentForeground,
        unfocused_insensitive_color: c.textMuted, unfocused_borders: c.border,
    };
    let css = '/* LightOS: T3 Code colors, stock Adwaita dimensions. */\n';
    css += Object.entries(colors).map(([key, color]) => `@define-color ${key} ${color};`).join('\n');
    if (modern) {
        const variables = Object.entries(colors).filter(([key]) => !key.startsWith('theme_') &&
            !key.startsWith('unfocused_') && !key.startsWith('insensitive_') && key !== 'borders');
        css += '\n:root {\n' + variables.map(([key, color]) =>
            `  --${key.replace(/_/g, '-')}: ${color};`).join('\n') + '\n}\n';
    } else {
        // GTK 3 compiles some Adwaita surface colors into literal values.
        // Override their colors, keeping every native size, inset and radius.
        css += `\nwindow.background { background-color: ${c.canvas}; color: ${c.text}; }
headerbar { background-color: ${c.toolbar}; color: ${c.toolbarForeground};
  background-image: linear-gradient(to bottom, ${c.toolbar}, ${c.toolbar}); }
`;
    }
    return css + '\n';
}

export function writeFile(path, text) {
    const file = Gio.File.new_for_path(path);
    GLib.mkdir_with_parents(file.get_parent().get_path(), 0o700);
    file.replace_contents(new TextEncoder().encode(text), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

export function readFile(path) {
    try {
        const [, contents] = Gio.File.new_for_path(path).load_contents(null);
        return new TextDecoder().decode(contents);
    } catch (error) {
        if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return null;
        throw error;
    }
}

const BEGIN = '/* BEGIN LightOS GNOME colors */';
const END = '/* END LightOS GNOME colors */';
function withoutBlock(css) {
    const start = css.indexOf(BEGIN);
    const end = css.indexOf(END, start);
    if (start < 0 || end < 0) return css;
    return css.slice(0, start) + css.slice(end + END.length).replace(/^\n/, '');
}

export class AppColors {
    constructor() {
        this._state = GLib.build_filenamev([GLib.get_user_state_dir(), 'lightos-gnome']);
        this._manifest = `${this._state}/colors-backup.json`;
    }

    apply(colors) {
        this.applyCss({'3.0': gtkColors(colors, false), '4.0': gtkColors(colors, true)});
    }

    applyCss(styles) {
        const saved = readFile(this._manifest);
        const backup = saved ? JSON.parse(saved) : {};
        for (const version of ['3.0', '4.0']) {
            const path = GLib.build_filenamev([GLib.get_user_config_dir(), `gtk-${version}`, 'gtk.css']);
            const existing = readFile(path);
            if (!(path in backup)) backup[path] = existing;
        }
        // Journal is written before modifications, also surviving a Shell crash.
        writeFile(this._manifest, JSON.stringify(backup));
        for (const path of Object.keys(backup)) {
            const css = withoutBlock(readFile(path) ?? '');
            const version = path.includes('gtk-4.0') ? '4.0' : '3.0';
            if (!(version in styles)) {
                if (readFile(path)?.includes(BEGIN)) {
                    if (backup[path] === null && css === '') Gio.File.new_for_path(path).delete(null);
                    else writeFile(path, css === `${backup[path]}\n` ? backup[path] : css);
                }
                continue;
            }
            writeFile(path, `${css}${css && !css.endsWith('\n') ? '\n' : ''}${BEGIN}\n` +
                styles[version] + `${END}\n`);
        }
    }

    restore() {
        const saved = readFile(this._manifest);
        if (!saved) return;
        const backup = JSON.parse(saved);
        for (const [path, original] of Object.entries(backup)) {
            const current = readFile(path);
            if (current === null || !current.includes(BEGIN)) continue;
            const cleaned = withoutBlock(current);
            if (original === null && cleaned === '') Gio.File.new_for_path(path).delete(null);
            else writeFile(path, cleaned === (original ?? '') || cleaned === `${original}\n` ? (original ?? '') : cleaned);
        }
        Gio.File.new_for_path(this._manifest).delete(null);
    }
}
