exports = module.exports = Process;

var cluster = require('cluster'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Logger = require('project-logger').Logger,
    _ = require('lodash');

/**
 * Base for processes in cluster
 *
 * @param {Object} config
 */
function Process(config) {
    this.config = _.merge(DEFAULT_OPTIONS, config);
    this.logger = new Logger(this.config.log);
}
util.inherits(Process, EventEmitter);

/**
 * Options, that cluster gets by default
 *
 * @type {Object}
 */
var DEFAULT_OPTIONS = exports.DEFAULT_OPTIONS = {
    name: 'clustered-app',
    log: {
        'name': 'cluster'
    },
    api: {
        enabled: true,
        port: 8887,
        host: '127.0.0.1',
        secret: 'cluster-secret'
    },
    timeout: {
        start: 5000,
        restart: 2000,
        kill: 5000
    },
    apps: {}
};

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