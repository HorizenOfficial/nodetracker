
const LocalStorage = require('node-localstorage').LocalStorage;
const local = new LocalStorage('./config');

const Client = require('bitcoin-core');
const Zcash = require('zcash');

let host =  local.getItem('rpcallowip') || local.getItem('rpcbind');
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

let opTimer = null;

class SecNode {
    constructor(corerpc, zenrpc) {
        this.corerpc = corerpc;
        this.zenrpc = zenrpc;
        this.statsInterval = 1000 * 60 * 6;

        this.statsTimer = null;
        this.statsLoop = () => {
            //get stats  
            const self = this;
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
        //this.corerpc.getAddressesByAccount("", (err, data) => {
        this.corerpc.getAccountAddress("", (err, data) => {
            if (err) {
                console.log(err);
                return cb(errmsg);
            }

            return cb(null, data);
        });
    }

    getPrimaryBal(taddr, cb) {
        this.zenrpc.z_getbalance(taddr)
            .then((bal) => {
                cb(null, bal);
            });
    }

    /*
    execChallenge(blockid, node_taddr, serverAddr, cb) {

        //given a block number get the hash
        //get the block
        //get the merkle root from the block
        //create the transaction and send
        //poll the operation for completion
        //return the txid

        this.corerpc.getBlockHash(blockid, (err, hash) => {

            if (err) return cb(err)
            this.corerpc.getBlock(hast, (err, block) => {
                console.log(block);

                let msgBuff = new Buffer.from(block.merkleroot);
                let amts = [{ "address": serverAddr, "amount": "0.0000", "memo": msgBuff.toString('hex') }];
                console.log(amts)
                this.zenrpc.z_sendmany(node_taddr, amts)
                    .then(opid => {

                        return this.checkOp(opid, cb);

                    })
                    .catch(err => {
                        console.log("send error", err);
                        cb("send error", err)
                    }
                    );
            });
        })
    }

    checkOp(opid, cb) {
        console.log('checkop', opid);
        opTimer = setInterval(() => {
            this.zenrpc.z_getoperationstatus([opid])
                .then(results => {

                    console.log(results);
                    if (results[0].status == "success") {
                        this.zenrpc.z_getoperationresult([opid])
                            .then(response => {
                                //socket.emit("txid", response[0].result.txid);
                                clearInterval(opTimer);
                                return cb(null, response[0].result.txid)
                            })
                            .catch(err => {
                                console.log(err);
                                return cb(err)
                            });
                    } else {
                        let status = results[0].status;
                        console.log(status);
                        //	if(status == "failed"){
                        console.log(results.error.message);

                        clearInterval(opTimer);
                        return cb(results.error.message)
                        //	}
                    }

                })
                .catch(err => {
                    console.log("status");
                    console.log(err);
                });
        }
            , 5000);

    }
    */
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
        //return   node version,  poolver, and hw
        var self = this;
        this.corerpc.getInfo()
            .then((data) => {
                let stats = {
                    "blocks": data.blocks,
                    "connections": data.connections
                }
                if (self.ident) {
                    self.zenrpc.z_getbalance(self.ident.taddr)
                        .then((bal) => {
                            stats.bal = bal;
                            //socket.emit("node", { type: "stats", stats: stats, ident: ident })
                            return cb(null, stats);
                        });
                } else {
                    return cb('ident not set')
                }
            })
            .catch(err => {
                let msg = err.cause ? err.cause : err.message;
                console.log(logtime(), "getStats " + msg);
                // console.log(err);
                return cb(err);
            });
    }


}

const logtime = () => {
    return (new Date()).toLocaleString() + " --";
}

module.exports = SecNode;
