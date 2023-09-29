const { LocalStorage } = require('node-localstorage');
const fs = require('fs');
const StdRPC = require('stdrpc');
const Backoff = require('backo2');

const Zen = require('./zencfg');

const zencfg = Zen.getZenConfig();

const local = new LocalStorage('./config/local');
const cfg = {
  url: zencfg.url,
  ssl: {
    enabled: false,
  },
  username: zencfg.rpcuser,
  password: zencfg.rpcpassword,
};

const logtime = () => `${(new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')} UTC --`;
const rpcError = (err, txt, cb) => {
  // response data may be an object or string
  let msg;
  if (err.response && err.response.data) {
    if (typeof err.response.data === 'object') {
      msg = err.response.data.error.message;
      if (err.response.data.error.code === -28) {
        console.log(logtime(), `Zend: Waiting - ${msg}`);
        return cb(msg, 'starting');
      }
      console.log(logtime(), `ERROR zend ${txt}  ${msg}`);
    } else {
      msg = err.response.data;
      if (msg.indexOf('depth') !== -1) {
        console.log(logtime(), `ERROR zend rpc issue:  ${msg}`);
        return cb(msg, 'queue');
      }
      console.log(logtime(), `ERROR zend ${txt}  ${msg}`);
    }
  } else {
    console.log(logtime(), `ERROR zend ${txt}`);
  }

  console.error(logtime(), err.message);
  return cb(err.message);
};

// config
const savedCfg = local.getItem('statscfg');
const statCfg = {};
if (savedCfg) {
  const scfg = JSON.parse(savedCfg);
  Object.assign(statCfg, scfg);
} else {
  statCfg.statsAckBackoff = {
    min: 12000,
    max: 120000,
    jitter: 0.800000,
  };
  statCfg.statsAckTimeout = 6000;
  statCfg.statsInterval = 360000;
  statCfg.statsRetryMax = 3;
}

class SNode {
  constructor(rpc, cfgzen) {
    this.rpc = rpc;
    this.zencfg = cfgzen;
    this.statsCfg = statCfg;
    this.statsTimer = null;
    this.statsTimerRunning = false;
    this.statsAckTimer = null;
    this.statsRetryCount = 0;
    this.statsRetryTimer = null;
    this.statAckBackoff = new Backoff(this.statsCfg.statsAckBackoff);
    this.statsLoop = () => {
      this.collectStats();
    };
    this.statsLastSentTime = null;
    this.configcount = 0;
    this.queueCount = 0;
    this.waiting = false;
    this.zenDownInterval = 1000 * 60;
    this.zenDownTimer = null;
    this.zenDownLoop = () => {
      this.checkZen();
    };
    this.mem = {};
  }

  static auto() {
    const rpc = new StdRPC(cfg);
    return new SNode(rpc, zencfg);
  }

  initialize() {
    this.statsTimer = setInterval(this.statsLoop, this.statsCfg.statsInterval);
    this.statsTimerRunning = true;
  }

  restartStatTimer(statconfig) {
    const self = this;
    self.statsCfg = statconfig;
    console.log(logtime(), `Stat Interval changed to ${statconfig.statsInterval}ms`);
    clearTimeout(self.statsTimer);
    self.initialize();
  }

  ackStats() {
    const self = this;
    clearTimeout(self.statsAckTimer);
    clearTimeout(self.statsRetryTimer);
    self.statAckBackoff.reset();
    if (!self.statsTimerRunning) self.initialize();
  }

  checkZen() {
    const self = this;
    self.getPrimaryAddress((err) => {
      if (err) return;
      console.log(logtime(), 'Zen connected.');
      clearInterval(self.zenDownTimer);
      self.collectStats();
    });
  }

  getPrimaryAddress(cb) {
    const self = this;
    self.rpc.getaddressesbyaccount('')
      .then((data) => {
        self.waiting = false;
        return cb(null, data[0]);
      })
      .catch((err) => rpcError(err, 'get t-address', cb));
  }

  getConfig(req, trkver, hw, nodejs, platform) {
    const self = this;
    self.rpc.getinfo()
      .then((data) => {
        if (data.error) {
          console.log(logtime(), 'ERROR getConfig unable to get data from zend');
          console.error(logtime(), data.error);
          return;
        }
        const node = {
          version: data.version,
          protocolversion: data.protocolversion,
          'wallet.version': data.walletversion,
        };
        if (!self.ident.nid && req.nid) self.ident.nid = req.nid;

        const config = {
          node, trkver, hw, mem: self.mem, nodejs, platform,
        };
        config.statsInterval = self.statsCfg.statsInterval;
        self.socket.emit('node', { type: 'config', ident: self.ident, config });
      })
      .catch((err) => rpcError(err, 'get config', () => { }));
  }

