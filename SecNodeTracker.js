
const LocalStorage = require('node-localstorage').LocalStorage;
const local = new LocalStorage('./config');

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



class SecNode {
    constructor(corerpc, zenrpc) {
        this.corerpc = corerpc;
        this.zenrpc = zenrpc;
        this.statsInterval = 1000 * 60 * 6;

        this.statsTimer = null;
        this.statsLoop = () => {

            const self = this;

            if (!self.socket.connected) return;

            this.getStats((err, stats) => {
                if (err) {
                    if (self.ident) {
                        self.socket.emit("node", { type: "down", ident: self.ident });
                    }
                } else {
                    self.socket.emit("node", { type: "stats", stats: stats, ident: self.ident });
                }
                console.log(logtime(), "stat check");
            })
        };
        this.configcount = 0;
        this.chalStart = null;
        this.chalRunning = false;
        this.opTimer = null;
        this.opTimerInterval = 1000 * 10;
        this.amt = 0.000001;
        this.fee = 0.000001;
        this.minChalBal = .001;
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

        this.corerpc.getAddressesByAccount("", (err, data) => {

            if (err) {
                console.log(err);
                return cb(errmsg);
            }

            return cb(null, data[0]);
        });
    }

    getAddrWithBal(cb) {

        const self = this;

        this.zenrpc.z_listaddresses()
            .then((result) => {

                if (result.length == 0) {
                    console.log("No private address found. Please create one and send at least .5 ZEN for challenges");

                    return cb(null)
                }

                let bal = 0;
                let addr = result[0];

                self.zenrpc.z_getbalance(addr)
                    .then((balance) => {
                        return cb(null, { "addr": addr, "bal": balance });
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
                        console.log(logtime(), "Challenge private address balance is 0. Cannot perform challenge");
                        console.log(logtime(), "Please send .5 zen to " + zaddr);
                    }

                    console.log('Using ' + zaddr + ' for challenge. bal=' + result.bal)

                    if (zaddr) {

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

                        let resp = { "crid": chal.crid, "status": "error", "error": "no available balance found" }
                        resp.ident = self.ident;
                        console.log("challenge: unable to find address with balance.", err);
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

                if (operation.length == 0) return
                let op = operation[0];

                let elapsed = (((new Date()) - self.chalStart) / 1000).toFixed(0);
                console.log(logtime(), "Elapsed challenge time=" + elapsed + "  status=" + op.status)

                if (op.status == "success") {

                    console.log(logtime(), "Challenge submit: " + op.status);

                    let resp = {
                        "crid": chal.crid,
                        "status": op.status,
                        "txid": op.result.txid,
                        "execSeconds": op.execution_secs,
                    }

                    console.log(op);
                    console.log("txid= " + op.result.txid);

                    resp.ident = self.ident;

                    self.chalRunning = false;
                    self.socket.emit("chalresp", resp)

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

    getConfig(poolver, hw) {
        //   node version,  poolver, and hw
        const self = this;
        this.corerpc.getInfo()
            .then((data) => {

                let node = {
                    "version": data.version,
                    "protocolversion": data.protocolversion,
                    "wallet.version": data.walletversion
                }

                let config = { node: node, poolver: poolver, hw: hw }
                self.socket.emit("node", { type: "config", ident: self.ident, config: config });

            })
            .catch(err => {
                console.log("get config", err);
            }
            );
    }
    getStats(cb) {

        var self = this;
        this.corerpc.getInfo()
            .then((data) => {

                self.getAddrWithBal((err, addrBal) => {

                    if(err) return cb(err)

                    let stats = {
                        "blocks": data.blocks,
                        "connections": data.connections,
                        "bal": addrBal.bal
                    }
                    if(addrBal.bal < self.minChalBal) console.log(logtime(), "Low challenge balance. " + addrBal.bal)

                    if (self.ident) {
                        return cb(null, stats);
                    } else {
                        return cb('ident not set');
                    }

                })
            })
            .catch(err => {

                let msg = err.cause ? err.cause : err.message;
                console.log(logtime(), "getStats " + msg);
                //console.log(err);
                return cb(err);
            });
    }


}

const logtime = () => {
    return (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '') + " GMT" + " --";
}

module.exports = SecNode;
