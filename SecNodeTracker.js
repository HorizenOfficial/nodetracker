
const LocalStorage = require('node-localstorage').LocalStorage;
const local = new LocalStorage('./config');
const fs = require('fs');
const Client = require('bitcoin-core');
const Zcash = require('zcash');

let host = local.getItem('rpcallowip') || local.getItem('rpcbind');
if (!host) host = '127.0.0.1';

const cfg = {
    host: host,
    port: local.getItem('rpcport'),
    ssl: {
        enabled: false
    },
    username: local.getItem('rpcuser'),
    password: local.getItem('rpcpassword'),
    hostname: local.getItem('rpcbind'),
}

const errmsg = "Unable to connect to zend. Please check the zen rpc settings and ensure zend is running";

const os = process.platform;

class SecNode {
    constructor(corerpc, zenrpc) {
        this.corerpc = corerpc;
        this.zenrpc = zenrpc;
        this.statsInterval = 1000 * 60 * 6;

        this.statsTimer = null;
        this.statsLoop = () => {
            this.collectStats();
        };
        this.configcount = 0;
        this.chalStart = null;
        this.chalRunning = false;
        this.opTimer = null;
        this.opTimerInterval = 1000 * 10;
        this.amt = 0.0001;
        this.fee = 0.0001;
        this.minChalBal = .01;
        this.defaultMemTime = 45;

        this.memBefore = {};
        this.memNearEnd = {};

        this.waiting = false;

    }

    static auto() {
        let corerpc = new Client(cfg);
        let zenrpc = new Zcash(cfg);
        return new SecNode(corerpc, zenrpc);
    }

    initialize() {
        this.statsTimer = setInterval(this.statsLoop, this.statsInterval);
    }

    loop() {
        this.getStats()
    }

    getPrimaryAddress(cb) {
        const self = this;
        this.corerpc.getAddressesByAccount("", (err, data) => {

            if (err) {
                self.waiting = true;
                if (err.code == -28) {
                    console.log(logtime(), "Zend: " + err.message);
                    return cb('Waiting on zend');
                } else {
                    console.log(logtime(), "Zend error: " + err.message);
                    return cb(errmsg);
                }
            }
            self.waiting = false;
            return cb(null, data[0]);
        });
    }

    getAddrWithBal(cb) {

        const self = this;

        this.zenrpc.z_listaddresses()
            .then((result) => {

                if (result.length == 0) {
                    console.log("No private address found. Please create one and send at least 1 ZEN for challenges");

                    return cb(null)
                }

                let bal = 0;
                let addr = result[0];
                let lastChalBlockNum = local.getItem('lastChalBlock');

                self.zenrpc.z_getbalance(addr)
                    .then((balance) => {

                        self.corerpc.getInfo()
                            .then((data) => {
                                let valid = true;
                                if (lastChalBlockNum && data.blocks - parseInt(lastChalBlockNum) < 5) valid = false;

                                return cb(null, { "addr": addr, "bal": balance, "valid": valid, "lastChalBlock": lastChalBlockNum });
                            })
                    })
                    .catch(err => {
                        cb(err)
                    });
            })
            .catch(err => {
                cb(err)
            });
    }

    execChallenge(chal) {

        //given a block number get the hash
        //get the block
        //get the merkle root from the block
        //create the transaction and send
        //poll the operation for completion
        //return a object with result and if success txid and exec time

        var self = this;
        console.log(logtime(), "Start challenge. " + chal.crid);

        if (self.chalRunning) {

            let resp = { "crid": chal.crid, "status": "error", "error": "Previous challenge still running. " + self.crid }
            resp.ident = self.ident;

            self.socket.emit("chalresp", resp)

            console.log(logtime(), "Challenge " + self.crid + " is currently running. Failed " + chal.crid)
            return

        }
        if (os == 'linux') self.memBefore = self.getProcMeminfo(false);
        self.crid = chal.crid
        self.corerpc.getBlockHash(chal.blocknum, (err, hash) => {

            if (err) return console.log(err)

            self.corerpc.getBlock(hash, (err, block) => {

                let msgBuff = new Buffer.from(block.merkleroot);
                let amts = [{ "address": chal.sendto, "amount": self.amt, "memo": msgBuff.toString('hex') }];

                self.getAddrWithBal((err, result) => {

                    if (err) return console.log(err);

                    let zaddr = result.addr;
                    if (result.bal == 0) {
                        console.log(logtime(), "Challenge private address balance is 0 at the moment. Cannot perform challenge");
                        //console.log(logtime(), "Please send .5 zen to " + zaddr);
                    }

                    console.log('Using ' + zaddr + ' for challenge. bal=' + result.bal)

                    if (zaddr && result.bal > 0) {

                        self.zenrpc.z_sendmany(zaddr, amts, 1, self.fee)
                            .then(opid => {

                                console.log("OperationId=" + opid);

                                self.chalStart = new Date();
                                self.chalRunning = true;
                                self.opTimer = setInterval(() => {
                                    self.checkOp(opid, chal);
                                }
                                    , self.opTimerInterval);
                                return
                            })
                            .catch(err => {

                                let resp = { "crid": chal.crid, "status": "error", "error": err }
                                resp.ident = self.ident;
                                console.log(logtime(), "Challenge: unable to create and send transaction.");
                                console.log(err);
                                self.socket.emit("chalresp", resp)
                            }
                            );
                    } else {

                        let resp = { "crid": chal.crid, "status": "error", "error": "no available balance found or 0" }
                        resp.ident = self.ident;
                        console.log("challenge: unable to find address with balance or balance 0.");
                        self.socket.emit("chalresp", resp)
                    }
                });
            });
        })
    }

