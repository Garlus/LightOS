import {OrbMotion, orbOutline} from '../extension/orbMotion.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const spread = motion => motion.particles().reduce((sum, p) =>
    sum + Math.hypot(p.x - 12, p.y - 12), 0) / 6;
const snapshot = motion => JSON.stringify({rotation: motion.rotation,
    phase: motion.phase, energy: motion.energy, gather: motion.gather,
    particles: motion.particles()});

// Stable identities avoid mistaking a depth-sort crossing for a teleportation.
function displacement(before, after) {
    let maximum = 0;
    for (const old of before) {
        const current = after.find(p => p.id === old.id);
        if (!current) throw new Error('Particle identity disappeared between frames');
        maximum = Math.max(maximum, distance(old, current));
    }
    return maximum;
}

// Check the renderer's cubic control hull after scale, wink and rotation.
// A Bezier segment lies inside this hull, so these extents conservatively
// include the complete smooth curve rather than only its outline vertices.
function contourHull(particle) {
    const outline = orbOutline(particle);
    const hull = [];
    for (let i = 0; i < outline.length; i++) {
        const previous = outline[(i + outline.length - 1) % outline.length];
        const current = outline[i], next = outline[(i + 1) % outline.length];
        const after = outline[(i + 2) % outline.length];
        hull.push(current,
            {x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6},
            {x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6});
    }
    return hull.map(point => {
        const x = point.x * particle.scaleX;
        const y = point.y * particle.scaleY * (1 - .88 * particle.wink);
        return {x: particle.x + x * Math.cos(particle.angle) - y * Math.sin(particle.angle),
            y: particle.y + x * Math.sin(particle.angle) + y * Math.cos(particle.angle)};
    });
}

const idle = new OrbMotion();
const spreads = [];
let minimumTurn = Infinity;
let maximumStep = 0;
for (let frame = 0; frame < 30 * 60; frame++) {
    const before = idle.particles();
    const rotation = idle.rotation;
    idle.advance(1 / 60);
    minimumTurn = Math.min(minimumTurn, idle.rotation - rotation);
    maximumStep = Math.max(maximumStep, displacement(before, idle.particles()));
    spreads.push(spread(idle));
}
assert(minimumTurn > 0, 'Idle rotation advances on every frame for 30 seconds');
assert(idle.rotation > 2 * Math.PI, 'Idle motion completes a full rotation');
assert(maximumStep < .25, 'Idle trajectory stays below a quarter pixel per 60 Hz frame');
for (let cycle = 0; cycle < 3; cycle++) {
    const window = spreads.slice(cycle * 600, (cycle + 1) * 600);
    assert(Math.max(...window) > 4, `Cycle ${cycle + 1}: particles disperse visibly`);
    assert(Math.min(...window) < 1.5, `Cycle ${cycle + 1}: particles gather visibly`);
    assert(Math.max(...window) / Math.min(...window) > 3,
        `Cycle ${cycle + 1}: gathering changes the orbital extent substantially`);
}

for (const kind of ['copy', 'louder', 'quieter', 'mute', 'hover', 'menu', 'overview', 'focus']) {
    const motion = new OrbMotion();
    motion.advance(.2);
    const before = snapshot(motion);
    motion.react(kind);
    assert(snapshot(motion) === before, `${kind}: event does not reset phase or move particles instantaneously`);
    for (let i = 0; i < 60; i++) motion.advance(1 / 60);
    assert(motion.energy > .05, `${kind}: event produces a sustained response`);
    assert(Math.abs(motion.gather) > .05, `${kind}: event modulates gathering`);
    for (let i = 0; i < 25 * 60; i++) motion.advance(1 / 60);
    assert(Math.abs(motion.energy) < .001 && Math.abs(motion.gather) < .001,
        `${kind}: event modulation settles after inactivity`);
    assert(motion.rotation > 2 * Math.PI, `${kind}: rotation continues while event settles`);
}

const busy = new OrbMotion();
let bounded = true;
let finite = true;
maximumStep = 0;
for (let frame = 0; frame < 40 * 60; frame++) {
    // Alternating targets every six frames exercises interruption of a response,
    // including switching repeatedly between gathering and dispersal.
    if (frame % 6 === 0) {
        const before = snapshot(busy);
        busy.react(['copy', 'louder', 'quieter'][Math.floor(frame / 6) % 3]);
        if (snapshot(busy) !== before) throw new Error('Repeated event changed current geometry');
    }
    const before = busy.particles();
    busy.advance(1 / 60);
    const particles = busy.particles();
    maximumStep = Math.max(maximumStep, displacement(before, particles));
    for (const p of particles) {
        finite &&= [p.x, p.y, p.radius, p.depth].every(Number.isFinite);
        bounded &&= p.radius > 0 && p.x - p.radius >= 0 && p.x + p.radius <= 24 &&
            p.y - p.radius >= 0 && p.y + p.radius <= 24;
    }
}
assert(finite, 'Repeated alternating events keep every particle value finite');
assert(bounded, 'Complete particle discs remain inside the 24 × 24 allocation');
assert(maximumStep < .25, 'Repeated alternating events remain below a quarter pixel per frame');

