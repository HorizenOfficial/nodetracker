
const { LocalStorage } = require('node-localstorage');
const fs = require('fs');
const StdRPC = require('stdrpc');
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

const os = process.platform;
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


class SNode {
  constructor(rpc, cfgzen) {
    this.rpc = rpc;
    this.zencfg = cfgzen;
    this.statsInterval = 1000 * 60 * 6;
    this.statsTimer = null;
    this.statsLoop = () => {
      this.collectStats();
    };
    this.configcount = 0;
    this.chalStart = null;
    this.chalRunning = false;
    this.queueCount = 0;
    this.opTimer = null;
    this.opTimerInterval = 1000 * 2;
    this.amt = 0.0001;
    this.fee = 0.0001;
    this.minChalBal = 0.001;
    this.defaultMemTime = 45;
    this.memBefore = {};
    this.memNearEnd = {};
    this.waiting = false;
    this.zenDownInterval = 1000 * 61;
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
    this.statsTimer = setInterval(this.statsLoop, this.statsInterval);
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
      .catch(err => rpcError(err, 'get t-address', cb));
  }

  getAddrWithBal(cb) {
    const self = this;
    const lastChalBlockNum = local.getItem('lastChalBlock');
    const results = {};
    self.rpc.getinfo()
      .then((data) => {
        let valid = true;
        if (lastChalBlockNum && data.blocks - parseInt(lastChalBlockNum, 10) < 5) valid = false;
        return valid;
      })
      .then((valid) => {
        results.valid = valid;
        return self.rpc.z_listaddresses();
      })
      .then((addrs) => {
        if (addrs.length === 0) {
          console.log('No private address found. Please create one using \'zen_cli z_getnewaddress\' and send at least 0.04 ZEN for challenges split into 4 or more transactions');
          return cb(null);
        }
        const bals = [];

        return Promise.all(addrs.map(async (addr) => {
          bals.push({ addr, bal: await self.rpc.z_getbalance(addr) });
        }))
          .then(() => {
            let obj;
            if (bals.length > 0) {
              for (let i = 0; i < bals.length; i += 1) {
                const zaddr = bals[i];
                if (zaddr.bal && zaddr.bal > self.minChalBal) {
                  obj = {
                    addr: zaddr.addr,
                    bal: zaddr.bal,
                    valid: results.valid,
                    lastChalBlock: lastChalBlockNum,
                  };
                  break;
                }
              }
            }
            if (obj) return cb(null, obj);
            return cb('Unable to get z-addr balance');
          });
      })
      .catch(err => rpcError(err, 'get addrwithbalance', cb));
  }

