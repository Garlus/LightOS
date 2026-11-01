import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {cleanState} from './searchModel.js';

export class SearchStore {
    constructor() {
        this._file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'search.json']));
        this.state = cleanState();
        try {
            if (this._file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size() <= 1048576) {
                const [, bytes] = this._file.load_contents(null);
                this.state = cleanState(JSON.parse(new TextDecoder().decode(bytes)));
            }
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) console.warn(`LightOS search state: ${error.message}`);
        }
    }

    save() {
        try {
            // UTF-8 can exceed the character budget. Trim learned data before writing
            // so a valid state can always be loaded under the same byte limit.
            let bytes = new TextEncoder().encode(JSON.stringify(this.state));
            if (bytes.length > 1048576) {
                const oldest = Object.values(this.state.items).sort((a, b) => a.last - b.last);
                for (const saved of oldest) {
                    saved.terms = [];
                    bytes = new TextEncoder().encode(JSON.stringify(this.state));
                    if (bytes.length <= 1048576) break;
                }
            }
            GLib.mkdir_with_parents(this._file.get_parent().get_path(), 0o700);
            this._file.replace_contents(bytes, null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (error) {
            console.warn(`LightOS search state: ${error.message}`);
        }
    }
}