const invalid = new OrbMotion();
invalid.react('copy');
for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.1']) {
    const before = snapshot(invalid);
    invalid.advance(dt);
    assert(snapshot(invalid) === before, `Invalid elapsed time ${String(dt)} is ignored`);
}
const delayed = new OrbMotion();
const boundedDelay = new OrbMotion();
delayed.react('copy');
boundedDelay.react('copy');
delayed.advance(600);
boundedDelay.advance(.25);
assert(snapshot(delayed) === snapshot(boundedDelay), 'A delayed frame advances at most a quarter second');
assert(delayed.phase > 0 && delayed.rotation > 0, 'A delayed frame still resumes forward motion');

// A wink deforms the drawn discs, while their orbital centres and clocks keep
// advancing normally. Sample the public envelope at the display frame rate.
const wink = new OrbMotion();
const noWink = new OrbMotion();
for (let i = 0; i < 120; i++) { wink.advance(1 / 60); noWink.advance(1 / 60); }
const beforeWink = snapshot(wink);
wink.react('wink');
assert(snapshot(wink) === beforeWink, 'Starting a wink preserves current phase, rotation and particle geometry');
const peaks = Array(6).fill(0);
const peakFrames = Array(6).fill(-1);
let previousWinks = Array(6).fill(0);
let maximumWinkStep = 0;
let validWinks = true;
let uninterruptedOrbit = true;
for (let frame = 0; frame < 90; frame++) {
    wink.advance(1 / 60);
    noWink.advance(1 / 60);
    uninterruptedOrbit &&= wink.rotation === noWink.rotation && wink.phase === noWink.phase;
    const actualParticles = wink.particles();
    const referenceParticles = noWink.particles();
    actualParticles.forEach((p, index) => {
        const reference = referenceParticles[index];
        uninterruptedOrbit &&= p.x === reference.x && p.y === reference.y && p.radius === reference.radius;
    });
    for (let index = 0; index < 6; index++) {
        const value = wink.winkFor(index);
        validWinks &&= Number.isFinite(value) && value >= 0 && value <= 1;
        maximumWinkStep = Math.max(maximumWinkStep, Math.abs(value - previousWinks[index]));
        if (value > peaks[index]) { peaks[index] = value; peakFrames[index] = frame; }
        previousWinks[index] = value;
    }
}
assert(validWinks, 'Every sampled wink envelope is finite and within the open/closed range');
assert(maximumWinkStep < .15, 'Wink deformation changes by less than 15 percent per 60 Hz frame');
assert(uninterruptedOrbit, 'Winking leaves continued orbital phase, rotation and particle centres unmodified');
for (let index = 0; index < 6; index++) {
    assert(peaks[index] > .98, `Particle ${index + 1} reaches a near-closed wink`);
    assert(wink.winkFor(index) === 0, `Particle ${index + 1} returns fully open`);
    if (index > 0) assert(peakFrames[index] > peakFrames[index - 1],
        `Particle ${index + 1} winks later than its predecessor`);
}

// Interrupt during closure. Requests must queue a later full wink rather than
// restart the current deformation or accumulate an unbounded animation backlog.
const queued = new OrbMotion();
const single = new OrbMotion();
queued.react('wink');
single.react('wink');
for (let i = 0; i < 12; i++) { queued.advance(1 / 60); single.advance(1 / 60); }
const beforeQueue = snapshot(queued);
for (let i = 0; i < 10; i++) queued.react('wink');
assert(snapshot(queued) === beforeQueue, 'Repeated wink requests preserve an active deformation');
let firstWinkUnchanged = true;
for (let i = 0; i < 42; i++) {
    queued.advance(1 / 60);
    single.advance(1 / 60);
    for (let index = 0; index < 6; index++)
        firstWinkUnchanged &&= queued.winkFor(index) === single.winkFor(index);
}
assert(firstWinkUnchanged, 'Queued requests do not rewind or truncate the current wink');
const queuedPeaks = Array(6).fill(0);
for (let i = 0; i < 90; i++) {
    queued.advance(1 / 60);
    single.advance(1 / 60);
    for (let index = 0; index < 6; index++)
        queuedPeaks[index] = Math.max(queuedPeaks[index], queued.winkFor(index));
}
assert(queuedPeaks.every(value => value > .98), 'Repeated requests produce one complete subsequent wink for all six particles');
assert(Array.from({length: 6}, (_, index) => queued.winkFor(index)).every(value => value === 0),
    'Repeated requests settle fully open without an accumulating backlog');
