exports = module.exports = MasterProcess;

var util = require('util'),
    os = require('os'),
    cluster = require('cluster'),
    async = require('async'),

    Process = require('./process'),
    Stat = require('./util/stat'),
    Api = require('./util/api'),
    Worker = require('./worker-object');

/**
 * Process, managing all workers in a cluster and
 * keeping an eye on them. Workers are cluster forks.
 *
 * @param {Object} config - configuration for cluster
 * @constructor
 */
function MasterProcess(config) {
    Process.call(this, config);

    this.workers = {};
    this.workersUids = {};

    this.startTimers = {};
    this.restartTimers = {};

    this.api = null;
    this.stat = new Stat(this);
}
util.inherits(MasterProcess, Process);

/**
 * Start all activities
 *
 */
MasterProcess.prototype.start = function() {
    process.title = this.config.name;

    this.initProcessEvents();
    this.forkWorkerProcesses(function(err) {
        if (err) return this.logger.error(err);
        if (this.config.api.enabled) {
            this.api = new Api(this.config, this);
        }

        this.emit('start');
    }.bind(this));
};

/**
 * Stop master process and all cluster.
 *
 * Stop is invoked on SIGINT/SIGKILL messages caught.
 */
MasterProcess.prototype.stop = function() {
    if (this.stopInProgress) return;

    Object.keys(this.restartTimers).forEach(function(uid) {
        clearTimeout(this.restartTimers[uid]);
    }.bind(this));
    Object.keys(this.startTimers).forEach(function(uid) {
        clearTimeout(this.startTimers[uid]);
    }.bind(this));

    this.stopInProgress = true;
    if (this.api) this.api.close();
    if (!this.workers) return this.emit('stop');

    this.removeAllWorkers(this.emit.bind(this, 'stop'));
};

/**
 * Add one worker process
 *
 * @param {String} type
 * @param {String} uid - optional id, if added worker is restarted old one
 * @param {Function} callback
 */
MasterProcess.prototype.addWorker = function(type, uid, callback) {
    if (this.stopInProgress) return;

    if (typeof uid == 'function') {
        callback = uid;
        uid = null;
    }

    var worker = this.fork(type, uid);

    var onMessage = function(message) {
        if (message != 'up') return;

        worker.removeListener('message', onMessage);
        worker.removeListener('exit', onExit);
        clearTimeout(this.startTimers[worker.uid]);

        this.logger.info('Added worker ' + worker.uid);
        this.emit('worker.start', worker);
        worker.state = Worker.UP;

        return callback && callback(null, worker.id);
    }.bind(this);
    var onExit = function() {
        clearTimeout(this.startTimers[worker.uid]);

        return callback && callback(
            new Error('Worker ' + worker.uid + ' failed to start')
        );
    }.bind(this);
    this.startTimers[worker.uid] = setTimeout(function() {
        worker.removeListener('exit', onExit);
        this.removeWorker(worker.id, function() {
            return callback && callback(
                new Error('Worker ' + worker.uid + ' failed to start in time')
            );
        });
    }.bind(this), this.config.timeout.start);

    worker.on('message', onMessage);
    worker.on('exit', onExit);

    this.initWorkerEvents(worker);
};

/**
 * Disconnect worker process
 *
 * @param  {String} id
 * @param  {Function} callback
 */
MasterProcess.prototype.removeWorker = function(id, callback) {
    var worker = this.getWorker(id);
    if (!worker) return callback && process.nextTick(function() {
        callback(new Error('Worker #' + id + ' does not exists'));
    });

    if (worker.state == Worker.DISCONNECTED) return;

    var timeout = setTimeout(function() {
        this.logger.warning('Worker ' + worker.uid + ' failed to exit');
        worker.kill('SIGKILL');
    }.bind(this), this.config.timeout.kill);
    worker.on('exit', function() {
        clearTimeout(timeout);

        this.logger.info('Worker ' + worker.uid + ' disconnected');
        this.emit('worker.stop', worker);

        return callback && callback();
    }.bind(this));

    worker.send('shutdown');
    worker.disconnect();
    worker.state = Worker.DISCONNECTED;
};

/**
 * Restart worker process
 *
 * @param  {String} id
 * @param  {Function} callback
 */
MasterProcess.prototype.restartWorker = function(id, callback) {
    var worker = this.getWorker(id);
    if (!worker) return callback && process.nextTick(function() {
        callback(new Error('Worker #' + id + ' does not exists'));
    });

    this.logger.info('Restarting worker ' + worker.uid);

    this.addWorker(worker.type, worker.uid, function(err, newWorkerId) {
        if (err) return callback && callback(err);
        this.removeWorker(worker.id, function(err) {
            return callback && callback(err, newWorkerId);
        });
    }.bind(this));
};

/**
 * Remove all current workers of a type (if any given)
 *
 * @param {String} type
 * @param {Function} callback
 */
MasterProcess.prototype.removeAllWorkers = function(type, callback) {
    if (typeof type == 'function') {
        callback = type;
        type = null;
    }

    var currentWorkers = this.getCurrentWorkersIds(type);
    async.each(currentWorkers, function(workerId, callback) {
        this.removeWorker(workerId, callback);
    }.bind(this), function(err) {
        return callback && callback(err, currentWorkers);
    });
};

/**
 * Restart all current worker processes, which is actually
 * kill all current ones and spawn same number of new ones
 *
 * @param {String} type
 * @param {function} callback
 */
