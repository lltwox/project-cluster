project-cluster
===============
`project-cluster` is process manager for complex node apps with more than one type of process.

## Why
It is so easy and fun to create web services in nodejs, that very soon after first service is created, next one follows. In addition to simple web interface worker, comes a background worker sending emails from queue, cron worker adding tasks to calculate staticstics and many others. At some point managing these services may become complicated. While such great tools as [forever](https://github.com/nodejitsu/forever) and [pm2](https://github.com/unitech/pm2) may help you with running services in production, managing them can be tough, especially in multi-server set-up. This is where `project-cluster` comes in play. It helps you to keep track, update, restart and monitor running processes. All of them. In one place.

## Features
- Support for multiple services.
- Zero-time reloading.
- Rest API for cluster monitoring and management. Easily integrated into your deployment process.
- Command line util for cluster monitoring and management. Handy for hands-on management.
- Monitoring of errors and warnings in services.

## Quick example
Install it
```
npm install --save project-cluster
```
And use it
```js
var cluster = Cluster.create({
    config: {
        // let's add 4 api workers and 2 bg
        apps: {
            api: 4,
            bg: 2
        }
    },
    // define method to create our workers
    start: function(type, callback) {
        require('./apps/' + type); // ./apps/api.js is api worker
                                   // ./apps/bg.js is email-sender
        callback();
    }
});
cluster.start();
```

## How to use
`project-cluster` module exports single method - `create(options)`. Possible options are:

- `config` - config object for cluster, for details, see next section. Optional.
- `start` - `function([type,] callback)` function, that will create new apps. Required.
    + `type` is name, that used to describe service to start. Based on that name we can start different types of workers.
    + `callback(err[, app])` should be called when worker start procedure is finished. If `app` param is given it will be used in `stop`
- `stop` - `function([app,] callback)` - function, that will be called for worker's gracefull shutdown.
    + `app` is object, passed with start callback. If none was given, it wll be omitter (only callback will be present)
    + `callback()` should be called, when worker is shut down

`create` function returns instance of appropriate Process object (Worker or Master).

### process.start()
Starts process. Master process will start spawning all needed children, worker process will invoke `start` function to create worker. After all workers is forked, `start` event will be emitted.

### process.stop()
Stops process. Master will wait for all workers to shutdown, workers will invoke `stop` function to gracefully shutdown. After all workers are shut down and disconnected, `stop` event will be emitted.

### process.isMaster(), process.isWorker()
Returns role of the process.

### master.addWorker(type, callback)
Adds new worker with given type. `callback(err, workerId)` is invoked when worker is up and running. `workerId` is generated by nodejs `cluster` module can be used to controll worker later. `worker.start` is emitted with Worker object as parameter, when worker is ready.

### master.removeWorker(id, callback)
Removes running worker. `callback(err)` is invoked when worker has disconnected and exited. If worker does not exit in configured timeout, it is focefully killed. `worker.start` is emitted with Worker object as parameter, when worker has exitted.

### master.restartWorker(id, callback)
Restarts running worker, which is actually add new one with the same type and remove the old one. `callback(err, newWorkerId)` is invoked when new one is up and running and old one has died. `newWorkerId` is regenerated id for this worker.

### master.removeAllWorkers([type,] callback)
Removes all workers or workers of given type, if specified.

### master.restartAllWorkers([type,] callback)
Restarts all workers or workers of given type, if specified.

## Available configuration and default values

```js
{
    // Base name for process (affects `ps aux` results)
    name: 'clustered-app',
    // Log settings. By default `project-logger` module is used for logging.
    // `false` value will disable logging. User defined
    // `function(message, severity)` can be given as a value.
    log: {
        'name': 'cluster'
    },
    // Setting for rest api. Command line util also uses this api
    // If you enable api, make sure it is properly secured (iptables,
    // http-auth, something better).
    api: {
        // Whether api is enabled
        enabled: true,
        // Host and port to run http server on
        host: '127.0.0.1',
        port: 8887
    },

    // Timeouts for worker management.
    timeout: {
        // Time, given for worker to start.  If worker does not start
        // in given time, it is removed and  error is returned.
        start: 5000,
        // Time, given for worker to shutdown. If it runs out,
        // worker is forcefully killed.
        kill: 5000,
        // Time to wait before crashed worker should be restarted.
        restart: 2000
    },
    // There are two suppoerted ways to spawn new processes: `cluster` and
    // `child`. First one forks all processes, using node's cluster module. 
    // It allows for all processes to share ports, if needed. Second way
    // uses child_process' fork – a better options, when you don't need 
    // shared ports.
    spawn: 'cluster',
    // Hash of apps, that should be added at the start.
    // Each key is type of the app, value is number of workers to add.
    // If -1 is specified, there will be same number of workers as
    // number of cores in cpu.
    apps: {}
};
```

## Rest API, Command line util, Under the hood
TODO at the moment.

## Contributing
Found a bug, have a feature proposal or want to add a pull request? All are welcome. Just go to issues and write it down.