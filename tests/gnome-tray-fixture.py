#!/usr/bin/env python3
"""A deterministic StatusNotifier/DBusMenu test app, run only in the VM."""
from gi.repository import Gio, GLib

ITEM_XML = '''<node><interface name="org.kde.StatusNotifierItem">
<property name="Title" type="s" access="read"/><property name="Status" type="s" access="read"/>
<property name="IconName" type="s" access="read"/><property name="Menu" type="o" access="read"/>
<property name="ItemIsMenu" type="b" access="read"/>
<method name="Activate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
</interface></node>'''
MENU_XML = '''<node><interface name="com.canonical.dbusmenu">
<method name="GetLayout"><arg type="i" direction="in"/><arg type="i" direction="in"/>
<arg type="as" direction="in"/><arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/></method>
<method name="Event"><arg type="i" direction="in"/><arg type="s" direction="in"/>
<arg type="v" direction="in"/><arg type="u" direction="in"/></method>
</interface></node>'''
loop = GLib.MainLoop()


def menu_method(connection, sender, path, interface, method, parameters, invocation):
    if method == 'GetLayout':
        rows = [GLib.Variant('(ia{sv}av)', [index, {'label': GLib.Variant('s', label),
                 'enabled': GLib.Variant('b', True), 'visible': GLib.Variant('b', True)}, []])
                for index, label in [(1, 'Native GNOME-Menüs'), (2, 'Test erfolgreich'), (3, 'Test beenden')]]
        invocation.return_value(GLib.Variant('(u(ia{sv}av))', [1, [0, {}, rows]]))
    else:
        print('Activated:', parameters.unpack()[0], flush=True)
        invocation.return_value(None)
        if parameters.unpack()[0] == 3:
            loop.quit()


def acquired(connection, name):
    props = {'Title': GLib.Variant('s', 'LightOS Tray-Test'), 'Status': GLib.Variant('s', 'Active'),
             'IconName': GLib.Variant('s', 'document-send-symbolic'), 'Menu': GLib.Variant('o', '/Menu'),
             'ItemIsMenu': GLib.Variant('b', True)}
    connection.register_object('/StatusNotifierItem', Gio.DBusNodeInfo.new_for_xml(ITEM_XML).interfaces[0],
                               lambda c, s, p, i, m, a, v: v.return_value(None),
                               lambda c, s, p, i, prop: props[prop], None)
    connection.register_object('/Menu', Gio.DBusNodeInfo.new_for_xml(MENU_XML).interfaces[0], menu_method, None, None)
    connection.call('org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher', 'org.kde.StatusNotifierWatcher',
                    'RegisterStatusNotifierItem', GLib.Variant('(s)', [name]), None,
                    Gio.DBusCallFlags.NONE, 2000, None, None, None)


owner = Gio.bus_own_name(Gio.BusType.SESSION, 'org.lightos.TrayTest', Gio.BusNameOwnerFlags.NONE,
                         None, acquired, None)
loop.run()
Gio.bus_unown_name(owner)
