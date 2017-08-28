const SecNode = require('./SecNodeTracker').auto();
const LocalStorage = require('node-localstorage').LocalStorage;
const local = new LocalStorage('./config');
const socket = require('socket.io-client')(local.getItem('serverurl'));  //('http://192.168.1.50:3333');
const os = require('os');
const pkg = require('./package.json');



//check if setup was run
if (local.length == 0) {
	console.log("Please run setup: node setup.js");
	process.exit();
}


//get cpu config
const cpus = os.cpus();
console.log("CPU " + cpus[0].model + "  cores=" + cpus.length + "  speed=" + cpus[0].speed);
const hw = { "CPU": cpus[0].model, "cores": cpus.length, "speed": cpus[0].speed }

//self version
const poolver = pkg.version;
console.log("Pool app version: " + poolver);


//check memory
if (process.platform == 'linux') {
	console.log(SecNode.getProcMeminfo(true));
} else {
	let totmem = os.totalmem() / (1000 * 1000 * 1024);
	let freemem = os.freemem() / (1000 * 1000 * 1024);
	console.log("total memory=" + totmem.toFixed(1) + "GB  free memory=" + freemem.toFixed(1)) + "GB";
}


let taddr;

//check if already registered
let nodeid = local.getItem('nodeid') || null;
let fqdn = local.getItem('fqdn') || null;
let ident = { "nid": nodeid, "stkaddr": local.getItem('stakeaddr'), "fqdn": fqdn };

socket.on('connect', () => {
	// check connectivity by getting the t_address.
	// pass identity to server on success
	SecNode.getPrimaryAddress((err, taddr) => {
		if (err) {
			console.log(err);
			//	console.log("Unable to connect to zend. Please check the zen rpc settings and ensure zend is running");
			//process.exit();
		} else {

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
					console.log("Please add at least 1 zen to the private address below");
					
					if (!nodeid) {
						console.log(result.addr)
						console.log("Unable to register node. Exiting.")
						process.exit();
					}
				} else {
					console.log("Balance for challenge transactions is " + result.bal);
					if (result.bal < 0.01 && result.valid) {
						console.log("Challenge private address balance getting low");
						console.log("Please add at least 1 zen to the private address below");
					}
				}

				console.log("Using the following address for challenges");
				console.log(result.addr)

				let identinit = ident;
				//only pass email on init.  
				identinit.email = local.getItem('email');
				return socket.emit('initnode', identinit);

			})
		}
	});

	console.log(logtime(), "Connected to node pool server");

});
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
			console.log(logtime(), "send stats")
			break;

		case 'get config':
			SecNode.getConfig(data, poolver, hw);
			break;

		case 'challenge':
			SecNode.execChallenge(data.chal);
			break;
	}
})

const logtime = () => {
	return (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '') + " GMT" + " --";
}

const conCheck = () => {
	setInterval(() => {
		if (!socket.connected) console.log(logtime(), "No connection to server");
	}, 60000
	)
}

SecNode.socket = socket;
SecNode.initialize();
conCheck();

