// SPDX-FileCopyrightText: Night Theme Switcher Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Solar equations adapted from Timer.js, revision 87ef3094137c7943b3d0a8fdf7420ea57827653b.
// LightOS changes: pure UTC timestamps, local-date anchoring, polar cases and validation.
// https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension

const DAY = 86400000;
export function validCoordinates(latitude, longitude) {
    return Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

// noon is the actual UTC timestamp of noon on the requested local calendar day.
export function solarDay(noon, latitude, longitude) {
    if (!Number.isFinite(noon) || !validCoordinates(latitude, longitude))
        throw new Error('Invalid solar date or coordinates');
    const rad = degrees => degrees * Math.PI / 180;
    const deg = radians => radians * 180 / Math.PI;
    const julianCentury = (noon / DAY + 2440587.5 - 2451545) / 36525;
    const geomMeanLongSun = (280.46646 + julianCentury * (36000.76983 + julianCentury * 0.0003032)) % 360;
    const geomMeanAnomSun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
    const eccentEarthOrbit = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
    const sunEqOfCtr =
      Math.sin(rad(geomMeanAnomSun)) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
      Math.sin(rad(2 * geomMeanAnomSun)) * (0.019993 - 0.000101 * julianCentury) +
      Math.sin(rad(3 * geomMeanAnomSun)) * 0.000289;
    const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
    const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * julianCentury));
    const meanObliqEcliptic =
      23 + (26 + (21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))) / 60) / 60;
    const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(rad(125.04 - 1934.136 * julianCentury));
    const sunDeclin = deg(Math.asin(Math.sin(rad(obliqCorr)) * Math.sin(rad(sunAppLong))));
    const varY = Math.tan(rad(obliqCorr / 2)) * Math.tan(rad(obliqCorr / 2));
    const eqOfTime =
      4 *
      deg(
        varY * Math.sin(2 * rad(geomMeanLongSun)) -
          2 * eccentEarthOrbit * Math.sin(rad(geomMeanAnomSun)) +
          4 * eccentEarthOrbit * varY * Math.sin(rad(geomMeanAnomSun)) * Math.cos(2 * rad(geomMeanLongSun)) -
          0.5 * varY * varY * Math.sin(4 * rad(geomMeanLongSun)) -
          1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * rad(geomMeanAnomSun)),
      );
    const cosine = Math.cos(rad(90.833)) / (Math.cos(rad(latitude)) * Math.cos(rad(sunDeclin))) -
        Math.tan(rad(latitude)) * Math.tan(rad(sunDeclin));
    if (cosine >= 1) return {sunrise: null, sunset: null, polar: 'night'};
    if (cosine <= -1) return {sunrise: null, sunset: null, polar: 'day'};
    const halfDay = deg(Math.acos(cosine)) * 4 * 60000;
    let solarNoon = Math.floor(noon / DAY) * DAY + (720 - 4 * longitude - eqOfTime) * 60000;
    // Date-line zones can have offsets whose sign differs from their longitude.
    solarNoon += Math.round((noon - solarNoon) / DAY) * DAY;
    return {sunrise: solarNoon - halfDay, sunset: solarNoon + halfDay, polar: null};
}

export function solarSchedule(now, today, adjacent = []) {
    const days = [today, ...adjacent];
    const daylight = today.polar === 'day' || days.some(day =>
        day.sunrise !== null && now >= day.sunrise && now < day.sunset);
    const transitions = days.flatMap(day => [day.sunrise, day.sunset])
        .filter(time => time !== null && time > now).sort((a, b) => a - b);
    return {mode: daylight ? 'light' : 'dark', next: transitions[0] ?? null};
}

export function parseCoordinates(value) {
    const match = /^([+-])(\d{4}|\d{6})([+-])(\d{5}|\d{7})$/.exec(value);
    if (!match) return null;
    function angle(sign, digits, width) {
        const degrees = Number(digits.slice(0, width));
        const minutes = Number(digits.slice(width, width + 2));
        const seconds = Number(digits.slice(width + 2) || 0);
        if (minutes >= 60 || seconds >= 60) return NaN;
        return (sign === '-' ? -1 : 1) * (degrees + minutes / 60 + seconds / 3600);
    }
    const latitude = angle(match[1], match[2], 2);
    const longitude = angle(match[3], match[4], 3);
    return validCoordinates(latitude, longitude) ? {latitude, longitude} : null;
}

export function parseZoneTable(text) {
    const zones = new Map();
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const [, coordinates, id] = line.split('\t');
        const point = parseCoordinates(coordinates ?? '');
        if (point && id) zones.set(id, point);
    }
    return zones;
}

export function timezonePoint(id, zones, standardOffsetSeconds) {
    const point = zones.get(id);
    if (point) return {...point, approximate: true, offsetOnly: false};
    const longitude = ((standardOffsetSeconds / 240 + 180) % 360 + 360) % 360 - 180;
    return {latitude: 0, longitude, approximate: true, offsetOnly: true};
}
