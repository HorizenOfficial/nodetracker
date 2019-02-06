const fs = require('fs');
const { LocalStorage } = require('node-localstorage');
const jsonfile = require('jsonfile');
const io = require('socket.io-client');
const os = require('os');
const SNode = require('./SNodeTracker').auto();
const pkg = require('./package.json');
const init = require('./init');
const configuration = require('./config/config');

const file = './config/config.json';

const local = new LocalStorage('./config/local');
// check if setup was run
if (!configuration) {
  console.log('Please run setup: node setup');
  process.exit();
}

// get user settings
const nodetype = configuration.active;
const config = configuration[nodetype];

// get general app settings
const savedSettings = local.getItem('gensettings');
let genCfg = {};
const defaultInterval = 30000;

// get saved or set defaults. can be updated from server
if (savedSettings) {
  const cfg = JSON.parse(savedSettings);
  Object.assign(genCfg, cfg);
} else {
  genCfg.initInterval = 20000;
  genCfg.conCheckInterval = 30000;
  genCfg.failoverInterval = 70000;
  genCfg.checkIn = {
    enabled: false,
    timeout: 5000,
    max: 2,
  };
  local.setItem('gensettings', JSON.stringify(genCfg));
}
SNode.genCfg = genCfg;

if (config.ipv === '6') {
  console.log('You setup ipv6 connectivity. We need to apply a workaround for dns resolution.');
  require('./ipv6-dns-workaround');
}

const logtime = () => `${(new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')} UTC --`;
const isEmpty = (obj) => {
  if (Object.entries(obj).length > 0) return false;
  return true;
};

const saveConfig = (key, value) => {
  config[key] = value;
  configuration[nodetype] = config;
  if (isEmpty(configuration)) {
    console.log(logtime(), `Could not save ${key}=${value}, configuration is empty.`);
    return;
  }
  fs.copyFile(file, `${file}.BACK`, () => {
    jsonfile.writeFile(file, configuration, { spaces: 1 }, (err) => {
      if (err) {
        console.error(err);
        console.log(logtime(), `Could not save ${key}=${value}`, err);
      }
      console.log(logtime(), `Saved ${key}=${value}`);
    });
  });
};

// socket latency
let pongCount = 0;
let latencies = [];
const latencyReset = 20;

// host names without domain
let { servers } = config;
let home = (config.home).trim();
if (!home) {
  console.log('ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue.');
  process.exit();
}

console.log(logtime(), 'STARTING NODETRACKER');
let curIdx = servers.indexOf(home);
let curServer = home;
let protocol = `${init.protocol}://`;
let domain = `.${init.domain}`;
if (process.env.DEV) {
  protocol = process.env.DEV_PROTOCOL;
  domain = process.env.DEV_DOMAIN;
}

let failoverTimer = null;
let conCheckTimer = null;
let returningHome = false;
let checkInsMissed = 0;

// get cpu config
const cpus = os.cpus();
console.log(`CPU ${cpus[0].model} count=${cpus.length} speed=${cpus[0].speed}`);
const hw = { CPU: cpus[0].model, cores: cpus.length, speed: cpus[0].speed };

// platform
const { platform } = process;

// check memory
if (platform === 'linux') {
  SNode.getProcMeminfo(true, true);
} else {
  const memtotal = os.totalmem() / (1000 * 1000 * 1024);
  const memfree = os.freemem() / (1000 * 1000 * 1024);
  SNode.mem.memtotal = Number(memtotal.toFixed(1));
  SNode.mem.memfree = Number(memfree.toFixed(1));
  SNode.mem.units = 'GB';
  console.log(`Total memory=${memtotal.toFixed(1)}GB  free memory=${memfree.toFixed(1)}GB`);
}

// node version
const nodejs = process.version;
console.log(`Node.js version: ${nodejs}`);

// self version
const trkver = pkg.version;
console.log(`Tracker app version: ${trkver}`);

// node type
console.log(`Node type: ${nodetype}`);

// gather identity
const nodeid = config.nodeid || null;
const fqdn = config.fqdn.trim() || null;
const stkaddr = config.stakeaddr.trim();
const ident = { nid: nodeid, stkaddr, fqdn };
ident.con = { home, cur: curServer };

if (nodeid) console.log(`Node Id: ${nodeid}`);

// add zend info to ident to send to server
ident.zend = {
  zip4: SNode.zencfg.zip4,
  zip6: SNode.zencfg.zip6,
  port: SNode.zencfg.port,
};

// optional category
let cat = config.category;
if (cat) {
  cat = cat.trim();
  ident.cat = cat;
}

// connection options
const socketOptions = {};
const savedOpts = local.getItem('socketoptions');
if (savedOpts) {
  const opts = JSON.parse(savedOpts);
  Object.assign(socketOptions, opts);
} else {
  // defaults
  socketOptions.transports = ['websocket'];
  socketOptions.reconnectionDelay = 30000;
  socketOptions.reconnectionDelayMax = 60000;
  socketOptions.randomizationFactor = 0.8;
}
let socket = io(protocol + curServer + domain, socketOptions);