    checkOp(opid, chal) {

        let self = this;

        if (!self.chalRunning) {
            console.log(logtime(), "Clearing timer");
            clearInterval(self.opTimer);
            return;
        }

        self.zenrpc.z_getoperationstatus([opid])
            .then(operation => {

                let elapsed = (((new Date()) - self.chalStart) / 1000).toFixed(0);


                if (operation.length == 0) {
                    if (elapsed < 12) return

                    //if here then operation lost or unavailable. 
                    self.chalRunning = false;
                    let resp = { "crid": chal.crid, "status": "failed", "error": "No operation found." }

                    resp.ident = self.ident;
                    self.socket.emit("chalresp", resp);

                    console.log(logtime(), "Challenge submit: failed. Could not find zen operation.");
                    console.log(logtime(), "Clearing timer");
                    clearInterval(self.opTimer);
                    return;
                }

                let op = operation[0];
                console.log(logtime(), "Elapsed challenge time=" + elapsed + "  status=" + op.status);

                if (op.status == "success") {

                    console.log(logtime(), "Challenge submit: " + op.status);

                    let resp = {
                        "crid": chal.crid,
                        "status": op.status,
                        "txid": op.result.txid,
                        "execSeconds": op.execution_secs
                    }
                    if (os == 'linux') {
                        resp.memBefore = self.memBefore,
                            resp.memNearEnd = self.memNearEnd
                    }

                    console.log(op);
                    console.log("txid= " + op.result.txid);

                    resp.ident = self.ident;

                    self.chalRunning = false;
                    self.socket.emit("chalresp", resp);

                    local.setItem('lastExecSec', (op.execution_secs).toFixed(2));

                    self.getBlockHeight(true);


                    //clear the operation from queue
                    self.zenrpc.z_getoperationresult([opid]);


                } else if (op.status == "failed") {

                    console.log(logtime(), "Challenge result: " + op.status)
                    console.log(op.error.message);

                    let resp = { "crid": chal.crid, "status": op.status, "error": op.error.message }
                    self.chalRunning = false;

                    resp.ident = self.ident;
                    self.socket.emit("chalresp", resp);

                    //clear the operation from queue
                    self.zenrpc.z_getoperationresult([opid]);

                } else if (os == 'linux' && op.status == "executing") {

                    let last = local.getItem('lastExecSec') || self.defaultMemTime;

                    if (last - elapsed < 12) {
                        self.memNearEnd = self.getProcMeminfo(false)
                    }
                }

                return
            })
            .catch(err => {

                self.chalRunning = false;
                console.log("challenge error");
                console.log(err);
                clearInterval(self.opTimer);
                return
            });
    }

    getConfig(req, poolver, hw) {
        //   node version,  poolver, and hw
        const self = this;
        this.corerpc.getInfo()
            .then((data) => {

                let node = {
                    "version": data.version,
                    "protocolversion": data.protocolversion,
                    "wallet.version": data.walletversion
                }

                if (!self.ident.nid && req.nid) self.ident.nid = req.nid;

                let config = { node: node, poolver: poolver, hw: hw }
                self.socket.emit("node", { type: "config", ident: self.ident, config: config });

            })
            .catch(err => {
                console.log("get config", err);
            }
            );
    }

