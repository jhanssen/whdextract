const { Glob } = require("glob");
const options = require("@jhanssen/options")("whdextract");
const path = require("node:path");
const { execFile } = require('node:child_process');

const lha = options("lha");
const extra = options("extra", "").split(" ");
const out = options("out");
const root = options("root");
const jobs = options.int("j", 5);

if (!lha) {
    console.error("no --lha");
    process.exit(1);
}

if (!root) {
    console.error("no --root");
    process.exit(1);
}

if (!out) {
    console.error("no --out");
    process.exit(1);
}

class Queue {
    constructor() {
        this._queue = [];
        this._running = [];
        for (let i = 0; i < jobs; ++i) {
            this._running.push(undefined);
        }
    }

    enqueue(dir, file, outdir) {
        this._queue.push({ dir, file, outdir });
        this._start();
    }

    join() {
        return new Promise((resolve, reject) => {
            if (this._queue.length === 0) {
                resolve();
                return;
            }
            this._joining = { resolve, reject };
        });
    }

    _start() {
        for (let i = 0; i < jobs; ++i) {
            if (this._running[i] === undefined) {
                this._startInternal(i);
                return;
            }
        }
    }

    _startInternal(jobno) {
        if (this._queue.length === 0) {
            this._running[jobno] = undefined;
            if (this._joining) {
                this._joining.resolve();
            }
            return;
        }
        const q = this._queue.shift();
        console.log("extracting", q.dir, q.file);
        this._running[jobno] = true;
        execFile(lha, ["x", q.file, `-o${q.outdir}`].concat(extra), { cwd: q.dir }, (error, stdout, stderr) => {
            if (error) {
                console.error(error);
            }
            if (stderr) {
                console.error(stderr);
            }
            this._startInternal(jobno);
        });
    }
};

async function init() {
    const queue = new Queue();
    const g = new Glob("**/*.lha", { cwd: root });
    for await (const file of g) {
        const p = path.join(root, file);
        const b = path.dirname(file);
        const o = path.join(out, b);
        //console.log("ooo", file, b, o);
        const d = path.dirname(p);
        const f = path.basename(p);
        queue.enqueue(d, f, o);
        //console.log('found a foo file:', d, f);
    }
    await queue.join();
}

(async function() {
    await init();
})().then(() => {
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(2);
});