const initialize = () => {
  // check connectivity by getting the t_address.
  // pass identity to server on success
  console.log(logtime(), 'Checking t-address...');
  SNode.getPrimaryAddress((err, taddr) => {
    if (err) {
      setTimeout(() => {
        initialize();
      }, genCfg.initInterval || defaultInterval);
    } else {
      ident.taddr = taddr;
      console.log(`Node t_address (not for stake)=${taddr}`);
      SNode.ident = ident;
      console.log(logtime(), 'Checking private z-addresses...');
      SNode.getAddrWithBal((error, result) => {
        if (error || result === 'Unable to get a z-addr balance') {
          console.error(logtime(), error || result);
          setTimeout(() => {
            initialize();
          }, genCfg.initInterval || defaultInterval);
          return;
        }

        if (result.bal === 0 && result.valid) {
          console.log('Challenge private address balance is 0');
          console.log('Please send at least 0.02 zen to the private address split into 2 or more transactions.');

          if (!nodeid) {
            console.log(result.addr);
            console.log('Unable to register node. Exiting.');
            process.exit();
          }
        } else {
          console.log(`Balance for challenge transactions is ${result.bal}`);
          if (result.bal < 0.002 && result.valid) {
            console.log('Challenge private address balance getting low');
            console.log('Please send a few small amounts (0.01 each) to the private address below');
          }
        }

        console.log('Using the following address for challenges');
        console.log(result.addr);

        ident.email = config.email;
        SNode.getNetworks(null, (err2, nets) => {
          if (!err2) {
            ident.nets = nets;
            socket.emit('initnode', ident, () => {
              // only pass email and nets on init.
              delete ident.email;
              delete ident.nets;
            });
          }
        });
      });
    }
  });
};

const switchServer = (server) => {
  let nextIdx = 0;
  if (server) {
    nextIdx = servers.indexOf(server);
  } else {
    nextIdx = curIdx + 1 >= servers.length ? 0 : curIdx + 1;
  }
  curServer = servers[nextIdx];
  curIdx = nextIdx;
  console.log(logtime(), `Trying server: ${curServer}`);
  socket.close();
  ident.con.cur = curServer;
  socket = io(protocol + curServer + domain, socketOptions);
  SNode.socket = socket;
  setSocketEvents();
  local.setItem('curserver', curServer);
};

const changeHome = (server) => {
  home = server;
  saveConfig('home', server);
  const region = server.split('.')[1];
  if (config.region !== region) saveConfig('region', region);
  curServer = home;
  curIdx = servers.indexOf(home);
  returningHome = true;
  console.log(logtime(), `Change home server to ${curServer}.`);
  socket.close();
  ident.con.home = home;
  ident.con.cur = curServer;
  socket = io(protocol + curServer + domain, socketOptions);
  SNode.socket = socket;
  setSocketEvents();
  returningHome = false;
  local.setItem('curserver', curServer);
};

const returnHome = () => {
  curServer = home;
  curIdx = servers.indexOf(home);
  returningHome = true;
  console.log(logtime(), `Returning to home server ${curServer}.`);
  socket.close();
  ident.con.cur = curServer;
  socket = io(protocol + curServer + domain, socketOptions);
  SNode.socket = socket;
  setSocketEvents();
  returningHome = false;
  local.setItem('curserver', curServer);
};

const resetSocket = (msg) => {
  console.log(logtime(), `Reset connection  ${msg || ''}`);
  socket.close();
  socket = io(protocol + curServer + domain, socketOptions);
  SNode.socket = socket;
  setSocketEvents();
};

let dTime = new Date();
let rTime;

const getDiff = (dt) => {
  const diff = (new Date() - dt) / 1000;
  return `${diff.toFixed(1)} seconds`;
};

