const TAU = Math.PI * 2;
const FORMS = {
    louder: {lift: -1, stretch: .9, wave: .4, scatter: 1, swirl: .5, merge: 0, squash: 0},
    quieter: {lift: .8, stretch: -.45, wave: .2, scatter: -.4, swirl: -.3, merge: .6, squash: .2},
    copy: {lift: -.15, stretch: .1, wave: 1, scatter: -.6, swirl: 1, merge: 1, squash: 0},
    mute: {lift: .45, stretch: 0, wave: .25, scatter: -.6, swirl: .1, merge: .8, squash: 1},
    unmute: {lift: -.4, stretch: .65, wave: .5, scatter: .85, swirl: .4, merge: 0, squash: 0},
    workspace: {lift: 0, stretch: .2, wave: .8, scatter: .75, swirl: -1, merge: .1, squash: 0},
    hover: {lift: -.7, stretch: .5, wave: .2, scatter: .35, swirl: .25, merge: 0, squash: 0},
    menu: {lift: -.35, stretch: .35, wave: .65, scatter: .7, swirl: .4, merge: .15, squash: 0},
    focus: {lift: -.1, stretch: .3, wave: .7, scatter: .25, swirl: .8, merge: .1, squash: 0},
    overview: {lift: -.2, stretch: .4, wave: .8, scatter: 1, swirl: .6, merge: 0, squash: 0},
};

// Local outline used by the Cairo renderer and geometry checks.
export function orbOutline(particle) {
    return Array.from({length: 16}, (_, i) => {
        const angle = i * TAU / 16;
        const r = particle.radius * (1 + particle.deform *
            (.65 * Math.sin(3 * angle + particle.surfacePhase) +
             .35 * Math.cos(2 * angle - particle.surfacePhase)));
        return {x: r * Math.cos(angle), y: r * Math.sin(angle)};
    });
}

// Continuous orbital state. Events change targets, never particle positions or phase.
export class OrbMotion {
    constructor() {
        this.rotation = 0;
        this.phase = 0;
        this.energy = 0;
        this.gather = 0;
        this.winkAge = 1;
        this._winkQueued = false;
        this._energyTarget = 0;
        this._gatherTarget = 0;
        this.form = Object.fromEntries(Object.keys(FORMS.copy).map(key => [key, 0]));
        this._formTarget = {...this.form};
    }

    react(kind) {
        if (kind === 'wink') {
            if (this.winkAge < 1) this._winkQueued = true;
            else this.winkAge = 0;
            return;
        }
        if (!FORMS[kind]) return;
        this._formTarget = {...FORMS[kind]};
        this._energyTarget = ['copy', 'louder', 'quieter', 'mute', 'unmute'].includes(kind) ? 1 : .45;
        this._gatherTarget = ['copy', 'quieter', 'mute'].includes(kind) ? .9 : -.45;
    }

    advance(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        // Substeps keep settling stable after a delayed frame, without teleporting.
        let remaining = Math.min(seconds, .25);
        while (remaining > 0) {
            const dt = Math.min(remaining, 1 / 120);
            const follow = 1 - Math.exp(-dt / .9);
            this.energy += (this._energyTarget - this.energy) * follow;
            this.gather += (this._gatherTarget - this.gather) * follow;
            this._energyTarget *= Math.exp(-dt / 2.4);
            this._gatherTarget *= Math.exp(-dt / 2.4);
            const morphFollow = 1 - Math.exp(-dt / .55);
            for (const key of Object.keys(this.form)) {
                this.form[key] += (this._formTarget[key] - this.form[key]) * morphFollow;
                this._formTarget[key] *= Math.exp(-dt / 2.8);
            }
            this.rotation += dt * (TAU / 14 + this.energy * .22);
            this.phase += dt * TAU / 10;
            this.winkAge = Math.min(1, this.winkAge + dt);
            if (this.winkAge >= 1 && this._winkQueued) {
                this.winkAge = 0;
                this._winkQueued = false;
            }
            remaining -= dt;
        }
    }

    winkFor(index) {
        const age = (this.winkAge - index * .035) / .55;
        return age > 0 && age < 1 ? Math.sin(Math.PI * age) ** 4 : 0;
    }

    particles() {
        const spread = .5 + .5 * Math.cos(this.phase);
        const orbit = 1.1 + 5.8 * spread * (1 + .08 * this.energy) - .75 * this.gather;
        const f = this.form;
        return Array.from({length: 6}, (_, i) => {
            const angle = this.rotation + i * TAU / 6 + .12 * Math.sin(this.phase + i) +
                f.swirl * .35 * Math.sin(this.phase + i * .8) +
                (i % 2 ? -1 : 1) * f.merge * .4;
            const depth = Math.sin(angle);
            const radius = 1.85 + .22 * depth;
            const orbitRadius = orbit * (1 + .07 * Math.sin(this.phase + i * 1.7)) +
                f.scatter * .8 - f.merge * .45;
            const floatX = .5 * Math.sin(this.phase * .7 + i * 1.2);
            const floatY = .55 * Math.cos(this.phase * .9 + i * 1.4);
            const x = Math.cos(angle) * orbitRadius + floatX +
                f.wave * .55 * Math.sin(this.phase * 2 + i * 1.1);
            const y = Math.sin(angle) * orbitRadius * .82 + floatY + f.lift * 1.6 +
                f.wave * .75 * Math.sin(this.phase * 2.5 + i * .85);
            const scaleX = 1 - .25 * f.stretch + .3 * f.squash +
                .1 * f.wave * Math.sin(this.phase * 2 + i);
            const scaleY = (1 + .6 * f.stretch +
                .12 * f.wave * Math.cos(this.phase * 2 + i)) * (1 - .55 * f.squash);
            const deform = .075 + .22 * f.wave + .1 * f.merge;
            // Smooth saturation reserves space for the complete deformed contour.
            const extent = radius * (1 + deform) * Math.max(scaleX, scaleY);
            const range = 11.5 - extent;
            return {id: i, x: 12 + range * Math.tanh(x / range),
                y: 12 + range * Math.tanh(y / range), radius, depth,
                scaleX, scaleY, deform, angle: this.rotation * .3 + i * .7 + f.swirl * .4,
                surfacePhase: this.phase * 1.5 + i * .9,
                wink: this.winkFor(i)};
        }).sort((a, b) => a.depth - b.depth);
    }
}
