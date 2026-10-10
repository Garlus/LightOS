#!/usr/bin/env python3
"""Measure native Adwaita widget geometry in the GNOME VM."""
import json
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Gtk, Adw, GLib

app = Adw.Application(application_id='dev.lightos.GeometryProbe')


def activate(application):
    window = Adw.ApplicationWindow(application=application, title='Adwaita geometry probe')
    window.set_default_size(480, 320)
    toolbar = Adw.ToolbarView()
    header = Adw.HeaderBar()
    toolbar.add_top_bar(header)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12,
                  margin_start=24, margin_end=24, margin_top=24, margin_bottom=24)
    widgets = [Gtk.Button(label='Native button'), Gtk.Entry(text='Native entry'), Gtk.Switch(halign=Gtk.Align.START)]
    for widget in widgets:
        box.append(widget)
    toolbar.set_content(box)
    window.set_content(toolbar)
    window.present()

    def measure():
        result = {}
        for widget in [header, *widgets]:
            context = widget.get_style_context()
            padding, border = context.get_padding(), context.get_border()
            result[widget.__class__.__name__] = {
                'width': widget.get_width(), 'height': widget.get_height(),
                'padding': [padding.top, padding.right, padding.bottom, padding.left],
                'border': [border.top, border.right, border.bottom, border.left],
            }
        print(json.dumps(result), flush=True)
        application.quit()
        return GLib.SOURCE_REMOVE
    GLib.timeout_add(1000, measure)


app.connect('activate', activate)
app.run(None)
