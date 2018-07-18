// const { LocalStorage } = require('node-localstorage');
const jsonfile = require('jsonfile');
const io = require('socket.io-client');
const os = require('os');
const SNode = require('./SNodeTracker').auto();
const pkg = require('./package.json');
const init = require('./init');
const configuration = require('./config/config');

const file = './config/config.json';

// const local = new LocalStorage('./config');
// check if setup was run
if (!configuration) {
  console.log('Please run setup: node setup');
  process.exit();
}


const nodetype = configuration.active;
const config = configuration[nodetype];

if (config.ipv === '6') {
  console.log('You setup ipv6 connectivity. We need to apply a workaround for dns resolution.');
  require('./ipv6-dns-workaround');
}

const logtime = () => `${(new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')} UTC --`;

const saveConfig = (key, value) => {
  config[key] = value;
  configuration[nodetype] = config;
  jsonfile.writeFile(file, configuration, { spaces: 1 }, (err) => {
    if (err) {
      console.error(err);
      console.log(logtime(), `Could not save ${key}=${value}`, err);
    }
    console.log(logtime(), `Saved ${key}=${value}`);
  });
};

// host names without domain
let { servers } = config;
let home = (config.home).trim();
if (!home) {
  console.log('ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue.');
  process.exit();
}

console.log('STARTING NODETRACKER');
let curIdx = servers.indexOf(home);
let curServer = home;
const protocol = `${init.protocol}://`;
const domain = `.${init.domain}`;

let socket = io(protocol + curServer + domain, { multiplex: false });
let failoverTimer;

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


let initTimer;
let returningHome = false;
// const errmsg = 'Unable to connect to zend. Please check the zen rpc settings and ensure zend is running';

const initialize = () => {
  // check connectivity by getting the t_address.
  // pass identity to server on success
  SNode.getPrimaryAddress((err, taddr) => {
    if (err) {
      // console.log(errmsg);
      if (!initTimer) {
        initTimer = setInterval(() => {
          initialize();
        }, 10000);
      }
    } else {
      if (initTimer) clearInterval(initTimer);

      ident.taddr = taddr;
      console.log(`Node t_address (not for stake)=${taddr}`);
      SNode.ident = ident;
      console.log('Checking private z-addresses...');
      SNode.getAddrWithBal((error, result) => {
        if (error) {
          console.error(error);
          return;
        }

        if (result.bal === 0 && result.valid) {
          console.log('Challenge private address balance is 0');
          console.log('Please add a total of 0.04 zen to the private address by sending 4 or more transactions.');

          if (!nodeid) {
            console.log(result.addr);
            console.log('Unable to register node. Exiting.');
            process.exit();
          }
        } else {
          console.log(`Balance for challenge transactions is ${result.bal}`);
          if (result.bal < 0.01 && result.valid) {
            console.log('Challenge private address balance getting low');
            console.log('Please send a few small amounts (0.02 each) to the private address below');
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
  socket = io.connect(protocol + curServer + domain);
  setSocketEvents();
  SNode.socket = socket;
  ident.con.cur = curServer;
};

const changeHome = (server) => {
  home = server;
  saveConfig('home', server);
  curServer = home;
  curIdx = servers.indexOf(home);
  returningHome = true;
  console.log(logtime(), `Change home server to ${curServer}.`);
  socket.close();
  ident.con.home = home;
  ident.con.cur = curServer;

  socket = io(protocol + curServer + domain, { forceNew: true });
  setSocketEvents();
  SNode.socket = socket;
  returningHome = false;
};

const setSocketEvents = () => {
  socket.on('connect', () => {
    console.log(logtime(), `Connected to server ${curServer}. Initializing...`);
    initialize();
    if (failoverTimer) clearInterval(failoverTimer);
  });

  socket.on('disconnect', () => {
    if (!returningHome) {
      console.log(logtime(), `No connection to ${curServer}`);
    }
    failoverTimer = setInterval(() => {
      switchServer();
    }, 70000);
  });

  socket.on('returnhome', () => {
    curServer = home;
    curIdx = servers.indexOf(home);
    returningHome = true;
    console.log(logtime(), `Returning to home server ${curServer}.`);
    socket.close();
    socket = io(protocol + curServer + domain, { forceNew: true });
    setSocketEvents();
    SNode.socket = socket;
    ident.con.cur = curServer;
    returningHome = false;
  });

  socket.on('reconnect', () => {
    console.log(logtime(), 'Server send reconnect.');
    socket.close();
    socket = io(protocol + curServer + domain, { forceNew: true });
    setSocketEvents();
    SNode.socket = socket;
  });

  socket.on('msg', (msg) => {
    console.log(logtime(), msg);
  });

  socket.on('action', (data) => {
    switch (data.action) {
      case 'set nid':
        saveConfig('nodeid', data.nid);
        break;

      case 'get stats':
        SNode.getStats((err, stats) => {
          if (err) {
            if (ident) {
              socket.emit('node', { type: 'down', ident });
            }
          } else {
            socket.emit('node', { type: 'stats', stats, ident });
          }
        });
        console.log(logtime(), 'Stats: send initial stats.');
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
        saveConfig('servers', servers);
        console.log(logtime(), 'Updated server list');
        break;
      default:
      // no default
    }
  });
};
setSocketEvents();

const conCheck = () => {
  setInterval(() => {
    if (!socket.connected) {
      console.log(logtime(), `No connection to server ${curServer}. Retry.`);
      if (!failoverTimer) {
        failoverTimer = setInterval(() => {
          switchServer();
        }, 61000);
      }
    }
  }, 30000);
};

SNode.socket = socket;
SNode.initialize();
conCheck();
