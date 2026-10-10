// SPDX-License-Identifier: GPL-3.0-or-later
// LightOS solar scheduler. Solar equations and reference are documented in solar.js.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {solarDay, solarSchedule, parseZoneTable, timezonePoint, validCoordinates} from './solar.js';

export class SolarAppearance {
    constructor(settings, {clock = () => GLib.DateTime.new_now_local(), loadGeo = () => import('gi://Geoclue')} = {}) {
        this.settings = settings;
        this._clock = clock;
        this._loadGeo = loadGeo;
        this._signals = [];
        this._timer = 0;
        this._geoTimeout = 0;
        this._generation = 0;
        this._geo = null;
        this._location = null;
        this._override = null;
        this._active = false;
        this._zones = new Map();
        // zone.tab also contains country-specific reference cities and older aliases.
        for (const file of ['zone1970.tab', 'zone.tab']) {
            try {
                const [ok, bytes] = GLib.file_get_contents(`/usr/share/zoneinfo/${file}`);
                if (ok) for (const [id, point] of parseZoneTable(new TextDecoder().decode(bytes))) this._zones.set(id, point);
            } catch { /* Offset-only fallback also works without tzdata tables. */ }
        }
        try {
            this._locationSettings = new Gio.Settings({schema_id: 'org.gnome.system.location'});
            this._connect(this._locationSettings, 'changed::enabled', () => {
                if (!this._active) return;
                this._cancelGeo();
                this._tick();
                this._startGeo();
            });
        } catch { this._locationSettings = null; }
        this._connect(settings, 'changed::auto-appearance', () => this._configure());
        this._connect(settings, 'changed::appearance', () => this._manualChoice());
        this._configure();
    }

    _connect(object, name, handler) { this._signals.push([object, object.connect(name, handler)]); }

    _publish(info) {
        const value = JSON.stringify(info);
        if (this.settings.get_string('solar-status') !== value) this.settings.set_string('solar-status', value);
    }

