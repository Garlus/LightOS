import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {solarDay, solarSchedule, validCoordinates, parseCoordinates, parseZoneTable, timezonePoint} from '../extension/solar/solar.js';
import {SolarAppearance} from '../extension/solar/runtime.js';
let checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
function close(actual, expected, tolerance, message) { assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`); }
const zone = GLib.TimeZone.new_identifier('Europe/Berlin');
const local = (year, month, day, hour = 12, minute = 0) => GLib.DateTime.new(zone, year, month, day, hour, minute, 0);
const epoch = date => date.to_unix() * 1000;
const noon = local(2026, 6, 21);
const berlin = solarDay(epoch(noon), 52.5, 13.3667);
// Summer solstice in Berlin: about 04:43 / 21:33 CEST (standard apparent horizon).
close(berlin.sunrise, epoch(local(2026, 6, 21, 4, 43)), 3 * 60000, 'Berlin summer sunrise');
close(berlin.sunset, epoch(local(2026, 6, 21, 21, 33)), 3 * 60000, 'Berlin summer sunset');
assert(solarSchedule(berlin.sunrise - 1, berlin).mode === 'dark', 'Dark before sunrise');
assert(solarSchedule(berlin.sunrise, berlin).mode === 'light', 'Light exactly at sunrise');
assert(solarSchedule(berlin.sunset - 1, berlin).mode === 'light', 'Light before sunset');
assert(solarSchedule(berlin.sunset, berlin).mode === 'dark', 'Dark exactly at sunset');
const tomorrow = solarDay(epoch(noon.add_days(1)), 52.5, 13.3667);
assert(solarSchedule(berlin.sunset, berlin, [tomorrow]).next === tomorrow.sunrise, 'Next sunrise belongs to tomorrow');
const winter = solarDay(epoch(local(2026, 12, 21)), 52.5, 13.3667);
close(winter.sunrise, epoch(local(2026, 12, 21, 8, 15)), 3 * 60000, 'Berlin winter sunrise');
close(winter.sunset, epoch(local(2026, 12, 21, 15, 54)), 3 * 60000, 'Berlin winter sunset');
const polarDay = solarDay(epoch(noon), 69.65, 18.96);
const polarNight = solarDay(epoch(local(2026, 12, 21)), 69.65, 18.96);
assert(polarDay.polar === 'day' && polarDay.sunrise === null, 'Polar summer has no invented sunrise');
assert(polarNight.polar === 'night' && polarNight.sunset === null, 'Polar winter has no invented sunset');
assert(solarSchedule(epoch(noon), polarDay).mode === 'light', 'Polar day stays light');
assert(solarSchedule(epoch(local(2026, 12, 21)), polarNight).mode === 'dark', 'Polar night stays dark');
for (const latitude of [-90, 90]) assert(solarDay(epoch(noon), latitude, 0).polar === 'day' || solarDay(epoch(noon), latitude, 0).polar === 'night', 'Geographic poles are finite');
for (const point of [[91,0],[0,181],[NaN,0],[0,Infinity],[null,0]]) {
 assert(!validCoordinates(...point), 'Reject invalid coordinates');
 let failed = false; try { solarDay(epoch(noon), ...point); } catch { failed = true; }
 assert(failed, 'Invalid solar input rejects');
}
assert(validCoordinates(0,0), 'Equator / Greenwich is a genuine valid location');
close(parseCoordinates('+5230+01322').latitude, 52.5, 1e-8, 'IANA minutes latitude');
close(parseCoordinates('-335213+1511242').longitude, 151.211667, 1e-6, 'IANA seconds longitude');
assert(parseCoordinates('bad') === null && parseCoordinates('+5260+01322') === null, 'Malformed coordinates reject');
const zones = parseZoneTable('# comment\nDE\t+5230+01322\tEurope/Berlin\nAU\t-3352+15113\tAustralia/Sydney\n');
assert(zones.size === 2, 'Read actual IANA table format');
assert(timezonePoint('Europe/Berlin', zones, 3600).latitude === 52.5, 'Named timezone uses representative latitude');
assert(timezonePoint('Etc/GMT-2', zones, 7200).latitude === 0 && timezonePoint('Etc/GMT-2', zones, 7200).longitude === 30, 'Unknown latitude: explicit coarse offset fallback');
assert(timezonePoint('Unknown/+14', zones, 14 * 3600).longitude === -150, 'UTC+14 wraps longitude across the date line');
assert(timezonePoint('Unknown/-12', zones, -12 * 3600).longitude === -180, 'UTC-12 preserves western date line');
const march28 = solarDay(epoch(local(2026, 3, 28)), 52.5, 13.3667);
const march29 = solarDay(epoch(local(2026, 3, 29)), 52.5, 13.3667);
const hour = t => { const d = GLib.DateTime.new_from_unix_utc(Math.round(t / 1000)).to_timezone(zone); return d.get_hour() + d.get_minute() / 60; };
close(hour(march29.sunrise) - hour(march28.sunrise), 1, .1, 'DST changes displayed civil time by an hour, not solar instant');
for (const [id, lat, lon] of [['Pacific/Kiritimati', 1.87, -157.4], ['Pacific/Pago_Pago', -14.27, -170.7], ['Asia/Tokyo',35.68,139.69],['America/Los_Angeles',34.05,-118.24]]) {
 const tz = GLib.TimeZone.new_identifier(id);
 const day = GLib.DateTime.new(tz, 2026, 6, 21, 12, 0, 0);
 const sun = solarDay(epoch(day), lat, lon);
 assert(solarSchedule(epoch(day), sun).mode === 'light', `${id}: correct date-line daytime`);
 assert(GLib.DateTime.new_from_unix_utc(Math.round(sun.sunrise / 1000)).to_timezone(tz).format('%F') === '2026-06-21', `${id}: sunrise on requested local date`);
}
// Memory-backend integration: real GSettings, scheduler lifetime, timezone and GeoClue callbacks.
const schemaDir = GLib.dir_make_tmp('lightos-solar-schema-XXXXXX');
Gio.File.new_for_path(GLib.get_current_dir() + '/extension/schemas/org.gnome.shell.extensions.lightos.gschema.xml')
 .copy(Gio.File.new_for_path(schemaDir + '/org.gnome.shell.extensions.lightos.gschema.xml'), Gio.FileCopyFlags.NONE, null, null);
GLib.spawn_command_line_sync('glib-compile-schemas ' + schemaDir);
const schema = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false).lookup('org.gnome.shell.extensions.lightos', false);
const settings = new Gio.Settings({settings_schema: schema});
const locationSettings = new Gio.Settings({schema_id:'org.gnome.system.location'});
locationSettings.set_boolean('enabled', false);
let now = local(2026, 6, 21, 23);
let scheduler = new SolarAppearance(settings, {clock: () => now});
assert(!scheduler._timer && !scheduler._geoPending, 'Off does not schedule timers or query location');
settings.set_boolean('auto-appearance', true);
assert(settings.get_string('appearance') === 'dark', 'Enabling at night immediately applies dark');
let status = JSON.parse(settings.get_string('solar-status'));
assert(status.source.includes('Zeitzonenschätzung') && status.sunrise !== '—', 'Disabled location uses real timezone-derived sun times');
settings.set_string('appearance','light');
assert(settings.get_string('appearance') === 'light' && JSON.parse(settings.get_string('solar-status')).manual, 'Manual choice stays until next solar change');
now = local(2026, 6, 22, 3); scheduler.refresh();
assert(settings.get_string('appearance') === 'light', 'Periodic refresh does not fight manual override');
now = local(2026, 6, 22, 7); scheduler.refresh();
assert(!JSON.parse(settings.get_string('solar-status')).manual, 'Sunrise releases manual override');
now = local(2026, 6, 22, 23); scheduler.refresh();
assert(settings.get_string('appearance') === 'dark', 'Following sunset automatically switches again');
settings.set_string('appearance','system');
assert(!settings.get_boolean('auto-appearance') && !scheduler._timer, 'System selection disables scheduler and keeps user control');
scheduler.destroy();
let requested = false, callback, stopped = 0, locationHandler;
const simple = {get_location: () => ({latitude:35.68, longitude:139.69, accuracy:10}),
 connect: (_name, handler) => {locationHandler=handler;return 1;}, disconnect: () => {locationHandler=null;},
 get_client: () => ({call_stop: (_cancel, done) => {stopped++;done({call_stop_finish:()=>{}},{});}})};
const fakeGeo = {default:{AccuracyLevel:{EXACT:8}, Simple:{new: (_id, accuracy, _cancel, ready) => {requested=accuracy===8;callback=ready;}, new_finish: result => result}}};
now = local(2026,6,21,12,30);
locationSettings.set_boolean('enabled', true);
scheduler = new SolarAppearance(settings, {clock: () => now, loadGeo: async () => fakeGeo});
settings.set_boolean('auto-appearance', true);
await Promise.resolve(); await Promise.resolve();
assert(requested, 'Available GeoClue requests highest available accuracy');
callback(null, simple);
assert(settings.get_string('appearance') === 'dark', 'Tokyo location at Berlin noon supersedes timezone estimate');
assert(JSON.parse(settings.get_string('solar-status')).source.includes('Systemstandort'), 'Preferences identify actual location source');
scheduler._acceptLocation({latitude:NaN, longitude:0, accuracy:0});
assert(settings.get_string('appearance') === 'light', 'Invalid fix immediately falls back to timezone');
scheduler._acceptLocation({latitude:0,longitude:0,accuracy:1});
assert(JSON.parse(settings.get_string('solar-status')).source.includes('Systemstandort'), 'Zero coordinates are not confused with unavailable GPS');
locationSettings.set_boolean('enabled', false);
assert(stopped === 1 && !locationHandler && !scheduler._location, 'Revoking location stops client, disconnects, and forgets coordinates');
settings.set_boolean('auto-appearance', false);
assert(!scheduler._timer && !scheduler._geoTimeout, 'Opt-out removes all timers');
scheduler.destroy();
locationSettings.set_boolean('enabled', true);
scheduler = new SolarAppearance(settings, {clock: () => now, loadGeo: async () => fakeGeo});
settings.set_boolean('auto-appearance', true); await Promise.resolve(); await Promise.resolve();
scheduler.destroy(); callback(null, simple);
assert(stopped === 2 && !scheduler._location && !scheduler._timer, 'Late async location cannot resurrect disabled extension');
settings.set_boolean('auto-appearance', false);
scheduler = new SolarAppearance(settings, {clock: () => now, loadGeo: async () => {throw new Error('No Geoclue typelib');}});
settings.set_boolean('auto-appearance', true); await Promise.resolve(); await Promise.resolve();
assert(!scheduler._geoPending && settings.get_string('appearance') === 'light', 'Missing optional GeoClue library keeps timezone scheduler active');
scheduler.destroy();
// Exercise the real GLib timer, without calling refresh at the boundary.
settings.set_boolean('auto-appearance', false);
locationSettings.set_boolean('enabled', false);
now = GLib.DateTime.new_from_unix_utc(Math.floor(berlin.sunrise / 1000) - 2).to_timezone(zone);
scheduler = new SolarAppearance(settings, {clock: () => now});
settings.set_boolean('auto-appearance', true);
now = GLib.DateTime.new_from_unix_utc(Math.ceil(berlin.sunrise / 1000) + 2).to_timezone(zone);
await new Promise(resolve => GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {resolve(); return GLib.SOURCE_REMOVE;}));
assert(settings.get_string('appearance') === 'light', 'Real GLib deadline automatically applies sunrise without a manual refresh');
scheduler.destroy();
assert(!scheduler._timer, 'Automatic timer test leaves no surviving source');
print(`${checks} solar schedule checks passed`);
