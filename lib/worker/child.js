var WorkerState = require('./state');

var workerCount = 0;

/**
 * Wrapper around child_process.ChildProcess to keep additional state
 *
 */
function WorkerChild(process) {
  this.uid = null;
  this.type = null;
  this.state = WorkerState.STARTING;

  this.id = ++workerCount;
  this.process = process;
}

/**
 * Proxying methods of the process
 *
 */
['on', 'addListener', 'removeListener', 'removeAllListeners',
  'kill', 'disconnect'
].forEach(function(method) {
  WorkerChild.prototype[method] = function() {
    return this.process[method].apply(this.process, arguments);
  };
});

/**
 * Send messages only when connected
 *
 */
WorkerChild.prototype.send = function(message) {
  if (this.state == WorkerState.DISCONNECTED) return;
  this.process.send(message);
};

exports = module.exports = WorkerChild;