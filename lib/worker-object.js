/**
 * Wrapper around cluster.Worker to keep additional state
 *
 */
function Worker(worker) {
    this.uid = null;
    this.type = null;
    this.state = Worker.STARTING;

    this.worker = worker;
}

/**
 * Possible worker states
 *
 */
Worker.STARTING = 'starting';
Worker.UP = 'up';
Worker.DISCONNECTED = 'disconnected';

/**
 * Proxying getters
 *
 */
['id', 'process'].forEach(function(field) {
    Worker.prototype.__defineGetter__(field, function() {
        return this.worker[field];
    });
});

/**
 * Proxying methods of the worker
 *
 */
['on', 'addListener', 'removeListener', 'removeAllListeners',
    'kill', 'disconnect'
].forEach(function(method) {
    Worker.prototype[method] = function() {
        return this.worker[method].apply(this.worker, arguments);
    };
});

/**
 * Send messages only when connected
 *
 */
Worker.prototype.send = function(message) {
    if (this.state == Worker.DISCONNECTED) return;
    this.worker.send(message);
};

exports = module.exports = Worker;