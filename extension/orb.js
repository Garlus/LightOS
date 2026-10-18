import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Cairo from 'cairo';
import {OrbMotion, orbOutline} from './orbMotion.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

// No keyboard interception or clipboard reads: observe native desktop signals.
export class DesktopOrb {
    constructor(button) {
        this._button = button;
        this._signals = [];
        this._streamSignals = [];
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._motionState = new OrbMotion();
        this.actor = new St.DrawingArea({width: 24, height: 24,
            y_align: Clutter.ActorAlign.CENTER});
        button.add_child(this.actor);
        this._connect(this.actor, 'repaint', () => this._paint());
        this._connect(button, 'notify::hover', () => {
            if (button.hover) this.react('hover');
        });
        this._connect(button.menu, 'open-state-changed', (_menu, open) => {
            this.react('menu');
            if (open && this._motion) this._motionState.react('wink');
        });
        this._connect(global.display, 'notify::focus-window', () => this.react('focus'));
        this._connect(global.workspace_manager, 'active-workspace-changed', () => this.react('workspace'));
        this._connect(Main.overview, 'showing', () => this.react('overview'));
        this._connect(Main.overview, 'hiding', () => this.react('overview'));
        this._connect(global.display.get_selection(), 'owner-changed', (_selection, type, owner) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD && owner) this.react('copy');
        });
        this._control = Volume.getMixerControl();
        this._connect(this._control, 'default-sink-changed', () => this._bindStream());
        this._connect(this._control, 'state-changed', () => this._bindStream());
        this._bindStream();
        this._timeline = new Clutter.Timeline({actor: this.actor, duration: 1000, repeat_count: -1});
        this._connect(this._timeline, 'new-frame', () => {
            const now = GLib.get_monotonic_time();
            this._motionState.advance((now - this._lastFrame) / 1000000);
            this._lastFrame = now;
            this.actor.queue_repaint();
        });
        this._connect(this._settings, 'changed::enable-animations', () => this._syncMotion());
        this._syncMotion();
        this._connect(this.actor, 'destroy', () => this.destroy(false));
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _bindStream() {
        for (const [object, signal] of this._streamSignals) object.disconnect(signal);
        this._streamSignals = [];
        this._stream = this._control.get_default_sink();
        if (!this._stream) return;
        this._volume = this._stream.volume;
        this._streamSignals.push([this._stream, this._stream.connect('notify::volume', () => {
            const volume = this._stream.volume;
            if (volume !== this._volume)
                this.react(volume > this._volume ? 'louder' : 'quieter');
            this._volume = volume;
        })]);
        this._streamSignals.push([this._stream, this._stream.connect('notify::is-muted', () =>
            this.react(this._stream.is_muted ? 'mute' : 'unmute'))]);
    }

    _syncMotion() {
        this._motion = this._settings.get_boolean('enable-animations');
        this._lastFrame = GLib.get_monotonic_time();
        if (this._motion) this._timeline.start();
        else this._timeline.stop();
        this.actor.queue_repaint();
    }

    react(kind) {
        this._event = kind;
        if (this._motion) this._motionState.react(kind);
        this.actor.queue_repaint();
    }

    _paint() {
        const cr = this.actor.get_context();
        const [w, h] = this.actor.get_surface_size();
        const color = this.actor.get_theme_node().get_foreground_color();
        cr.scale(w / 24, h / 24);
        const particles = this._motion ? this._motionState.particles() : new OrbMotion().particles();
        const rgb = [color.red / 255, color.green / 255, color.blue / 255];
        for (const particle of particles) {
            const {x, y, radius, depth, wink, scaleX, scaleY, angle} = particle;
            cr.save();
            cr.translate(x, y);
            cr.rotate(angle);
            cr.scale(scaleX, scaleY * (1 - .88 * wink));
            // Pearl-like cores and a restrained rim keep the tiny spheres legible.
            const alpha = color.alpha / 255 * (.8 + .2 * (depth + 1) / 2);
            const gradient = new Cairo.RadialGradient(-radius * .35, -radius * .4,
                radius * .1, 0, 0, radius);
            gradient.addColorStopRGBA(0, ...rgb, alpha);
            gradient.addColorStopRGBA(.42, ...rgb, alpha * .88);
            gradient.addColorStopRGBA(.8, ...rgb, alpha * .38);
            gradient.addColorStopRGBA(1, ...rgb, alpha * .7);
            cr.setSource(gradient);
            const points = orbOutline(particle);
            cr.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length; i++) {
                const prev = points[(i + points.length - 1) % points.length];
                const current = points[i], next = points[(i + 1) % points.length];
                const after = points[(i + 2) % points.length];
                cr.curveTo(current.x + (next.x - prev.x) / 6,
                    current.y + (next.y - prev.y) / 6,
                    next.x - (after.x - current.x) / 6,
                    next.y - (after.y - current.y) / 6, next.x, next.y);
            }
            cr.closePath();
            cr.fillPreserve();
            cr.setSourceRGBA(...rgb, alpha * .6);
            cr.setLineWidth(.4);
            cr.stroke();
            cr.restore();
        }
        cr.$dispose();
    }

    destroy(destroyActor = true) {
        if (this._destroyed) return;
        this._destroyed = true;
        this._timeline.stop();
        for (const [object, signal] of [...this._signals, ...this._streamSignals]) object.disconnect(signal);
        this._signals = this._streamSignals = [];
        if (destroyActor) this.actor.destroy();
        this._stream = this._control = this._button = this._settings = null;
    }
}