    _configure() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this._cancelGeo();
        this._override = null;
        this._active = this.settings.get_boolean('auto-appearance');
        if (!this._active) { this._publish({enabled: false}); return; }
        this._tick();
        this._startGeo();
        this._arm();
    }

    refresh() {
        if (!this._active) return;
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this._tick();
        this._arm();
    }

    _arm() {
        if (!this._active) return;
        const now = this._clock().to_unix() * 1000;
        const delay = this._snapshot?.next === null ? 60 : Math.min(60, Math.max(1, Math.ceil((this._snapshot.next - now) / 1000)));
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timer = 0;
            if (!this._active) return GLib.SOURCE_REMOVE;
            this._tick();
            // Retry failed/unavailable fixes, never busy-loop or block the Shell.
            if (!this._geo && !this._geoPending && GLib.get_monotonic_time() - (this._geoAttempt ?? 0) > 15 * 60 * 1000000)
                this._startGeo();
            this._arm();
            return GLib.SOURCE_REMOVE;
        });
    }

    _manualChoice() {
        if (!this._active || this._writing) return;
        const mode = this.settings.get_string('appearance');
        if (mode === 'system') { this.settings.set_boolean('auto-appearance', false); return; }
        if (['light', 'dark'].includes(mode)) {
            this._override = mode === this._snapshot?.mode ? null : mode;
            this._tick();
        }
    }

    _point(now) {
        if (this._location) return {...this._location, source: 'Systemstandort · GeoClue (z. B. GPS)'};
        const zone = now.get_timezone();
        const id = zone.get_identifier();
        // Use the standard offset for an unknown zone, not its summer-time offset.
        const january = GLib.DateTime.new(zone, now.get_year(), 1, 15, 12, 0, 0);
        const july = GLib.DateTime.new(zone, now.get_year(), 7, 15, 12, 0, 0);
        const offset = Math.min(january.get_utc_offset(), july.get_utc_offset()) / 1000000;
        const point = timezonePoint(id, this._zones, offset);
        const reason = !this._locationSettings?.get_boolean('enabled') ? 'Standortdienste aus' : 'Standort nicht verfügbar';
        return {...point, source: `${point.offsetOnly ? 'Grobe Schätzung aus UTC-Versatz' : 'Grobe Zeitzonenschätzung'} · ${id} · ${reason}`};
    }

    _tick() {
        if (!this._active) return;
        const now = this._clock();
        const point = this._point(now);
        const noon = GLib.DateTime.new(now.get_timezone(), now.get_year(), now.get_month(), now.get_day_of_month(), 12, 0, 0);
        const days = [-1, 0, 1, 2].map(offset => solarDay(noon.add_days(offset).to_unix() * 1000, point.latitude, point.longitude));
        const today = days[1];
        const schedule = solarSchedule(now.to_unix() * 1000, today, [days[0], days[2], days[3]]);
        this._snapshot = schedule;
        if (this._override === schedule.mode) this._override = null;
        const desired = this._override ?? schedule.mode;
        if (this.settings.get_string('appearance') !== desired) {
            this._writing = true;
            try { this.settings.set_string('appearance', desired); }
            finally { this._writing = false; }
        }
        const format = (timestamp, next = false) => {
            if (timestamp === null) return '—';
            const local = GLib.DateTime.new_from_unix_utc(Math.round(timestamp / 1000)).to_timezone(now.get_timezone());
            return local.format(next || local.format('%F') !== now.format('%F') ? '%d.%m. %H:%M' : '%H:%M');
        };
        this._publish({enabled: true, source: point.source, date: now.format('%d.%m.%Y'),
            sunrise: format(today.sunrise), sunset: format(today.sunset),
            polar: today.polar, mode: desired, next: format(schedule.next, true), manual: !!this._override});
    }

    async _startGeo() {
        if (!this._active || !this._locationSettings?.get_boolean('enabled') || this._geo || this._geoPending) return;
        const generation = this._generation;
        this._geoPending = true;
        this._geoAttempt = GLib.get_monotonic_time();
        this._cancellable = new Gio.Cancellable();
        const cancellable = this._cancellable;
        // A missing GPS fix must not delay the timezone-based schedule indefinitely.
        this._geoTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
            this._geoTimeout = 0;
            if (generation === this._generation) { this._cancelGeo(); this._tick(); }
            return GLib.SOURCE_REMOVE;
        });
        try {
            const {default: Geo} = await this._loadGeo();
            if (generation !== this._generation || !this._active) return;
            Geo.Simple.new('org.gnome.Shell', Geo.AccuracyLevel.EXACT, cancellable, (_source, result) => {
                let simple = null;
                try {
                    simple = Geo.Simple.new_finish(result);
                    if (generation !== this._generation || !this._active) { this._stopClient(simple); return; }
                    if (this._geoTimeout) GLib.source_remove(this._geoTimeout);
                    this._geoTimeout = 0;
                    this._geoPending = false;
                    this._geo = simple;
                    this._geoSignal = simple.connect('notify::location', () => this._acceptLocation(simple.get_location()));
                    this._acceptLocation(simple.get_location());
                } catch {
                    if (generation === this._generation) { this._cancelGeo(); this._tick(); }
                    if (simple && simple !== this._geo) this._stopClient(simple);
                }
            });
        } catch {
            if (generation === this._generation) { this._cancelGeo(); this._tick(); }
        }
    }

    _acceptLocation(location) {
        if (!this._active) return;
        this._location = location && validCoordinates(location.latitude, location.longitude) && location.accuracy >= 0 ?
            {latitude: location.latitude, longitude: location.longitude} : null;
        this._tick();
    }

    _stopClient(simple) {
        try {
            const client = simple?.get_client();
            client?.call_stop(null, (object, result) => { try { object.call_stop_finish(result); } catch {} });
        } catch { /* Service may already have disappeared. */ }
    }

    _cancelGeo() {
        this._generation++;
        this._cancellable?.cancel();
        this._cancellable = null;
        if (this._geoTimeout) GLib.source_remove(this._geoTimeout);
        this._geoTimeout = 0;
        if (this._geoSignal) this._geo.disconnect(this._geoSignal);
        this._geoSignal = 0;
        this._stopClient(this._geo);
        this._geo = null;
        this._location = null;
        this._geoPending = false;
    }

    destroy() {
        this._active = false;
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this._cancelGeo();
        for (const [object, signal] of this._signals) object.disconnect(signal);
        this._signals = [];
    }
}