  execChallenge(chal) {
    const self = this;
    console.log(logtime(), `Start challenge ${chal.crid}`);

    if (self.chalRunning) {
      const resp = { crid: chal.crid, status: 'error', error: `Previous challenge still running.  ${self.crid}` };
      resp.ident = self.ident;
      self.socket.emit('chalresp', resp);
      console.log(logtime(), `Challenge ${self.crid} is currently running. Failed ${chal.crid}`);
      return;
    }

    if (os === 'linux') self.memBefore = self.getProcMeminfo(false);
    self.crid = chal.crid;
    self.rpc.getblockhash(chal.blocknum)
      .then((hash) => {
        self.queueCount = 0;
        if (self.zenDownTimer) clearInterval(self.zenDownTimer);
        self.rpc.getblock(hash)
          .then((block) => {
            const msgBuff = new Buffer.from(block.merkleroot);
            const amts = [{ address: chal.sendto, amount: self.amt, memo: msgBuff.toString('hex') }];

            self.getAddrWithBal((err, result) => {
              if (err) {
                const resp = { crid: chal.crid, status: 'error', error: err };
                resp.ident = self.ident;
                self.socket.emit('chalresp', resp);
                console.log(logtime(), `Challenge ${self.crid} was unable to complete due to ${err}`);
                return;
              }

              const zaddr = result.addr;
              if (result.bal === 0) {
                console.log(logtime(), 'Challenge private address balance is 0 at the moment. Cannot perform challenge');
              }
              console.log(`Using ${zaddr} for challenge. bal=${result.bal}`);
              if (zaddr && result.bal > 0) {
                self.rpc.z_sendmany(zaddr, amts, 1, self.fee)
                  .then((opid) => {
                    console.log(`OperationId=${opid}`);
                    self.chalStart = new Date();
                    self.chalRunning = true;
                    self.opTimer = setInterval(() => {
                      self.checkOp(opid, chal);
                    }, self.opTimerInterval);
                  })
                  .catch((error) => {
                    const resp = { crid: chal.crid, status: 'error', error: 'unable to create transaction' };
                    resp.ident = self.ident;
                    console.log(logtime(), 'ERROR Challenge: unable to create and send transaction.');
                    console.error(logtime(), error);
                    self.socket.emit('chalresp', resp);
                  });
              } else {
                const resp = { crid: chal.crid, status: 'error', error: 'no available balance found or 0' };
                resp.ident = self.ident;
                console.log(logtime(), 'Challenge: unable to find address with balance or balance 0.');
                self.socket.emit('chalresp', resp);
              }
            });
          });
      })
      .catch(err => rpcError(err, 'get block hash for challenge', (errmsg, errtype) => {
        const resp = { crid: chal.crid, status: 'failed' };
        if (errtype && errtype === 'starting') {
          resp.error = errmsg;
        } else {
          resp.error = 'could not get block hash from zend';
        }
        self.chalRunning = false;
        resp.ident = self.ident;
        self.socket.emit('chalresp', resp);
        console.log(logtime(), `ERROR: challenge failing challenge id ${chal.crid} block ${chal.blocknum}`);
        // console.error(logtime(), error);
        if (!self.zenDownTimer) {
          self.zenDownTimer = setInterval(self.zenDownLoop, self.zenDownInterval);
        }
      }));
  }

  async checkOp(opid, chal) {
    const self = this;
    if (!self.chalRunning) {
      console.log(logtime(), 'Clearing timer');
      clearInterval(self.opTimer);
      return;
    }
    if (self.queueCount > 0) return;
    self.queueCount += 1;
    await self.rpc.z_getoperationstatus([opid])
      .then((operation) => {
        self.queueCount -= 1;
        const elapsed = (((new Date()) - self.chalStart) / 1000).toFixed(0);
        if (operation.length === 0) {
          if (elapsed < 12) return;
          // if here then operation lost or unavailable.
          self.chalRunning = false;
          const resp = { crid: chal.crid, status: 'failed', error: 'No operation found.' };
          resp.ident = self.ident;
          self.socket.emit('chalresp', resp);
          console.log(logtime(), 'Challenge submit: failed. Could not find zen operation.');
          console.log(logtime(), 'Clearing timer');
          clearInterval(self.opTimer);
          return;
        }

        const op = operation[0];
        if (elapsed % 10 === 0) console.log(logtime(), `Elapsed challenge time=${elapsed}  status=${op.status}`);
        if (op.status === 'success') {
          console.log(logtime(), `Challenge submit: ${op.status}`);
          const resp = {
            crid: chal.crid,
            status: op.status,
            txid: op.result.txid,
            execSeconds: op.execution_secs,
            created: op.creation_time,
          };
          if (os === 'linux') {
            resp.memBefore = self.memBefore;
            resp.memNearEnd = self.memNearEnd;
          }
          console.log(logtime(), `Challenge result:${op.status} seconds:${op.execution_secs}`);
          resp.ident = self.ident;
          self.chalRunning = false;
          self.socket.emit('chalresp', resp);
          local.setItem('lastExecSec', (op.execution_secs).toFixed(2));
          self.getBlockHeight(true);
          self.queueCount = 0;

          // clear the operation from queue
          self.rpc.z_getoperationresult([opid])
            .catch((err) => {
              console.log(logtime(), 'ERROR getoperationresult unable to get data from zend');
              console.error(logtime(), err.message, err.response.data);
            });
        } else if (op.status === 'failed') {
          console.log(logtime(), `Challenge result:${op.status}`);
          console.log(logtime(), op.error.message);

          const resp = { crid: chal.crid, status: op.status, error: op.error.message };
          self.chalRunning = false;
          resp.ident = self.ident;
          self.socket.emit('chalresp', resp);
          self.queueCount = 0;

          // clear the operation from queue
          self.rpc.z_getoperationresult([opid])
            .catch((err) => {
              console.log(logtime(), 'ERROR getoperationresult  unable to get data from zend');
              console.error(logtime(), err.message, err.response.data);
            });
        } else if (os === 'linux' && op.status === 'executing') {
          const last = local.getItem('lastExecSec') || self.defaultMemTime;
          if (last - elapsed < 12) {
            self.memNearEnd = self.getProcMeminfo(false);
          }
        }
      })
      .catch(err => rpcError(err, 'get operation status', (errmsg, errtype) => {
        if (errtype && errtype === 'queue') {
          console.log(logtime(), 'ERROR: challenge - waiting for room in work queue');
          return;
        }
        const resp = { crid: chal.crid, status: 'failed', error: 'could not get challenge operation status' };
        self.chalRunning = false;
        resp.ident = self.ident;
        self.socket.emit('chalresp', resp);
        console.log(logtime(), `ERROR: challenge failing challenge id ${chal.crid} block ${chal.blocknum}`);
        self.queueCount = 0;

        if (!self.zenDownTimer) {
          self.zenDownTimer = setInterval(self.zenDownLoop, self.zenDownInterval);
        }
      }));
  }

