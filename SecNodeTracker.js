const LocalStorage = require("node-localstorage").LocalStorage;
const local = new LocalStorage("./config");
const fs = require("fs");
const Client = require("bitcoin-core");
const Zcash = require("zcash");

let host = local.getItem("rpchost") || local.getItem("rpcbind");
if (!host) host = "localhost";

const cfg = {
    host: host,
    port: local.getItem("rpcport"),
    ssl: {
        enabled: false
    },
    username: local.getItem("rpcuser"),
    password: local.getItem("rpcpassword")
};

const errmsg = "Unable to connect to zend. Please check the zen rpc settings and ensure zend is running";

const os = process.platform;
const logtime = () => {
    return (new Date()).toISOString().replace(/T/, " ").replace(/\..+/, "") + " GMT" + " --";
};

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
        this.opTimerInterval = 1000 * 2;
        this.amt = 0.0001;
        this.fee = 0.0001;
        this.minChalBal = .01;
        this.defaultMemTime = 45;
        this.memBefore = {};
        this.memNearEnd = {};
        this.waiting = false;
        this.zenDownInterval = 1000 * 61;
        this.zenDownTimer = null;
        this.zenDownLoop = () => {
            this.checkZen();
        }
    }

    static auto() {
        let corerpc = new Client(cfg);
        let zenrpc = new Zcash(cfg);
        return new SecNode(corerpc, zenrpc);
    }

    initialize() {
        this.statsTimer = setInterval(this.statsLoop, this.statsInterval);
    }

    checkZen() {
        const self = this;
        self.getPrimaryAddress((err, amt) => {
            if (err) {
                console.error(logtime(), err);
            } else {
                console.log(logtime(), "Zen connected.");
                clearInterval(self.zenDownTimer);
                self.collectStats();
            }
        });
    }

    getPrimaryAddress(cb) {
        const self = this;
        this.corerpc.getAddressesByAccount("", (err, data) => {

            if (err) {
                self.waiting = true;
                if (err.code === -28) {
                    console.log(logtime(), "Zend: " + err.message);
                    return cb("Waiting on zend");
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
        let lastChalBlockNum = local.getItem("lastChalBlock");
        self.corerpc.getInfo()
            .then((data) => {
                let valid = true;
                if (lastChalBlockNum && data.blocks - parseInt(lastChalBlockNum) < 5) valid = false;
                return valid;
            })
            .then((valid) => {
                this.zenrpc.z_listaddresses()
                    .then((results) => {
                        if (results.length === 0) {
                            console.log("No private address found. Please create one using 'zen-cli z_getnewaddress' and send at least 1 ZEN for challenges split into 4 or more transactions");
                            return cb(null)
                        }
                        let called = false;
                        let addrbal;
                        let count = 0;
                        for (let i = 0; i < results.length; i++) {
                            const addr = results[i];
                            self.zenrpc.z_getbalance(addr)
                                .then((bal) => {
                                    return {addr, bal}
                                })
                                .then((addrbal) => {
                                    count++;
                                    if (addrbal.bal > .001 && !called) {
                                        called = true;
                                        cb(null, {
                                            "addr": addrbal.addr,
                                            "bal": addrbal.bal,
                                            "valid": valid,
                                            "lastChalBlock": lastChalBlockNum
                                        });
                                    }
                                    if (count === results.length && !called) {
                                        cb(null, {
                                            "addr": addrbal.addr,
                                            "bal": addrbal.bal,
                                            "valid": valid,
                                            "lastChalBlock": lastChalBlockNum
                                        });
                                    }
                                })
                                .catch(err => {
                                    console.error("Error: zen z_getbalance ", err);
                                });
                        }
                    })
                    .catch(err => {
                        console.error("Error: zen z_listaddresses ", err);
                    });
            })
            .catch(err => {
                console.error("Error: zen getinfo ", err);
            });
    }

    execChallenge(chal) {
        let self = this;
        console.log(logtime(), "Start challenge. " + chal.crid);

        if (self.chalRunning) {
            let resp = {
                "crid": chal.crid,
                "status": "error",
                "error": "Previous challenge still running. " + self.crid
            };
            resp.ident = self.ident;
            self.socket.emit("chalresp", resp);
            console.log(logtime(), "Challenge " + self.crid + " is currently running. Failed " + chal.crid);
            return
        }

        if (os === "linux") self.memBefore = self.getProcMeminfo(false);
        self.crid = chal.crid;
        self.corerpc.getBlockHash(chal.blocknum, (err, hash) => {

            if (err) {
                let resp = {"crid": chal.crid, "status": "failed", "error": "unable to get blockhash from zen"};
                self.chalRunning = false;
                resp.ident = self.ident;
                self.socket.emit("chalresp", resp);
                console.error(logtime(), `Challenge Error: unable to get blockhash for challenge id ${chal.crid} block ${chal.blocknum}`);
                if (!self.zenDownTimer) self.zenDownTimer = setInterval(self.zenDownLoop, self.zenDownInterval);
                return
            }
            if (self.zenDownTimer) clearInterval(self.zenDownTimer);

            self.corerpc.getBlock(hash, (err, block) => {

                let msgBuff = new Buffer.from(block.merkleroot);
                let amts = [{"address": chal.sendto, "amount": self.amt, "memo": msgBuff.toString("hex")}];

                self.getAddrWithBal((err, result) => {
                    if (err) return console.error(err);

                    let zaddr = result.addr;
                    if (result.bal === 0) {
                        console.log(logtime(), "Challenge private address balance is 0 at the moment. Cannot perform challenge");
                    }
                    console.log("Using " + zaddr + " for challenge. bal=" + result.bal);
                    if (zaddr && result.bal > 0) {
                        self.zenrpc.z_sendmany(zaddr, amts, 1, self.fee)
                            .then(opid => {
                                console.log("OperationId=" + opid);
                                self.chalStart = new Date();
                                self.chalRunning = true;
                                self.opTimer = setInterval(() => {
                                    self.checkOp(opid, chal);
                                }, self.opTimerInterval);
                            })
                            .catch(err => {
                                    let resp = {
                                        "crid": chal.crid,
                                        "status": "error",
                                        "error": "unable to create transaction"
                                    };
                                    resp.ident = self.ident;
                                    console.error(logtime(), "Challenge: unable to create and send transaction.");
                                    console.error(err);
                                    self.socket.emit("chalresp", resp)
                                }
                            );
                    } else {
                        let resp = {"crid": chal.crid, "status": "error", "error": "no available balance found or 0"};
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
                if (operation.length === 0) {
                    if (elapsed < 12) return;
                    // if here then operation lost or unavailable.
                    self.chalRunning = false;
                    let resp = {"crid": chal.crid, "status": "failed", "error": "No operation found."};
                    resp.ident = self.ident;
                    self.socket.emit("chalresp", resp);
                    console.log(logtime(), "Challenge submit: failed. Could not find zen operation.");
                    console.log(logtime(), "Clearing timer");
                    clearInterval(self.opTimer);
                    return;
                }

                let op = operation[0];
                if (elapsed % 10 === 0) console.log(logtime(), "Elapsed challenge time=" + elapsed + "  status=" + op.status);
                if (op.status === "success") {
                    console.log(logtime(), "Challenge submit: " + op.status);
                    let resp = {
                        "crid": chal.crid,
                        "status": op.status,
                        "txid": op.result.txid,
                        "execSeconds": op.execution_secs,
                        "created": op.creation_time
                    };
                    if (os === "linux") {
                        resp.memBefore = self.memBefore;
                        resp.memNearEnd = self.memNearEnd
                    }
                    console.log(logtime(), `Challenge result:${op.status} seconds:${op.execution_secs}`);
                    resp.ident = self.ident;
                    self.chalRunning = false;
                    self.socket.emit("chalresp", resp);
                    local.setItem("lastExecSec", (op.execution_secs).toFixed(2));
                    self.getBlockHeight(true);

                    //clear the operation from queue
                    self.zenrpc.z_getoperationresult([opid]);
                } else if (op.status === "failed") {
                    console.log(logtime(), `Challenge result:${op.status}`);
                    console.log(op.error.message);

                    let resp = {"crid": chal.crid, "status": op.status, "error": op.error.message};
                    self.chalRunning = false;
                    resp.ident = self.ident;
                    self.socket.emit("chalresp", resp);

                    //clear the operation from queue
                    self.zenrpc.z_getoperationresult([opid]);
                } else if (os === "linux" && op.status === "executing") {
                    let last = local.getItem("lastExecSec") || self.defaultMemTime;
                    if (last - elapsed < 12) {
                        self.memNearEnd = self.getProcMeminfo(false)
                    }
                }
            })
            .catch(err => {
                self.chalRunning = false;
                console.log(logtime(), "Challenge error: could not get operation status.");
                console.error(err);
                clearInterval(self.opTimer);
            });
    }

    getConfig(req, trkver, hw) {
        //   node version,  trkver, and hw
        const self = this;
        this.corerpc.getInfo()
            .then((data) => {
                let node = {
                    "version": data.version,
                    "protocolversion": data.protocolversion,
                    "wallet.version": data.walletversion
                };
                if (!self.ident.nid && req.nid) self.ident.nid = req.nid;
                let config = {node: node, trkver: trkver, hw: hw};
                self.socket.emit("node", {type: "config", ident: self.ident, config: config});
            })
            .catch(err => {
                    console.error("Get config ", err);
                }
            );
    }

    collectStats() {
        const self = this;
        if (!self.socket.connected || self.waiting) return;
        if (!self.ident.nid) {
            console.log(logtime(), "Unable to collect stats without a nodeid.");
            return;
        }

        self.getStats((err, stats) => {
            if (err) {
                console.error(logtime(), "Stat check failed. " + err);
                if (self.ident) {
                    self.socket.emit("node", {type: "down", ident: self.ident});
                }
                if (!self.zenDownTimer) self.zenDownTimer = setInterval(self.zenDownLoop, self.zenDownInterval);
            } else {
                if (self.zenDownTimer) clearInterval(self.zenDownTimer);
                self.getTLSPeers((err, tlsPeers) => {
                    if (err) console.log(logtime(), "Unable to get peers from zen. " + err);

                    stats.tlsPeers = tlsPeers;
                    self.socket.emit("node", {type: "stats", stats: stats, ident: self.ident});
                    let display = "";
                    for (let s in stats) {
                        if (s !== "tlsPeers") display += `${s}:${stats[s]} `;
                    }
                    console.log(logtime(), `Stat check: connected to:${self.ident.con.cur} ${display}`);
                });
            }
        })
    }

    getStats(cb) {
        let self = this;
        if (self.waiting) return cb("Waiting for zend");
        this.corerpc.getInfo()
            .then((data) => {
                self.zenrpc.z_getoperationstatus()
                    .then(ops => {
                        let count = 0;
                        for (let op of ops) {
                            op.status === "queued" ? count++ : null;
                        }
                        self.getAddrWithBal((err, addrBal) => {
                            if (err) return cb(err);

                            let stats = {
                                "blocks": data.blocks,
                                "peers": data.connections,
                                "bal": addrBal.bal,
                                "isValidBal": addrBal.valid,
                                "queueDepth": count,
                                "lastChalBlock": addrBal.lastChalBlock,
                                "lastExecSec": local.getItem("lastExecSec")
                            };

                            if (addrBal.bal < self.minChalBal && addrBal.valid) console.log(logtime(), "Low challenge balance. " + addrBal.bal);

                            if (self.ident) {
                                return cb(null, stats);
                            } else {
                                return cb("ident not set");
                            }
                        })
                    })
            })
            .catch(err => {
                let msg = err.cause ? err.cause : err.message;
                console.error(logtime(), "Stat check: unable to access zen.");
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
                    self.socket.emit("node", {type: "networks", ident: self.ident, nets});
                } else {
                    cb(null, nets)
                }
            })
            .catch(err => {
                    console.error(logtime(), "get networks " + err);
                }
            );
    }

    getTLSPeers(cb) {
        const self = this;
        this.corerpc.getPeerInfo()
            .then((data) => {
                let peers = [];
                for (let i = 0; i < data.length; i++) {
                    let p = data[i];
                    if (p.inbound === false) {
                        let ip = p.addr.indexOf("]") !== -1 ? p.addr.substr(1, p.addr.indexOf("]") - 1) : p.addr.substr(0, p.addr.indexOf(":"));
                        let peer = {ip, tls: p.tls_verified};
                        peers.push(peer);
                    }
                }
                cb(null, peers)
            })
            .catch(err => {
                    console.error(logtime(), "Zen - can not get peers");
                    cb(err)
                }
            );
    }

    getBlockHeight(setLast) {
        const self = this;
        this.corerpc.getInfo()
            .then((data) => {
                if (setLast) local.setItem("lastChalBlock", data.blocks);
                return data.blocks;
            })
            .catch(err => {
                let msg = err.cause ? err.cause : err;
                console.log(logtime(), "getBlockHeight " + msg);
            });
    }

    getProcMeminfo(display, cb) {
        if (cb && typeof cb === "function") {
            return fs.readFile("/proc/meminfo", (err, meminfo) => {
                if (err) {
                    return cb(err);
                }
                return cb(null, _formatProcMeminfo(meminfo, display));
            });
        }
        let meminfo = fs.readFileSync("/proc/meminfo");
        return _formatProcMeminfo(meminfo, display);
    }
}

const _formatProcMeminfo = (meminfo, display) => {
    let lines = meminfo.toString().split("\n");
    let disp = "";
    let data = {};
    let toGb = 1000 * 1024;

    lines.forEach((line) => {

        let row = line.split(":");
        let item = row[0];
        if (item === "MemTotal" ||
            item === "MemFree" ||
            item === "MemAvailable" ||
            item === "SwapTotal" ||
            item === "SwapFree") {
            let num = parseInt(row[1].trim().split(" ")[0]);
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

module.exports = SecNode;
