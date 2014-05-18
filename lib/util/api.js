exports = module.exports = Api;

var express = require('express'),
    async = require('async');

/**
 * Api for cluster management
 *
 * @param {Object} config
 * @param {Master} master
 */
function Api(config, master) {
    this.config = config;
    this.master = master;
    this.stat = this.master.stat;

    var api = express();
    api.use(this.checkSecret.bind(this));

    api.get('/stat', this.getStat.bind(this));
    api.get('/:type/add', this.add.bind(this));
    api.get('/:selector/start', this.start.bind(this));
    api.get('/:selector/restart', this.restart.bind(this));
    api.get('/:selector/stop', this.stop.bind(this));
    api.get('/:selector/reset', this.reset.bind(this));
    api.get('/:selector/remove', this.remove.bind(this));

    this.server = api.listen(this.config.api.port, this.config.api.host);
}

/**
 * Stop api
 *
 */
Api.prototype.close = function() {
    if (this.server) this.server.close();
};

/**
 * Get stats on running processes
 *
 * @param {express.Request} req
 * @param {express.Response} res
 * @private
 */
Api.prototype.getStat = function(req, res) {
    res.json(this.stat.get());
};

/**
 * Add new worker of given type
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.add = function(req, res) {
    this.master.addWorker(req.param('type'), function(err, workerId) {
        if (err) return res.status(400).end(err.message);
        res.json(this.stat.get(this.master.getWorker(workerId).uid));
    }.bind(this));
};

/**
 * Start previously stopped process
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.start = function(req, res) {
    var selector = req.param('selector');
    if (selector.indexOf(':') >= 0) {
        var stat = this.stat.get(selector);
        if (!stat) {
            return res.status(400).end('Invalid id: no process found');
        }
        if (stat.pid) {
            return res.status(400).end('Process is already running');
        }

        return this.master.addWorker(stat.type, stat.uid, function(err) {
            if (err) return res.status(400).end(err.message);
            this.stat.reset(stat.uid);
            res.json(this.stat.get(stat.uid));
        }.bind(this));
    }

    var type = selector != 'all' ? selector : null;
    var stats = this.stat.get();
    var startedStats = [];
    async.each(stats, function(stat, callback) {
        if (type && stat.type != type) {
            return callback();
        }
        if (stat.pid) {
            return callback();
        }

        this.master.addWorker(stat.type, stat.uid, function(err) {
            if (err) return callback(err);
            this.stat.reset(stat.uid);
            startedStats.push(this.stat.get(stat.uid));
            return callback();
        }.bind(this));
    }.bind(this), function(err) {
        if (err) return res.status(500).end(err.message);
        res.json(startedStats);
    });
};

/**
 * Restart process, described by selector
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.restart = function(req, res) {
    var selector = req.param('selector');
    if (selector.indexOf(':') >= 0) {
        var stat = this.stat.get(selector);
        if (!stat) {
            return res.status(400).end('Invalid id: no process found');
        }
        if (!stat.pid) {
            return res.status(400).end('Process is not running');
        }
        return this.master.restartWorker(stat.id, function(err) {
            if (err) return res.status(400).end(err.message);
            this.stat.reset(stat.uid);
            res.json(this.stat.get(stat.uid));
        }.bind(this));
    }

    var type = selector != 'all' ? selector : null;
    var currentWorkers = this.master.getCurrentWorkersIds(type);
    var uids = currentWorkers.map(function(id) {
        return this.master.getWorker(id).uid;
    }.bind(this));
    this.master.restartAllWorkers(type, function(err) {
        if (err) return res.status(500).end();

        uids.map(function(uid) {
            this.stat.reset(uid);
        }.bind(this));
        res.json(uids.map(function(uid) {
            return this.stat.get(uid);
        }.bind(this)));
    }.bind(this));
};

/**
 * Stop processes, described by selector
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.stop = function(req, res) {
    var selector = req.param('selector');
    if (selector.indexOf(':') >= 0) {
        var stat = this.stat.get(selector);
        if (!stat) {
            return res.status(400).end('Invalid id: no process found');
        }
        if (!stat.pid) {
            return res.status(400).end('Process is not running');
        }
        return this.master.removeWorker(stat.id, function(err) {
            if (err) return res.status(400).end(err.message);
            res.json(this.stat.get(stat.uid));
        }.bind(this));
    }

    var type = selector != 'all' ? selector : null;
    var currentWorkers = this.master.getCurrentWorkersIds(type);
    var uids = currentWorkers.map(function(id) {
        return this.master.getWorker(id).uid;
    }.bind(this));
    this.master.removeAllWorkers(type, function(err) {
        if (err) return res.status(500).end();

        res.json(uids.map(function(uid) {
            return this.stat.get(uid);
        }.bind(this)));
    }.bind(this));
};

/**
 * Reset process statistics
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.reset = function(req, res) {
    var selector = req.param('selector');
    if (selector.indexOf(':') >= 0) {
        var stat = this.stat.get(selector);
        if (!stat) {
            return res.status(400).end('Invalid id: no process found');
        }
        if (!stat.pid) {
            return res.status(400).end('Process is not running');
        }
        this.stat.reset(stat.uid);
        return res.json(this.stat.get(stat.uid));
    }

    var type = selector != 'all' ? selector : null;
    var currentWorkers = this.master.getCurrentWorkersIds(type);
    var uids = currentWorkers.map(function(id) {
        return this.master.getWorker(id).uid;
    }.bind(this));
    res.json(uids.map(function(uid) {
        this.stat.reset(uid);
        return this.stat.get(uid);
    }.bind(this)));
};

/**
 * Reset process statistics
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
Api.prototype.remove = function(req, res) {
    var selector = req.param('selector');
    if (selector.indexOf(':') >= 0) {
        var stat = this.stat.get(selector);
        if (!stat) {
            return res.status(400).end('Invalid id: no process found');
        }
        if (stat.pid) {
            return res.status(400).end(
                'To remove, process should be stopped first'
            );
        }
        this.stat.remove(stat.uid);
        return res.json(this.stat.get());
    }

    var type = selector != 'all' ? selector : null;
    var allStat = this.stat.get();
    allStat.forEach(function(stat) {
        if (type == stat.type || stat.pid) {
            return;
        }

        this.stat.remove(stat.uid);
    }.bind(this));
    res.json(this.stat.get());
};

/**
 * Check secret specified in request
 *
 */
Api.prototype.checkSecret = function(req, res, next) {
    var secret = req.param('secret');
    if (secret != this.config.api.secret) {
        return res.status(403).end('Not allowed');
    }
    next();
};
