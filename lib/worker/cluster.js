var WorkerState = require('./state');

/**
 * Wrapper around cluster.Worker to keep additional state
 *
 */
function WorkerCluster(worker) {
  this.uid = null;
  this.type = null;
  this.state = WorkerState.STARTING;

  this.worker = worker;
}

/**
 * Proxying getters
 *
 */
['id', 'process'].forEach(function(field) {
  WorkerCluster.prototype.__defineGetter__(field, function() {
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
  WorkerCluster.prototype[method] = function() {
    return this.worker[method].apply(this.worker, arguments);
  };
});

/**
 * Send messages only when connected
 *
 */
WorkerCluster.prototype.send = function(message) {
  if (this.state == WorkerState.DISCONNECTED) return;
  this.worker.send(message);
};

exports = module.exports = WorkerCluster;