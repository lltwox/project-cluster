/**
 * Create cluster management class. When processes will be forked, worker
 * wrapper will be created instead.
 *
 * @param {Object} options
 * @return {Cluster}
 */
exports.create = function(options) {
    options.config = options.config || {};
    if (!options.start || typeof options.start != 'function') {
        throw new Error('`start` should be a function');
    }
    if (options.stop && typeof options.stop != 'function') {
        throw new Error('`stop` should be a function');
    }

    if (process.env.WORKER_TYPE) {
        var Worker = require('./worker-process');
        return new Worker(options.config, options.start, options.stop);
    } else {
        var Master = require('./master-process');
        return new Master(options.config);
    }
};
