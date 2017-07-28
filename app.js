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
let totmem = os.totalmem() / 1000000000;
let freemem = os.freemem() / 1000000000;
console.log("total memory=" + totmem.toFixed(2) + "  free memory=" + freemem.toFixed(2));

if (freemem < 4) {
	console.log("WARNING: Minimum available memory needed for creating shielded transactions is 4GB. swap file not checked.");
}


let taddr;

//check if already registered
let nodeid = local.getItem('nodeid') || null;
let ident = { "nid": nodeid, "stkaddr": local.getItem('stakeaddr') };

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

			SecNode.getPrimaryBal(taddr, (err, bal) => {
				if (err) return console.log(err);

				if (bal < 0.001) {
					console.log("Node balance too low for challenge transactions");
					console.log("Please add at least 1 zen to " + taddr);
					if (!nodeid) {
						console.log("Unable to register node. Exiting.")
						process.exit();
					}
				} else {
					console.log("Node balance for challenge transactions is " + bal);
				}
				let identinit = ident;
				//only pass email on init.  
				identinit.email = local.getItem('email');
				socket.emit('initnode', identinit);

			})
		}
	});

	console.log(logtime(), "Connected to pool server");

});
	socket.on('msg', (msg) => {
		console.log(logtime(), msg);
	});

socket.on("action", (data) => {
	//console.log(data);
	switch (data.action) {
		case "set nid":
			local.setItem("nodeid", data.nid);
			break;

		case 'get stats':
			SecNode.getStats();
			console.log(logtime(), "stats")
			break;
	
		case 'get config':
			SecNode.getConfig(poolver, hw);
			break;

		case 'challenge':
			SecNode.execChallenge(data);
			break;
	}
})


SecNode.socket = socket;
SecNode.initialize();

const logtime = () => {
	return (new Date()).toLocaleString() + " --";
}