  getConfig(req, trkver, hw, nodejs, platform) {
    //   node version,  trkver, and hw
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
        self.socket.emit('node', { type: 'config', ident: self.ident, config });
      })
      .catch(err => rpcError(err, 'get config', () => { }));
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
        self.getTLSPeers((error, tlsPeers) => {
          if (error) console.log(logtime(), `Unable to get peers from zen. ${error}`);
          const stats2 = Object.assign({}, stats);
          let display = '';
          Object.entries(stats2).forEach((s) => {
            if (s !== 'tlsPeers') display += `${s[0]}:${s[1]}  `;
          });
          stats2.tlsPeers = tlsPeers;
          self.socket.emit('node', { type: 'stats', stats: stats2, ident: self.ident });
          console.log(logtime(), `Stat check: connected to:${self.ident.con.cur} ${display}`);
        });
      }
    });
  }

  getStats(cb) {
    const self = this;
    if (self.waiting) return cb('Waiting for zend');
    return self.rpc.getinfo()
      .then((data) => {
        self.rpc.z_getoperationstatus()
          .then((ops) => {
            let count = 0;
            for (let i = 0; i < ops.length; i += 1) {
              count += ops[i].status === 'queued' ? 1 : 0;
            }
            self.getAddrWithBal((err, addrBal) => {
              if (err) return cb(err);
              const stats = {
                blocks: data.blocks,
                peers: data.connections,
                bal: addrBal.bal,
                isValidBal: addrBal.valid,
                queueDepth: count,
                lastChalBlock: addrBal.lastChalBlock,
                lastExecSec: local.getItem('lastExecSec'),
              };

              if (addrBal.bal < self.minChalBal && addrBal.valid) {
                console.log(logtime(), `Low challenge balance. ${addrBal.bal}`);
              }
              if (self.ident) {
                return cb(null, stats);
              }
              return cb('ident not set');
            });
          });
      })
      .catch(err => rpcError(err, 'get stats', cb));
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
      .catch((err) => {
        console.log(logtime(), 'ERROR: getNetworks  unable to get data from zend');
        console.error(logtime(), err.message, err.response.data);
        return cb(err.message);
      });
  }

  getTLSPeers(cb) {
    const self = this;
    return self.rpc.getpeerinfo()
      .then((data) => {
        const peers = [];
        for (let i = 0; i < data.length; i += 1) {
          const p = data[i];
          if (p.inbound === false) {
            const ip = p.addr.indexOf(']') !== -1 ? p.addr.substr(1, p.addr.indexOf(']') - 1) : p.addr.substr(0, p.addr.indexOf(':'));
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
      .catch(err => rpcError(err, 'get blockheight', () => { }));
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