    collectStats(){
        const self = this;

        if (!self.socket.connected) return;

        this.getStats((err, stats) => {
            if (err) {
                console.log(logtime(), "Stat check failed. " + err);
                if (self.ident) {
                    self.socket.emit("node", { type: "down", ident: self.ident });
                }
            } else {
                self.getTLSPeers(null, (err, tlsPeers) => {
                stats.tlsPeers = tlsPeers;
                self.socket.emit("node", { type: "stats", stats: stats, ident: self.ident });
                console.log(logtime(), "stat check");
                });
            }
        })
    }
    getStats(cb) {

        var self = this;
        if (self.waiting) return cb("Waiting for zend");
        this.corerpc.getInfo()
            .then((data) => {

                self.zenrpc.z_getoperationstatus()
                    .then(ops => {
                        let count = 0;

                        for (let op of ops) {
                            op.status == 'queued' ? count++ : null;
                        }

                        self.getAddrWithBal((err, addrBal) => {

                            if (err) return cb(err)

                            let stats = {
                                "blocks": data.blocks,
                                "peers": data.connections,
                                "bal": addrBal.bal,
                                "isValidBal": addrBal.valid,
                                "queueDepth": count,
                                "lastChalBlock": addrBal.lastChalBlock,
                                "lastExecSec": local.getItem('lastExecSec')
                            }
                            console.log(stats)
                          //  console.log("lastchalblock=" + local.getItem('lastChalBlock'))
                            if (addrBal.bal < self.minChalBal && addrBal.valid) console.log(logtime(), "Low challenge balance. " + addrBal.bal)

                            if (self.ident) {
                                return cb(null, stats);
                            } else {
                                return cb('ident not set');
                            }

                        })
                    })
            })
            .catch(err => {

                let msg = err.cause ? err.cause : err.message;
                console.log(logtime(), "getStats " + msg);
                //console.log(err);
                return cb(err);
            });
    }

    getNetworks(req, cb) {
        const self = this;
        this.corerpc.getNetworkInfo()
            .then((data) => {
                let nets = data.localaddresses;
                if (req) {
                    if (!self.ident.nid && req.nid) self.ident.nid = req.nid;
                    self.socket.emit("node", { type: "networks", ident: self.ident, nets });
                } else {
                    cb(null, nets)
                }
            })
            .catch(err => {
                console.log(logtime(), 'get networks ' + err);
            }
            );
    }

    getTLSPeers(req, cb) {
        const self = this;
        this.corerpc.getPeerInfo()
            .then((data) => {
                let peers = [];
                if (!self.ident.nid && req.nid) self.ident.nid = req.nid;
                for (let i = 0; i < data.length; i++) {
                    let p = data[i];
                    if (p.inbound == false) {
                        let ip = p.addr.indexOf(']') != -1 ? p.addr.substr(1, p.addr.indexOf(']')) : p.addr.substr(0, p.addr.indexOf(":"));
                        let peer = { ip, tls: p.tls_verified };
                        peers.push(peer);
                    }
                }
                if (req) {
                    self.socket.emit("node", { type: "peers", ident: self.ident, peers });
                } else {
                    cb(null, peers)
                }
            })
            .catch(err => {
                console.log(logtime(), 'get peers ' + err);
            }
            );
    }

    getBlockHeight(setLast) {

        const self = this;
        this.corerpc.getInfo()
            .then((data) => {
              //  console.log("GETBLOCK set last", setLast)
                if (setLast) local.setItem('lastChalBlock', data.blocks);
                return data.blocks;
            })
            .catch(err => {

                let msg = err.cause ? err.cause : err;
                console.log(logtime(), "getBlockHeight " + msg);
                return
            });
    }


    getProcMeminfo(display, cb) {
        if (cb && typeof cb === 'function') {
            return fs.readFile('/proc/meminfo', (err, meminfo) => {
                if (err) {
                    return cb(err);
                }
                return cb(null, _formatProcMeminfo(meminfo, display));
            });
        }

        let meminfo = fs.readFileSync('/proc/meminfo');
        return _formatProcMeminfo(meminfo, display);
    }
}

const _formatProcMeminfo = (meminfo, display) => {
    let lines = meminfo.toString().split('\n');
    let disp = "";
    let data = {};
    let toGb = 1000 * 1024;

    lines.forEach((line) => {

        let row = line.split(':');
        let item = row[0]
        if (item == 'MemTotal' ||
            item == 'MemFree' ||
            item == 'MemAvailable' ||
            item == 'SwapTotal' ||
            item == 'SwapFree') {
            let num = parseInt(row[1].trim().split(' ')[0]);
            if (display) {

                disp += item + ": " + (num / toGb).toFixed(2) + "GB  ";
            } else {
                data[item] = (num / toGb).toFixed(2) + "GB"
            }
        }
    });

    if (display) return disp;

    return data;
};




const logtime = () => {
    return (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '') + " GMT" + " --";
}

module.exports = SecNode;
