exports = module.exports = Stat;

var moment = require('moment');

/**
 * Statistics collection class for master operations
 *
 * @param {MasterProcess} master
 */
function Stat(master) {
    this.master = master;
    this.initEvents();

    this.stats = {};
}

var MEMORY_UNITS = [
    'b', 'K', 'M', 'G'
];

Stat.MAX_ERRORS = 1000;
Stat.MAX_WARNINGS = 1000;

/**
 * Get stats
 *
 * @return {Object}
 */
Stat.prototype.get = function(uid) {
    if (typeof uid == 'string') {
        return this.getOne(uid);
    }

    var uids = uid ? uid : Object.keys(this.stats);

    var result = [];
    uids.forEach(function(uid) {
        var stat = this.getOne(uid);
        if (stat) {
            result.push(stat);
        }
    }.bind(this));

    return result;
};

/**
 * Reset stats about process
 *
 * @param  {String} uid
 */
Stat.prototype.reset = function(uid) {
    if (!this.stats[uid]) {
        return;
    }

    this.stats[uid].restarted = 0;
    this.stats[uid].errors = 0;
    this.stats[uid].warnings = 0;
};

/**
 * Remove stopped process from stats
 *
 * @param  {String} uid
 */
Stat.prototype.remove = function(uid) {
    if (!this.stats[uid]) {
        return;
    }

    delete this.stats[uid];
};

/**
 * Init handlers for master events
 *
 * @private
 */
Stat.prototype.initEvents = function() {
    this.master.on('worker.start', this.handleWorkerStart.bind(this));
    this.master.on('worker.stop', this.handleWorkerStop.bind(this));
    this.master.on('worker.error', this.handleWorkerError.bind(this));
    this.master.on('worker.warning', this.handleWorkerWarning.bind(this));
    this.master.on('worker.memoryUsage', this.handleWorkerMemoryUsage.bind(this));
};

/**
 * @param  {String} uid
 * @return {Object}
 * @private
 */
Stat.prototype.getOne = function(uid) {
    if (!this.stats[uid]) {
        return null;
    }

    var stat = this.stats[uid];

    var result = {
        uid: stat.uid,
        id: stat.id,
        type: stat.type,
        pid: stat.pid,
        restarted: stat.restarted,
        errors: (
            stat.errors == Stat.MAX_ERRORS ?
                stat.errors + '+' : stat.errors
        ),
        warnings: (
            stat.warnings == Stat.MAX_WARNINGS ?
                stat.warnings + '+' : stat.warnings
        ),
        status: stat.online ? 'online' : 'offline'
    };
    if (stat.started) {
        result.uptime = this.formatUptime(stat.started);
        result.memory = this.formatMemory(stat.memory);
    }

    return result;
};

/**
 * Handler for event about new worker starting
 *
 * @param  {cluster.Worker} worker
 * @private
 */
Stat.prototype.handleWorkerStart = function(worker) {
    if (!this.stats[worker.uid]) {
        this.stats[worker.uid] = {
            id: worker.id,
            uid: worker.uid,
            type: worker.type,
            started: Date.now(),
            pid: worker.process.pid,
            restarted: 0,
            errors: 0,
            warnings: 0,
            memory: 0,
            online: true
        };

        return;
    }

    this.stats[worker.uid].id = worker.id;
    this.stats[worker.uid].started = Date.now();
    this.stats[worker.uid].restarted++;
    this.stats[worker.uid].pid = worker.process.pid;
    this.stats[worker.uid].online = true;
};

/**
 * Handler for event about worker stopping
 *
 * @param  {cluster.Worker} worker
 * @private
 */
Stat.prototype.handleWorkerStop = function(worker) {
    if (!this.stats[worker.uid]) {
        return;
    }
    if (worker.id != this.stats[worker.uid].id) {
        return;
    }

    this.stats[worker.uid].online = false;
    delete this.stats[worker.uid].started;
    delete this.stats[worker.uid].id;
    delete this.stats[worker.uid].pid;
};

/**
 * Handler for event about worker error
 *
 * @param  {cluster.Worker} worker
 * @private
 */
Stat.prototype.handleWorkerError = function(worker) {
    if (!this.stats[worker.uid]) {
        return;
    }
    if (worker.id != this.stats[worker.uid].id) {
        return;
    }

    this.stats[worker.uid].errors += 1;

    if (this.stats[worker.uid].errors > Stat.MAX_ERRORS) {
        this.stats[worker.uid].errors = Stat.MAX_ERRORS;
    }
};

/**
 * Handler for event about worker warning
 *
 * @param  {cluster.Worker} worker
 * @private
 */
Stat.prototype.handleWorkerWarning = function(worker) {
    if (!this.stats[worker.uid]) {
        return;
    }
    if (worker.id != this.stats[worker.uid].id) {
        return;
    }

    this.stats[worker.uid].warnings += 1;

    if (this.stats[worker.uid].warnings > Stat.MAX_WARNINGS) {
        this.stats[worker.uid].warnings = Stat.MAX_WARNINGS;
    }
};

/**
 * Handler for event about worker memory usage
 *
 * @param {cluster.Worker} worker
 * @param {String} memory
 * @private
 */
Stat.prototype.handleWorkerMemoryUsage = function(worker, memory) {
    if (!this.stats[worker.uid]) {
        return;
    }
    if (worker.id != this.stats[worker.uid].id) {
        return;
    }

    this.stats[worker.uid].memory = memory;
};

/**
 * @param {String} started
 * @return {String}
 */
Stat.prototype.formatUptime = function(started) {
    var duration = moment.duration(Date.now() - started),
        days = Math.floor(duration.asDays()),
        uptime = moment.utc(duration.asMilliseconds()).format('HH:mm:ss');

    uptime = days + ':' + uptime;

    return uptime;
};

/**
 * @param {Number} used
 * @return {String}
 */
Stat.prototype.formatMemory = function(used) {
    var index = 0;
    while (used > 900 && MEMORY_UNITS[index + 1]) {
        used /= 1000;
        index += 1;
    }

    return (Math.round(used * 100) / 100) + MEMORY_UNITS[index];
};
