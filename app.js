const SecNode = require('./SecNodeTracker').auto();
const LocalStorage = require('node-localstorage').LocalStorage;
const local = new LocalStorage('./config');
const io = require('socket.io-client')
const os = require('os');
const pkg = require('./package.json');
const init = require('./init');

//check if setup was run
if (local.length == 0) {
	console.log("Please run setup: node setup");
	process.exit();
}

// host names without domain
const servers = local.getItem('servers').split(',');
const home = local.getItem('home');
if (!home) return console.log("ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue.")
let curIdx = servers.indexOf(home);
let curServer = home;
const protocol = `${init.protocol}://`;
const domain = `.${init.domain}`;
let socket = io(protocol + curServer + domain, { multiplex: false });
let failoverTimer;

//get cpu config
const cpus = os.cpus();
console.log("CPU " + cpus[0].model + "  cores=" + cpus.length + "  speed=" + cpus[0].speed);
const hw = { "CPU": cpus[0].model, "cores": cpus.length, "speed": cpus[0].speed }

//self version
const poolver = pkg.version;
console.log("Tracker app version: " + poolver);


//check memory
if (process.platform == 'linux') {
	console.log(SecNode.getProcMeminfo(true));
} else {
	let totmem = os.totalmem() / (1000 * 1000 * 1024);
	let freemem = os.freemem() / (1000 * 1000 * 1024);
	console.log("total memory=" + totmem.toFixed(1) + "GB  free memory=" + freemem.toFixed(1)) + "GB";
}


// gather identity
let taddr;
let nodeid = local.getItem('nodeid') || null;
let fqdn = local.getItem('fqdn') || null;
if (fqdn) fqdn = fqdn.trim();
let stkaddr = local.getItem('stakeaddr').trim();
let ident = { "nid": nodeid, "stkaddr": stkaddr, "fqdn": fqdn };

let initTimer;
let returningHome = false;

const initialize = () => {
	// check connectivity by getting the t_address.
	// pass identity to server on success
	SecNode.getPrimaryAddress((err, taddr) => {
		if (err) {
			console.log(err);

			if (!initTimer) {
				initTimer = setInterval(() => {
					initialize();
				}, 10000)
			}

		} else {
			if (initTimer) clearInterval(initTimer);

			ident.taddr = taddr;
			console.log("Secure Node t_address=" + taddr);
			SecNode.ident = ident;

			SecNode.getAddrWithBal((err, result) => {
				if (err) {
					console.log(err);
					return
				}

				if (result.bal == 0 && result.valid) {

					console.log("Challenge private address balance is 0");
					console.log("Please add a total of 1 zen to the private address by sending 4 or more transactions.");

					if (!nodeid) {
						console.log(result.addr)
						console.log("Unable to register node. Exiting.")
						process.exit();
					}
				} else {
					console.log("Balance for challenge transactions is " + result.bal);
					if (result.bal < 0.01 && result.valid) {
						console.log("Challenge private address balance getting low");
						console.log("Please send a few small amounts (0.2) each to the private address below");
					}
				}

				console.log("Using the following address for challenges");
				console.log(result.addr)

				ident.email = local.getItem('email');
				ident.con = { home: home, cur: curServer }
				SecNode.getNetworks(null, (err, nets) => {
					ident.nets = nets;
					socket.emit('initnode', ident, () => {
						//only pass email and nets on init.  
						delete ident.email;
						delete ident.nets;
					});
				})
				return
			})
		}
	});

}

const setSocketEvents = () => {
	socket.on('connect', () => {
		console.log(logtime(), `Connected to server ${curServer}. Initializing...`);
		initialize();
		if (failoverTimer) clearInterval(failoverTimer);
	});
	
	socket.on('disconnect', () => {
		if (returningHome) return
		//wait  for current to be available
		console.log(logtime(), 'Lost connection to ' + curServer)
		failoverTimer = setInterval(() => {
			switchServer()
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
		SecNode.socket = socket;
		returningHome = false;
	})

	socket.on('msg', (msg) => {
		console.log(logtime(), msg);
	});

	socket.on("action", (data) => {

		switch (data.action) {
			case "set nid":
				local.setItem("nodeid", data.nid);
				break;

			case 'get stats':
				SecNode.getStats((err, stats) => {
					if (err) {
						if (ident) {
							socket.emit("node", { type: "down", ident: ident });
						}
					} else {
						socket.emit("node", { type: "stats", stats: stats, ident: ident });
					}

				});
				console.log(logtime(), "Stats: send initial stats.")
				break;

			case 'get config':
				SecNode.getConfig(data, poolver, hw);
				break;

			case 'challenge':
				SecNode.execChallenge(data.chal);
				break;

			case 'networks':
				SecNode.getNets(data);
				break;
		}
	})
}
setSocketEvents();

const logtime = () => {
	return (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '') + " GMT" + " --";
}

const switchServer = () => {
	let nextIdx = curIdx + 1 === servers.length ? 0 : curIdx + 1;
	curServer = servers[nextIdx];
	curIdx = nextIdx;
	console.log(logtime(), "Trying server: " + curServer);
	socket.close();
	socket = io.connect(protocol + curServer + domain);
	setSocketEvents();
	SecNode.socket = socket;
}


const conCheck = () => {
	setInterval(() => {
		if (!socket.connected) {
			console.log(logtime(), `No connection to server ${curServer}. Retry.`);
			if (!failoverTimer) {
				failoverTimer = setInterval(() => {
					switchServer()
				}, 61000);
			}
		}
	}, 30000
	)
}

SecNode.socket = socket;
SecNode.initialize();
conCheck();