MasterProcess.prototype.restartAllWorkers = function(type, callback) {
    if (typeof type == 'function') {
        callback = type;
        type = null;
    }

    var currentWorkers = this.getCurrentWorkersIds(type);

    async.each(currentWorkers, function(id, callback) {
        var worker = this.getWorker(id);
        if (worker) {
            this.addWorker(worker.type, worker.uid, callback);
        } else {
            callback(new Error('Unknown worker: ' + id));
        }
    }.bind(this), function(err) {
        if (err) return callback && callback(err);

        async.each(currentWorkers, function(id, callback) {
            this.removeWorker(id, callback);
        }.bind(this), function(err) {
            return callback && callback(err, currentWorkers);
        });
    }.bind(this));
};

/**
 * Kill all workers, that are still running. Should be used only in case
 * of timeouted shutdown
 *
 * @param {String} type
 * @param  {Function} callback
 */
MasterProcess.prototype.killAllWorkers = function(type, callback) {
    if (typeof type == 'function') {
        callback = type;
        type = null;
    }

    var currentWorkers = this.getCurrentWorkersIds(type);
    async.map(currentWorkers, function(id, callback) {
        var worker = this.getWorker(id);
        if (worker) worker.kill('SIGKILL');
        callback();
    }.bind(this), function() {
        return callback && callback(null, currentWorkers);
    });
};

/**
 * @param  {String} id
 * @return {cluster.Worker}
 */
MasterProcess.prototype.getWorker = function(id) {
    for (var type in this.workers) {
        if (this.workers[type][id]) return this.workers[type][id];
    }

    return null;
};

/**
 * Get list of ids of all workers, that are started and running
 *
 * @param {String} type
 * @return {Array}
 * @private
 */
MasterProcess.prototype.getCurrentWorkersIds = function(type) {
    if (type) {
        if (!this.workers[type]) return [];
        return Object.keys(this.workers[type]);
    }

    var ids = [];
    for (var workerType in this.workers) {
        ids = ids.concat(Object.keys(this.workers[workerType]));
    }

    return ids;
};

/**
 * Set up how master process reacts to signals and errors
 *
 * @private
 */
MasterProcess.prototype.initProcessEvents = function() {
    process.on('SIGINT', this.stop.bind(this));
    process.on('SIGTERM', this.stop.bind(this));
    process.on('uncaughtException', function workerOnError(err) {
        this.logger.error('MasterProcess uncaught exception', err);
        this.stop();
    }.bind(this));
};

/**
 * @param  {cluster.Worker} worker
 */
MasterProcess.prototype.initWorkerEvents = function(worker) {
    worker.on('message', function(message) {
        if (message == 'error' || message == 'warning') {
            this.emit('worker.' + message, worker);
        } else if (message == 'restartme') {
            this.restartWorker(worker.id);
        } else if (message == 'disconnectme') {
            if (worker.state == Worker.STARTING) {
                this.removeWorker(worker.id);
            } else {
                this.removeWorker(worker.id, scheduleRestart);
            }
        }
    }.bind(this));

    worker.on('exit', function() {
        delete this.workers[worker.type][worker.id];
        delete this.workersUids[worker.type][worker.uid];
        this.emit('worker.stop', worker);

        // it was an unexpected stop, we need to restart it
        if (worker.state == Worker.UP) scheduleRestart();
    }.bind(this));

    var scheduleRestart = function() {
        if (this.stopInProgress) return;

        this.logger.warning('Restarting worker ' + worker.uid);
        if (this.restartTimers[worker.uid]) {
            clearTimeout(this.restartTimers[worker.uid]);
        }
        this.restartTimers[worker.uid] = setTimeout(function() {
            this.addWorker(worker.type, worker.uid);
        }.bind(this), this.config.timeout.restart);
    }.bind(this);
};

/**
 * Initial fork for all worker processes
 *
 * @param {Function} callback
 * @private
 */
MasterProcess.prototype.forkWorkerProcesses = function(callback) {
    var apps = Object.keys(this.config.apps);
    if (apps.length === 0 && !this.config.api.enabled) {
        return callback(new Error('No apps added to run'));
    }

    async.each(apps, function(type, callback) {
        var workersNumber = this.config.apps[type];
        if (workersNumber < 0) {
            workersNumber = os.cpus().length;
        }

        async.times(
            workersNumber,
            function(n, callback) {
                this.addWorker(type, function(err) {
                    if (err) this.logger.error(err);
                    callback();
                }.bind(this));
            }.bind(this),
            callback
        );
    }.bind(this), callback);
};

/**
 * Fork new worker process
 *
 * @param {String} type
 * @param {String} uid
 * @return {Worker}
 * @private
 */
MasterProcess.prototype.fork = function(type, uid) {
    var worker = new Worker(cluster.fork({WORKER_TYPE: type}));
    this.workers[type] = this.workers[type] || {};
    this.workersUids[type] = this.workersUids[type] || {};

    worker.type = type;
    worker.uid = uid || this.generateWorkerUid(worker.type);

    this.workers[type][worker.id] = worker;
    this.workersUids[type][worker.uid] = true;

    return worker;
};

/**
 * @param  {cluster.Worker} worker
 * @private
 * @return {String}
 */
MasterProcess.prototype.generateWorkerUid = function(type) {
    var uid, i = 1;

    while (true) {
        uid = type + ':' + ('0' + i).slice(-2);
        if (!this.workersUids[type][uid]) return uid;
        i += 1;
    }
};
