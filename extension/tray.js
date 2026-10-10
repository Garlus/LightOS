import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const WATCHER = 'org.kde.StatusNotifierWatcher';
const WATCHER_XML = `<node><interface name="${WATCHER}">
  <method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
  <method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
  <property name="RegisteredStatusNotifierItems" type="as" access="read"/>
  <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
  <property name="ProtocolVersion" type="i" access="read"/>
  <signal name="StatusNotifierItemRegistered"><arg type="s"/></signal>
  <signal name="StatusNotifierItemUnregistered"><arg type="s"/></signal>
  <signal name="StatusNotifierHostRegistered"/>
</interface></node>`;

export class NativeTray {
    constructor() {
        this._items = new Map();
        this._registered = new Set();
        this._watches = new Map();
        this._owner = Gio.bus_own_name(Gio.BusType.SESSION, WATCHER, Gio.BusNameOwnerFlags.NONE,
            null, connection => {
                if (this._destroyed) return;
                this._connection = connection;
                const implementation = {
                    get RegisteredStatusNotifierItems() { return [...this.owner._registered]; },
                    get IsStatusNotifierHostRegistered() { return true; },
                    get ProtocolVersion() { return 0; },
                    owner: this,
                    RegisterStatusNotifierItemAsync: ([service], invocation) => {
                        const id = service.startsWith('/') ? `${invocation.get_sender()}${service}` :
                            `${service}/StatusNotifierItem`;
                        this._register(id);
                        invocation.return_value(null);
                    },
                    RegisterStatusNotifierHost: () => {},
                };
                this._export = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, implementation);
                this._export.export(connection, '/StatusNotifierWatcher');
                this._export.emit_signal('StatusNotifierHostRegistered', null);
            }, () => {});
        // Cooperate with an existing watcher rather than taking its bus name.
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, WATCHER, Gio.BusNameWatcherFlags.NONE,
            (connection, _name, owner) => {
                if (owner === connection.get_unique_name() || this._destroyed) return;
                this._foreign = new Gio.DBusProxy({g_connection: connection, g_name: WATCHER,
                    g_object_path: '/StatusNotifierWatcher', g_interface_name: WATCHER});
                this._foreign.init_async(GLib.PRIORITY_DEFAULT, null, (proxy, result) => {
                    if (this._destroyed) return;
                    try {
                        proxy.init_finish(result);
                        (proxy.get_cached_property('RegisteredStatusNotifierItems')?.deep_unpack() ?? [])
                            .forEach(id => this._add(id));
                        this._foreignSignal = proxy.connect('g-signal', (_p, _sender, signal, params) => {
                            const [id] = params.deep_unpack();
                            if (signal === 'StatusNotifierItemRegistered') this._add(id);
                            else if (signal === 'StatusNotifierItemUnregistered') this._remove(id);
                        });
                    } catch (error) { console.debug(`LightOS tray: ${error.message}`); }
                });
            }, () => {
                if (this._foreignSignal) this._foreign.disconnect(this._foreignSignal);
                this._foreign = null;
                this._foreignSignal = 0;
            });
    }

    _register(id) {
        if (this._registered.has(id)) return;
        this._registered.add(id);
        this._export.emit_property_changed('RegisteredStatusNotifierItems', new GLib.Variant('as', [...this._registered]));
        this._export.emit_signal('StatusNotifierItemRegistered', new GLib.Variant('(s)', [id]));
        this._add(id);
        const name = id.slice(0, id.indexOf('/'));
        this._watches.set(id, Gio.bus_watch_name(Gio.BusType.SESSION, name, Gio.BusNameWatcherFlags.NONE,
            () => {}, () => {
                this._registered.delete(id);
                this._remove(id);
                if (!this._destroyed) {
                    this._export.emit_property_changed('RegisteredStatusNotifierItems', new GLib.Variant('as', [...this._registered]));
                    this._export.emit_signal('StatusNotifierItemUnregistered', new GLib.Variant('(s)', [id]));
                }
                Gio.bus_unwatch_name(this._watches.get(id));
                this._watches.delete(id);
            }));
    }

    async _add(id) {
        if (this._items.has(id) || this._destroyed) return;
        const split = id.indexOf('/');
        if (split < 1) return;
        const name = id.slice(0, split);
        const path = id.slice(split);
        const cancellable = new Gio.Cancellable();
        const item = {cancellable};
        this._items.set(id, item);
        try {
            const proxy = await new Promise((resolve, reject) => Gio.DBusProxy.new_for_bus(
                Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null, name, path,
                'org.kde.StatusNotifierItem', cancellable,
                (_source, result) => { try { resolve(Gio.DBusProxy.new_for_bus_finish(result)); } catch (e) { reject(e); } }));
            if (this._destroyed || cancellable.is_cancelled()) return;
            item.proxy = proxy;
            item.button = new PanelMenu.Button(0, 'Tray-Anwendung');
            item.button.menu.addMenuItem(new PopupMenu.PopupMenuItem('Laden …', {reactive: false}));
            item.icon = new St.Icon({style_class: 'system-status-icon'});
            item.button.add_child(item.icon);
            Main.panel.addToStatusArea(`lightos-tray-${id}`, item.button, 2, 'right');
            const update = () => {
                const iconName = proxy.get_cached_property('IconName')?.deep_unpack();
                item.icon.icon_name = iconName || 'application-x-executable-symbolic';
                item.button.accessible_name = proxy.get_cached_property('Title')?.deep_unpack() || name;
                item.button.visible = proxy.get_cached_property('Status')?.deep_unpack() !== 'Passive';
            };
            item.properties = proxy.connect('g-properties-changed', update);
            item.signal = proxy.connect('g-signal', () => {
                Gio.DBus.session.call(name, path, 'org.freedesktop.DBus.Properties', 'GetAll',
                    new GLib.Variant('(s)', ['org.kde.StatusNotifierItem']), new GLib.VariantType('(a{sv})'),
                    Gio.DBusCallFlags.NONE, 2000, cancellable, (connection, result) => {
                        try {
                            const [properties] = connection.call_finish(result).deep_unpack();
                            for (const [key, value] of Object.entries(properties)) proxy.set_cached_property(key, value);
                            if (!this._destroyed && !cancellable.is_cancelled()) update();
                        } catch { /* The app may have exited. */ }
                    });
            });
            item.button.connect('button-press-event', (_button, event) => {
                if (event.get_button() !== 1 || proxy.get_cached_property('ItemIsMenu')?.deep_unpack())
                    return Clutter.EVENT_PROPAGATE;
                const [x, y] = event.get_coords();
                proxy.call('Activate', new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]),
                    Gio.DBusCallFlags.NONE, 2000, cancellable, (_proxy, result) => {
                        try { proxy.call_finish(result); } catch { /* Menu-only apps need no Activate. */ }
                    });
                return Clutter.EVENT_STOP;
            });
            item.button.menu.connect('open-state-changed', (_menu, open) => {
                if (open) this._loadMenu(item, name, cancellable);
            });
            update();
        } catch (error) {
            if (!cancellable.is_cancelled()) console.debug(`LightOS tray: ${error.message}`);
            this._remove(id);
        }
    }

    _loadMenu(item, name, cancellable) {
        const path = item.proxy.get_cached_property('Menu')?.deep_unpack();
        if (!path || path === '/') return;
        Gio.DBus.session.call(name, path, 'com.canonical.dbusmenu', 'GetLayout',
            new GLib.Variant('(iias)', [0, 2, []]), null, Gio.DBusCallFlags.NONE, 2000, cancellable,
            (connection, result) => {
                try {
                    const [, layout] = connection.call_finish(result).deep_unpack();
                    if (this._destroyed || cancellable.is_cancelled()) return;
                    item.button.menu.removeAll();
                    const append = (node, menu) => {
                        const [id, properties, children] = node instanceof GLib.Variant ? node.deep_unpack() : node;
                        const property = (key, fallback) => properties[key]?.deep_unpack() ?? fallback;
                        if (!property('visible', true)) return;
                        let row;
                        if (property('type', '') === 'separator') row = new PopupMenu.PopupSeparatorMenuItem();
                        else if (children.length) {
                            row = new PopupMenu.PopupSubMenuMenuItem(property('label', '').replace(/_/g, ''));
                            children.forEach(child => append(child, row.menu));
                        } else {
                            row = new PopupMenu.PopupMenuItem(property('label', '').replace(/_/g, ''));
                            row.setSensitive(property('enabled', true));
                            if (property('toggle-state', 0) === 1) row.setOrnament(PopupMenu.Ornament.CHECK);
                            row.connect('activate', () => Gio.DBus.session.call(name, path,
                                'com.canonical.dbusmenu', 'Event', new GLib.Variant('(isvu)',
                                    [id, 'clicked', new GLib.Variant('i', 0), global.get_current_time()]),
                                null, Gio.DBusCallFlags.NONE, 2000, cancellable, null));
                        }
                        menu.addMenuItem(row);
                    };
                    layout[2].forEach(child => append(child, item.button.menu));
                } catch (error) { if (!cancellable.is_cancelled()) console.debug(`LightOS tray menu: ${error.message}`); }
            });
    }

    _remove(id) {
        const item = this._items.get(id);
        if (!item) return;
        item.cancellable.cancel();
        if (item.properties) item.proxy.disconnect(item.properties);
        if (item.signal) item.proxy.disconnect(item.signal);
        item.button?.destroy();
        this._items.delete(id);
    }

    destroy() {
        this._destroyed = true;
        Gio.bus_unwatch_name(this._watch);
        if (this._foreignSignal) this._foreign.disconnect(this._foreignSignal);
        this._watches.forEach(watch => Gio.bus_unwatch_name(watch));
        [...this._items.keys()].forEach(id => this._remove(id));
        this._export?.unexport();
        Gio.bus_unown_name(this._owner);
    }
}
