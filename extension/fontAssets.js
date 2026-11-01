import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Only expose the bundled fonts to the current user. Never replace existing
// fonts or a directory owned by another application.
export default class FontAssets {
    constructor(extensionDir) {
        this._source = extensionDir.get_child('fonts').get_path();
        this._parent = GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts']);
        this._link = Gio.File.new_for_path(GLib.build_filenamev([this._parent, 'lightos-geist']));
    }

    _target() {
        try {
            const info = this._link.query_info('standard::symlink-target',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            return info.has_attribute('standard::symlink-target') ? info.get_symlink_target() : null;
        } catch (error) {
            if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return undefined;
            throw error;
        }
    }

    _refresh(path) {
        const process = Gio.Subprocess.new(['fc-cache', path], Gio.SubprocessFlags.NONE);
        process.wait_check(null);
    }

    ensure() {
        const target = this._target();
        if (target !== undefined && target !== this._source)
            throw new Error('LightOS font directory is already owned by another application');
        GLib.mkdir_with_parents(this._parent, 0o755);
        if (target === undefined) this._link.make_symbolic_link(this._source, null);
        this._refresh(this._link.get_path());
    }

    destroy() {
        if (this._target() !== this._source) return;
        this._link.delete(null);
        this._refresh(this._parent);
    }
}