assert(queued.rotation === single.rotation && queued.phase === single.phase,
    'Queued winks preserve continued orbital clocks');

const actions = ['louder', 'quieter', 'copy', 'mute', 'menu', 'hover', 'focus', 'overview', 'unmute', 'workspace'];
const responses = new Map();
for (const action of actions) {
    const motion = new OrbMotion();
    for (let frame = 0; frame < 37; frame++) motion.advance(1 / 60);
    const before = snapshot(motion);
    motion.react(action);
    assert(snapshot(motion) === before, `${action}: target update preserves complete visible contour geometry`);
    for (let frame = 0; frame < 60; frame++) motion.advance(1 / 60);
    responses.set(action, motion.particles().sort((a, b) => a.id - b.id));
    assert(Object.values(motion.form).some(value => Math.abs(value) > .05),
        `${action}: action engages a sustained morph response`);
    for (let frame = 0; frame < 30 * 60; frame++) motion.advance(1 / 60);
    assert(Object.values(motion.form).every(value => Number.isFinite(value) && Math.abs(value) < .001),
        `${action}: every form channel settles after inactivity`);
}
for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
        const a = responses.get(actions[i]), b = responses.get(actions[j]);
        const centreDifference = Math.max(...a.map((p, index) => distance(p, b[index])));
        const shapeDifference = Math.max(...a.map((p, index) => Math.max(
            Math.abs(p.scaleX - b[index].scaleX), Math.abs(p.scaleY - b[index].scaleY),
            Math.abs(p.deform - b[index].deform))));
        assert(centreDifference > .03, `${actions[i]} / ${actions[j]}: distinguishable trajectories`);
        assert(shapeDifference > .01, `${actions[i]} / ${actions[j]}: distinguishable deformation`);
    }
}
const meanShape = action => responses.get(action).reduce((sum, p) => sum + p.scaleY / p.scaleX, 0) / 6;
assert(meanShape('louder') > meanShape('quieter'), 'Louder stretches the particles more vertically than quieter');
assert(meanShape('unmute') > meanShape('mute'), 'Unmuting opens the shape relative to the flattened mute response');

const organic = new OrbMotion();
const idleBefore = organic.particles().sort((a, b) => a.id - b.id);
const localBefore = idleBefore.map(orbOutline);
for (let frame = 0; frame < 60; frame++) organic.advance(1 / 60);
const idleAfter = organic.particles().sort((a, b) => a.id - b.id);
assert(displacement(idleBefore, idleAfter) > .5, 'Idle particles drift visibly without desktop events');
assert(idleAfter.every((p, index) => orbOutline(p).some((point, vertex) =>
    distance(point, localBefore[index][vertex]) > .01)),
    'Every idle particle changes its local organic outline over time');

let fullContourBounded = true;
let fullContourFinite = true;
let maximumContourStep = 0;
const contourMotion = new OrbMotion();
for (let frame = 0; frame < 40 * 60; frame++) {
    if (frame % 18 === 0) contourMotion.react(actions[Math.floor(frame / 18) % actions.length]);
    if (frame % 83 === 0) contourMotion.react('wink');
    const before = new Map(contourMotion.particles().map(p => [p.id, contourHull(p)]));
    contourMotion.advance(1 / 60);
    for (const particle of contourMotion.particles()) {
        const points = contourHull(particle);
        const oldPoints = before.get(particle.id);
        points.forEach((point, index) => {
            fullContourFinite &&= Number.isFinite(point.x) && Number.isFinite(point.y);
            // Include the renderer's 0.4-unit outline stroke conservatively
            // under the largest local scale, even during eyelid compression.
            const rim = .2 * Math.max(particle.scaleX, particle.scaleY);
            fullContourBounded &&= point.x - rim >= 0 && point.x + rim <= 24 &&
                point.y - rim >= 0 && point.y + rim <= 24;
            maximumContourStep = Math.max(maximumContourStep, distance(point, oldPoints[index]));
        });
    }
}
assert(fullContourFinite, 'Organic contour control hull stays finite throughout alternating events and winks');
assert(fullContourBounded, 'Rotated, scaled, winking cubic curves including stroke remain inside 24 × 24');
assert(maximumContourStep < .5, `Organic contours remain continuous below half a pixel per 60 Hz frame (measured ${maximumContourStep})`);
print(`${checks} orb motion checks passed (30 s idle, 40 s interrupted interaction, maximum contour step ${maximumContourStep.toFixed(3)} px)`);
