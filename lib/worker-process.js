var util = require('util'),
    Process = require('./process');

/**
 * Process with application running inside of it.
 *
 * @param {Object} config - configuration for cluster
 * @param {Function} start
 * @param {Function} stop
 * @constructor
 */
function WorkerProcess(config, start, stop) {
    Process.call(this, config);

    this.startApp = start;
    this.stopApp = stop;

    /**
     * App instance - returned from start function
     *
     * @type {[type]}
     */
    this.app = null;
    this.started = false;
}
util.inherits(WorkerProcess, Process);

/**
 * Start worker process
 *
 */
WorkerProcess.prototype.start = function() {
    process.title = this.config.name + ' ' + this.getType() + ' worker';

    this.initProcessEvents();
    if (this.startApp.length < 2) {
        this.startApp(this.onStart.bind(this));
    } else {
        this.startApp(this.getType(), this.onStart.bind(this));
    }
};

/**
 * Stop process
 *
 */
WorkerProcess.prototype.stop = function() {
    if (this.stopInProgress) return;

    this.stopInProgress = true;
    this.stopMemoryReport();
    process.removeAllListeners('message');

    if (!this.started || !this.stopApp) return this.emit('stop');
    if (!this.app) return this.stopApp(this.emit.bind(this, 'stop'));

    this.stopApp(this.app, this.emit.bind(this, 'stop'));
};

/**
 * Callback for worker start function
 *
 * @param  {Error} err
 * @param  {Object} app
 */
WorkerProcess.prototype.onStart = function(err, app) {
    if (err) {
        this.logger.error('Failed to start', err);
        process.exit();
    }
    if (app) this.app = app;

    this.started = true;
    this.startMemoryReport();
    this.send('up');
    this.emit('start');
};

/**
 * @private
 */
WorkerProcess.prototype.initProcessEvents = function() {
    process.on('message', function(msg) {
        if (msg == 'shutdown') this.stop();
    }.bind(this));

    process.once('uncaughtException', function(err) {
        this.logger.error('Worker ' + this.getType() + ' uncaught exception', err);
        if (this.stopInProgress) process.exit();

        this.send('disconnectme');
    }.bind(this));

    process.on('SIGINT', this.requestRestart.bind(this));
    process.on('SIGTERM', this.requestRestart.bind(this));
};

/**
 * @private
 */
WorkerProcess.prototype.requestRestart = function() {
    if (this.stopInProgress) return;
    this.send('disconnectme');
};

/**
 * @private
 * @return {String}
 */
WorkerProcess.prototype.getType = function() {
    return process.env.WORKER_TYPE;
};

/**
 * Start sending reports about memory usage
 *
 */
WorkerProcess.prototype.startMemoryReport = function() {
    this.send('memoryUsage:' + process.memoryUsage().rss);
    this.memoryUsageReportInterval = setInterval(function() {
        this.send('memoryUsage:' + process.memoryUsage().rss);
    }.bind(this), 1000);
};

/**
 * Start sending reports about memory usage
 *
 */
WorkerProcess.prototype.stopMemoryReport = function() {
    clearInterval(this.memoryUsageReportInterval);
};

/**
 * @param  {String} message
 */
WorkerProcess.prototype.send = function(message) {
    try {
        if (process.connected) process.send(message);
    } catch (err) {
        this.logger.error(err);
    }
};

exports = module.exports = WorkerProcess;