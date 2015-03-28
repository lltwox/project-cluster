var cluster = require('cluster'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Logger = require('project-logger'),
    _ = require('lodash');

/**
 * Options, that cluster gets by default
 *
 * @type {Object}
 */
var DEFAULT_OPTIONS = exports.DEFAULT_OPTIONS = {
    name: 'clustered-app',
    log: {
        name: 'cluster'
    },
    api: {
        enabled: true,
        port: 8887,
        host: '127.0.0.1'
    },
    timeout: {
        start: 5000,
        restart: 2000,
        kill: 5000
    },
    apps: {}
};

/**
 * Base for processes in cluster
 *
 * @param {Object} config
 */
function Process(config) {
    this.config = _.merge(_.cloneDeep(DEFAULT_OPTIONS), config);
    this.exposeLogger();
}
util.inherits(Process, EventEmitter);

/**
 * Check if current process is master
 *
 * @return {Boolean}
 */
Process.prototype.isMaster = function() {
    return cluster.isMaster;
};

/**
 * Check if current process is worker
 *
 * @return {Boolean}
 */
Process.prototype.isWorker = function() {
    return cluster.isWorker;
};

/**
 * @private
 */
Process.prototype.exposeLogger = function() {
    this.__defineGetter__('logger', function() {
        delete this.logger;
        this.logger = new Logger(this.config.log);

        return this.logger;
    });

    this.__defineSetter__('logger', function(logger) {
        delete this.logger;
        this.logger = logger;
    });

    this.hasLogger = function() {
        var description = Object.getOwnPropertyDescriptor(this, 'logger');
        return !description || !description.get;
    };
};


exports = module.exports = Process;