const setSocketEvents = () => {
  socket.on('connect', () => {
    console.log(logtime(), `Connected to server ${curServer}. Initializing...`);
    if (rTime) rTime = null;
    if (dTime) dTime = null;
    initialize();
    if (failoverTimer) clearInterval(failoverTimer);
  });

  socket.on('disconnect', () => {
    if (!returningHome) {
      console.log(logtime(), `Disconnected from ${curServer}. Retry at random intervals.`);
    }
    dTime = new Date();
    failoverTimer = setInterval(() => {
      switchServer();
    }, genCfg.failoverInterval || defaultInterval);
  });

  socket.on('returnhome', () => {
    returnHome();
  });

  socket.on('newconnection', (msg) => {
    resetSocket(msg);
  });

  socket.on('msg', (msg) => {
    console.log(logtime(), msg);
    // for backward compatibility until servers support 0.4.0
    if (msg.indexOf('Stats received') !== -1) {
      SNode.ackStats();
    }
  });

  socket.on('action', (data) => {
    let oldInterval;
    switch (data.action) {
      case 'set nid':
        saveConfig('nodeid', data.nid);
        break;

      case 'get stats':
        SNode.collectStats((err, stats) => {
          if (err) {
            if (ident) {
              socket.emit('node', { type: 'down', ident });
            }
          } else {
            socket.emit('node', {
              type: 'stats',
              stats,
              ident,
              req: true,
            });
          }
        });
        console.log(logtime(), 'Stats: send initial stats.');
        break;

      case 'get tlsPeers':
        SNode.getTLSPeers((err, tlsPeers) => {
          if (err) {
            if (ident) {
              socket.emit('node', { type: 'down', ident });
            }
          } else {
            socket.emit('node', { type: 'tlsPeers', tlsPeers, ident });
          }
        });
        console.log(logtime(), 'TLS Peers: sent list');
        break;

      case 'get config':
        SNode.getConfig(data, trkver, hw, nodejs, platform);
        break;

      case 'challenge':
        SNode.execChallenge(data.chal);
        break;

      case 'networks':
        SNode.getNets(data);
        break;

      case 'changeServer':
        switchServer(data.server);
        break;

      case 'changeHome':
        changeHome(data.server);
        break;

      case 'updateServers':
        servers = data.servers;
        curIdx = servers.indexOf(curServer);
        saveConfig('servers', servers);
        console.log(logtime(), 'Updated server list');
        break;

      case 'setSocketOpts':
        local.setItem('socketoptions', JSON.stringify(data.cfg));
        SNode.socketOptions = data.cfg;
        console.log(logtime(), 'Updated socketOptions');
        break;

      case 'setStatsCheck':
        local.setItem('statscfg', JSON.stringify(data.cfg));
        SNode.statsCfg = data.cfg;
        SNode.restartStatTimer(data.cfg);
        console.log(logtime(), 'Updated statCheck config');
        break;

      case 'setGenCfg':
        local.setItem('gensettings', JSON.stringify(data.cfg));
        oldInterval = genCfg.conCheckInterval;
        genCfg = data.cfg;
        if (data.cfg.conCheckInterval !== oldInterval) conCheck();
        SNode.genCfg = data.cfg;
        console.log(logtime(), 'Updated general settings');
        break;

      case 'statsAck':
        console.log(logtime(), `Stats received by ${data.server}`);
        SNode.ackStats();
        break;

      default:
      // no default
    }
  });
  socket.on('error', (err) => {
    if (!err.message === 'websocket error') {
      console.log(logtime(), `Socket.io ERROR:  ${err.message}`);
    }
  });

  socket.on('reconnect', (num) => {
    console.log(logtime(), 'Reconnect attempts', num, `${!rTime ? getDiff(dTime) : getDiff(rTime)}`);
    rTime = new Date();
  });

  socket.on('reconnect_error', (err) => {
    console.log(logtime(), `Reconnect ${err.message}`);
  });

  socket.on('pong', (latency) => {
    pongCount += 1;
    latencies.push(latency);
    if (pongCount >= latencyReset) {
      const sum = latencies.reduce((tot, val) => tot + val);
      const avg = (sum / pongCount).toFixed(0);
      console.log(logtime(), `Server response latency average (last ${pongCount}) ${avg}ms`);
      latencies = [];
      pongCount = 0;
    }
    if (!SNode.statsTimerRunning) {
      const interval = SNode.statsInterval + SNode.statsAckTimeout;
      if ((new Date()).getTime() - interval > SNode.statsLastSentTime) {
        console.log(logtime(), 'Restart statCheck timer');
        SNode.initialize();
      }
    }
  });

  socket.on('checkedIn', (srv) => {
    if (srv !== curServer) console.log(logtime(), `Actually connected to ${srv}`);
    checkInsMissed = 0;
  });
};
setSocketEvents();

const conCheck = () => {
  if (conCheckTimer) clearInterval(conCheckTimer);
  conCheckTimer = setInterval(() => {
    if (!socket.connected) {
      console.log(logtime(), `No connection to server ${curServer}.`);
      if (!failoverTimer) {
        failoverTimer = setInterval(() => {
          switchServer();
        }, genCfg.failoverInterval || defaultInterval);
      }
    } else if (genCfg.checkIn.enabled) {
      // application ping/pong
      checkInsMissed += 1;
      socket.emit('checkIn');
      setTimeout(() => {
        if (checkInsMissed >= genCfg.checkIn.max) {
          console.log(logtime(), 'Server does not appear to be responding. Resetting connection');
          resetSocket();
        }
      }, genCfg.checkIn.timeout);
    }
  }, genCfg.conCheckInterval || defaultInterval);
};

SNode.resetSocket = resetSocket;
SNode.socketOptions = socketOptions;
SNode.socket = socket;
SNode.initialize();
conCheck();