  collectStats() {
    const self = this;
    if (!self.socket.connected || self.waiting || !self.ident) return;
    if (!self.ident.nid) {
      console.log(logtime(), 'Unable to collect stats without a nodeid.');
      return;
    }

    self.getStats((err, stats) => {
      if (err) {
        console.log(logtime(), `Stat check unable to complete. ${err}`);
        if (self.ident) {
          self.socket.emit('node', { type: 'down', ident: self.ident });
        }
        if (!self.zenDownTimer) self.zenDownTimer = setInterval(self.zenDownLoop, self.zenDownInterval);
      } else {
        if (self.zenDownTimer) clearInterval(self.zenDownTimer);
        const stats2 = { ...stats };
        let display = '';
        Object.entries(stats2).forEach((s) => {
          display += `${s[0]}:${s[1]}  `;
        });
        const reply = {
          type: 'stats',
          stats: stats2,
          ident: self.ident,
          sots: self.socketOptions.ts,
          scts: self.statsCfg.ts,
          gts: self.genCfg.ts,
        };
        self.socket.emit('node', reply);
        self.statsLastSentTime = (new Date()).getTime();
        self.statsAckTimer = setTimeout(() => { self.missedStatsAck(); }, self.statsCfg.statsAckTimeout);
        console.log(logtime(), `Stat check: server:${self.ident.con.cur} ${display}`);
      }
    });
  }

  missedStatsAck() {
    const self = this;
    self.statsRetryCount += 1;
    if (self.statAckBackoff.attempts === 0) self.statAckBackoff.attempts = 1;
    if (self.statsRetryCount > self.statsCfg.statsRetryMax) {
      console.log(logtime(), `Stat check: no response from server count: ${self.statsRetryCount}. Reconnecting.`);
      self.statsRetryCount = 0;
      self.resetSocket('no stat check response from server');
    } else {
      clearTimeout(self.statsTimer);
      self.statsTimerRunning = false;
      const timeout = self.statAckBackoff.duration();
      self.statsRetryTimer = setTimeout(() => { self.collectStats(); }, timeout);
      const msg = self.statsRetryCount > self.statsCfg.statsRetryMax ? '' : `in ${(timeout / 1000).toFixed(0)}s`;
      console.log(logtime(), `Stat check: no response from server count: ${self.statsRetryCount}.`
        + ` Retry ${msg}`);
    }
  }

  getStats(cb) {
    const self = this;
    if (self.waiting) return cb('Waiting for zend');
    return self.rpc.getinfo()
      .then((data) => {
        // leave queueDepth and lastExecSec for server compatibility
        const stats = {
          blocks: data.blocks,
          peers: data.connections,
          queueDepth: 0,
          lastExecSec: 0,
        };

        if (self.ident) {
          return cb(null, stats);
        }
        return cb('ident not set');
      })
      .catch((err) => rpcError(err, 'get stats', cb));
  }

  getNetworks(req, cb) {
    const self = this;
    self.rpc.getnetworkinfo()
      .then((data) => {
        const nets = data.localaddresses;
        if (req) {
          if (!self.ident.nid && req.nid) self.ident.nid = req.nid;
          self.socket.emit('node', { type: 'networks', ident: self.ident, nets });
        } else {
          cb(null, nets);
        }
      })
      .catch((err) => rpcError(err, 'get networks', cb));
  }

  getTLSPeers(cb) {
    const self = this;
    return self.rpc.getpeerinfo()
      .then((data) => {
        const peers = [];
        for (let i = 0; i < data.length; i += 1) {
          const p = data[i];
          if (p.inbound === false) {
            const ip = p.addr.indexOf(']') !== -1
              ? p.addr.substr(1, p.addr.indexOf(']') - 1)
              : p.addr.substr(0, p.addr.indexOf(':'));
            const peer = { ip, tls: p.tls_verified };
            peers.push(peer);
          }
        }
        cb(null, peers);
      })
      .catch((err) => {
        console.log(logtime(), 'ERROR: getTLSPeers  unable to get data from zend');
        console.error(logtime(), 'getTLSPeers', err.message);
        return cb(err.message);
      });
  }

  getBlockHeight(setLast) {
    const self = this;
    self.rpc.getinfo()
      .then((data) => {
        if (setLast) local.setItem('lastChalBlock', data.blocks);
        return data.blocks;
      })
      .catch((err) => rpcError(err, 'get blockheight', () => { }));
  }

  getProcMeminfo(display, save) {
    const self = this;
    fs.readFile('/proc/meminfo', (err, meminfo) => {
      if (err) {
        return console.log(logtime(), 'Unable to get meminfo');
      }
      return self.formatProcMeminfo(meminfo, display, save);
    });
  }

  formatProcMeminfo(meminfo, display, save) {
    const self = this;
    const lines = meminfo.toString().split('\n');
    let disp = '';
    const data = {};
    const toGb = 1000 * 1024;

    lines.forEach((line) => {
      const row = line.split(':');
      const item = row[0];
      if (item === 'MemTotal'
        || item === 'MemFree'
        || item === 'MemAvailable'
        || item === 'SwapTotal'
        || item === 'SwapFree') {
        const num = parseInt(row[1].trim().split(' ')[0], 10);
        if (display) {
          disp += `${item}: ${(num / toGb).toFixed(2)}GB  `;
        }
        const key = item.toLowerCase();
        data[key] = Number((num / toGb).toFixed(2));
      }
    });
    data.units = 'GB';
    if (save) {
      self.mem = data;
    }
    if (display) console.log(disp);
    return data;
  }
}

module.exports = SNode;
